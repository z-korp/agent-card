// The leaderboard: the ten best agents, one row each (rank, name and owner, points and wins), in the
// single card's frame, colours and type.
import { frame } from "./frame.mjs";
import { count, esc, fit, grouped, shrink, textWidth } from "./svg.mjs";

export const TOP = 10;
const W = 480;
const PAD = 28;
const ROWS_Y = 90; // the first row's top, under the heading and the column labels
const ROW = 44;
const RANK = 34; // the rank column, wide enough for "10"
const GAP = 16; // between a name and the points
const POINTS_MIN = 56; // the points column is never narrower than its "POINTS" label…
const POINTS_MAX = 170; // …nor wider than this: larger points shrink instead

/** The leaderboard's accessible name and heading: "Top 10 agents", "Top 1 agent", "No agents yet". */
export const topTitle = (n) => (n === 0 ? "No agents yet" : `Top ${n} agent${n === 1 ? "" : "s"}`);

/** Compares two names code point by code point, the same on every machine: "Zed" < "abe" < "zoë" < "Émile". */
export function byCodePoint(a, b) {
  const x = [...a];
  const y = [...b];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = x[i].codePointAt(0) - y[i].codePointAt(0);
    if (d) return d;
  }
  return x.length - y.length;
}

/** The leaderboard's order: points (highest first), then wins (most first), then name. */
export const byRank = (a, b) => b.points - a.points || b.wins - a.wins || byCodePoint(a.name, b.name);

/** The leaderboard of `agents` (as parseAgents returns them): the ten best, in the theme named `theme`. */
export function renderTop(agents, theme = "light") {
  const rows = [...agents]
    .sort(byRank)
    .slice(0, TOP)
    .map((a, i) => ({ ...a, rank: i + 1, value: grouped(a.points), record: count(a.wins, "win") }));
  const height = Math.max(170, ROWS_Y + rows.length * ROW + 18);
  // One points column for every row, as wide as its widest value; the names get the rest.
  const widest = Math.max(POINTS_MIN, ...rows.flatMap((r) => [textWidth(r.value, 15, true), textWidth(r.record, 12)]));
  const points = Math.min(POINTS_MAX, Math.ceil(widest));
  const name = W - 2 * PAD - RANK - points - GAP;

  return frame({ width: W, height, title: topTitle(rows.length), theme }, (t) =>
    [
      `<text x="${PAD}" y="46" font-size="22" font-weight="700" fill="${t.text}">${topTitle(rows.length)}</text>`,
      rows.length ? labels(t) : `<text x="${PAD}" y="76" font-size="13" fill="${t.muted}">Agents show up here once they enter a round.</text>`,
      ...rows.map((r, i) => row(r, ROWS_Y + i * ROW, name, points, t)),
    ].join("\n  "),
  );
}

function labels(t) {
  const label = (x, text, end = false) =>
    `<text x="${x}" y="78" font-size="11" font-weight="600" letter-spacing="1.2" fill="${t.muted}"${end ? ` text-anchor="end"` : ""}>${text}</text>`;
  return [label(PAD, "#"), label(PAD + RANK, "AGENT"), label(W - PAD, "POINTS", true)].join("\n  ");
}

/** One row, `y` its top: a rule, the rank, the name over its owner, the points over the wins. */
function row(r, y, nameWidth, pointsWidth, t) {
  return [
    `<rect x="${PAD}" y="${y}" width="${W - 2 * PAD}" height="1" fill="${t.track}"/>`,
    `<text x="${PAD}" y="${y + 28}" font-size="16" font-weight="700" fill="${r.rank <= 3 ? "url(#accent)" : t.muted}">${r.rank}</text>`,
    `<text x="${PAD + RANK}" y="${y + 20}" font-size="15" font-weight="600" fill="${t.text}">${esc(fit(r.name, nameWidth, 15, true))}</text>`,
    r.owner ? `<text x="${PAD + RANK}" y="${y + 36}" font-size="12" fill="${t.muted}">${esc(fit(`@${r.owner}`, nameWidth, 12))}</text>` : "",
    `<text x="${W - PAD}" y="${y + 20}" font-size="${shrink(r.value, pointsWidth, 15, true)}" font-weight="700" fill="${t.text}" text-anchor="end">${r.value}</text>`,
    `<text x="${W - PAD}" y="${y + 36}" font-size="${shrink(r.record, pointsWidth, 12)}" fill="${t.muted}" text-anchor="end">${r.record}</text>`,
  ]
    .filter(Boolean)
    .join("\n  ");
}
