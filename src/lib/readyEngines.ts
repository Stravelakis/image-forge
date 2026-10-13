/**
 * The engines that are set up and ready right now — what the Start screen's
 * engine drop-down offers (Ak, 13 Oct 2026: "a dropdown of the things that are
 * setup and available, with an add more at the end").
 *
 * Only what will actually work: a key-less engine always, a keyed one only
 * with its key, your own machine's picture models by name only when LocalAI
 * answered. Each choice is a settings patch, so picking one is one click.
 */
import type { ForgeSettings } from "./providers";

export interface ReadyEngine {
  value: string;
  label: string;
  free: boolean;
  patch: Partial<ForgeSettings>;
}

export function readyEngines(s: ForgeSettings, localModels: string[]): ReadyEngine[] {
  const out: ReadyEngine[] = [];
  for (const m of localModels) {
    out.push({ value: `local:${m}`, label: `${m} — this computer, free`, free: true, patch: { provider: "local", localModel: m } });
  }
  out.push({ value: "ovh", label: "OVHcloud SDXL — free, no limit", free: true, patch: { provider: "ovh" } });
  if (s.cloudflare.accountId.trim() && s.cloudflare.token.trim()) {
    out.push({ value: "cloudflare", label: "Cloudflare FLUX — free daily allowance", free: true, patch: { provider: "cloudflare" } });
  }
  if (s.pollinationsToken.trim()) {
    out.push({ value: "pollinations", label: "Pollinations FLUX — free", free: true, patch: { provider: "pollinations" } });
  }
  if ([...s.geminiKeys, ...s.geminiPaidKeys].some((k) => k.key.trim())) {
    out.push({ value: "gemini:nano-banana-2-lite", label: "Google Nano Banana 2 Lite — about $0.034 a picture", free: false, patch: { provider: "gemini", geminiModel: "nano-banana-2-lite" } });
    out.push({ value: "gemini:nano-banana-2", label: "Google Nano Banana 2 — about $0.067 a picture", free: false, patch: { provider: "gemini", geminiModel: "nano-banana-2" } });
  }
  if (s.openaiKeys.some((k) => k.key.trim())) {
    out.push({ value: "openai", label: `${s.openaiModel || "OpenAI-compatible"} — your own account`, free: false, patch: { provider: "openai" } });
  }
  return out;
}

/** Which of those the settings are on now. */
export function currentEngineValue(s: ForgeSettings): string {
  if (s.provider === "local") return `local:${s.localModel}`;
  if (s.provider === "gemini") return `gemini:${s.geminiModel}`;
  return s.provider;
}
