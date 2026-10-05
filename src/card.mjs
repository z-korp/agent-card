// One agent's card: name and owner on top, then points, wins and rounds, then the win rate.
import { count, esc, fit, grouped, shrink } from "./svg.mjs";
import { themes } from "./themes.mjs";

export const FONT = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif`;
const W = 480;
const H = 170;
const PAD = 28;

/** The card's accessible name: "opus-a: 4,200,000 points, 2 wins in 5 rounds". */
export const cardTitle = (a) => `${a.name}: ${count(a.points, "point")}, ${count(a.wins, "win")} in ${count(a.rounds, "round")}`;

export function renderCard(agent, theme = themes.light) {
  const t = theme;
  const rate = agent.rounds ? agent.wins / agent.rounds : 0;
  const name = fit(agent.name, W - 2 * PAD, 22, true);
  const track = W - 2 * PAD - 96; // the win rate's label sits to its right

  // Three stat columns; each value shrinks if it would run into the next column.
  const stats = [
    { label: "POINTS", value: grouped(agent.points), x: PAD, width: 200, size: 28, fill: "url(#accent)" },
    { label: "WINS", value: grouped(agent.wins), x: 260, width: 90, size: 22, fill: t.text },
    { label: "ROUNDS", value: grouped(agent.rounds), x: 360, width: 92, size: 22, fill: t.text },
  ];

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" font-family="${FONT}">
  <title>${esc(cardTitle(agent))}</title>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.background}"/><stop offset="1" stop-color="${t.backgroundEnd}"/></linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${t.accent}"/><stop offset="1" stop-color="${t.accentEnd}"/></linearGradient>
    <clipPath id="frame"><rect width="${W}" height="${H}" rx="12"/></clipPath>
  </defs>
  <g clip-path="url(#frame)">
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    <rect width="${W}" height="4" fill="url(#accent)"/>
  </g>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="11.5" fill="none" stroke="${t.border}"/>
  <text x="${PAD}" y="46" font-size="22" font-weight="700" fill="${t.text}">${esc(name)}</text>
  ${agent.owner ? `<text x="${PAD}" y="68" font-size="13" fill="${t.muted}">@${esc(agent.owner)}</text>` : ""}
  ${stats.map((s) => statColumn(s, t)).join("\n  ")}
  <rect x="${PAD}" y="142" width="${track}" height="6" rx="3" fill="${t.track}"/>
  ${rate ? `<rect x="${PAD}" y="142" width="${Math.max(6, Math.round(track * rate))}" height="6" rx="3" fill="url(#accent)"/>` : ""}
  <text x="${W - PAD}" y="149" font-size="12" fill="${t.muted}" text-anchor="end">${Math.round(rate * 100)}% win rate</text>
</svg>
`;
}

function statColumn({ label, value, x, width, size, fill }, t) {
  return `<text x="${x}" y="100" font-size="11" font-weight="600" letter-spacing="1.2" fill="${t.muted}">${label}</text>
  <text x="${x}" y="128" font-size="${shrink(value, width, size, true)}" font-weight="700" fill="${fill}">${value}</text>`;
}
