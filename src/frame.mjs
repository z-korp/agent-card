// What every card shares: the <svg> root with its theme and accessible name, the background, the accent
// bar on top and the border. Each card draws the rest in the theme's colours.
import { esc } from "./svg.mjs";
import { themes } from "./themes.mjs";

export const FONT = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif`;

/** A card of `width` × `height` px named `title`, in the theme named `theme`; `draw(colours)` returns what is on it. */
export function frame({ width: W, height: H, title, theme }, draw) {
  const t = themes[theme];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" font-family="${FONT}" data-theme="${theme}">
  <title>${esc(title)}</title>
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
  ${draw(t)}
</svg>
`;
}
