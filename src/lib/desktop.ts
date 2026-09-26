/**
 * The page's side of electron/appctl.mjs: window or browser, and updates.
 *
 * Every call fails quietly to "not the desktop app" — in `npm run dev` or on
 * a plain web host there is no /app/ route, and that is normal.
 */

export type LaunchMode = "window" | "browser";

export interface DesktopInfo {
  desktop: true;
  mode: LaunchMode;
  version: string;
}

const HEADERS = { "X-Forge-App": "1" };

/** Which side this page is: the Electron window, or a normal browser tab. */
export const thisSide = (): LaunchMode => (/\bElectron\//.test(navigator.userAgent) ? "window" : "browser");

export async function desktopInfo(): Promise<DesktopInfo | null> {
  try {
    const r = await fetch("/app/info", { headers: HEADERS });
    if (!r.ok) return null;
    const j = await r.json();
    return j?.desktop ? (j as DesktopInfo) : null;
  } catch {
    return null;
  }
}

/** Everything in this page's storage, as text. Folder links are not included: they cannot cross browsers. */
export function snapshotStorage(store: Storage = localStorage): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (k !== null) out[k] = store.getItem(k) ?? "";
  }
  return out;
}

/**
 * Replace this page's storage with what the other side handed over. Replace,
 * not merge: a key left over from last time would bring back a row or a key
 * you deleted on the other side.
 */
export function applySnapshot(snapshot: Record<string, string>, store: Storage = localStorage): number {
  store.clear();
  let n = 0;
  for (const [k, v] of Object.entries(snapshot)) {
    store.setItem(k, v);
    n++;
  }
  return n;
}

/** Called before the app reads its storage. Returns how many values arrived, or 0. */
export async function importHandover(): Promise<number> {
  try {
    const r = await fetch("/app/handover", { headers: { ...HEADERS, "X-Forge-Side": thisSide() } });
    if (!r.ok) return 0;
    const { snapshot } = (await r.json()) as { snapshot: Record<string, string> | null };
    return snapshot ? applySnapshot(snapshot) : 0;
  } catch {
    return 0;
  }
}

export async function switchMode(mode: LaunchMode): Promise<void> {
  const r = await fetch("/app/mode", {
    method: "POST",
    headers: { ...HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({ mode, snapshot: snapshotStorage() }),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? `the app answered ${r.status}`);
}

/** Download the installer and install it. The app closes and reopens itself. */
export async function installUpdate(url: string): Promise<void> {
  const r = await fetch("/app/update", {
    method: "POST",
    headers: { ...HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? `the app answered ${r.status}`);
}
