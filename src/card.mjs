// One agent's card: a monogram, the name and owner, then a row of stats. 480 × 160 px, which reads
// well at the top of a README and stays sharp when GitHub scales it down.
import { el, text } from "./svg.mjs";
import { FONT } from "./theme.mjs";
import { cardTitle, fit, grouped, initial, textWidth } from "./text.mjs";

const W = 480;
const H = 160;
const PAD = 24;
const NAME_X = 84;
const LABEL = { size: 10, spacing: 0.8 };
const GAP = 28;

/** The win rate, or a dash before any round. */
const winRate = (a) => (a.rounds === 0 ? "—" : `${Math.round((a.wins / a.rounds) * 100)}%`);

/**
 * Lays the stats out across the card: each column as wide as its label or its value, the room left
 * shared between the gaps, values at the largest size that keeps at least GAP between columns.
 */
function statsRow(stats, width) {
  const labelWidth = (l) => textWidth(l, LABEL.size, true) + LABEL.spacing * l.length;
  for (const size of [20, 18, 16, 14, 12]) {
    const widths = stats.map(([label, value]) => Math.max(labelWidth(label), textWidth(value, size, true)));
    const gap = (width - widths.reduce((s, w) => s + w, 0)) / (stats.length - 1);
    if (gap >= GAP || size === 12) {
      let x = PAD;
      return stats.map(([label, value], i) => {
        const col = { label, value, x, size };
        x += widths[i] + Math.max(gap, GAP);
        return col;
      });
    }
  }
}

/** The SVG of one agent's card in theme `t` (a THEMES entry), as a string ending in a newline. */
export function renderCard(a, t, themeName) {
  const name = fit(a.name, W - NAME_X - PAD, [22, 20, 18, 16], { bold: true });
  const nameY = a.owner ? 47 : 59;
  const stats = statsRow([["POINTS", grouped(a.points)], ["WINS", grouped(a.wins)], ["ROUNDS", grouped(a.rounds)], ["WIN RATE", winRate(a)]], W - 2 * PAD);

  const svg = el(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg", width: W, height: H, viewBox: `0 0 ${W} ${H}`,
      role: "img", "aria-labelledby": "card-title", "font-family": FONT, "data-theme": themeName,
    },
    el("title", { id: "card-title" }, text(cardTitle(a))),
    el("defs", {}, el("clipPath", { id: "card-shape" }, el("rect", { width: W, height: H, rx: 12 }))),
    el("g", { "clip-path": "url(#card-shape)" },
      el("rect", { width: W, height: H, fill: t.background }),
      el("rect", { width: W, height: 4, fill: t.accent })),
    el("rect", { x: 0.5, y: 0.5, width: W - 1, height: H - 1, rx: 11.5, fill: "none", stroke: t.border }),
    // Header: monogram, name, owner.
    el("circle", { cx: 48, cy: 54, r: 22, fill: t.accent }),
    el("text", { x: 48, y: 54, "text-anchor": "middle", "dominant-baseline": "central", "font-size": 20, "font-weight": 700, fill: t.onAccent }, text(initial(a.name))),
    el("text", { x: NAME_X, y: nameY, "font-size": name.size, "font-weight": 700, fill: t.text }, text(name.text)),
    a.owner ? el("text", { x: NAME_X, y: 70, "font-size": 13, fill: t.muted }, text(`@${a.owner}`)) : null,
    el("line", { x1: PAD, x2: W - PAD, y1: 94.5, y2: 94.5, stroke: t.divider }),
    // Stats: label above value.
    stats.map((s) => [
      el("text", { x: s.x, y: 118, "font-size": LABEL.size, "font-weight": 600, "letter-spacing": LABEL.spacing, fill: t.muted }, text(s.label)),
      el("text", { x: s.x, y: 141, "font-size": s.size, "font-weight": 700, fill: t.text }, text(s.value)),
    ]),
  );
  return `${svg}\n`;
}
