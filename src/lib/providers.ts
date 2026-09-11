import type { ManifestRow, Toast } from "../types";
import { STYLES } from "../types";
import { blobToDataUrl } from "./output";
import { routeBase } from "./visionEngine";
import {
  generateBytes,
  MODELS,
  RETIRED_MODELS,
  findModel,
  resolveRoute,
  RateLimitError,
  RetiredModelError,
  priceFor,
  estimateCost,
  formatUsd,
  MODEL_TRAITS,
  NO_TEXT_NEGATIVE,
  textQualityFor,
  promptStyleFor,
  suppressTextIfWeak,
} from "./engines.mjs";
import type { ApiKey, Exhaust, ModelDef, ProviderId, TextQuality } from "./engines.mjs";

/* The engines themselves (routing, prices, key rotation, network) live in the
   shared, DOM-free engines.mjs so the MCP server uses the exact same code. */
export {
  MODELS,
  RETIRED_MODELS,
  findModel,
  resolveRoute,
  RateLimitError,
  RetiredModelError,
  priceFor,
  estimateCost,
  formatUsd,
  MODEL_TRAITS,
  NO_TEXT_NEGATIVE,
  textQualityFor,
  promptStyleFor,
  suppressTextIfWeak,
};
export type { ApiKey, Exhaust, ModelDef, ProviderId, TextQuality };

/* ---------------- keys & settings ---------------- */

export const newKey = (label: string): ApiKey => ({
  id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
  label,
  key: "",
  exhaustedUntil: 0,
});

/** A batch job sent to Google and waiting to come back. */
export interface BatchJob {
  name: string;
  model: string;
  count: number;
  filenames: string[];
  submittedAt: string;
  state?: string;
  lastCheckedAt?: string;
}

export interface ForgeSettings {
  provider: ProviderId;
  pollinationsModel: string;
  /** free token from auth.pollinations.ai — anonymous use is bot-checked now */
  pollinationsToken: string;
  pollinationsReferrer: string;
  /** free-tier Google keys — tried first, and expected to run out */
  geminiKeys: ApiKey[];
  /** paid Google keys — only used once the free ones are spent */
  geminiPaidKeys: ApiKey[];
  geminiModel: string;
  geminiImageSize: string;
  cloudflare: { accountId: string; token: string };
  cloudflareSteps: number;
  openaiKeys: ApiKey[];
  openaiBase: string;
  openaiModel: string;
  /** a model running on your own machine: LocalAI, ComfyUI, LM Studio, SD WebUI */
  localBase: string;
  localModel: string;
  localKey: string;
  /** how good YOUR local model is at writing words inside a picture */
  localTextQuality: TextQuality;
  /** tell models that cannot write not to try — on by default */
  suppressTextOnWeakModels: boolean;
  /** rewrite each prompt to suit the model, using your text engine. Off unless you ask. */
  tailorPrompts: boolean;
  /** ask before anything that costs money. On, and it should stay on. */
  confirmPaidRuns: boolean;
  /** how many images to draw at once; 1 = one at a time, as it has always been */
  concurrency: number;
  /** batch jobs sent to Google that have not been collected yet */
  batchJobs: BatchJob[];
  /** warn before the browser's storage box fills up and starts dropping data */
  storageWarnAtPct: number;
  scribe: { base: string; key: string; model: string };
  /** a model for writing CODE — SVG, Lottie JSON. Codestral is built for this. */
  coder: { base: string; key: string; model: string };
  /**
   * A model that can LOOK at a picture — used to find where a caption belongs.
   * Any OpenAI-compatible endpoint that accepts an image_url part will do, so
   * this is not tied to one company. It defaults to Mistral because that is
   * free on their tier and needs no card.
   */
  vision: { base: string; key: string; model: string };
  /**
   * The endpoints and keys the three text jobs draw from.
   *
   * The three engines each carried their own address and key, which meant
   * typing the same Mistral key three times and no way to see, at a glance,
   * what you had. They are entered once here; each engine then picks a model
   * and takes that provider's address and key with it. The engines still hold
   * their own copy, because that is what the request needs and it keeps them
   * working if a provider is later removed.
   */
  textProviders: { id: string; label: string; base: string; key: string }[];
  /** which filename rules are enforced; anything missing counts as on */
  filenameRules: Record<string, boolean>;
  /**
   * Engines switched off by hand. A provider having a bad month should not
   * cost you your key setup, and should not cost you thirty seconds per row
   * proving it is still broken.
   */
  pausedEngines: string[];
  cooldowns: Record<string, number>;
  usage: Record<string, { day: string; used: number }>;
  writeCsvOnSync: boolean;
  /** automatically re-queue rows whose cooldown has elapsed */
  autoRetry: boolean;
  /** GitHub repo used by Settings → Advanced (pull manifest / check for app updates) */
  github: { owner: string; repo: string; branch: string; csvPath: string };
  metaPrompts: { promptWriter: string; filenameForger: string; stylePicker: string; wpMeta: string; factory: string };
  wp: { url: string; user: string; appPassword: string };
  ambient: {
    accent: string;
    background: "none" | "dots" | "embers" | "stars";
    density: number;
    wave: boolean;
    sparkle: boolean;
    glow: "off" | "accent" | "prismatic";
    cursor: "none" | "lantern" | "sparks";
    cursorSize: number;
    /**
     * How much things move. "system" follows the operating system's own
     * reduce-motion setting, which is the right default: someone who set it
     * there should not have to find it again in here.
     */
    motion: "system" | "full" | "reduced" | "off";
  };
  customStyles: { id: string; name: string; block: string }[];
  /**
   * Style ids you starred, newest first.
   *
   * Not a group in the catalogue: a style belongs to one group by what it
   * looks like, and putting it in a "favourites" group instead would move it
   * out of the family it belongs to. This is a separate list laid over the
   * top, so a starred style appears both at the front and in its own group.
   */
  favoriteStyles: string[];
}

