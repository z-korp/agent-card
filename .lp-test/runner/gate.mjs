#!/usr/bin/env node
// gate.mjs: the Season 0 gate script. Runs a round's cumulative checks on an entry in the pinned runner
// and writes the attested gate transcript (launchpad-gate/1). Entrants run it before their reveal; the
// house verifier re-runs it on every attested pass and compares the transcripts byte for byte.
// No dependencies: Node 18+, git, and Docker or rootless Podman (or --runner local, for tests and machines
// without either: no isolation, and a transcript the platform refuses for a real round).
//
//   node gate.mjs --base <round base commit> --project <slug> --round <n> [--repo .] [--out gate-transcript.json]
//                 [--container docker|podman]     (default: LAUNCHPAD_CONTAINER, else docker)
//
// The harness is every check under .launchpad/checks/ at the BASE commit (round-1/, round-2/, ...): this
// round's and every earlier round's, so an entry is eligible only if it passes all of them. An entry whose
// diff touches .launchpad/checks fails.
//
// Dependencies are installed first, in their own container with the network on: only the entry's
// package.json and lockfile are in it (never its .npmrc or any other file), npm ignores every user and
// global config, takes every tarball from the pinned registry, uses the image's git and runs no install
// script. The check tools come from the base's own lockfile (on PATH as /tools/node_modules/.bin), never
// from the entry's.
//
// Each check then runs in a fresh container with no network, a read-only root and harness, CPU, memory,
// process and time limits, and the entry's tree copied into a size-limited tmpfs (/work). The harness runs
// as the runner's root, with no capability but SETUID, SETGID, KILL and DAC_OVERRIDE; every process it
// starts runs as the entry's user (1000), without any capability. The report ($LAUNCHPAD_GATE_OUT) is on a
// tmpfs only the harness can open, and the gate reads it from the container's supervisor, which the
// entry cannot reach. A check passes only if its harness reports at least one test, all of them passed,
// and, when its check.json lists `tests`, exactly those tests.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

export const PROTOCOL = "launchpad-gate/1";
export const RUNNER = {
  image: "mcr.microsoft.com/playwright@sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27",
  network: "none", user: "1000:1000", readOnly: true, cpus: 2, memory: "2g", pids: 512, timeoutSeconds: 600,
};
export const LOCAL_IMAGE = `local@sha256:${"0".repeat(64)}`;
/**
 * The rest of the sandbox (not in the transcript: an honest entry gets the same result with or without it).
 * `work` and `tmp` are tmpfs sizes (they count in the container's memory), `out` holds the report; a check's
 * container lives at most `graceSeconds` past its timeout before the gate kills it.
 */
export const SANDBOX = { work: "1g", tmp: "512m", out: "16m", reportBytes: 8 * 1024 * 1024, graceSeconds: 120, installSeconds: 600,
  harnessCaps: ["SETUID", "SETGID", "KILL", "DAC_OVERRIDE"] };
/** Every package tarball comes from this registry, whatever the lockfile's `resolved` URLs say. */
export const NPM_REGISTRY = "https://registry.npmjs.org/";
const HARNESS = ".launchpad/checks";
const LOCKFILES = ["npm-shrinkwrap.json", "package-lock.json"];
const RESULT_MARK = "@@launchpad-gate-result@@";

/** The machine cannot run the gate (the container engine failed): nothing is said about the entry. */
export class GateInfraError extends Error {}

/**
 * The container engine's command line for one isolated step: `docker` by default, or `podman` (rootless)
 * through LAUNCHPAD_CONTAINER or the `container` option (a name or a path). The isolation is the same; under
 * rootless Podman the profile's user is mapped to the host user (`--userns keep-id`), so what an install
 * writes stays the host user's, and the mounts are relabeled for SELinux (`:Z`). The engine is not in the
 * transcript: Docker and Podman runs of the same entry give the same transcript.
 */
