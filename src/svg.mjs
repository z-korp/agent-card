// Building SVG as text, with every attribute value and every text node escaped.

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };
export const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ESCAPES[c]);

/** A number for an attribute: at most two decimals, no trailing zeros. */
const num = (v) => (typeof v === "number" ? String(Math.round(v * 100) / 100) : v);

/**
 * One element: `el("text", { x: 24, y: 40 }, "Tom & Jerry")`. Children are elements (already strings
 * from `el`) or plain text, which `text()` escapes. Attributes set to null or undefined are left out.
 */
export function el(name, attrs = {}, ...children) {
  const a = Object.entries(attrs)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => ` ${k}="${escape(num(v))}"`)
    .join("");
  const inner = children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false).join("");
  return inner ? `<${name}${a}>${inner}</${name}>` : `<${name}${a}/>`;
}

/** Text content, escaped. */
export const text = (s) => escape(s);