/** Build a provider list from whatever the three engines were already using. */
function seedProviders(s: Record<string, unknown>): ForgeSettings["textProviders"] {
  const out: ForgeSettings["textProviders"] = [];
  const seen = new Set<string>();
  for (const [job, label] of [
    ["scribe", "writing"],
    ["coder", "code"],
    ["vision", "vision"],
  ] as const) {
    const e = s[job] as { base?: string; key?: string } | undefined;
    const base = (e?.base ?? "").trim();
    const key = (e?.key ?? "").trim();
    if (!base || !key) continue;
    const fingerprint = `${base}|${key}`;
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    let host = base;
    try {
      host = new URL(base).host.replace(/^api\./, "");
    } catch {
      /* keep the raw address as the name */
    }
    out.push({ id: `p${out.length + 1}`, label: host || label, base, key });
  }
  return out;
}

export const DEFAULT_SETTINGS: ForgeSettings = {
  provider: "simulated",
  pollinationsModel: "flux",
  pollinationsToken: "",
  pollinationsReferrer: "image-forge",
  geminiKeys: [newKey("free-1")],
  geminiPaidKeys: [newKey("paid-1")],
  geminiModel: "nano-banana-2",
  geminiImageSize: "1K",
  cloudflare: { accountId: "", token: "" },
  cloudflareSteps: 4,
  openaiKeys: [newKey("key-1")],
  openaiBase: "https://api.openai.com/v1",
  openaiModel: "gpt-image-1",
  localBase: "http://localhost:8080/v1",
  localModel: "flux.2-klein-4b",
  localKey: "",
  localTextQuality: "poor",
  suppressTextOnWeakModels: true,
  tailorPrompts: false,
  confirmPaidRuns: true,
  concurrency: 1,
  batchJobs: [],
  storageWarnAtPct: 70,
  scribe: { base: "https://api.openai.com/v1", key: "", model: "gpt-4o-mini" },
  coder: { base: "https://api.mistral.ai/v1", key: "", model: "codestral-latest" },
  vision: { base: "https://api.mistral.ai/v1", key: "", model: "mistral-medium-latest" },
  textProviders: [],
  filenameRules: {},
  pausedEngines: [],
  cooldowns: {},
  usage: {},
  writeCsvOnSync: true,
  autoRetry: true,
  github: { owner: "", repo: "image-forge", branch: "main", csvPath: "marketplace-images.csv" },
  metaPrompts: { promptWriter: "", filenameForger: "", stylePicker: "", wpMeta: "", factory: "" },
  wp: { url: "", user: "", appPassword: "" },
  ambient: {
    accent: "ember",
    background: "dots",
    density: 55,
    wave: true,
    sparkle: true,
    glow: "accent",
    cursor: "lantern",
    cursorSize: 240,
    motion: "system",
  },
  customStyles: [],
  favoriteStyles: [],
};

