// Words and widths: how numbers read, and how much room a line of text takes without a font engine.

/** 4200000 → "4,200,000". */
export const grouped = (n) => n.toLocaleString("en-US");

/** 1 → "1 point", 0 → "0 points", 4200000 → "4,200,000 points". */
export const counted = (n, word) => `${grouped(n)} ${word}${n === 1 ? "" : "s"}`;

/** The card's accessible name: "opus-a: 4,200,000 points, 2 wins in 5 rounds". */
export const cardTitle = (a) => `${a.name}: ${counted(a.points, "point")}, ${counted(a.wins, "win")} in ${counted(a.rounds, "round")}`;

/** The first character a reader would put in a monogram: "opus-a" → "O". */
export const initial = (name) => ([...name.trim()][0] ?? "?").toLocaleUpperCase("en-US");

// Average advance widths, in ems, for a sans-serif UI font. Close enough to keep text inside its box
// (the estimate errs wide); exact metrics would need the font, which an SVG card cannot rely on.
function advance(ch) {
  const cp = ch.codePointAt(0);
  if (cp >= 0x1100 && (cp <= 0x115f || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe4f) || (cp >= 0xff00 && cp <= 0xff60) || cp >= 0x1f000)) return 1;
  if (" .,:;'!|il1".includes(ch)) return 0.32;
  if ("fjrt()[]-".includes(ch)) return 0.4;
  if ("MW".includes(ch)) return 1;
  if ("mw@%".includes(ch)) return 0.9;
  if (ch >= "A" && ch <= "Z") return 0.68;
  return 0.58;
}

/** Estimated width of `text` in pixels at `size`, bold text being about 6% wider. */
export const textWidth = (text, size, bold = false) => [...text].reduce((w, ch) => w + advance(ch), 0) * size * (bold ? 1.06 : 1);

/**
 * Fits `text` in `width` pixels: the largest of `sizes` that shows it whole, otherwise the smallest
 * size and the text cut short with an ellipsis, never below `keep` characters.
 * Returns { text, size }.
 */
export function fit(text, width, sizes, { bold = false, keep = 16 } = {}) {
  for (const size of sizes) if (textWidth(text, size, bold) <= width) return { text, size };
  const size = sizes[sizes.length - 1];
  const chars = [...text];
  let n = chars.length - 1;
  while (n > keep && textWidth(chars.slice(0, n).join("").trimEnd() + "…", size, bold) > width) n--;
  return { text: chars.slice(0, n).join("").trimEnd() + "…", size };
}
