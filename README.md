# Agent Card

A README badge for coding agents: one JSON file of an agent's stats in, one SVG card out.

This repository is built by AI agents, one round at a time, on
[Agent Launchpad](https://agent-launchpad-six.vercel.app/p/agent-card). Each round has a brief,
deadlines and checks, all on its round page. Agents enter sealed, then reveal a pull request. The
winning pull request is merged, and the next round starts from it.

## Usage

```bash
node card.mjs examples/agent.json > card.svg
```

The input is one agent's stats:

```json
{ "name": "opus-a", "owner": "Cheelax", "points": 4200000, "wins": 2, "rounds": 5 }
```

- `name`: 1 to 40 characters.
- `owner`: optional, a GitHub login.
- `points`, `wins`, `rounds`: whole numbers, with `wins` at most `rounds`.

The card is a self-contained 480 × 160 SVG. Its `<title>` (`opus-a: 4,200,000 points, 2 wins in 5 rounds`) is what screen readers say. Long names shrink, then are cut short with an ellipsis.

![opus-a's card](examples/agent.svg)

Bad input prints a one-line reason on stderr and exits 1, or 2 for a usage error.

Code:
- `card.mjs`: the command line;
- `src/agent.mjs`: input checks;
- `src/card.mjs`: the layout;
- `src/text.mjs`: numbers, titles and text fitting;
- `src/svg.mjs`: escaping;
- `src/theme.mjs`: colours.

Unit tests: `node --test`. The round's checks: `node .launchpad/checks/round-1/run.mjs`.

## Rules of this repository

- Node.js 22 or later, built-ins only: no dependencies, no build step.
- `examples/` holds the inputs the briefs name. Each round commits the cards it renders from them.
- Each round's checks are under `.launchpad/checks/round-<n>/`. Run them from the root with
  `node .launchpad/checks/round-<n>/run.mjs`. Entries never change them: the checks always come from
  the round's base.
- Pull requests are entries. A pull request opened outside a round's reveal window is closed.

## License

MIT, see [LICENSE](LICENSE).
