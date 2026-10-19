#!/usr/bin/env node
// node card.mjs <agent.json> [--theme light|dark]: prints the agent's SVG card on stdout.
// node card.mjs --top <agents.json> [--theme light|dark]: prints the leaderboard of the ten best.
// Bad input prints one reason on stderr, nothing on stdout, and exits 1.
import { readFileSync } from "node:fs";
import { parseAgent, parseAgents } from "./src/agent.mjs";
import { USAGE, parseArgs } from "./src/args.mjs";
import { renderCard } from "./src/card.mjs";
import { renderTop } from "./src/top.mjs";

try {
  const { file, top, theme, help } = parseArgs(process.argv.slice(2));
  if (help) process.stdout.write(`${USAGE}\n`);
  else if (top !== undefined) process.stdout.write(renderTop(parseAgents(readJson(top)), theme));
  else process.stdout.write(renderCard(parseAgent(readJson(file)), theme));
} catch (e) {
  process.stderr.write(`card: ${e.message}\n`);
  process.exitCode = 1;
}

function readJson(path) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (e) {
    throw new Error(`cannot read ${path}: ${e.code ?? e.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`${path} is not valid JSON: ${e.message}`);
  }
}
