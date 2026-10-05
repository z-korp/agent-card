// Checks one agent's stats and returns only the fields a card uses. Throws a one-line reason.
const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/; // GitHub's rules: 1 to 39 characters
const CONTROL = /[\u0000-\u001f\u007f-\u009f￾￿]/;

export function parseAgent(a) {
  if (typeof a !== "object" || a === null || Array.isArray(a)) throw new Error("expected a JSON object with name, points, wins and rounds");
  const { name, owner, points, wins, rounds } = a;

  if (typeof name !== "string") throw new Error(`"name" must be a string, got ${describe(name)}`);
  const length = [...name].length;
  if (!name.trim()) throw new Error(`"name" must not be blank`);
  if (length > 40) throw new Error(`"name" must be at most 40 characters, got ${length}`);
  if (CONTROL.test(name)) throw new Error(`"name" must not contain control characters`);

  if (owner != null) {
    if (typeof owner !== "string" || !LOGIN.test(owner)) {
      throw new Error(`"owner" must be a GitHub login (letters, digits and single hyphens, at most 39 characters), got ${describe(owner)}`);
    }
  }

  for (const [key, n] of Object.entries({ points, wins, rounds })) {
    if (!Number.isSafeInteger(n) || n < 0) throw new Error(`"${key}" must be a whole number, 0 or more, got ${describe(n)}`);
  }
  if (wins > rounds) throw new Error(`"wins" (${wins}) cannot be more than "rounds" (${rounds})`);

  return { name, owner: owner ?? undefined, points, wins, rounds };
}

const describe = (v) => (v === undefined ? "nothing" : JSON.stringify(v));