export function normalizeSettings(s: Partial<ForgeSettings>): ForgeSettings {
  // Google retired the Imagen endpoints on 2026-08-17, so anyone whose saved
  // settings still say "imagen" gets moved to its replacement automatically.
  const legacyProvider = (s as { provider?: string }).provider;
  const provider = (legacyProvider === "imagen" ? "gemini" : legacyProvider) as ProviderId | undefined;

  return {
    ...DEFAULT_SETTINGS,
    ...s,
    ...(provider ? { provider } : {}),
    cloudflare: { ...DEFAULT_SETTINGS.cloudflare, ...(s.cloudflare ?? {}) },
    batchJobs: Array.isArray(s.batchJobs) ? s.batchJobs : [],
    concurrency: Math.min(Math.max(Number(s.concurrency) || 1, 1), 8),
    scribe: { ...DEFAULT_SETTINGS.scribe, ...(s.scribe ?? {}) },
    coder: { ...DEFAULT_SETTINGS.coder, ...(s.coder ?? {}) },
    vision: { ...DEFAULT_SETTINGS.vision, ...(s.vision ?? {}) },
    // Settings saved before the providers card existed have keys on the three
    // engines and no provider list. Seed it from them, deduplicated, so an
    // existing setup arrives already filled in rather than looking empty.
    textProviders: Array.isArray(s.textProviders) && s.textProviders.length > 0 ? s.textProviders : seedProviders(s),
    filenameRules: (s.filenameRules as Record<string, boolean>) ?? {},
    pausedEngines: Array.isArray(s.pausedEngines) ? s.pausedEngines : [],
    metaPrompts: { ...DEFAULT_SETTINGS.metaPrompts, ...(s.metaPrompts ?? {}) },
    github: { ...DEFAULT_SETTINGS.github, ...(s.github ?? {}) },
    wp: { ...DEFAULT_SETTINGS.wp, ...(s.wp ?? {}) },
    ambient: (() => {
      const a = (s.ambient ?? {}) as Partial<ForgeSettings["ambient"]> & { dots?: boolean; glow?: boolean };
      const migrated: Partial<ForgeSettings["ambient"]> = { ...a };
      // legacy boolean toggles → new structured choices
      if (typeof a.background !== "string" && typeof a.dots === "boolean") migrated.background = a.dots ? "dots" : "none";
      if (typeof a.glow !== "string" && typeof (a as { glow?: boolean }).glow === "boolean")
        migrated.glow = (a as { glow?: boolean }).glow ? "accent" : "off";
      delete (migrated as { dots?: boolean }).dots;
      return { ...DEFAULT_SETTINGS.ambient, ...migrated };
    })(),
    customStyles: s.customStyles ?? [],
    favoriteStyles: Array.isArray(s.favoriteStyles) ? s.favoriteStyles : [],
    geminiKeys: s.geminiKeys?.length ? s.geminiKeys : DEFAULT_SETTINGS.geminiKeys,
    geminiPaidKeys: s.geminiPaidKeys?.length ? s.geminiPaidKeys : DEFAULT_SETTINGS.geminiPaidKeys,
    openaiKeys: s.openaiKeys?.length ? s.openaiKeys : DEFAULT_SETTINGS.openaiKeys,
  };
}

/* ---------------- model registry (defined in engines.mjs) ---------------- */

export const modelOptions = MODELS.map((m) => m.id);

export const cooldownHoursFor = (modelId: string, s: ForgeSettings): number => {
  const custom = s.cooldowns[modelId];
  if (typeof custom === "number" && custom >= 0) return custom;
  return findModel(modelId)?.defaultCooldownH ?? 1;
};

const todayStr = () => new Date().toISOString().slice(0, 10);
export function bumpUsage(usage: ForgeSettings["usage"], modelId: string): ForgeSettings["usage"] {
  const cur = usage[modelId];
  const used = cur && cur.day === todayStr() ? cur.used + 1 : 1;
  return { ...usage, [modelId]: { day: todayStr(), used } };
}
export const usedToday = (usage: ForgeSettings["usage"], modelId: string): number => {
  const cur = usage[modelId];
  return cur && cur.day === todayStr() ? cur.used : 0;
};

