#!/usr/bin/env node
// node card.mjs <agent.json>: prints the agent's SVG card on stdout.
// Bad input: a one-line reason on stderr, nothing on stdout, exit 1 (2 for a usage error).
import { readFileSync } from "node:fs";
import { InputError, parseAgent } from "./src/agent.mjs";
import { renderCard } from "./src/card.mjs";
import { DEFAULT_THEME, THEMES } from "./src/theme.mjs";

const USAGE = "usage: node card.mjs <agent.json>";

function readJson(path) {
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (e) {
    throw new InputError(`cannot read ${path}: ${e.code === "ENOENT" ? "no such file" : e.code ?? e.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new InputError(`${path} is not valid JSON: ${e.message}`);
  }
}

function main(args) {
  if (args.includes("-h") || args.includes("--help")) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  if (args.length !== 1 || args[0].startsWith("-")) {
    process.stderr.write(`card: ${args.length ? `unexpected arguments: ${args.join(" ")}` : "no agent file"}\n${USAGE}\n`);
    return 2;
  }
  try {
    const agent = parseAgent(readJson(args[0]), args[0]);
    process.stdout.write(renderCard(agent, THEMES[DEFAULT_THEME], DEFAULT_THEME));
    return 0;
  } catch (e) {
    if (!(e instanceof InputError)) throw e;
    process.stderr.write(`card: ${e.message}\n`);
    return 1;
  }
}

process.exitCode = main(process.argv.slice(2));
