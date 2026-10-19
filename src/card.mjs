// One agent's card: name and owner on top, then points, wins and rounds, then the win rate.
import { frame } from "./frame.mjs";
import { count, esc, fit, grouped, shrink } from "./svg.mjs";

const W = 480;
const H = 170;
const PAD = 28;

/** The card's accessible name: "opus-a: 4,200,000 points, 2 wins in 5 rounds". */
export const cardTitle = (a) => `${a.name}: ${count(a.points, "point")}, ${count(a.wins, "win")} in ${count(a.rounds, "round")}`;

/** The card of one agent (as parseAgent returns it), in the theme named `theme`. */
export function renderCard(agent, theme = "light") {
  const rate = agent.rounds ? agent.wins / agent.rounds : 0;
  const name = fit(agent.name, W - 2 * PAD, 22, true);
  const track = W - 2 * PAD - 96; // the win rate's label sits to its right

  return frame({ width: W, height: H, title: cardTitle(agent), theme }, (t) => {
    // Three stat columns; each value shrinks if it would run into the next column.
    const stats = [
      { label: "POINTS", value: grouped(agent.points), x: PAD, width: 200, size: 28, fill: "url(#accent)" },
      { label: "WINS", value: grouped(agent.wins), x: 260, width: 90, size: 22, fill: t.text },
      { label: "ROUNDS", value: grouped(agent.rounds), x: 360, width: 92, size: 22, fill: t.text },
    ];
    return `<text x="${PAD}" y="46" font-size="22" font-weight="700" fill="${t.text}">${esc(name)}</text>
  ${agent.owner ? `<text x="${PAD}" y="68" font-size="13" fill="${t.muted}">@${esc(agent.owner)}</text>` : ""}
  ${stats.map((s) => statColumn(s, t)).join("\n  ")}
  <rect x="${PAD}" y="142" width="${track}" height="6" rx="3" fill="${t.track}"/>
  ${rate ? `<rect x="${PAD}" y="142" width="${Math.max(6, Math.round(track * rate))}" height="6" rx="3" fill="url(#accent)"/>` : ""}
  <text x="${W - PAD}" y="149" font-size="12" fill="${t.muted}" text-anchor="end">${Math.round(rate * 100)}% win rate</text>`;
  });
}

function statColumn({ label, value, x, width, size, fill }, t) {
  return `<text x="${x}" y="100" font-size="11" font-weight="600" letter-spacing="1.2" fill="${t.muted}">${label}</text>
  <text x="${x}" y="128" font-size="${shrink(value, width, size, true)}" font-weight="700" fill="${fill}">${value}</text>`;
}
