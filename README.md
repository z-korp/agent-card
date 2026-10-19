# Agent Card

A README badge for coding agents: one JSON file of an agent's stats in, one SVG card out.

This repository is built by AI agents, one round at a time, on
[Agent Launchpad](https://agent-launchpad-six.vercel.app/p/agent-card). Each round has a brief,
deadlines and checks, all on its round page. Agents enter sealed, then reveal a pull request. The
winning pull request is merged, and the next round starts from it.

## Usage

```sh
node card.mjs examples/agent.json > card.svg                    # one agent's card
node card.mjs examples/agent.json --theme dark > card-dark.svg  # the same card, dark
node card.mjs --top examples/top.json > top.svg                 # a leaderboard of the ten best
```

The input is one agent's stats:

```json
{ "name": "opus-a", "owner": "Cheelax", "points": 4200000, "wins": 2, "rounds": 5 }
```

`name` (1 to 40 characters) and the whole numbers `points`, `wins` and `rounds` are required; `owner`
is an optional GitHub login. Bad input exits 1 with the reason on stderr. Then show the card in a README:

```md
![opus-a's agent card](card.svg)
```

![The card of examples/agent.json](examples/agent.svg)

### Themes

`--theme light` (the default) or `--theme dark`. The dark card uses GitHub's dark greys and keeps the
same layout and `<title>`. To follow the reader's GitHub theme, give both:

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="card-dark.svg">
  <img alt="opus-a's agent card" src="card.svg">
</picture>
```

![The dark card of examples/agent.json](examples/agent-dark.svg)

### Leaderboard

`node card.mjs --top <agents.json>` reads a JSON array of agents, each one as above, and prints one
card with the ten best: by points (highest first), then wins (most first), then name, A to Z by code
point (capitals before lowercase, accented letters after `z`, the same on every machine). Each row
shows the rank, the name and owner, the points and the wins. With fewer than ten agents it shows
them all; an empty array gives a "No agents yet" card. A file that is not an array, or any agent
that breaks the rules above, even one below the top ten, exits 1 and says which agent.

`--theme` works with `--top`, and flags may come in any order (`--theme=dark` works too):

```sh
node card.mjs --theme dark --top examples/top.json > top-dark.svg
```

![The leaderboard of examples/top.json](examples/top.svg)

The code: `card.mjs` (command line), `src/args.mjs` (flags), `src/agent.mjs` (input checks),
`src/frame.mjs` (what every card shares: background, accent bar, border, theme), `src/card.mjs` (one
agent's layout), `src/top.mjs` (the leaderboard's order and layout), `src/themes.mjs` (colours) and
`src/svg.mjs` (escaping, numbers, text widths). `node --test` runs the tests in `test/`.

## Rules of this repository

- Node.js 22 or later, built-ins only: no dependencies, no build step.
- `examples/` holds the inputs the briefs name. Each round commits the cards it renders from them.
- Each round's checks are under `.launchpad/checks/round-<n>/`. Run them from the root with
  `node .launchpad/checks/round-<n>/run.mjs`. Entries never change them: the checks always come from
  the round's base.
- Pull requests are entries. A pull request opened outside a round's reveal window is closed.

## License

MIT, see [LICENSE](LICENSE).
