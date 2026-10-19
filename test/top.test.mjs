// node --test: the leaderboard's order and title, and the command line's flags. The round checks
// under .launchpad/checks/ cover the cards themselves.
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseArgs } from "../src/args.mjs";
import { byRank, topTitle } from "../src/top.mjs";

const agent = (name, points, wins) => ({ name, points, wins, rounds: wins });
const names = (list) => list.map((a) => a.name);

test("ranks by points, then wins, then name by code point", () => {
  const field = [agent("Émile", 5, 1), agent("zoë", 5, 1), agent("abe", 5, 1), agent("Zed", 5, 1), agent("more-wins", 5, 2), agent("leader", 9, 0)];
  assert.deepEqual(names(field.sort(byRank)), ["leader", "more-wins", "Zed", "abe", "zoë", "Émile"]);
});

test("names beyond U+FFFF sort by code point, not by UTF-16 unit", () => {
  // "Ａ" (U+FF21) is below "🤖" (U+1F916) as a code point, but above its first UTF-16 unit (U+D83E).
  assert.deepEqual(names([agent("🤖", 1, 0), agent("Ａ", 1, 0)].sort(byRank)), ["Ａ", "🤖"]);
  assert.deepEqual(names([agent("ab", 1, 0), agent("a", 1, 0)].sort(byRank)), ["a", "ab"]);
});

test("the title counts what is shown", () => {
  assert.equal(topTitle(0), "No agents yet");
  assert.equal(topTitle(1), "Top 1 agent");
  assert.equal(topTitle(3), "Top 3 agents");
  assert.equal(topTitle(10), "Top 10 agents");
});

test("flags come in any order, with a space or an =", () => {
  const want = { file: undefined, top: "a.json", theme: "dark", help: false };
  for (const argv of [["--top", "a.json", "--theme", "dark"], ["--theme", "dark", "--top", "a.json"], ["--theme=dark", "--top=a.json"]]) {
    assert.deepEqual(parseArgs(argv), want);
  }
  assert.equal(parseArgs(["agent.json"]).theme, "light");
});

test("bad flags are refused with a reason", () => {
  for (const [argv, reason] of [
    [[], /usage/],
    [["a.json", "--theme"], /--theme needs a value/],
    [["a.json", "--theme", "blue"], /unknown theme "blue"/],
    [["a.json", "--theme", "constructor"], /unknown theme/],
    [["--top"], /--top needs a file/],
    [["--top", "--theme", "dark"], /--top needs a file/],
    [["--top", "a.json", "b.json"], /not both/],
    [["a.json", "b.json"], /one agent file at a time/],
    [["a.json", "--theme", "dark", "--theme", "light"], /given twice/],
    [["a.json", "--size", "2"], /unknown option --size/],
  ]) {
    assert.throws(() => parseArgs(argv), reason, argv.join(" "));
  }
});