export function formatCountdown(untilMs: number): string {
  const ms = untilMs - Date.now();
  if (ms <= 0) return "now";
  const h = Math.floor(ms / 3600000);
  const m = Math.ceil((ms % 3600000) / 60000);
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

/* ---------------- provider meta & catalog ---------------- */

export const PROVIDER_META: Record<ProviderId, { name: string; short: string; needsKey: boolean; dot: string; note: string; free: string }> = {
  simulated: {
    name: "Simulated Forge", short: "simulated", needsKey: false, dot: "#97876d",
    note: "Offline rehearsal engine. Paints a deterministic procedural plate so you can dry-run the whole pipeline for free.",
    free: "∞ free",
  },
  local: {
    name: "Your own machine", short: "local", needsKey: false, dot: "#7fb069",
    note: "A model running on your own computer — LocalAI, ComfyUI, LM Studio, an SD WebUI. Free, unlimited, private, and it works with no internet. Slower than the paid services: expect 20 seconds to a few minutes per picture depending on your graphics card.",
    free: "free · unlimited · private",
  },
  cloudflare: {
    name: "Cloudflare · FLUX", short: "cloudflare", needsKey: true, dot: "#e8a33d",
    note: "The best genuinely free option: 10,000 credits a day, about 690 pictures, resetting at midnight UTC. No card needed. Fixed image size, so the aspect ratio is ignored.",
    free: "free · ~690/day",
  },
  pollinations: {
    name: "Pollinations · FLUX", short: "pollinations", needsKey: false, dot: "#f2a33c",
    note: "Free and unlimited in volume, but paced to one picture every few seconds. Anonymous use is now blocked by a bot check — get a free token at auth.pollinations.ai.",
    free: "free · needs a token",
  },
  ovh: {
    name: "OVHcloud · SDXL", short: "ovh", needsKey: false, dot: "#6e9fd8",
    note: "Stable Diffusion XL, hosted free by OVHcloud. No key and no signup. Paced to two pictures a minute, always 1024×1024, and it takes no seed — the same prompt twice gives two different pictures.",
    free: "free · no key · 2/min",
  },
  gemini: {
    name: "Google · Nano Banana", short: "google", needsKey: true, dot: "#56b8a5",
    note: "Google's current image models, charged per picture. There is no free tier any more — the old Imagen free allowance ended when Google switched Imagen off on 17 August 2026. Batch jobs cost half.",
    free: "paid · from $0.034/image",
  },
  openai: {
    name: "OpenAI-compatible", short: "openai", needsKey: true, dot: "#b18ce0",
    note: "Any /images/generations endpoint: OpenAI itself, Together, OpenRouter, or a local Stable Diffusion WebUI.",
    free: "depends on endpoint",
  },
};

/**
 * What is actually free, checked by hand on 2 September 2026.
 * 'recurring' means the allowance comes back — daily, monthly — rather than
 * being a one-off pot of trial credits that runs dry and never refills.
 */
export const FREE_OPTIONS = [
  { name: "Cloudflare Workers AI", free: "~690 images/day", recurring: "daily, resets 00:00 UTC", limit: "10,000 neurons/day shared with any text use", models: "FLUX.1 schnell, FLUX.2, Leonardo", key: "account id + API token", wiring: "built-in" },
  { name: "Pollinations", free: "unlimited volume", recurring: "always", limit: "one image every 5s on the free token; anonymous use is bot-blocked", models: "flux, turbo", key: "free token from auth.pollinations.ai", wiring: "built-in" },
  { name: "Hugging Face Inference", free: "about 25 images/month", recurring: "monthly", limit: "$0.10 of credit a month; $2 on a PRO account", models: "FLUX.1, SDXL", key: "HF token", wiring: "curl" },
  { name: "NVIDIA NIM", free: "developer credits", recurring: "monthly-ish", limit: "free developer plan, terms change often", models: "FLUX, SDXL", key: "NVIDIA key", wiring: "curl" },
  { name: "Google (Gemini / Nano Banana)", free: "none", recurring: "never", limit: "no free image tier since Imagen was retired on 17 Aug 2026", models: "nano-banana-2, nano-banana-2-lite", key: "GEMINI_API_KEY + billing", wiring: "built-in" },
  { name: "fal.ai", free: "~$20 trial credit", recurring: "one-off", limit: "runs out and does not refill", models: "FLUX.1, AuraFlow", key: "FAL_KEY", wiring: "curl" },
  { name: "Together AI", free: "$1 trial credit", recurring: "one-off", limit: "runs out and does not refill", models: "FLUX.1-schnell", key: "TOGETHER_KEY", wiring: "curl" },
  { name: "Stability API", free: "25 trial credits", recurring: "one-off", limit: "runs out and does not refill", models: "SD3.5, SDXL", key: "STABILITY_KEY", wiring: "curl" },
  { name: "Leonardo AI", free: "150 tokens/day", recurring: "daily", limit: "token cost varies by model", models: "Phoenix, Lucid", key: "API key", wiring: "curl" },
  { name: "Craiyon", free: "unlimited, ad-supported", recurring: "always", limit: "web only, lower quality", models: "craiyon", key: "none", wiring: "web only" },
];


export const SNIPPETS = [
  {
    label: "Google · Nano Banana 2",
    code: `curl "https://generativelanguage.googleapis.com/v1beta/interactions" \\
  -H "x-goog-api-key: $GEMINI_API_KEY" \\
  -H 'Content-Type: application/json' \\
  -d '{"model":"gemini-3.1-flash-image",
       "input":[{"type":"text","text":"'"$PROMPT"'"}],
       "response_format":{"type":"image","mime_type":"image/png",
                          "aspect_ratio":"16:9","image_size":"1K"}}' \\
  --output response.json
# base64 PNG lands in .output_image.data
# NOTE: the old imagen-4.0-*:predict endpoints were switched off 17 Aug 2026`,
  },
  {
    label: "Cloudflare Workers AI (free)",
    code: `curl "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/ai/run/@cf/black-forest-labs/flux-1-schnell" \\
  -H "Authorization: Bearer $CF_API_TOKEN" \\
  -H 'Content-Type: application/json' \\
  -d '{"prompt":"'"$PROMPT"'","steps":4}' \\
  --output response.json
# base64 image lands in .result.image
# 10,000 neurons/day free, roughly 690 pictures, resets midnight UTC`,
  },
  {
    label: "Pollinations (free, token required)",
    code: `curl "https://image.pollinations.ai/prompt/$PROMPT?model=flux&width=1024&height=576&nologo=true" \\
  -H "Authorization: Bearer $POLLINATIONS_TOKEN" \\
  --output image.png
# free token: https://auth.pollinations.ai
# without a token you get 403 {"error":"Missing Turnstile token"}`,
  },
  {
    label: "OpenAI-compatible",
    code: `curl "$BASE_URL/images/generations" \\
  -H "Authorization: Bearer $API_KEY" \\
  -H 'Content-Type: application/json' \\
  -d '{"model":"gpt-image-1","prompt":"'"$PROMPT"'",
       "size":"1024x1024","response_format":"b64_json"}' \\
  --output response.json
# base64 PNG lands in .data[0].b64_json`,
  },
  {
    label: "Hugging Face",
    code: `curl https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell \\
  -H "Authorization: Bearer $HF_TOKEN" \\
  -H 'Content-Type: application/json' \\
  -d '{"inputs":"'"$PROMPT"'"}' \\
  --output image.jpg
# binary image in the response body`,
  },
];

/* ---------------- generation ---------------- */

/* Plain setTimeout rather than window.setTimeout, so the text engine works
   outside a browser too — under test, and from the MCP server. */
function fetchWithTimeout(url: string, init: RequestInit, ms: number, outer?: AbortSignal): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(new Error("request timed out")), ms);
  const onOuter = () => ctrl.abort(new Error("halted"));
  if (outer) {
    if (outer.aborted) onOuter();
    else outer.addEventListener("abort", onOuter);
  }
  return fetch(url, { ...init, signal: ctrl.signal }).finally(() => {
    clearTimeout(t);
    outer?.removeEventListener("abort", onOuter);
  });
}

