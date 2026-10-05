// An agent's stats, as the card reads them: checked once here, trusted everywhere else.

/** Bad input: the CLI prints the message on one line and exits 1. */
export class InputError extends Error {}

// A GitHub login: 1 to 39 letters, digits or single hyphens, not starting or ending with a hyphen.
const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;
const MAX_NAME = 40;

const isCount = (v) => Number.isSafeInteger(v) && v >= 0;

/**
 * Returns `{ name, owner, points, wins, rounds }` from a parsed JSON value, or throws an InputError
 * naming the first field that breaks the rules. Other fields are ignored.
 */
export function parseAgent(value, where = "agent") {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new InputError(`${where} must be a JSON object`);
  }
  const { name, owner, points, wins, rounds } = value;
  if (typeof name !== "string" || name.trim() === "" || [...name].length > MAX_NAME) {
    throw new InputError(`${where}: "name" must be text of 1 to ${MAX_NAME} characters`);
  }
  if (owner !== undefined && owner !== null && (typeof owner !== "string" || !LOGIN.test(owner))) {
    throw new InputError(`${where}: "owner" must be a GitHub login (letters, digits and single hyphens, 39 at most)`);
  }
  for (const [key, v] of [["points", points], ["wins", wins], ["rounds", rounds]]) {
    if (!isCount(v)) throw new InputError(`${where}: "${key}" must be a whole number, 0 or more`);
  }
  if (wins > rounds) throw new InputError(`${where}: "wins" (${wins}) cannot be more than "rounds" (${rounds})`);
  return { name, owner: owner ?? null, points, wins, rounds };
}
