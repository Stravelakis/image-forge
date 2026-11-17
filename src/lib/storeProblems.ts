/**
 * When a saved-data file (the vault, or the keys shared with Video Forge)
 * cannot be read, the desktop app refuses to save over it and says why
 * (electron/vault.mjs, electron/forgeKeys.mjs). This carries that plain
 * message to the screen. A problem found before the app is drawn (at
 * start-up) is kept and handed over as soon as the app listens.
 * The same message is shown once, not every 2 seconds.
 */
type Listener = (msg: string) => void;

const waiting: string[] = [];
const shown = new Set<string>();
let listener: Listener | null = null;

export function reportStoreProblem(msg: string): void {
  const m = msg.trim();
  if (!m || shown.has(m)) return;
  shown.add(m);
  if (listener) listener(m);
  else waiting.push(m);
}

/** Listen for problems; anything reported before now is delivered at once. Returns a stop function. */
export function onStoreProblem(fn: Listener): () => void {
  listener = fn;
  while (waiting.length) fn(waiting.shift()!);
  return () => {
    if (listener === fn) listener = null;
  };
}

/** Read the plain error out of a failed /app response. */
export async function errorFrom(r: Response, fallback: string): Promise<string> {
  try {
    const j = (await r.json()) as { error?: unknown };
    return typeof j?.error === "string" && j.error.trim() ? j.error : fallback;
  } catch {
    return fallback;
  }
}

/** For the tests. */
export function resetStoreProblems(): void {
  waiting.length = 0;
  shown.clear();
  listener = null;
}
