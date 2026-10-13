/**
 * The page's side of the vault (electron/vault.mjs), 13 Oct 2026.
 *
 * The page's own storage is tied to its address and port, so a launch on
 * another port used to come up empty: no keys, no settings, no list. Now:
 *
 *  1. Before the app reads anything, the vault FILE is copied into storage
 *     (the file wins — it is the real copy).
 *  2. What other ports' boxes held (gathered once by the app) is MERGED in:
 *     lists are joined, an empty setting is filled, nothing is overwritten.
 *  3. From then on every change in storage is copied to the file within a
 *     couple of seconds, and straight away before a reset or a reload.
 *
 * Outside the desktop app there is no /app route and all of this quietly does
 * nothing.
 */

const HEADERS = { "X-Forge-App": "1", "Content-Type": "application/json" };

let sent: Record<string, string> = {};
let active = false;

type Json = unknown;
const isObj = (v: Json): v is Record<string, Json> => !!v && typeof v === "object" && !Array.isArray(v);
const hasId = (v: Json): v is { id: string } => isObj(v) && typeof v.id === "string";

/**
 * Fold `other` into `mine` without overwriting anything `mine` already has.
 * Lists of things with an id are joined (mine first); an empty text is filled;
 * a list whose keys are all blank takes the other's. Pure, for the tests.
 */
export function mergeValue(mine: Json, other: Json): Json {
  if (mine === undefined || mine === null) return other;
  if (typeof mine === "string") return mine.trim() === "" && typeof other === "string" ? other : mine;
  if (Array.isArray(mine) && Array.isArray(other)) {
    if (mine.every(hasId) && other.every(hasId) && (mine.length || other.length)) {
      const byId = new Map(other.map((o) => [o.id, o] as const));
      const out = mine.map((m) => (byId.has(m.id) ? mergeValue(m, byId.get(m.id)) : m));
      const seen = new Set(mine.map((m) => m.id));
      for (const o of other) if (!seen.has(o.id)) out.push(o);
      return out;
    }
    if (mine.every((x) => typeof x !== "object") && other.every((x) => typeof x !== "object")) {
      return [...mine, ...other.filter((x) => !mine.includes(x))];
    }
    return mine.length ? mine : other;
  }
  if (isObj(mine) && isObj(other)) {
    const out: Record<string, Json> = { ...mine };
    for (const [k, v] of Object.entries(other)) out[k] = k in mine ? mergeValue(mine[k], v) : v;
    return out;
  }
  return mine;
}

/** Merge one stored text value (usually JSON) with another port's. */
export function mergeStored(mine: string | null, other: string): string {
  if (mine === null || mine === "") return other;
  try {
    return JSON.stringify(mergeValue(JSON.parse(mine), JSON.parse(other)));
  } catch {
    return mine;
  }
}

function snapshot(): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k !== null) out[k] = localStorage.getItem(k) ?? "";
  }
  return out;
}

/** Called before the app reads its storage. */
export async function hydrateFromVault(): Promise<void> {
  try {
    const r = await fetch("/app/vault", { headers: HEADERS });
    if (!r.ok) return;
    const { values, harvests } = (await r.json()) as {
      values: Record<string, string> | null;
      harvests: { port: number; values: Record<string, string> }[];
    };
    active = true;
    if (values) {
      for (const [k, v] of Object.entries(values)) localStorage.setItem(k, v);
      sent = { ...values };
    }
    if (harvests?.length) {
      for (const h of harvests) {
        for (const [k, v] of Object.entries(h.values)) {
          try {
            localStorage.setItem(k, mergeStored(localStorage.getItem(k), v));
          } catch {
            /* storage full: the file still has it */
          }
        }
      }
      await flushVault();
      await fetch("/app/vault/harvested", { method: "POST", headers: HEADERS });
    }
  } catch {
    /* not the desktop app */
  }
}

/** Copy whatever changed in storage to the file. Safe to call often. */
export async function flushVault(): Promise<void> {
  if (!active) return;
  const now = snapshot();
  const changes: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(now)) if (sent[k] !== v) changes[k] = v;
  for (const k of Object.keys(sent)) if (!(k in now)) changes[k] = null;
  if (!Object.keys(changes).length) return;
  try {
    const r = await fetch("/app/vault", { method: "PUT", headers: HEADERS, body: JSON.stringify({ changes }) });
    if (r.ok) sent = now;
  } catch {
    /* tried again on the next tick */
  }
}

/** Every 2 s, and when the window is hidden or closed. */
export function startVaultSync(): void {
  if (!active) return;
  window.setInterval(() => void flushVault(), 2000);
  document.addEventListener("visibilitychange", () => void flushVault());
  window.addEventListener("pagehide", () => void flushVault());
}
