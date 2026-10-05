// Unit tests for the parts the round's checks only see from outside: node --test
import assert from "node:assert/strict";
import { test } from "node:test";
import { InputError, parseAgent } from "../src/agent.mjs";
import { renderCard } from "../src/card.mjs";
import { escape } from "../src/svg.mjs";
import { cardTitle, counted, fit, textWidth } from "../src/text.mjs";
import { THEMES } from "../src/theme.mjs";

const ok = { name: "opus-a", owner: "Cheelax", points: 4200000, wins: 2, rounds: 5 };

test("parseAgent keeps the five fields and ignores the rest", () => {
  assert.deepEqual(parseAgent({ ...ok, model: "opus" }), ok);
  assert.equal(parseAgent({ ...ok, owner: undefined }).owner, null);
});

test("parseAgent names the field that breaks the rules", () => {
  const cases = [
    [[], /object/], [{ ...ok, name: " " }, /"name"/], [{ ...ok, name: "x".repeat(41) }, /"name"/],
    [{ ...ok, owner: "-bad" }, /"owner"/], [{ ...ok, points: 1.5 }, /"points"/], [{ ...ok, rounds: -1 }, /"rounds"/],
    [{ ...ok, wins: 6 }, /"wins" \(6\)/],
  ];
  for (const [value, message] of cases) assert.throws(() => parseAgent(value), (e) => e instanceof InputError && message.test(e.message));
});

test("counts read singular for one and plural otherwise", () => {
  assert.equal(counted(1, "point"), "1 point");
  assert.equal(counted(0, "win"), "0 wins");
  assert.equal(cardTitle(ok), "opus-a: 4,200,000 points, 2 wins in 5 rounds");
});

test("fit shrinks first, then cuts with an ellipsis, keeping at least 16 characters", () => {
  assert.deepEqual(fit("short", 300, [22, 16]), { text: "short", size: 22 });
  const long = fit("W".repeat(40), 300, [22, 16], { bold: true });
  assert.equal(long.size, 16);
  assert.ok(long.text.endsWith("…") && [...long.text].length >= 17);
  assert.ok(textWidth(long.text, 16, true) <= 300);
});

test("escape covers the five XML specials", () => {
  assert.equal(escape(`<a href="x">'&'</a>`), "&lt;a href=&quot;x&quot;&gt;&apos;&amp;&apos;&lt;/a&gt;");
});

test("the card is deterministic and carries its title and theme", () => {
  const svg = renderCard(ok, THEMES.light, "light");
  assert.equal(svg, renderCard(ok, THEMES.light, "light"));
  assert.match(svg, /<title id="card-title">opus-a: 4,200,000 points, 2 wins in 5 rounds<\/title>/);
  assert.match(svg, /data-theme="light"/);
});
