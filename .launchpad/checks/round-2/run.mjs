// Round 2's checks: the themes and the leaderboard (the round's brief has the interface). Round 1's
// checks run too: the gate runs every earlier round's. Same report format, same helpers.
// Run them yourself from the repository's root: node .launchpad/checks/round-2/run.mjs
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, cardTitle, check, grouped, harness, input, refuses, render, titleOf, visibleText } from "../round-1/lib/card.mjs";

const { test, done } = harness();
const SAMPLE = { name: "opus-a", owner: "Cheelax", points: 4_200_000, wins: 2, rounds: 5 };
const TOP = { maxWidth: 600, maxHeight: 900, maxBytes: 48 * 1024 };
const themeOf = (root) => root.attrs["data-theme"];

// Twelve agents, with ties on points and on points and wins; names no other name contains.
const FIELD = [
  { name: "ada-7", points: 9_000, wins: 3, rounds: 4 },
  { name: "bea-3", points: 12_500, wins: 5, rounds: 6 },
  { name: "cyd-5", points: 9_000, wins: 4, rounds: 4 },
  { name: "dot-2", points: 300, wins: 0, rounds: 2 },
  { name: "eve-9", points: 9_000, wins: 3, rounds: 5 },
  { name: "fay-4", points: 75_000, wins: 9, rounds: 9 },
  { name: "gus-6", points: 0, wins: 0, rounds: 1 },
  { name: "hal-1", points: 4_200, wins: 1, rounds: 3 },
  { name: "ivy-8", points: 1_000_000, wins: 12, rounds: 14 },
  { name: "joe-0", points: 50, wins: 0, rounds: 1 },
  { name: "kit-5", points: 600, wins: 1, rounds: 1 },
  { name: "lou-3", points: 9_000, wins: 4, rounds: 7 },
];
const byRank = (a, b) => b.points - a.points || b.wins - a.wins || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
const topTitle = (n) => (n === 0 ? "No agents yet" : `Top ${n} agent${n === 1 ? "" : "s"}`);

await test("--theme light is the default", () => {
  const path = input(SAMPLE);
  const plain = render([path]);
  const light = render([path, "--theme", "light"]);
  check(themeOf(plain.root) === "light", `the root's data-theme is ${JSON.stringify(themeOf(plain.root) ?? null)} without --theme, expected "light"`);
  check(plain.svg === light.svg, "the card without --theme differs from --theme light");
});

await test("--theme dark prints a different valid card, with the same title", () => {
  const path = input(SAMPLE);
  const light = render([path, "--theme", "light"]);
  const dark = render([path, "--theme", "dark"]);
  check(themeOf(dark.root) === "dark", `the root's data-theme is ${JSON.stringify(themeOf(dark.root) ?? null)}, expected "dark"`);
  check(dark.svg !== light.svg, "the dark card is the light card");
  check(titleOf(dark.root) === cardTitle(SAMPLE), `the dark card's title is "${titleOf(dark.root)}"`);
  check(render(["--theme", "dark", path]).svg === dark.svg, "--theme before the file gives another card than after it");
});

await test("an unknown or missing theme is refused", () => {
  const path = input(SAMPLE);
  render([path, "--theme", "dark"]); // a card that refuses every theme does not pass this one
  refuses([path, "--theme", "blue"], "--theme blue");
  refuses([path, "--theme"], "--theme with no value");
});

await test("examples/agent-dark.svg is the dark card of examples/agent.json", () => {
  check(existsSync(join(ROOT, "examples/agent-dark.svg")), "examples/agent-dark.svg is not committed");
  const { svg } = render(["examples/agent.json", "--theme", "dark"]);
  check(readFileSync(join(ROOT, "examples/agent-dark.svg"), "utf8") === svg, "examples/agent-dark.svg differs from node card.mjs examples/agent.json --theme dark");
});

await test("--top shows the ten best, by points, then wins, then name, in a card at most 600×900 px and 48 KB", () => {
  const { root } = render(["--top", input(FIELD)], TOP);
  const ranked = [...FIELD].sort(byRank);
  check(titleOf(root) === topTitle(10), `the title is "${titleOf(root)}", expected "${topTitle(10)}"`);
  const shown = visibleText(root);
  let at = -1;
  for (const a of ranked.slice(0, 10)) {
    const i = shown.indexOf(a.name);
    check(i >= 0, `${a.name} is in the top 10 but not on the card`);
    check(i > at, `${a.name} is shown before an agent ranked above it (expected order: ${ranked.slice(0, 10).map((x) => x.name).join(", ")})`);
    at = i;
  }
  for (const a of ranked.slice(10)) check(!shown.includes(a.name), `${a.name} is 11th or below but on the card`);
  check(shown.includes(grouped(ranked[0].points)), `the leader's points, ${grouped(ranked[0].points)}, are not on the card`);
});

await test("--top with fewer than ten shows them all: Top 1 agent, Top 3 agents, No agents yet", () => {
  for (const n of [1, 3, 0]) {
    const field = FIELD.slice(0, n);
    const { root } = render(["--top", input(field)], TOP);
    check(titleOf(root) === topTitle(n), `with ${n}, the title is "${titleOf(root)}", expected "${topTitle(n)}"`);
    for (const a of field) check(visibleText(root).includes(a.name), `${a.name} is not on the card`);
  }
});

await test("--top takes --theme, in any order", () => {
  const path = input(FIELD);
  const dark = render(["--top", path, "--theme", "dark"], TOP);
  check(themeOf(dark.root) === "dark", `the leaderboard's data-theme is ${JSON.stringify(themeOf(dark.root) ?? null)}, expected "dark"`);
  check(render(["--theme", "dark", "--top", path], TOP).svg === dark.svg, "--theme before --top gives another card than after it");
  check(themeOf(render(["--top", path], TOP).root) === "light", "the leaderboard is not light by default");
});

await test("--top refuses a file that is not a list, or a list with a bad agent", () => {
  render(["--top", input(FIELD.slice(0, 3))], TOP); // a card that refuses every list does not pass this one
  refuses(["--top", input(SAMPLE)], "an object instead of a list");
  refuses(["--top", input("[ not json")], "invalid JSON");
  refuses(["--top"], "--top with no file");
  refuses(["--top", input([...FIELD.slice(0, 3), { name: "", points: 1, wins: 0, rounds: 0 }])], "a list with a blank name");
  refuses(["--top", input([...FIELD.slice(0, 3), { name: "x", points: -5, wins: 0, rounds: 0 }])], "a list with negative points");
});

await test("the same list gives the same bytes", () => {
  const path = input(FIELD);
  check(render(["--top", path], TOP).svg === render(["--top", path], TOP).svg, "two runs on the same list printed different cards");
});

await test("examples/top.svg is the leaderboard of examples/top.json", () => {
  check(existsSync(join(ROOT, "examples/top.svg")), "examples/top.svg is not committed");
  const { svg } = render(["--top", "examples/top.json"], TOP);
  check(readFileSync(join(ROOT, "examples/top.svg"), "utf8") === svg, "examples/top.svg differs from node card.mjs --top examples/top.json");
});

done();
