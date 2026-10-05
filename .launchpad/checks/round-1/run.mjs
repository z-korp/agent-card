// Round 1's checks: one agent's card (the round's brief has the interface). They run the entry's
// `node card.mjs` and write {"tests":[{"name","status"}]} to $LAUNCHPAD_GATE_OUT for the gate.
// Run them yourself from the repository's root: node .launchpad/checks/round-1/run.mjs
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, card, cardTitle, check, harness, input, refuses, render, titleOf, visibleText } from "./lib/card.mjs";

const { test, done } = harness();
const SAMPLE = { name: "opus-a", owner: "Cheelax", points: 4_200_000, wins: 2, rounds: 5, since: "2026-10-05" };

await test("prints a well-formed SVG card, at most 600×300 px and 20 KB, that loads nothing from outside", () => {
  check(existsSync(join(ROOT, "card.mjs")), "no card.mjs at the root of the repository");
  render([input(SAMPLE)]);
});

await test("its <title> reads \"name: points, wins in rounds\"", () => {
  const { root } = render([input(SAMPLE)]);
  check(titleOf(root) === cardTitle(SAMPLE), `the title is "${titleOf(root)}", expected "${cardTitle(SAMPLE)}"`);
});

await test("it shows the name, the points with commas and the owner as @login", () => {
  const shown = visibleText(render([input(SAMPLE)]).root);
  for (const part of ["opus-a", "4,200,000", "@Cheelax"]) check(shown.includes(part), `"${part}" is not in the card's text: "${shown.slice(0, 200)}"`);
});

await test("one reads singular, zero reads plural, and no owner shows no @", () => {
  for (const a of [{ name: "solo", points: 1, wins: 1, rounds: 1 }, { name: "fresh", points: 0, wins: 0, rounds: 0 }]) {
    const { root } = render([input(a)]);
    check(titleOf(root) === cardTitle(a), `the title is "${titleOf(root)}", expected "${cardTitle(a)}"`);
    check(!visibleText(root).includes("@"), `a card without an owner shows "@": "${visibleText(root).slice(0, 200)}"`);
  }
});

await test("large numbers keep their commas", () => {
  const a = { name: "veteran", points: 1_234_567_890, wins: 999, rounds: 1000 };
  const { root } = render([input(a)]);
  check(titleOf(root) === cardTitle(a), `the title is "${titleOf(root)}", expected "${cardTitle(a)}"`);
  check(visibleText(root).includes("1,234,567,890"), "1,234,567,890 is not in the card's text");
});

await test("markup in a name is escaped", () => {
  const a = { name: `Tom & <Jerry> "Q" 'x'`, points: 10, wins: 0, rounds: 2 };
  const { root } = render([input(a)]);
  check(titleOf(root) === cardTitle(a), `the title is "${titleOf(root)}", expected "${cardTitle(a)}"`);
  check(visibleText(root).includes(a.name), "the name is not in the card's text as given");
});

await test("non-ASCII names come through", () => {
  const a = { name: "Zoë · 机器人 🤖", owner: "zoe-bot", points: 77, wins: 1, rounds: 3 };
  const { root } = render([input(a)]);
  check(titleOf(root) === cardTitle(a), `the title is "${titleOf(root)}", expected "${cardTitle(a)}"`);
  check(visibleText(root).includes(a.name), "the name is not in the card's text as given");
});

await test("a 40-character name fits: the title has it whole, the card at least its first 16 characters", () => {
  const a = { name: "an-agent-with-a-very-long-name-indeed-40", points: 5, wins: 0, rounds: 1 };
  check([...a.name].length === 40, "fixture: the name must be 40 characters");
  const { root } = render([input(a)]);
  check(titleOf(root) === cardTitle(a), `the title is "${titleOf(root)}", expected "${cardTitle(a)}"`);
  check(visibleText(root).includes(a.name.slice(0, 16)), `"${a.name.slice(0, 16)}" is not in the card's text`);
});

await test("the same input gives the same bytes", () => {
  const path = input(SAMPLE);
  check(render([path]).svg === render([path]).svg, "two runs on the same input printed different cards");
});

await test("examples/agent.svg is the card of examples/agent.json", () => {
  check(existsSync(join(ROOT, "examples/agent.svg")), "examples/agent.svg is not committed");
  const { svg } = render(["examples/agent.json"]);
  check(readFileSync(join(ROOT, "examples/agent.svg"), "utf8") === svg, "examples/agent.svg differs from node card.mjs examples/agent.json");
});

await test("bad input exits non-zero, with a reason on stderr and nothing on stdout", () => {
  const ok = { name: "ok", points: 1, wins: 0, rounds: 0 };
  // A program that refuses everything is not a card: the same input, valid, must render.
  render([input(ok)]);
  refuses([], "no argument");
  refuses([join(ROOT, "no-such-file.json")], "a missing file");
  refuses([input("{ not json")], "invalid JSON");
  refuses([input([ok])], "an array instead of an object");
  const bad = {
    "no name": { ...ok, name: undefined },
    "a blank name": { ...ok, name: "   " },
    "a 41-character name": { ...ok, name: "x".repeat(41) },
    "a name that is a number": { ...ok, name: 42 },
    "negative points": { ...ok, points: -1 },
    "fractional points": { ...ok, points: 1.5 },
    "points as a string": { ...ok, points: "12" },
    "no rounds": { ...ok, rounds: undefined },
    "more wins than rounds": { ...ok, wins: 3, rounds: 2 },
    "an owner that is not a GitHub login": { ...ok, owner: "not a login!" },
    "a 40-character owner": { ...ok, owner: "o".repeat(40) },
  };
  for (const [what, a] of Object.entries(bad)) refuses([input(a)], what);
});

// Not a check of its own: a card that cannot even start says why once, above the failures.
if (!existsSync(join(ROOT, "card.mjs"))) console.error("note: there is no card.mjs yet, so every check fails");
else if (card(input(SAMPLE)).code !== 0) console.error("note: node card.mjs fails on the sample input, so most checks fail");

done();
