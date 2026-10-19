// Colours of a card, by theme. Every theme has the same keys; `--theme <name>` picks one.
export const themes = {
  light: {
    background: "#ffffff",
    backgroundEnd: "#f6f8fa",
    border: "#d0d7de",
    accent: "#6d5dfc",
    accentEnd: "#c158dc",
    text: "#1f2328",
    muted: "#656d76",
    track: "#eaeef2",
  },
  // GitHub's dark greys, so the card sits on a dark README; the accent is lifted to keep its contrast.
  dark: {
    background: "#161b22",
    backgroundEnd: "#0d1117",
    border: "#30363d",
    accent: "#8f84ff",
    accentEnd: "#e07ef0",
    text: "#e6edf3",
    muted: "#9198a1",
    track: "#262c36",
  },
};
