// Colours and type, by theme. A card only ever reads a theme through these names, so a new theme is
// one more entry here.

export const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif";

export const THEMES = {
  light: {
    background: "#ffffff",
    border: "#d0d7de",
    divider: "#eaeef2",
    text: "#1f2328",
    muted: "#59636e",
    accent: "#f5c400", // the launchpad's yellow
    onAccent: "#111111",
  },
};

export const DEFAULT_THEME = "light";
