/**
 * Keys shared with Video Forge (12 Oct 2026).
 *
 * When both apps are installed on one computer, a key typed into either one
 * works in both. The desktop app keeps them in a file only this Windows user
 * can read (electron/forgeKeys.mjs); this page reads and writes it through
 * /app/keys. Outside the desktop app there is no /app route, and every call
 * quietly does nothing.
 *
 * Two rules keep it from fighting you:
 *  · a shared key only FILLS an empty box here — it never overwrites one;
 *  · a key you type here is shared as soon as settings save.
 */
import type { ForgeSettings } from "./providers";
import { newKey } from "./providers";

const HEADERS = { "X-Forge-App": "1" };

/** The text providers both apps know, by the address their API lives at. */
export const TEXT_PROVIDERS = {
  mistral: { host: "api.mistral.ai", base: "https://api.mistral.ai/v1", label: "mistral.ai" },
  openrouter: { host: "openrouter.ai", base: "https://openrouter.ai/api/v1", label: "openrouter.ai" },
  nvidia: { host: "integrate.api.nvidia.com", base: "https://integrate.api.nvidia.com/v1", label: "nvidia" },
  groq: { host: "api.groq.com", base: "https://api.groq.com/openai/v1", label: "groq" },
} as const;
type TextName = keyof typeof TEXT_PROVIDERS;

const hostOf = (base: string) => {
  try {
    return new URL(base).host;
  } catch {
    return "";
  }
};

/** The keys in these settings, by shared name. Empty ones are left out. */
export function keysFromSettings(s: ForgeSettings): Record<string, string> {
  const out: Record<string, string> = {};
  const put = (name: string, v: string | undefined) => {
    if (v && v.trim()) out[name] = v.trim();
  };
  put("gemini", s.geminiKeys.find((k) => k.key.trim())?.key);
  put("pollinations", s.pollinationsToken);
  put("cloudflare-account", s.cloudflare.accountId);
  put("cloudflare-token", s.cloudflare.token);
  put("openai", s.openaiKeys.find((k) => k.key.trim())?.key);
  for (const [name, p] of Object.entries(TEXT_PROVIDERS)) {
    put(name, s.textProviders.find((t) => hostOf(t.base) === p.host && t.key.trim())?.key);
  }
  return out;
}

/**
 * Settings with the shared keys filled into empty places. Returns the same
 * object when nothing was missing, so React does not re-render for nothing.
 */
export function fillFromShared(s: ForgeSettings, keys: Record<string, string>): ForgeSettings {
  let next = s;
  const edit = (patch: Partial<ForgeSettings>) => (next = { ...next, ...patch });

  if (keys.gemini && !next.geminiKeys.some((k) => k.key.trim())) {
    const first = next.geminiKeys[0] ?? newKey("free-1");
    edit({ geminiKeys: [{ ...first, key: keys.gemini, label: first.label || "from Video Forge" }, ...next.geminiKeys.slice(1)] });
  }
  if (keys.openai && !next.openaiKeys.some((k) => k.key.trim())) {
    const first = next.openaiKeys[0] ?? newKey("key-1");
    edit({ openaiKeys: [{ ...first, key: keys.openai }, ...next.openaiKeys.slice(1)] });
  }
  if (keys.pollinations && !next.pollinationsToken.trim()) edit({ pollinationsToken: keys.pollinations });
  if (keys["cloudflare-account"] && !next.cloudflare.accountId.trim()) {
    edit({ cloudflare: { ...next.cloudflare, accountId: keys["cloudflare-account"] } });
  }
  if (keys["cloudflare-token"] && !next.cloudflare.token.trim()) {
    edit({ cloudflare: { ...next.cloudflare, token: keys["cloudflare-token"] } });
  }

  for (const name of Object.keys(TEXT_PROVIDERS) as TextName[]) {
    const key = keys[name];
    if (!key) continue;
    const p = TEXT_PROVIDERS[name];
    const list = next.textProviders;
    if (list.some((t) => hostOf(t.base) === p.host && t.key.trim())) continue;
    const at = list.findIndex((t) => hostOf(t.base) === p.host);
    const textProviders =
      at >= 0
        ? list.map((t, i) => (i === at ? { ...t, key } : t))
        : [...list, { id: `p${list.length + 1}-${name}`, label: p.label, base: p.base, key }];
    edit({ textProviders });
    // The three text jobs carry their own copy of the address and key.
    for (const job of ["scribe", "coder", "vision"] as const) {
      const e = next[job];
      if (hostOf(e.base) === p.host && !e.key.trim()) edit({ [job]: { ...e, key } } as Partial<ForgeSettings>);
    }
  }
  return next;
}

export async function loadSharedKeys(): Promise<Record<string, string>> {
  try {
    const r = await fetch("/app/keys", { headers: HEADERS });
    if (!r.ok) return {};
    const j = await r.json();
    return j && typeof j.keys === "object" && j.keys ? (j.keys as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export async function saveSharedKeys(keys: Record<string, string>): Promise<void> {
  try {
    await fetch("/app/keys", {
      method: "POST",
      headers: { ...HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ keys }),
    });
  } catch {
    /* not the desktop app */
  }
}
