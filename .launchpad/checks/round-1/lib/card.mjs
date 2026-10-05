// What every round's checks share: running the entry's `node card.mjs` and reading the SVG it prints.
// The entry's code only ever runs in a child process, with a clean environment and a time limit, never
// in the check's own process, so it cannot change what the check reports.
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { localName, parseXml, textOf, walk } from "./xml.mjs";

export const ROOT = process.cwd();
const TMP = mkdtempSync(join(tmpdir(), "agent-card-"));
const SVG_NS = "http://www.w3.org/2000/svg";

/** Records tests, then writes the report the gate reads ($LAUNCHPAD_GATE_OUT) and exits 1 if one failed. */
export function harness() {
  const results = [];
  return {
    async test(name, fn) {
      try {
        await fn();
        results.push({ name, status: "passed" });
      } catch (e) {
        results.push({ name, status: "failed" });
        console.error(`FAIL ${name}\n  ${String(e instanceof Error ? e.message : e).split("\n").join("\n  ")}`);
      }
    },
    done() {
      if (process.env.LAUNCHPAD_GATE_OUT) writeFileSync(process.env.LAUNCHPAD_GATE_OUT, JSON.stringify({ tests: results }));
      const failed = results.filter((r) => r.status === "failed").length;
      console.log(`${results.length - failed}/${results.length} checks passed`);
      process.exit(failed ? 1 : 0);
    },
  };
}

export function check(cond, msg) {
  if (!cond) throw new Error(msg);
}

/** Runs `node card.mjs ...args` at the root of the entry: { code, out, err }. */
export function card(...args) {
  const r = spawnSync(process.execPath, ["card.mjs", ...args], {
    cwd: ROOT, encoding: "utf8", timeout: 10_000, maxBuffer: 1024 * 1024,
    env: { PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin", HOME: TMP, LANG: "C.UTF-8", TZ: "UTC" },
  });
  const cmd = `node card.mjs ${args.join(" ")}`;
  if (r.error?.code === "ETIMEDOUT") throw new Error(`${cmd} took more than 10 s`);
  if (r.error?.code === "ENOBUFS") throw new Error(`${cmd} wrote more than 1 MB`);
  if (r.error) throw new Error(`${cmd}: ${r.error.message}`);
  return { code: r.status, out: r.stdout, err: r.stderr, cmd };
}

let inputs = 0;
/** Writes an input file (an object as JSON, or raw text) and returns its path. */
export function input(value) {
  const path = join(TMP, `input-${++inputs}.json`);
  writeFileSync(path, typeof value === "string" ? value : JSON.stringify(value, null, 2));
  return path;
}

/** Runs the card and returns its output and parsed root, or throws why it is not a valid card. */
export function render(args, limits) {
  const r = card(...args);
  check(r.code === 0, `${r.cmd} exited with ${r.code}${r.err.trim() ? `: ${r.err.trim().slice(0, 300)}` : ""}`);
  return { svg: r.out, root: parseCard(r.out, limits) };
}

/** Runs the card on bad input: it must exit non-zero, say why on stderr, and print nothing. */
export function refuses(args, what) {
  const r = card(...args);
  check(r.code !== 0, `${what}: exited with 0`);
  check(r.out === "", `${what}: printed something on stdout`);
  check(r.err.trim() !== "", `${what}: no reason on stderr`);
}

const DIMENSION = /^(\d+(\.\d+)?)(px)?$/;
const FORBIDDEN = new Set(["script", "foreignobject", "iframe", "object", "embed", "audio", "video"]);

/**
 * Checks an SVG card: well-formed, an <svg> root in the SVG namespace with a pixel width and height
 * within the limits and a viewBox, small, self-contained (no script, no event attribute, nothing
 * loaded from outside), and no "undefined", "null" or "NaN" in what it shows. Returns the root.
 */
export function parseCard(svg, { maxWidth = 600, maxHeight = 300, maxBytes = 20 * 1024 } = {}) {
  const bytes = Buffer.byteLength(svg);
  check(bytes > 0, "nothing on stdout");
  check(bytes <= maxBytes, `the card is ${bytes} bytes: at most ${maxBytes}`);
  let root;
  try {
    root = parseXml(svg);
  } catch (e) {
    throw new Error(`the card is not well-formed XML: ${e.message}`);
  }
  check(localName(root.name) === "svg", `the root element is <${root.name}>, not <svg>`);
  check(root.attrs.xmlns === SVG_NS, `the root <svg> has no xmlns="${SVG_NS}"`);
  for (const [attr, max] of [["width", maxWidth], ["height", maxHeight]]) {
    const m = DIMENSION.exec(root.attrs[attr] ?? "");
    check(m, `the root's ${attr} is ${JSON.stringify(root.attrs[attr] ?? null)}: it must be a number of pixels`);
    const v = Number(m[1]);
    check(v > 0 && v <= max, `the root's ${attr} is ${v}: more than 0 and at most ${max}`);
  }
  check(/^\s*-?[\d.]+(?:[\s,]+-?[\d.]+){3}\s*$/.test(root.attrs.viewBox ?? ""), "the root <svg> has no viewBox of four numbers");
  for (const el of walk(root)) {
    const name = localName(el.name).toLowerCase();
    check(!FORBIDDEN.has(name), `<${el.name}> is not allowed in a card`);
    for (const [k, v] of Object.entries(el.attrs)) {
      check(!/^on/i.test(localName(k)), `event attribute ${k} on <${el.name}>`);
      if (localName(k) === "href") {
        check(v.startsWith("#") || /^data:image\/(png|jpeg|gif|webp);base64,/.test(v), `<${el.name}> links outside the card: ${k}="${v.slice(0, 60)}"`);
      }
      selfContained(v, `${k} on <${el.name}>`);
    }
    if (name === "style") selfContained(textOf(el), "<style>");
  }
  const shown = visibleText(root);
  for (const word of ["undefined", "null", "NaN"]) check(!new RegExp(`\\b${word}\\b`).test(shown), `the card shows "${word}"`);
  return root;
}

/** Throws if CSS or an attribute value loads something from outside the card. */
function selfContained(text, where) {
  check(!/javascript:/i.test(text), `javascript: in ${where}`);
  check(!/@import/i.test(text), `@import in ${where}`);
  for (const m of text.matchAll(/url\(\s*['"]?([^'")\s]*)/gi)) {
    check(m[1].startsWith("#") || m[1].startsWith("data:"), `${where} loads ${m[1].slice(0, 60)}`);
  }
}

const squash = (s) => s.replace(/\s+/g, " ").trim();

/** What a reader sees: the text of every <text> element, in document order. */
export const visibleText = (root) => squash([...walk(root)].filter((el) => localName(el.name) === "text").map(textOf).join(" "));

/** The root's <title> child, the card's accessible name. */
export function titleOf(root) {
  const t = root.children.find((c) => typeof c !== "string" && localName(c.name) === "title");
  check(t, "the root <svg> has no <title> child");
  return squash(textOf(t));
}

/** A whole number with commas between thousands: 4200000 is "4,200,000". */
export const grouped = (n) => n.toLocaleString("en-US");
/** "1 point", "0 points", "4,200,000 points". */
export const count = (n, word) => `${grouped(n)} ${word}${n === 1 ? "" : "s"}`;
/** The <title> round 1's brief asks for. */
export const cardTitle = (a) => `${a.name}: ${count(a.points, "point")}, ${count(a.wins, "win")} in ${count(a.rounds, "round")}`;
