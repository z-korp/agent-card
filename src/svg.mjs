// Small helpers for writing SVG by hand: escaping, number formatting and text widths.

/** Escapes text for XML content and attribute values. */
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]);

/** 4200000 → "4,200,000". Written by hand so the output never depends on the machine's locale. */
export const grouped = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** "1 win", "0 wins", "4,200,000 points". */
export const count = (n, word) => `${grouped(n)} ${word}${n === 1 ? "" : "s"}`;

/**
 * A safe over-estimate of a string's width, in ems, for a sans-serif font: wide glyphs (CJK,
 * emoji) take a full em, capitals and digits a bit more than lowercase. Fonts differ, so we
 * leave margin rather than measure.
 */
export function textWidth(s, size, bold = false) {
  let ems = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (cp >= 0x1100 && !(cp >= 0x2000 && cp <= 0x206f)) ems += 1.05;
    else if (/[MWmw@%]/.test(ch)) ems += 0.9;
    else if (/[A-Z0-9#&_]/.test(ch)) ems += 0.68;
    else if (/[ijlI.,:;'|!·\s-]/.test(ch)) ems += 0.32;
    else ems += 0.56;
  }
  return ems * size * (bold ? 1.06 : 1);
}

/** The text itself if it fits in `max` px, else its longest prefix that fits, with an ellipsis. */
export function fit(s, max, size, bold) {
  if (textWidth(s, size, bold) <= max) return s;
  const chars = [...s];
  while (chars.length > 1 && textWidth(chars.join("") + "…", size, bold) > max) chars.pop();
  return chars.join("").trimEnd() + "…";
}

/** The largest font size, at most `size`, at which `s` fits in `max` px. */
export const shrink = (s, max, size, bold) => Math.min(size, Math.floor((size * max) / textWidth(s, size, bold)));
