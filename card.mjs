#!/usr/bin/env node
// node card.mjs <agent.json>: prints the agent's SVG card on stdout, or one reason on stderr.
import { readFileSync } from "node:fs";
import { parseAgent } from "./src/agent.mjs";
import { renderCard } from "./src/card.mjs";

try {
  const path = process.argv[2];
  if (!path) throw new Error("usage: node card.mjs <agent.json>");
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (e) {
    throw new Error(`cannot read ${path}: ${e.code ?? e.message}`);
  }
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new Error(`${path} is not valid JSON: ${e.message}`);
  }
  process.stdout.write(renderCard(parseAgent(json)));
} catch (e) {
  process.stderr.write(`card: ${e.message}\n`);
  process.exitCode = 1;
}