export interface StrikeResult {
  blob: Blob;
  dataUrl: string;
}

/** Real generation against the routed engine, with key rotation on rate limits. */
export async function generateReal(
  row: ManifestRow,
  s: ForgeSettings,
  signal: AbortSignal | undefined,
  exhaust: Exhaust,
  cooldownMs: number,
  /** base64 pictures for the model to work from — sheets use this for consistency */
  opts: { refImages?: string[] } = {}
): Promise<StrikeResult> {
  const { bytes, mime } = await generateBytes(row, s, signal, exhaust, cooldownMs, opts);
  const blob = new Blob([bytes], { type: mime || "image/png" });
  return { blob, dataUrl: await blobToDataUrl(blob) };
}

/* ---------------- the scribe & factory (OpenAI-compatible chat) ---------------- */

export async function scribeChat(
  scribe: ForgeSettings["scribe"],
  system: string,
  user: string,
  signal?: AbortSignal
): Promise<string> {
  if (!scribe.key.trim()) throw new Error("no text-engine key — set one in Settings → Text engines");
  // Detours around providers that refuse browser callers (NVIDIA). A no-op
  // for everyone else, and a no-op in Node where CORS does not exist.
  const base = routeBase(scribe.base);
  const res = await fetchWithTimeout(
    `${base}/chat/completions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${scribe.key.trim()}` },
      body: JSON.stringify({
        model: scribe.model || "gpt-4o-mini",
        temperature: 0.8,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    },
    120000,
    signal
  );
  if (!res.ok) {
    const text = (await res.text()).slice(0, 180);
    throw new Error(`text engine ${res.status} — ${text || "request refused"}`);
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const out = json.choices?.[0]?.message?.content?.trim();
  if (!out) throw new Error("text engine answered with nothing");
  return out;
}

export const SCRIBE_SYSTEMS = {
  promptWriter: (styleBlock: string, category: string, kindFlavor = "", override?: string) =>
    override?.trim() ||
    `You are the prompt scribe of an image generation forge (category: ${category}).
Rewrite the user's short description into ONE vivid image prompt, 35–60 words, concrete nouns, strong light, no camera jargon.
${kindFlavor ? `The subject world is: ${kindFlavor}. Weave that flavor in naturally. ` : "Keep the subject world exactly as the user describes it — add no genre of your own. "}
You MUST end the prompt with exactly this style block, verbatim: ", ${styleBlock}".
Reply with the prompt only — no quotes, no preamble.`,
  styleCrafter: (override?: string) =>
    override?.trim() ||
    `You are the style smith of an image forge. The user describes a visual look in plain words.
Invent a NEW visual style for image prompts: a short kebab-case id (lowercase, dashes), a display Name, and a style block of 8–16 words describing ONLY the artistic medium (technique, materials, lighting, composition) — never the subject world.
Reply with valid JSON only, no markdown fences: {"id":"my-style","name":"My Style","block":"..."}`,
  filenameForger: (category: string, override?: string) =>
    override?.trim() ||
    `You are the filename forger. From the user's image prompt, invent ONE filename that obeys ALL rules:
lowercase only · no spaces · no special characters · words joined with underscores · must start with the prefix "${category}_" · must end with ".png" · max 4 words after the prefix · evocative but short.
Reply with ONLY the filename, nothing else. Example shape: ${category}_crooked_potion_shop.png`,
  styleSuggester: (override?: string) =>
    override?.trim() ||
    `You are the style advisor of an image forge. The available visual languages are: ${STYLES.map((s) => s.id).join(", ")}.
Pick the single best style id for the user's subject and reply with EXACTLY one line: <style-id> — <one short reason>.`,
  wpMetadata: (override?: string) =>
    override?.trim() ||
    `You craft WordPress attachment metadata for a marketplace image. From the user's filename + prompt, reply with valid JSON only, no markdown fences:
{"title": "Human readable title", "alt": "descriptive alt text under 125 chars, no keyword stuffing", "caption": "one charming sentence for the shop card"}`,
  factory: (kindFlavor: string, kindNegative: string, filenameTag: string, styleBlock: string | null, override?: string) =>
    override?.trim() ||
    `You are the prompt factory of an image forge. The user gives a theme and a count. Invent that many DIFFERENT picture ideas${
      kindFlavor ? ` for this subject world: ${kindFlavor}` : " — keep them genre-neutral unless the theme implies otherwise"
    }.
Rules for every idea:
- filename: lowercase, underscores only, starts with its category prefix (shop_ / item_ / event_ / npc_), ${
      filenameTag ? `then the world tag "${filenameTag}_", ` : ""
    }then up to 3 subject words, ends with .png (example shape: item_${filenameTag ? filenameTag + "_" : ""}healing_flask.png)
- prompt: RICH — 45–80 words across 2–3 sentences: subject & materials first, then lighting & mood, then one telling detail. No camera jargon.${
      styleBlock ? ` MUST end verbatim with ", ${styleBlock}".` : " Do NOT append any style words — the visual style is added later."
    }
- negative_prompt: start with "${kindNegative}" and add 2–4 subject-specific avoids
- category: one of shop | item | event | npc (mix them)
Reply with ONLY a JSON object, no markdown fences:
{"rows":[{"filename":"shop_...png","prompt":"...","negative_prompt":"...","category":"shop"}, ...]}`,
};

export type { Toast as ProviderToast };
