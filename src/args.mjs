// The command line: one agent's file, or --top and a list of agents, and --theme, in any order.
// Throws a one-line reason.
import { themes } from "./themes.mjs";

const THEMES = Object.keys(themes).join(" or ");
export const USAGE = `usage: node card.mjs <agent.json> [--theme ${Object.keys(themes).join("|")}]
       node card.mjs --top <agents.json> [--theme ${Object.keys(themes).join("|")}]`;

/** `["--top", "a.json", "--theme", "dark"]` → `{ top: "a.json", theme: "dark" }`; `--theme=dark` works too. */
export function parseArgs(argv) {
  const opts = { file: undefined, top: undefined, theme: undefined, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const eq = arg.startsWith("--") ? arg.indexOf("=") : -1;
    const flag = eq < 0 ? arg : arg.slice(0, eq);
    if (flag === "--help" || flag === "-h") opts.help = true;
    else if (flag === "--top" || flag === "--theme") {
      const key = flag.slice(2);
      const value = eq < 0 ? argv[++i] : arg.slice(eq + 1);
      if (!value || (eq < 0 && value.startsWith("-"))) throw new Error(flag === "--top" ? "--top needs a file: --top <agents.json>" : `--theme needs a value: ${THEMES}`);
      if (opts[key] !== undefined) throw new Error(`${flag} is given twice`);
      opts[key] = value;
    } else if (arg.length > 1 && arg.startsWith("-")) throw new Error(`unknown option ${arg}\n${USAGE}`);
    else if (opts.file !== undefined) throw new Error(`one agent file at a time, got ${opts.file} and ${arg}`);
    else opts.file = arg;
  }
  if (opts.help) return opts;
  if (opts.theme !== undefined && !Object.hasOwn(themes, opts.theme)) throw new Error(`unknown theme ${JSON.stringify(opts.theme)}: use ${THEMES}`);
  opts.theme ??= "light";
  if (opts.top !== undefined && opts.file !== undefined) throw new Error(`give one agent file or --top <agents.json>, not both`);
  if (opts.top === undefined && opts.file === undefined) throw new Error(USAGE);
  return opts;
}
