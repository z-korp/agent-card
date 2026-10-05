// node card.mjs <agent.json>: prints an SVG card of one agent's stats.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const themes = {
  light: { bg: "#ffffff", border: "#d0d7de", fg: "#1f2328", muted: "#656d76", accent: "#8250df", accent2: "#0969da" },
};

const W = 480;
const H = 150;
const PAD = 28;
const FONT = `-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif`;

// GitHub login: 1-39 letters, digits or single hyphens, no hyphen at either end.
const LOGIN = /^(?=.{1,39}$)[A-Za-z0-9]+(-[A-Za-z0-9]+)*$/;

/** Returns the agent's stats, or throws an Error whose message is the one-line reason. */
export function validate(a) {
  if (a === null || typeof a !== "object" || Array.isArray(a)) throw new Error("the JSON must be an object");
  if (typeof a.name !== "string" || !a.name.trim()) throw new Error("name must be a non-empty string");
  if ([...a.name].length > 40) throw new Error("name must be at most 40 characters");
  if (a.owner !== undefined && (typeof a.owner !== "string" || !LOGIN.test(a.owner)))
    throw new Error("owner must be a GitHub login (1-39 letters, digits or hyphens)");
  for (const k of ["points", "wins", "rounds"])
    if (!Number.isSafeInteger(a[k]) || a[k] < 0) throw new Error(`${k} must be a whole number, 0 or more`);
  if (a.wins > a.rounds) throw new Error("wins must be at most rounds");
  return { name: a.name, owner: a.owner, points: a.points, wins: a.wins, rounds: a.rounds };
}

export const grouped = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const count = (n, word) => `${grouped(n)} ${word}${n === 1 ? "" : "s"}`;
export const title = (a) => `${a.name}: ${count(a.points, "point")}, ${count(a.wins, "win")} in ${count(a.rounds, "round")}`;

export const escape = (s) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]);

// ponytail: width estimate per character class (wide CJK/emoji = 1em), not real font metrics.
const em = (ch) => (/[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠\u{1f000}-\u{1faff}\u{20000}-\u{3fffd}]/u.test(ch) ? 1 : /[A-Z@mwMW]/.test(ch) ? 0.72 : 0.58);
const width = (s, size) => [...s].reduce((w, ch) => w + em(ch) * size, 0);

/** Cuts text with an ellipsis so it fits in max px at the given font size. */
export function clip(s, size, max) {
  if (width(s, size) <= max) return s;
  const chars = [...s];
  while (chars.length && width(chars.join("") + "…", size) > max) chars.pop();
  return chars.join("").trimEnd() + "…";
}

/** The largest font size up to `size` at which text fits in max px. */
const fit = (s, size, max) => Math.min(size, Math.floor(max / width(s, 1)));

const text = (x, y, size, fill, s, extra = "") =>
  `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}"${extra}>${escape(s)}</text>`;

/** The SVG card of a validated agent. */
export function card(a, t = themes.light) {
  const rate = a.rounds ? `${Math.round((100 * a.wins) / a.rounds)}% win rate` : "";
  const nameMax = W - 2 * PAD - (rate ? width(rate, 12) + 16 : 0);
  const col = [PAD, 300, 390];
  const stats = [
    ["POINTS", grouped(a.points), col[1] - col[0] - 16, t.accent],
    ["WINS", grouped(a.wins), col[2] - col[1] - 12, t.fg],
    ["ROUNDS", grouped(a.rounds), W - PAD - col[2], t.fg],
  ];
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img">`,
    `<title>${escape(title(a))}</title>`,
    `<defs><linearGradient id="accent" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.accent}"/><stop offset="1" stop-color="${t.accent2}"/></linearGradient>`,
    `<clipPath id="frame"><rect width="${W}" height="${H}" rx="12"/></clipPath></defs>`,
    `<style>text{font-family:${FONT}}</style>`,
    `<g clip-path="url(#frame)">`,
    `<rect width="${W}" height="${H}" fill="${t.bg}"/>`,
    `<rect width="6" height="${H}" fill="url(#accent)"/>`,
    `</g>`,
    `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="11.5" fill="none" stroke="${t.border}"/>`,
    text(PAD, 46, 22, t.fg, clip(a.name, 22, nameMax), ` font-weight="700"`),
    a.owner ? text(PAD, 68, 13, t.muted, `@${a.owner}`) : "",
    rate ? text(W - PAD, 44, 12, t.muted, rate, ` text-anchor="end"`) : "",
    `<line x1="${PAD}" y1="86" x2="${W - PAD}" y2="86" stroke="${t.border}"/>`,
    ...stats.map(([label, value, max, fill], i) =>
      text(col[i], 108, 11, t.muted, label, ` font-weight="600" letter-spacing="1"`) +
      text(col[i], 134, fit(value, 22, max), fill, value, ` font-weight="700"`)),
    `</svg>`,
    "",
  ].filter(Boolean).join("\n");
}

function main([path]) {
  if (!path) throw new Error("usage: node card.mjs <agent.json>");
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (e) {
    throw new Error(`cannot read ${path}: ${e.code ?? e.message}`);
  }
  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(`${path} is not valid JSON`);
  }
  process.stdout.write(card(validate(json)));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`card: ${e.message}\n`);
    process.exit(1);
  }
}