export function containerEngine(container = process.env.LAUNCHPAD_CONTAINER || "docker", user = RUNNER.user) {
  const podman = /^podman(\.exe)?$/.test(basename(container));
  const [uid, gid] = user.split(":");
  return {
    bin: container,
    podman,
    /** Flags for the profile's user: under rootless Podman it is the host user, seen as `user` inside. */
    userns: podman ? ["--userns", `keep-id:uid=${uid},gid=${gid ?? uid}`] : [],
    /** `-v host:path:mode`, relabeled for SELinux under Podman. */
    volume: (host, path, mode) => ["-v", `${host}:${path}:${mode}${podman ? ",Z" : ""}`],
  };
}

/** JSON with sorted keys and no whitespace: the platform's canonical form (src/platform/sealed.ts). */
export function canonicalJson(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(v[k])}`).join(",")}}`;
}

const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const git = (repo, args, opts = {}) => execFileSync("git", ["-C", repo, ...args], { maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"], ...opts });

/** Files under .launchpad/checks at `commit`, sorted, and their sha256 digest (paths and contents). */
export function harnessAt(repo, commit) {
  const files = git(repo, ["ls-tree", "-r", "-z", "--name-only", commit, "--", HARNESS]).toString().split("\0").filter(Boolean).sort();
  const h = createHash("sha256");
  const contents = new Map();
  for (const f of files) {
    const b = git(repo, ["show", `${commit}:${f}`]);
    contents.set(f, b);
    h.update(f).update("\0").update(b).update("\0");
  }
  return { files, contents, digest: h.digest("hex") };
}

/** Test results from a check's report: vitest's JSON reporter, or {"tests":[{"name","status"}]}. */
export function testsFromReport(text) {
  let r;
  try {
    r = JSON.parse(text);
  } catch {
    return [];
  }
  const norm = (s) => (s === "passed" || s === "pass" ? "passed" : s === "failed" || s === "fail" ? "failed" : "skipped");
  const tests = [];
  if (Array.isArray(r?.testResults)) {
    for (const f of r.testResults) for (const a of f.assertionResults ?? []) tests.push({ name: String(a.fullName ?? a.title), status: norm(a.status) });
  } else if (Array.isArray(r?.tests)) {
    for (const t of r.tests) tests.push({ name: String(t.name), status: norm(t.status) });
  }
  return tests.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/**
 * A check's status from what its harness reported. It passes only if the check exited 0 and reported at
 * least one test, none failed, and, when the check lists its `expected` tests (check.json `tests`), the
 * report names exactly those, each passed. An exit code alone never makes a pass.
 */
export function checkStatus({ timedOut = false, code, tests, expected }) {
  if (timedOut) return "timeout";
  if (code === null || code === undefined) return "error";
  if (code !== 0 || !tests.some((t) => t.status === "passed") || tests.some((t) => t.status === "failed")) return "failed";
  if (Array.isArray(expected)) {
    const want = [...new Set(expected.map(String))].sort();
    const got = tests.map((t) => t.name);
    if (got.length !== want.length || got.some((n, i) => n !== want[i]) || tests.some((t) => t.status !== "passed")) return "failed";
  }
  return "passed";
}

/** Runs a command; `stdout` is kept whole (up to 32 MB), the merged output's tail in `out`. */
function run(cmd, args, { timeoutMs, cwd, env, onTimeout } = {}) {
  return new Promise((done) => {
    const child = spawn(cmd, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    const stdout = [];
    let size = 0;
    child.stdout.on("data", (d) => {
      if ((size += d.length) <= 32 * 1024 * 1024) stdout.push(d);
      out = (out + d).slice(-20000);
    });
    child.stderr.on("data", (d) => (out = (out + d).slice(-20000)));
    let timedOut = false;
    const timer = timeoutMs ? setTimeout(() => {
      timedOut = true;
      onTimeout?.();
      child.kill("SIGKILL");
    }, timeoutMs) : null;
    child.on("error", (e) => { if (timer) clearTimeout(timer); done({ code: 127, spawnError: true, timedOut, out: String(e), stdout: "" }); });
    child.on("close", (code) => { if (timer) clearTimeout(timer); done({ code: code ?? 1, timedOut, out, stdout: Buffer.concat(stdout).toString("utf8") }); });
  });
}

/** Writes `files` (path → bytes) under `dir`. */
function writeTree(dir, files) {
  for (const [path, bytes] of files) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), bytes);
  }
}

/** Removes a work directory whatever a check left in it; never throws (a failed cleanup is only reported). */
export function removeTree(dir) {
  try {
    spawnSync("chmod", ["-R", "u+rwX", dir], { stdio: "ignore" });
    rmSync(dir, { recursive: true, force: true, maxRetries: 2 });
  } catch (e) {
    process.stderr.write(`gate: could not remove ${dir}: ${e instanceof Error ? e.message : e}\n`);
  }
}

/**
 * npm's environment for an install: no user or global config (the entry's .npmrc is not even in the
 * install directory; /dev/null/npmrc can never exist, and npm refuses one file for both), the image's git,
 * every tarball from the pinned registry, no install script.
 */
export const INSTALL_ENV = {
  npm_config_userconfig: "/dev/null", npm_config_globalconfig: "/dev/null/npmrc", npm_config_git: "git",
  npm_config_registry: NPM_REGISTRY, npm_config_replace_registry_host: "always", npm_config_ignore_scripts: "true",
  npm_config_audit: "false", npm_config_fund: "false", npm_config_update_notifier: "false", npm_config_umask: "0",
};
const INSTALL = "umask 000; npm ci --loglevel=error; s=$?; chmod -R a+rwX . 2>/dev/null; exit $s";

/**
 * Why a lockfile cannot be installed in the runner, or null: every package must be a registry tarball.
 * Git, local (file:, link) and workspace packages are refused: they reach other hosts or files outside the
 * install directory, and a git host can serve another tree on the re-run.
 */
export function lockfileSources(bytes) {
  let lock;
  try {
    lock = JSON.parse(bytes.toString("utf8"));
  } catch {
    return "the lockfile is not valid JSON";
  }
  const bad = [];
  for (const [path, p] of Object.entries(lock?.packages ?? {})) {
    if (path === "") continue;
    if (p?.link || (p?.resolved !== undefined && !/^https?:\/\//.test(String(p.resolved)))) bad.push(path.replace(/^.*node_modules\//, ""));
  }
  // lockfileVersion 1: nested `dependencies`, the source in `version` or `resolved`.
  const walk = (deps) => {
    for (const [name, d] of Object.entries(deps ?? {})) {
      if (/^(git|github|gitlab|bitbucket|gist|file|link):|^git\+/.test(String(d?.version ?? "")) || (d?.resolved !== undefined && !/^https?:\/\//.test(String(d.resolved)))) bad.push(name);
      walk(d?.dependencies);
    }
  };
  if (!lock?.packages) walk(lock?.dependencies);
  return bad.length ? `the lockfile has packages that are not registry tarballs (git, local or workspace packages are not installed in the runner): ${[...new Set(bad)].slice(0, 5).join(", ")}` : null;
}

/**
 * What to install for a package: null with no dependencies, the files npm needs (package.json and its
 * lockfile), or an error. A package with dependencies and no lockfile is refused: there is no `npm install`.
 */
export function packageToInstall(files) {
  const pkg = files.get("package.json");
  if (!pkg) return null;
  let json;
  try {
    json = JSON.parse(pkg.toString("utf8"));
  } catch {
    return { error: "package.json is not valid JSON" };
  }
  const deps = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"].some((k) => json?.[k] && Object.keys(json[k]).length);
  if (!deps) return null;
  const lock = LOCKFILES.find((f) => files.has(f));
  if (!lock) return { error: "package.json has dependencies but no package-lock.json: npm ci needs a lockfile" };
  const odd = lockfileSources(files.get(lock));
  if (odd) return { error: odd };
  return { files: new Map([["package.json", pkg], [lock, files.get(lock)]]), key: sha256(Buffer.concat([pkg, Buffer.from("\0"), files.get(lock)])) };
}

/** The sandboxed check runtime: run as root in the container, it is the only process that writes the gate's stdout. */
const SUPERVISOR = `// The check's supervisor (written by gate.mjs): copies the entry into /work as the entry's user, runs the
// harness as root with every child dropped to the entry's user, then prints the report on stdout.
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, readFileSync, statSync } from "node:fs";
const c = JSON.parse(readFileSync(process.argv[2], "utf8"));
const [uid, gid] = c.entryUser.split(":").map(Number);
process.umask(0);
try { chmodSync("/work/.launchpad", 0o1777); } catch {}
const copy = spawnSync("cp", ["-R", "-P", "/gate/entry/.", "/work/"], { uid, gid, encoding: "utf8" });
let log = copy.status === 0 ? "" : \`copying the entry: \${copy.stderr}\`.slice(-2000);
const env = { ...process.env, ...c.env, PATH: \`/tools/node_modules/.bin:\${process.env.PATH}\`, LAUNCHPAD_ENTRY_USER: c.entryUser,
  NODE_OPTIONS: "--import=/gate/sup/as-entry.mjs" };
let done = false;
const finish = (r) => {
  if (done) return;
  done = true;
  let report = null;
  try {
    const st = statSync("/out/report.json");
    if (st.isFile() && st.size <= c.reportBytes) report = readFileSync("/out/report.json", "utf8");
  } catch {}
  process.stdout.write(\`\\n\${c.mark}\${JSON.stringify({ ...r, report, log })}\\n\`, () => process.exit(0));
};
const child = spawn("sh", ["-c", c.run], { cwd: "/work", env, stdio: ["ignore", "pipe", "pipe"] });
child.stdout.on("data", (d) => (log = (log + d).slice(-20000)));
child.stderr.on("data", (d) => (log = (log + d).slice(-20000)));
setTimeout(() => finish({ code: null, timedOut: true }), c.timeoutMs).unref();
child.on("error", (e) => finish({ code: 127, timedOut: false, error: String(e) }));
// The harness's exit ends the check, even if a process it started still holds its output.
child.on("exit", (code, signal) => finish({ code: code ?? 128, signal, timedOut: false }));
`;

/** Loaded (node --import) into the harness's Node processes: whatever starts a process starts it as the entry's user. */
const AS_ENTRY = `// Loaded by NODE_OPTIONS into the harness's Node processes (written by gate.mjs). The harness runs as root
// in the runner; every process it starts runs as the entry's user, which drops every capability, so the
// entry's code never runs beside the harness and never reaches its report. Git in those processes trusts
// the repositories the harness made (safe.directory): they belong to root.
import cp from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
if (process.getuid?.() === 0) {
  const [uid, gid] = (process.env.LAUNCHPAD_ENTRY_USER ?? "1000:1000").split(":").map(Number);
  const safeGit = (env) => {
    const n = Number(env.GIT_CONFIG_COUNT) || 0;
    return { ...env, GIT_CONFIG_COUNT: String(n + 1), [\`GIT_CONFIG_KEY_\${n}\`]: "safe.directory", [\`GIT_CONFIG_VALUE_\${n}\`]: "*" };
  };
  const spawnAs = cp.ChildProcess.prototype.spawn;
  cp.ChildProcess.prototype.spawn = function (options) {
    if (!options.envPairs) return spawnAs.call(this, { ...options, uid, gid });
    const env = Object.fromEntries(options.envPairs.map((p) => [p.slice(0, p.indexOf("=")), p.slice(p.indexOf("=") + 1)]));
    return spawnAs.call(this, { ...options, uid, gid, envPairs: Object.entries(safeGit(env)).map(([k, v]) => \`\${k}=\${v}\`) });
  };
  const opts = (o) => ({ ...(o ?? {}), uid, gid, env: safeGit(o?.env ?? process.env) });
  const withArgs = (f) => (file, args, o) => (Array.isArray(args) ? f(file, args, opts(o)) : f(file, [], opts(args)));
  const { spawnSync, execFileSync, execSync } = cp;
  cp.spawnSync = withArgs(spawnSync);
  cp.execFileSync = withArgs(execFileSync);
  cp.execSync = (command, o) => execSync(command, opts(o));
  syncBuiltinESMExports();
}
`;

/** Installs a package's dependencies in their own container (network on, no entry file but the package's). */
async function installIn(dir, { runner, engine, profile, verbose }) {
  if (runner === "local") {
    const env = { ...process.env, ...INSTALL_ENV, npm_config_cache: join(dir, ".npm-cache") };
    const r = await run("sh", ["-c", INSTALL], { cwd: dir, env, timeoutMs: SANDBOX.installSeconds * 1000 });
    return r.code === 0 ? null : `dependency install failed: ${r.out.slice(-600)}`;
  }
  const name = `gate-install-${randomBytes(6).toString("hex")}`;
  // Docker keeps the host's user ids: the install writes as the host user, so the gate can remove what it wrote.
  const user = engine.podman || !process.getuid?.() ? profile.user : `${process.getuid()}:${process.getgid()}`;
  try {
    const r = await run(engine.bin, ["run", "--rm", "--name", name, "--init", ...engine.userns, "--user", user, "--cap-drop", "ALL",
      "--security-opt", "no-new-privileges", "--cpus", String(profile.cpus), "--memory", profile.memory, "--pids-limit", String(profile.pids),
      "--read-only", "--tmpfs", "/tmp:rw,exec,size=1g,mode=1777", ...engine.volume(dir, "/deps", "rw"), "-w", "/deps",
      "-e", "HOME=/tmp", "-e", "npm_config_cache=/tmp/npm", ...Object.entries(INSTALL_ENV).flatMap(([k, v]) => ["-e", `${k}=${v}`]),
      profile.image, "sh", "-c", INSTALL], { timeoutMs: SANDBOX.installSeconds * 1000, onTimeout: () => killContainer(engine, name) });
    if (r.spawnError || (r.code === 125 && !r.timedOut)) throw new GateInfraError(`the container engine could not run the install: ${r.out.slice(-600)}`);
    if (verbose && r.code !== 0) process.stderr.write(`install: exit ${r.code}\n${r.out.slice(-2000)}\n`);
    return r.code === 0 ? null : r.timedOut ? `dependency install timed out after ${SANDBOX.installSeconds} s` : `dependency install failed: ${r.out.slice(-600)}`;
  } finally {
    removeContainer(engine, name);
  }
}

function killContainer(engine, name) {
  spawnSync(engine.bin, ["kill", name], { stdio: "ignore", timeout: 30_000 });
}
function removeContainer(engine, name) {
  spawnSync(engine.bin, ["rm", "-f", name], { stdio: "ignore", timeout: 60_000 });
}

/** The fail transcript of an entry the gate could not check (the verifier's, when the gate itself fails on it). */
export function errorTranscript(o, why = "error") {
  const repo = resolve(o.repo ?? ".");
  const runner = o.runner ?? "docker";
  const profile = { ...RUNNER, ...(runner === "local" ? { image: LOCAL_IMAGE } : {}), ...(o.image ? { image: o.image } : {}) };
  const commit = git(repo, ["rev-parse", "HEAD"]).toString().trim();
  const base = git(repo, ["rev-parse", o.base]).toString().trim();
  const harness = harnessAt(repo, base);
  const transcript = {
    protocol: PROTOCOL, project: o.project, round: Number(o.round), base, commit, bundleHash: git(repo, ["rev-parse", "HEAD^{tree}"]).toString().trim(),
    harnessDigest: harness.digest, runner: profile, harnessTouched: git(repo, ["diff", "--name-only", base, commit, "--", HARNESS]).toString().trim().length > 0,
    checks: [{ round: Number(o.round), name: "gate", status: "error", tests: [] }], result: "fail",
  };
  const text = canonicalJson(transcript);
  return { text, hash: sha256(text), result: transcript.result, transcript, why };
}

export async function gate(o) {
  const repo = resolve(o.repo ?? ".");
  const runner = o.runner ?? "docker";
  const profile = { ...RUNNER, ...(runner === "local" ? { image: LOCAL_IMAGE } : {}), ...(o.image ? { image: o.image } : {}) };
  const commit = git(repo, ["rev-parse", "HEAD"]).toString().trim();
  const base = git(repo, ["rev-parse", o.base]).toString().trim();
  const bundleHash = git(repo, ["rev-parse", "HEAD^{tree}"]).toString().trim();
  if (spawnSync("git", ["-C", repo, "merge-base", "--is-ancestor", base, commit]).status !== 0) throw new Error(`HEAD ${commit.slice(0, 10)} does not build on the base ${base.slice(0, 10)}`);
  const harness = harnessAt(repo, base);
  if (!harness.files.length) throw new Error(`the base ${base.slice(0, 10)} has no checks under ${HARNESS}`);
  const harnessTouched = git(repo, ["diff", "--name-only", base, commit, "--", HARNESS]).toString().trim().length > 0;
  const engine = containerEngine(o.container, profile.user);
  const say = (line) => o.verbose && process.stderr.write(`${line}\n`);

  const workRoot = o.work ?? join(homedir(), ".launchpad", "runner");
  mkdirSync(workRoot, { recursive: true });
  const work = mkdtempSync(join(workRoot, "gate-"));
  const ws = join(work, "ws"), hdir = join(work, "harness"), out = join(work, "out"), sup = join(work, "sup");
  for (const d of [ws, hdir, out, sup]) mkdirSync(d, { recursive: true });
  const containers = [];
  const checks = [];
  // This round's checks and every earlier round's; a later round's checks, if already committed, wait for it.
  const rounds = [...new Set(harness.files.map((f) => /^\.launchpad\/checks\/round-(\d+)\//.exec(f)?.[1]).filter(Boolean))].map(Number)
    .filter((n) => n <= Number(o.round) && harness.contents.has(`${HARNESS}/round-${n}/check.json`)).sort((a, b) => a - b);
  const cfgOf = (n) => {
    try {
      return JSON.parse(harness.contents.get(`${HARNESS}/round-${n}/check.json`).toString());
    } catch {
      return null;
    }
  };
  try {
    // The entry's tree as committed (no shell: nothing of the payload reaches one), without the harness.
    const tar = join(work, "entry.tar");
    git(repo, ["archive", "--format=tar", "-o", tar, commit]);
    execFileSync("tar", ["-x", "-f", tar, "-C", ws], { stdio: ["ignore", "ignore", "pipe"] });
    rmSync(tar, { force: true });
    rmSync(join(ws, HARNESS), { recursive: true, force: true });
    writeTree(hdir, [...harness.contents].map(([p, b]) => [p.slice(HARNESS.length + 1), b]));
    if (runner === "local") writeTree(ws, [...harness.contents]);
    writeFileSync(join(sup, "supervisor.mjs"), SUPERVISOR);
    writeFileSync(join(sup, "as-entry.mjs"), AS_ENTRY);
    // Readable by the runner's users whatever the host's umask (the copies under Docker keep the host's ids).
    spawnSync("chmod", ["-R", "a+rX", ws, hdir, sup], { stdio: "ignore" });

    // Dependencies: the entry's (for its code), and the check tools from the base's lockfile (the same install when they match).
    const fileAt = (f) => (existsSync(join(ws, f)) ? readFileSync(join(ws, f)) : undefined);
    const baseFile = (f) => {
      try {
        return git(repo, ["show", `${base}:${f}`]);
      } catch {
        return undefined;
      }
    };
    const pkgs = ["package.json", ...LOCKFILES];
    const entryPkg = packageToInstall(new Map(pkgs.filter((f) => fileAt(f)).map((f) => [f, fileAt(f)])));
    const basePkg = packageToInstall(new Map(pkgs.filter((f) => baseFile(f)).map((f) => [f, baseFile(f)])));
    const installs = new Map();
    const install = async (pkg, label) => {
      if (!pkg) return { dir: null };
      if (pkg.error) return { error: `${label}: ${pkg.error}` };
      if (!installs.has(pkg.key)) {
        const dir = join(work, `deps-${installs.size}`);
        writeTree(dir, [...pkg.files]);
        const once = () => installIn(dir, { runner, engine, profile, verbose: o.verbose });
        // One retry: a registry hiccup is not the entry's fault (a timeout is not retried).
        let error = await once();
        if (error && !error.includes("timed out")) error = await once();
        installs.set(pkg.key, error ? { error: `${label}: ${error}` } : { dir: join(dir, "node_modules") });
      }
      return installs.get(pkg.key);
    };
    const deps = await install(entryPkg, "the entry's dependencies");
    const tools = await install(basePkg, "the base's check tools");
    const installError = deps.error ?? tools.error;
    if (installError) say(installError);
    if (runner === "local" && deps.dir) symlinkSync(deps.dir, join(ws, "node_modules"));

    for (const n of rounds) {
      const cfg = cfgOf(n);
      const name = String(cfg?.name ?? `round-${n}`);
      if (!cfg || typeof cfg.run !== "string" || installError) {
        checks.push({ round: n, name, status: "error", tests: [] });
        say(`round ${n} (${name}): error, ${installError ?? "check.json needs a run command"}`);
        continue;
      }
      const timeoutMs = Math.min(cfg.timeoutSeconds ?? profile.timeoutSeconds, profile.timeoutSeconds) * 1000;
      const env = { LAUNCHPAD_GATE_OUT: "/out/report.json", LAUNCHPAD_SANDBOXED: "1", LAUNCHPAD_ROUND: String(n), HOME: "/tmp", CI: "1", npm_config_cache: "/tmp/npm" };
      let r;
      if (runner === "local") {
        const localOut = join(out, `local-${n}`);
        mkdirSync(localOut, { recursive: true });
        const report = join(localOut, "report.json");
        const path = tools.dir ? `${join(tools.dir, ".bin")}:${process.env.PATH}` : process.env.PATH;
        const x = await run("sh", ["-c", cfg.run], { cwd: ws, timeoutMs, env: { ...process.env, ...env, PATH: path, HOME: process.env.HOME, npm_config_cache: process.env.npm_config_cache, LAUNCHPAD_GATE_OUT: report } });
        r = { code: x.timedOut ? null : x.code, timedOut: x.timedOut, report: existsSync(report) ? readFileSync(report, "utf8") : null, log: x.out };
      } else {
        const container = `gate-${randomBytes(6).toString("hex")}`;
        containers.push(container);
        writeFileSync(join(sup, `check-${n}.json`), JSON.stringify({ run: cfg.run, timeoutMs, entryUser: profile.user, env, reportBytes: SANDBOX.reportBytes, mark: RESULT_MARK }));
        spawnSync("chmod", ["a+r", join(sup, `check-${n}.json`)], { stdio: "ignore" });
        try {
          const x = await run(engine.bin, ["run", "--rm", "--name", container, "--init", ...engine.userns, "--user", "0:0", "--cap-drop", "ALL",
            ...SANDBOX.harnessCaps.flatMap((c) => ["--cap-add", c]), "--security-opt", "no-new-privileges", "--cpus", String(profile.cpus),
            "--memory", profile.memory, "--pids-limit", String(profile.pids), "--network", "none", "--read-only",
            "--tmpfs", `/tmp:rw,exec,size=${SANDBOX.tmp},mode=1777`, "--tmpfs", `/work:rw,exec,size=${SANDBOX.work},mode=1777`,
            "--tmpfs", `/out:rw,noexec,size=${SANDBOX.out},mode=0700`,
            ...engine.volume(ws, "/gate/entry", "ro"), ...engine.volume(sup, "/gate/sup", "ro"), ...engine.volume(hdir, `/work/${HARNESS}`, "ro"),
            ...(deps.dir ? engine.volume(deps.dir, "/work/node_modules", "ro") : []), ...(tools.dir ? engine.volume(tools.dir, "/tools/node_modules", "ro") : []),
            "-w", "/work", profile.image, "node", "/gate/sup/supervisor.mjs", `/gate/sup/check-${n}.json`],
          { timeoutMs: timeoutMs + SANDBOX.graceSeconds * 1000, onTimeout: () => killContainer(engine, container) });
          const at = x.stdout.lastIndexOf(RESULT_MARK);
          if (at >= 0) {
            r = JSON.parse(x.stdout.slice(at + RESULT_MARK.length).split("\n")[0]);
          } else if (x.timedOut) {
            r = { code: null, timedOut: true, report: null, log: x.out };
          } else if (x.spawnError || x.code === 125) {
            throw new GateInfraError(`the container engine could not run the check: ${x.out.slice(-600)}`);
          } else {
            r = { code: null, timedOut: false, report: null, log: x.out };
          }
        } finally {
          removeContainer(engine, container);
        }
      }
      const tests = r.report ? testsFromReport(r.report) : [];
      const status = checkStatus({ timedOut: r.timedOut, code: r.code, tests, expected: cfg.tests });
      checks.push({ round: n, name, status, tests });
      say(`round ${n} (${name}): ${status}, ${tests.length} tests\n${status === "passed" ? "" : String(r.log ?? "").slice(-2000)}`);
    }
  } catch (e) {
    if (e instanceof GateInfraError) throw e;
    // Whatever went wrong is about this entry: it fails, and the gate still writes its transcript.
    say(`gate: ${e instanceof Error ? e.message : e}`);
    for (const n of rounds) if (!checks.some((c) => c.round === n)) checks.push({ round: n, name: String(cfgOf(n)?.name ?? `round-${n}`), status: "error", tests: [] });
  } finally {
    if (runner !== "local") for (const c of containers) removeContainer(engine, c);
    if (!o.keep) removeTree(work);
  }
  const transcript = {
    protocol: PROTOCOL, project: o.project, round: Number(o.round), base, commit, bundleHash, harnessDigest: harness.digest,
    runner: profile, harnessTouched, checks,
    result: !harnessTouched && checks.length > 0 && checks.every((c) => c.status === "passed") ? "pass" : "fail",
  };
  const text = canonicalJson(transcript);
  return { text, hash: sha256(text), result: transcript.result, transcript, containers };
}

function args(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (!k.startsWith("--")) continue;
    const name = k.slice(2);
    if (["keep", "verbose"].includes(name)) o[name] = true;
    else o[name] = argv[++i];
  }
  return o;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("gate.mjs")) {
  const o = args(process.argv.slice(2));
  if (!o.base || !o.project || !o.round) {
    process.stderr.write("usage: node gate.mjs --base <sha> --project <slug> --round <n> [--repo <dir>] [--out <file>] [--runner docker|local] [--container docker|podman] [--verbose]\n");
    process.exit(2);
  }
  gate(o).then((r) => {
    const outFile = o.out ?? "gate-transcript.json";
    writeFileSync(outFile, r.text);
    process.stdout.write(JSON.stringify({ ok: true, data: { result: r.result, transcriptHash: r.hash, file: outFile, checks: r.transcript.checks.map((c) => `${c.name}: ${c.status}`) } }) + "\n");
    process.exit(r.result === "pass" ? 0 : 1);
  }).catch((e) => {
    process.stderr.write(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }) + "\n");
    process.exit(2);
  });
}
