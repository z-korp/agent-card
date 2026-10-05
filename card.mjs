#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Colours live together so another theme can reuse the same layout.
export const lightTheme = Object.freeze({
  paper: '#FAFAF5', ink: '#153E35', muted: '#547168', line: '#DCE4DC',
  accent: '#247A55', track: '#E4EBE2', badge: '#EDF2E9',
});

const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const format = value => number.format(value === 0 ? 0 : value);
const count = (value, unit) => `${format(value)} ${unit}${value === 1 ? '' : 's'}`;
const escape = value => String(value).replace(/[&<>"'\r\n\t]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  '\r': '&#13;', '\n': '&#10;', '\t': '&#9;',
})[character]);

/** Validate without normalising the name or interpreting additional fields. */
export function validateAgent(agent) {
  if (!agent || typeof agent !== 'object' || Array.isArray(agent)) {
    throw new Error('input must be a JSON object');
  }
  if (typeof agent.name !== 'string' || !agent.name.trim() || [...agent.name].length > 40) {
    throw new Error('name must be non-blank text of 1–40 characters');
  }
  // XML 1.0 cannot represent these code points, even with character references.
  if (/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/u.test(agent.name)) {
    throw new Error('name contains a character that cannot be represented in SVG');
  }
  for (const field of ['points', 'wins', 'rounds']) {
    if (!Number.isInteger(agent[field]) || agent[field] < 0) {
      throw new Error(`${field} must be a whole number of 0 or more`);
    }
  }
  if (agent.wins > agent.rounds) throw new Error('wins must be at most rounds');
  if (Object.hasOwn(agent, 'owner') && (typeof agent.owner !== 'string' ||
      !/^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i.test(agent.owner))) {
    throw new Error('owner must be a GitHub login: 1–39 letters, digits or single internal hyphens');
  }
  return agent;
}

// A conservative width estimate keeps names readable with system font fallbacks.
// Wide Unicode characters count as a full em; truncation preserves at least 16.
function displayName(name) {
  const chars = [...name];
  const width = character => /[MW@%]/.test(character) ? 1 :
    /[ilI.,'!| :;]/.test(character) ? 0.35 : /[\x20-\x7E]/.test(character) ? 0.7 : 1.1;
  let visible = [...chars];
  while (visible.length > 16 && visible.reduce((sum, c) => sum + width(c), 0) > 18.5) visible.pop();
  return visible.join('') + (visible.length < chars.length ? '…' : '');
}

/** Pure rendering: no clock, randomness, network, fonts or filesystem access. */
export function renderCard(input, theme = lightTheme) {
  const agent = validateAgent(input);
  const { name, owner, points, wins, rounds } = agent;
  const title = `${name}: ${count(points, 'point')}, ${count(wins, 'win')} in ${count(rounds, 'round')}`;
  const rate = rounds ? wins / rounds : 0;
  const percent = rounds ? `${Number((rate * 100).toFixed(1))}%` : '—';
  const pointsText = format(points);
  const pointSize = Math.min(48, 340 / (pointsText.length * 0.62));
  const text = (x, y, value, attributes = '') =>
    `<text x="${x}" y="${y}" ${attributes}>${escape(value)}</text>`;
  const label = `font-size="10" font-weight="600" letter-spacing="1.8" fill="${theme.muted}"`;
  const mono = 'font-family="ui-monospace, DejaVu Sans Mono, monospace"';
  const stat = (x, value, unit) => {
    const digits = format(value);
    const size = Math.min(21, 220 / (digits.length * 0.62));
    return text(x, 249, digits, `${mono} font-size="${size}" font-weight="600"`) +
      text(x, 267, value === 1 ? unit : `${unit}s`, `font-size="11" fill="${theme.muted}"`);
  };

  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="292" viewBox="0 0 600 292" role="img">
  <title>${escape(title)}</title>
  <desc>An agent's points and round record. ${rounds ? `${percent} of rounds won.` : 'No rounds played yet.'}</desc>
  <rect x="0.5" y="0.5" width="599" height="291" rx="18" fill="${theme.paper}" stroke="${theme.line}"/>
  <g font-family="Trebuchet MS, DejaVu Sans, sans-serif" fill="${theme.ink}">
    <path d="M29 30h9m-4.5-4.5v9M45 30h9m-4.5-4.5v9" stroke="${theme.accent}" stroke-width="2"/>
    ${text(65, 34, 'AGENT RECORD', label)}
    <rect x="461" y="20" width="111" height="23" rx="11.5" fill="${theme.badge}"/>
    ${text(516.5, 35, 'LAUNCHPAD', `text-anchor="middle" font-size="9" font-weight="700" letter-spacing="1.3" fill="${theme.accent}"`)}
    ${text(28, 79, displayName(name), 'font-size="27" font-weight="700" xml:space="preserve"')}
    ${owner === undefined ? '' : text(29, 101, `@${owner}`, `font-size="12" fill="${theme.muted}"`)}
    ${text(29, 137, points === 1 ? 'POINT' : 'POINTS', label)}
    ${text(26, 187, pointsText, `${mono} font-size="${pointSize}" font-weight="700"`)}
    <g transform="translate(509 158)">
      <circle r="34" fill="none" stroke="${theme.track}" stroke-width="5"/>
      ${wins ? `<circle r="34" fill="none" stroke="${theme.accent}" stroke-width="5" pathLength="100" stroke-dasharray="${(rate * 100).toFixed(4)} 100" transform="rotate(-90)"/>` : ''}
      ${text(0, 7, percent, `text-anchor="middle" ${mono} font-size="${percent.length > 4 ? 15 : 18}" font-weight="700"`)}
      ${text(0, 52, 'WIN RATE', `text-anchor="middle" font-size="9" letter-spacing="1.2" fill="${theme.muted}"`)}
    </g>
    <path d="M28 220h544" stroke="${theme.line}"/>
    ${stat(29, wins, 'win')}
    <path d="M298 237v30" stroke="${theme.line}"/>
    ${stat(325, rounds, 'round')}
  </g>
</svg>\n`;
}

function main(args) {
  if (args.length !== 1) throw new Error('usage: node card.mjs <agent.json>');
  let source;
  try { source = readFileSync(args[0], 'utf8'); }
  catch (error) { throw new Error(`cannot read input file (${error.code ?? 'read error'})`); }
  let agent;
  try { agent = JSON.parse(source); }
  catch { throw new Error('input file is not valid JSON'); }
  process.stdout.write(renderCard(agent));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(process.argv.slice(2)); }
  catch (error) {
    process.stderr.write(`card: ${error.message}\n`);
    process.exitCode = 1;
  }
}
