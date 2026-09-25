/**
 * Shared image engines — the single source of truth for model routing, prices
 * and the network calls behind them.
 *
 * Deliberately DOM-free and dependency-free plain ESM so BOTH sides can use it:
 *   · the browser app  (src/lib/providers.ts wraps this into Blob + data URL)
 *   · the MCP server   (scripts/mcp-server.js writes the bytes straight to disk)
 *
 * Everything here returns raw bytes; anything Blob/FileReader-shaped lives in
 * providers.ts. Types for TypeScript callers live in engines.d.mts.
 *
 * ── Reality check, verified 2026-09-02 ────────────────────────────────────
 * · Google retired imagen-4.0-* on 2026-08-17. The `:predict` call this file
 *   used to make is gone. Image generation now goes through the Interactions
 *   API, and there is NO free Google tier any more.
 * · Pollinations now answers anonymous requests with a Turnstile bot check.
 *   A free "seed" token from auth.pollinations.ai is the supported way in.
 * · Cloudflare Workers AI is the one genuinely free recurring allowance:
 *   10,000 neurons/day, ~690 FLUX images, no card.
 */

/* ---------------- shared shapes ---------------- */

/** Pixel dimensions per aspect key. Mirrors ASPECTS in src/types.ts (w/h only). */
export const DIMS = {
  "16:9": { w: 1024, h: 576 },
  "1:1": { w: 768, h: 768 },
  "9:16": { w: 576, h: 1024 },
  "4:3": { w: 1024, h: 768 },
};

/**
 * Every model the forge can route to.
 *
 *   priceUsd      what one image costs, in US dollars. 0 = free.
 *   batchPriceUsd what one image costs when sent via a half-price batch job,
 *                 or null when the engine has no batch mode.
 *   allowance     the free allowance in plain words (shown in the UI).
 *   retiresOn     ISO date the provider switches it off, or null.
 */
export const MODELS = [
  {
    id: "nano-banana-2",
    label: "Nano Banana 2",
    engine: "gemini",
    apiId: "gemini-3.1-flash-image",
    priceUsd: 0.067,
    batchPriceUsd: 0.034,
    needsKey: true,
    free: "paid · $0.067/image",
    allowance: "no free tier",
    note: "Google's current flagship image model. Best all-rounder.",
    retiresOn: null,
    defaultCooldownH: 1,
  },
  {
    id: "nano-banana-2-lite",
    label: "Nano Banana 2 Lite",
    engine: "gemini",
    apiId: "gemini-3.1-flash-lite-image",
    priceUsd: 0.0336,
    batchPriceUsd: 0.0168,
    needsKey: true,
    free: "paid · $0.034/image",
    allowance: "no free tier",
    note: "Half the price of Nano Banana 2. 1K output only.",
    retiresOn: null,
    defaultCooldownH: 1,
  },
  {
    id: "nano-banana",
    label: "Nano Banana (1)",
    engine: "gemini",
    apiId: "gemini-2.5-flash-image",
    priceUsd: 0.039,
    batchPriceUsd: 0.0195,
    needsKey: true,
    free: "paid · $0.039/image",
    allowance: "no free tier",
    note: "The original. Google switches it off on 2 October 2026.",
    retiresOn: "2026-10-02",
    defaultCooldownH: 1,
  },
  {
    id: "gemini-3-pro-image",
    label: "Gemini 3 Pro Image",
    engine: "gemini",
    apiId: "gemini-3-pro-image",
    priceUsd: 0.134,
    batchPriceUsd: 0.067,
    needsKey: true,
    free: "paid · $0.134/image",
    allowance: "no free tier",
    note: "Highest quality, highest price. Worth it for hero images.",
    retiresOn: null,
    defaultCooldownH: 1,
  },
  {
    id: "cloudflare-flux",
    label: "Cloudflare FLUX schnell",
    engine: "cloudflare",
    apiId: "@cf/black-forest-labs/flux-1-schnell",
    priceUsd: 0,
    batchPriceUsd: null,
    needsKey: true,
    free: "free · ~690 images/day",
    allowance: "10,000 neurons/day, resets 00:00 UTC, no card needed",
    note: "The best genuinely free option. Fixed image size — aspect ratio is ignored.",
    retiresOn: null,
    defaultCooldownH: 6,
  },
  {
    id: "flux",
    label: "Pollinations FLUX",
    engine: "pollinations",
    apiId: "flux",
    priceUsd: 0,
    batchPriceUsd: null,
    needsKey: false,
    free: "free · needs a token",
    allowance: "unlimited volume, 1 image every 5s with a free token",
    note: "Anonymous use is now blocked by a bot check. Get a free token at auth.pollinations.ai.",
    retiresOn: null,
    defaultCooldownH: 0,
  },
  {
    id: "turbo",
    label: "Pollinations Turbo",
    engine: "pollinations",
    apiId: "turbo",
    priceUsd: 0,
    batchPriceUsd: null,
    needsKey: false,
    free: "free · needs a token",
    allowance: "unlimited volume, 1 image every 5s with a free token",
    note: "Faster and rougher than FLUX. Same token.",
    retiresOn: null,
    defaultCooldownH: 0,
  },
  {
    id: "ovh-sdxl",
    label: "OVHcloud SDXL",
    engine: "ovh",
    apiId: "stable-diffusion-xl-base-v10",
    priceUsd: 0,
    batchPriceUsd: null,
    needsKey: false,
    free: "free · no key · 2 a minute",
    allowance: "no signup at all, paced to two pictures a minute",
    note: "Stable Diffusion XL hosted by OVHcloud. Always 1024×1024 and no seed, so aspect ratio and seed are ignored.",
    retiresOn: null,
    defaultCooldownH: 0,
  },
  {
    id: "dall-e-3",
    label: "DALL·E 3",
    engine: "openai",
    apiId: "dall-e-3",
    priceUsd: 0.04,
    batchPriceUsd: null,
    needsKey: true,
    free: "paid · ~$0.04/image",
    allowance: "no free tier",
    note: "OpenAI. Price varies with size and quality.",
    retiresOn: null,
    defaultCooldownH: 1,
  },
  {
    id: "gpt-image-1",
    label: "GPT Image 1",
    engine: "openai",
    apiId: "gpt-image-1",
    priceUsd: 0.04,
    batchPriceUsd: null,
    needsKey: true,
    free: "paid · ~$0.04/image",
    allowance: "no free tier",
    note: "OpenAI, or any endpoint that speaks the same language.",
    retiresOn: null,
    defaultCooldownH: 1,
  },
];

/**
 * How well each model writes readable words inside a picture, and what kind of
 * prompt it likes. Judged from Black Forest Labs / Google / Stability's own
 * material and from test runs on 2026-09-02.
 *
 *   textQuality  "good"  — you can ask for a shop sign and get real letters
 *                "fair"  — short words usually survive, sentences do not
 *                "poor"  — asking for words produces convincing gibberish
 *   promptStyle  what to feed it, used by the optional prompt rewriter
 */
export const MODEL_TRAITS = {
  "nano-banana-2": {
    textQuality: "good",
    promptStyle:
      "Natural, flowing English sentences. It follows long, specific instructions well, so describe the scene, the lighting, the camera angle and the mood in prose. Do not use comma-separated tag lists.",
  },
  "nano-banana-2-lite": {
    textQuality: "good",
    promptStyle:
      "Natural English sentences, but keep them tighter than for the full model. Lead with the subject, then the style, then the lighting.",
  },
  "nano-banana": { textQuality: "good", promptStyle: "Natural English sentences, subject first, then style and lighting." },
  "gemini-3-pro-image": {
    textQuality: "good",
    promptStyle:
      "Rich, detailed prose. It rewards art direction: name the lens, the light source, the material and the mood.",
  },
  "cloudflare-flux": {
    textQuality: "fair",
    promptStyle:
      "A single descriptive sentence, then a few style words. It runs in only four steps, so keep it short and concrete — long prompts get half-read.",
  },
  flux: {
    textQuality: "fair",
    promptStyle: "One clear descriptive sentence followed by style words. Avoid very long prompts.",
  },
  turbo: { textQuality: "poor", promptStyle: "Very short and concrete. Subject, style, lighting. Nothing more." },
  "ovh-sdxl": {
    textQuality: "poor",
    promptStyle:
      "Short and front-loaded: subject first, then style words, then lighting. SDXL reads roughly the first seventy-five tokens and drops the rest, so anything important must come early.",
  },
  "dall-e-3": {
    textQuality: "good",
    promptStyle: "Plain descriptive English. It rewrites your prompt itself, so state clearly what must not change.",
  },
  "gpt-image-1": { textQuality: "good", promptStyle: "Plain descriptive English, subject first." },
};

/** Words that talk a model out of scrawling fake writing on the picture. */
export const NO_TEXT_NEGATIVE =
  "text, letters, words, writing, captions, labels, signage lettering, watermark, signature, gibberish text";

/** How good the model behind this row is at writing readable words. */
export function textQualityFor(row, s) {
  const { def, engine } = resolveRoute(row, s);
  if (def) return MODEL_TRAITS[def.id]?.textQuality ?? "fair";
  // A model on your own machine — you tell us, because we cannot know.
  if (engine === "local") return s.localTextQuality || "poor";
  return "fair";
}

/** The prompt-shape advice for this row's model, or null when we have none. */
export function promptStyleFor(row, s) {
  const { def, engine } = resolveRoute(row, s);
  if (def) return MODEL_TRAITS[def.id]?.promptStyle ?? null;
  if (engine === "local")
    return (
      "A small model running on a home computer. Keep the prompt short, concrete and visual — " +
      "one sentence for the subject, then a few style words. It ignores long or abstract instructions."
    );
  return null;
}

/**
 * When the chosen model cannot write, add the no-text words to the row's
 * negatives so it stops trying. Returns a row — never mutates the original.
 */
export function suppressTextIfWeak(row, s) {
  if (!s.suppressTextOnWeakModels) return row;
  if (textQualityFor(row, s) === "good") return row;
  const existing = (row.negative_prompt || "").trim();
  if (existing.toLowerCase().includes("gibberish text")) return row;
  return { ...row, negative_prompt: existing ? `${existing}, ${NO_TEXT_NEGATIVE}` : NO_TEXT_NEGATIVE };
}

/** Models Google switched off. Kept so old manifests explain themselves. */
export const RETIRED_MODELS = {
  "imagen-4-ultra": { replacedBy: "nano-banana-2", retiredOn: "2026-08-17" },
  "imagen-4": { replacedBy: "nano-banana-2", retiredOn: "2026-08-17" },
  "imagen-4-fast": { replacedBy: "nano-banana-2-lite", retiredOn: "2026-08-17" },
  "gemini-flash-image": { replacedBy: "nano-banana", retiredOn: "2026-08-17" },
};

export const findModel = (id) => MODELS.find((m) => m.id === id);

/** What one image costs on this model, honouring batch pricing. 0 for free engines. */
export function priceFor(modelId, { batch = false } = {}) {
  const m = findModel(modelId);
  if (!m) return null;
  if (batch && typeof m.batchPriceUsd === "number") return m.batchPriceUsd;
  return m.priceUsd;
}

/** Total cost of a set of rows, plus how many rows we could not price. */
export function estimateCost(rows, settings, { batch = false } = {}) {
  let total = 0;
  let unknown = 0;
  for (const row of rows) {
    const { def, engine } = resolveRoute(row, settings);
    // A model running on your own machine costs nothing, whatever it is called.
    if (!def && FREE_ENGINES.has(engine)) continue;
    const p = def ? priceFor(def.id, { batch }) : null;
    if (p === null) unknown++;
    else total += p;
  }
  return { total, unknown, count: rows.length };
}

export const formatUsd = (n) => {
  if (n === 0) return "free";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
};

export class RateLimitError extends Error {
  constructor(message, retryAt, keyLabel) {
    super(message);
    this.name = "RateLimitError";
    this.retryAt = retryAt;
    this.keyLabel = keyLabel;
  }
}

/** Thrown when a model no longer exists at the provider. Never worth retrying. */
export class RetiredModelError extends Error {
  constructor(modelId, info) {
    super(
      `"${modelId}" was switched off by the provider on ${info.retiredOn}. ` +
        `Change these rows to "${info.replacedBy}".`
    );
    this.name = "RetiredModelError";
    this.modelId = modelId;
    this.replacedBy = info.replacedBy;
  }
}

/** Engines that cost nothing, whoever the model turns out to be. */
const FREE_ENGINES = new Set(["local", "simulated", "cloudflare", "pollinations", "ovh"]);

/** Which engine + API model id a row should be struck with. */
/**
 * An engine the user has switched off in Settings.
 *
 * Not the same as broken. A provider can be down, or expensive, or having a
 * bad month, and you want the app to stop reaching for it without deleting
 * your keys and losing the setup. A paused engine fails immediately with a
 * sentence saying so, rather than spending thirty seconds proving it again.
 */
export class PausedEngineError extends Error {
  constructor(engine) {
    super(`${engine} is paused in Settings — switch it back on there, or pick another engine.`);
    this.name = "PausedEngineError";
    this.engine = engine;
  }
}

/** Engine ids are code; these are what a person calls them. */
export const PROVIDER_LABELS = {
  gemini: "Google",
  cloudflare: "Cloudflare",
  pollinations: "Pollinations",
  ovh: "OVHcloud",
  openai: "The OpenAI-compatible endpoint",
  local: "Your own machine",
};

const isPaused = (engine, s) => Array.isArray(s?.pausedEngines) && s.pausedEngines.includes(engine);

export function resolveRoute(row, s) {
  const route = resolveRouteIgnoringPauses(row, s);
  return isPaused(route.engine, s) ? { ...route, engine: "paused", pausedEngine: route.engine } : route;
}

function resolveRouteIgnoringPauses(row, s) {
  const wanted = (row.model || "").trim();
  if (wanted) {
    const def = findModel(wanted);
    if (def) return { engine: def.engine, apiModel: def.apiId, def };
    if (RETIRED_MODELS[wanted]) return { engine: "retired", apiModel: wanted, def: undefined };
    return { engine: s.provider, apiModel: wanted };
  }
  if (s.provider === "local") {
    return { engine: "local", apiModel: s.localModel || "flux.2-klein-4b" };
  }
  if (s.provider === "gemini") {
    const def = findModel(s.geminiModel || "nano-banana-2") || findModel("nano-banana-2");
    return { engine: "gemini", apiModel: def.apiId, def };
  }
  if (s.provider === "cloudflare") {
    const def = findModel("cloudflare-flux");
    return { engine: "cloudflare", apiModel: def.apiId, def };
  }
  if (s.provider === "ovh") {
    const def = findModel("ovh-sdxl");
    return { engine: "ovh", apiModel: def.apiId, def };
  }
  if (s.provider === "pollinations") {
    const def = findModel(s.pollinationsModel) || findModel("flux");
    return { engine: "pollinations", apiModel: def.apiId, def };
  }
  if (s.provider === "openai") {
    const def = findModel(s.openaiModel);
    return { engine: "openai", apiModel: s.openaiModel || "gpt-image-1", def };
  }
  return { engine: "simulated", apiModel: "forge" };
}

/* ---------------- plumbing ---------------- */

function fetchWithTimeout(url, init, ms, outer) {
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

/* ---------------- what a file really is ---------------- */

/**
 * The extensions a forged file may legitimately carry.
 *
 * There is no single right one. Cloudflare returns JPEG, Google's image API
 * refuses to return anything except JPEG, OVHcloud and most local servers
 * return PNG, vectors are .svg and Lottie is .json. A name is correct when it
 * matches its own bytes, not when it matches a house rule.
 *
 * This lives here, not in validate.ts, because the MCP server writes files
 * too and cannot import TypeScript. One copy means the app and an agent can
 * never disagree about what a JPEG is called.
 */
export const KNOWN_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".json"];

const MIME_EXTENSION = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/svg+xml": ".svg",
  "application/json": ".json",
};

/** The extension a MIME type deserves, or "" when we do not recognise it. */
export const extensionForMime = (mime) =>
  MIME_EXTENSION[String(mime || "").split(";")[0].trim().toLowerCase()] ?? "";

/** The extension a name currently carries, lowercased, or "". */
export const extensionOf = (name) => {
  const lower = String(name || "").toLowerCase();
  return KNOWN_EXTENSIONS.find((e) => lower.endsWith(e)) ?? "";
};

/**
 * The same name, wearing the extension its bytes actually earned.
 *
 * Unchanged when already right, when the type is unrecognised, or when the
 * only difference is jpg versus jpeg. The stem never changes, so a row keeps
 * its identity.
 */
export function nameForMime(name, mime) {
  const want = extensionForMime(mime);
  if (!want) return name;
  const have = extensionOf(name);
  if (!have) return name + want;
  if (have === want) return name;
  if ((have === ".jpg" || have === ".jpeg") && want === ".jpg") return name;
  return name.slice(0, -have.length) + want;
}

/**
 * What the bytes say they are, whatever the server's header claimed.
 *
 * Headers are a claim; the first bytes of a file are not. Two paths in this
 * app used to write "image/png" by hand — the local engine for every base64
 * reply, and Google's half-price batch collector — while the bytes were JPEG.
 * The signatures below are the file formats' own definitions.
 */
export function mimeFromBytes(bytes) {
  const b = bytes;
  if (!b || b.length < 12) return "";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50)
    return "image/webp";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return "image/gif";
  return "";
}

/**
 * Where a style's words go in the prompt, per engine.
 *
 * Normally at the end: the subject leads, the look follows. But SDXL — the
 * OVHcloud engine — reads only about the first 77 tokens of a prompt (the
 * limit of its CLIP text encoder) and drops the rest silently. Found on a real
 * request, 25 September 2026: a long mouth-shape-grid prompt came back with no
 * trace of the clay look it asked for, because the look was past the cut. On
 * that engine the look goes first.
 */
const READS_ONLY_THE_FRONT = new Set(["ovh"]);
export function withStyleBlock(prompt, block, engine) {
  const p = String(prompt || "").trim();
  const b = String(block || "").trim();
  if (!b || p.includes(b)) return p;
  return READS_ONLY_THE_FRONT.has(engine) ? `${b}, ${p}` : `${p}, ${b}`;
}

/** Add a suffix before the extension: image_a.jpg + "_copy" → image_a_copy.jpg */
export function withSuffix(name, suffix) {
  const ext = extensionOf(name);
  const stem = ext ? name.slice(0, -ext.length) : name;
  return stem + suffix + ext;
}

/**
 * A name nothing in `taken` uses, adding _2, _3… before the extension.
 *
 * The code this replaces only understood ".png", so a duplicate "a.jpg"
 * became "a.jpg_2.png" — a picture with two extensions and the wrong one last.
 */
export function uniqueName(name, taken) {
  if (!taken.has(name)) return name;
  let n = 2;
  while (taken.has(withSuffix(name, `_${n}`))) n++;
  return withSuffix(name, `_${n}`);
}

export const b64ToBytes = (b64) => {
  const clean = String(b64).replace(/^data:[^,]*,/, "");
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(clean, "base64"));
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const healthyKeys = (pool) => (pool || []).filter((k) => k.key.trim() && k.exhaustedUntil <= Date.now());

/** true when this code is running inside a web page rather than in Node */
export const inBrowser = () => typeof window !== "undefined" && typeof document !== "undefined";

/**
 * Where to send Cloudflare requests.
 *
 * Cloudflare's API sends no CORS headers, so a browser blocks the call before
 * it leaves the page — verified 2026-09-02, even with no auth header at all.
 * In a page we therefore go through the app's own /cf-api proxy; in Node, where
 * that rule does not exist, we call Cloudflare directly.
 */
export const CLOUDFLARE_BASE = "https://api.cloudflare.com";
export const cloudflareUrl = (path) =>
  inBrowser() ? `/cf-api${path}` : `${CLOUDFLARE_BASE}${path}`;

const dimsFor = (aspect) => DIMS[aspect] || DIMS["1:1"];

/** Turns a provider's raw complaint into something a human can act on. */
export function explainFailure(status, body, engine) {
  const text = String(body || "").slice(0, 300);
  // Google reports "no credit" as a 429, which normally means "wait and retry".
  // Here waiting never helps, so say so — verified against a live free key on
  // 2026-09-02: image generation needs prepaid credit, there is no free tier.
  if (/prepayment credits are depleted|billing/i.test(text) && engine === "gemini") {
    return (
      "This Google key has no image credit. Google's image models are not free — " +
      "add prepaid credit at ai.studio, or use Cloudflare or your own machine instead."
    );
  }
  if (status === 401 || status === 403) {
    if (/turnstile/i.test(text)) return "Pollinations now requires a token — add a free one in Settings → Engines.";
    if (engine === "gemini") return "Google refused the key. Check it is correct and that billing is switched on.";
    if (engine === "cloudflare") return "Cloudflare refused the token. Check the token has Workers AI permission.";
    return "The key was refused. Check it is correct and still active.";
  }
  if (status === 429) return "You have hit today's limit on this key. The forge will rest it and try the next one.";
  if (status === 404) return "That model no longer exists at the provider. Pick a different one.";
  if (status === 400 && /billing|quota/i.test(text)) return "Billing is not set up on this account yet.";
  if (status >= 500) return "The provider is having a bad moment. Try again shortly.";
  return text || `the provider returned ${status}`;
}

/* ---------------- engines ---------------- */

/*
 * OVHcloud's hosted SDXL. No key, no signup — confirmed 11 September 2026.
 *
 * The catch is the pace: anonymous callers get two pictures a minute, stated in
 * the X-RateLimit-Limit-Minute header. Left to the normal rate-limit path, a 429
 * would park the row for hours as if a daily quota had run out, which is wrong
 * for a limit that clears in seconds. So the engine keeps its own pace: calls
 * are queued one behind another, thirty-one seconds apart, however many lanes
 * the queue is running. A 429 that still slips through is waited out for as
 * long as the RateLimit-Reset header says, and tried again.
 *
 * It takes only a prompt and a negative prompt: no size, no seed. Every picture
 * is 1024x1024, and the same prompt twice gives two different pictures.
 */
export const OVH_URL = "https://stable-diffusion-xl.endpoints.kepler.ai.cloud.ovh.net/api/text2image";
const OVH_GAP_MS = 31_000;
let ovhNextSlot = 0;
let ovhChain = Promise.resolve();

const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("halted"));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new Error("halted"));
      },
      { once: true }
    );
  });

/** Wait for this caller's turn. Serialised, so parallel lanes cannot bunch up. */
function ovhTurn(signal) {
  const turn = ovhChain.then(async () => {
    const wait = ovhNextSlot - Date.now();
    if (wait > 0) await sleep(wait, signal);
    ovhNextSlot = Date.now() + OVH_GAP_MS;
  });
  ovhChain = turn.catch(() => {});
  return turn;
}

async function ovh(row, s, signal) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await ovhTurn(signal);
    const res = await fetchWithTimeout(
      OVH_URL,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/octet-stream" },
        body: JSON.stringify({ prompt: row.prompt, negative_prompt: row.negative_prompt || "" }),
      },
      180000,
      signal
    );
    if (res.status === 429) {
      const reset = Number(res.headers.get("RateLimit-Reset")) || 30;
      ovhNextSlot = Date.now() + (reset + 1) * 1000;
      continue;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(explainFailure(res.status, body, "ovh"));
    }
    const mime = res.headers.get("content-type") || "";
    if (!mime.startsWith("image")) throw new Error("OVHcloud sent something that was not an image.");
    return { bytes: new Uint8Array(await res.arrayBuffer()), mime };
  }
  throw new RateLimitError("OVHcloud is still busy after three tries — it allows two pictures a minute.", Date.now() + 60e3, "ovh");
}

async function pollinations(row, apiModel, s, signal) {
  const { w, h } = dimsFor(row.aspect_ratio);
  const token = (s.pollinationsToken || "").trim();
  const url =
    `https://image.pollinations.ai/prompt/${encodeURIComponent(row.prompt)}` +
    `?width=${w}&height=${h}&seed=${row.seed || 1}&model=${encodeURIComponent(apiModel)}&nologo=true&safe=true` +
    (row.negative_prompt ? `&negative=${encodeURIComponent(row.negative_prompt)}` : "") +
    (s.pollinationsReferrer ? `&referrer=${encodeURIComponent(s.pollinationsReferrer)}` : "");
  const res = await fetchWithTimeout(
    url,
    { method: "GET", headers: token ? { Authorization: `Bearer ${token}` } : {} },
    240000,
    signal
  );
  if (res.status === 429) throw new RateLimitError("Pollinations is throttling you — it allows one image every few seconds.", Date.now() + 60e3, "pollinations");
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(explainFailure(res.status, body, "pollinations"));
  }
  const mime = res.headers.get("content-type") || "";
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!mime.startsWith("image")) throw new Error("Pollinations sent something that was not an image.");
  return { bytes, mime };
}

/** Aspect ratios the Gemini Interactions API accepts. */
const GEMINI_ASPECTS = ["1:1", "3:2", "2:3", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"];

/** Pulls the base64 image out of an Interactions response, whichever shape it arrives in. */
export function readGeminiImage(json) {
  const direct = json?.output_image?.data ?? json?.outputImage?.data;
  if (direct) return direct;
  for (const step of json?.steps ?? []) {
    for (const block of step?.content ?? []) {
      if (block?.type === "image" && block?.data) return block.data;
    }
  }
  // generateContent shape, still used by batch jobs
  for (const cand of json?.candidates ?? []) {
    for (const part of cand?.content?.parts ?? []) {
      const d = part?.inlineData?.data ?? part?.inline_data?.data;
      if (d) return d;
    }
  }
  return null;
}

/** Body for one Gemini image request — shared by the live call and batch jobs. */
export function geminiRequestBody(row, apiModel, { imageSize = "1K" } = {}) {
  const aspect = GEMINI_ASPECTS.includes(row.aspect_ratio) ? row.aspect_ratio : "1:1";
  const prompt = row.negative_prompt
    ? `${row.prompt}\n\nAvoid: ${row.negative_prompt}`
    : row.prompt;
  return {
    model: apiModel,
    input: [{ type: "text", text: prompt }],
    // JPEG, not PNG. Google's own examples show "image/png", but the
    // Interactions API rejects it: "The value 'image/png' is not supported for
    // 'response_format.mime_type'. Supported values: 'image/jpeg'." Confirmed
    // against a live account on 2026-09-02.
    response_format: { type: "image", mime_type: "image/jpeg", aspect_ratio: aspect, image_size: imageSize },
  };
}

async function gemini(row, apiModel, s, signal, exhaust, cooldownMs, refImages) {
  // Free keys first, always. A paid key is only reached once every free one is
  // resting, so a free allowance is never left unused while money is spent.
  const freeHealthy = healthyKeys(s.geminiKeys).map((k) => ({ ...k, pool: "geminiKeys" }));
  const paidHealthy = healthyKeys(s.geminiPaidKeys).map((k) => ({ ...k, pool: "geminiPaidKeys" }));
  const healthy = [...freeHealthy, ...paidHealthy];

  if (healthy.length === 0) {
    const withKey = [...(s.geminiKeys || []), ...(s.geminiPaidKeys || [])].filter((k) => k.key.trim());
    if (!withKey.length) throw new Error("No Google key yet — add one in Settings → Engines.");
    const earliest = Math.min(...withKey.map((k) => k.exhaustedUntil || Date.now()));
    throw new RateLimitError("Every Google key is resting.", Math.max(earliest, Date.now() + cooldownMs), "all");
  }
  const body = geminiRequestBody(row, apiModel, { imageSize: s.geminiImageSize || "1K", refImages: refImages ?? [] });
  let lastErr = null;
  for (const k of healthy) {
    try {
      const res = await fetchWithTimeout(
        "https://generativelanguage.googleapis.com/v1beta/interactions",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": k.key.trim() },
          body: JSON.stringify(body),
        },
        180000,
        signal
      );
      if (res.status === 429) {
        const text = await res.text().catch(() => "");
        exhaust(k.pool, k.id, Date.now() + cooldownMs);
        // "No credit" also arrives as a 429, but no amount of waiting fixes it.
        const noCredit = /prepayment credits are depleted|billing/i.test(text);
        lastErr = noCredit
          ? new Error(explainFailure(429, text, "gemini"))
          : new RateLimitError(`${k.label} hit its limit — trying the next key.`, Date.now() + cooldownMs, k.label);
        continue;
      }
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        if (res.status === 403 || res.status === 401) {
          exhaust(k.pool, k.id, Date.now() + cooldownMs);
          lastErr = new Error(explainFailure(res.status, text, "gemini"));
          continue;
        }
        throw new Error(explainFailure(res.status, text, "gemini"));
      }
      const json = await res.json();
      const b64 = readGeminiImage(json);
      if (!b64) throw new Error("Google replied without an image. The prompt may have been blocked.");
      return { bytes: b64ToBytes(b64), mime: "image/jpeg" };
    } catch (e) {
      if (e instanceof RateLimitError) {
        lastErr = e;
        continue;
      }
      throw e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Every Google key failed.");
}

async function cloudflare(row, apiModel, s, signal, exhaust, cooldownMs) {
  const cf = s.cloudflare || {};
  const account = (cf.accountId || "").trim();
  const token = (cf.token || "").trim();
  if (!account || !token) {
    throw new Error("Cloudflare needs an account id and a token — add both in Settings → Engines.");
  }
  const res = await fetchWithTimeout(
    cloudflareUrl(`/client/v4/accounts/${encodeURIComponent(account)}/ai/run/${apiModel}`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        prompt: String(row.prompt).slice(0, 2048),
        steps: Math.min(Math.max(Number(s.cloudflareSteps) || 4, 1), 8),
        // No seed. Cloudflare's own model page lists one, but flux-1-schnell
        // rejects the whole request with "Additional or unevaluated properties
        // '/seed' at '/' not allowed" — confirmed against a live account on
        // 2026-09-02. Sending it makes every Cloudflare picture fail.
      }),
    },
    180000,
    signal
  );
  if (res.status === 429) {
    throw new RateLimitError(
      "Cloudflare's free daily allowance is used up. It resets at midnight UTC.",
      Date.now() + cooldownMs,
      "cloudflare"
    );
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(explainFailure(res.status, text, "cloudflare"));
  }
  const json = await res.json();
  const b64 = json?.result?.image ?? json?.image;
  if (!b64) {
    const why = json?.errors?.[0]?.message || "Cloudflare replied without an image.";
    throw new Error(why);
  }
  return { bytes: b64ToBytes(b64), mime: "image/jpeg" };
}

/**
 * A model running on your own machine — LocalAI, ComfyUI's API, Ollama, LM
 * Studio, an SD WebUI. They all speak the OpenAI image dialect, and none of
 * them wants a key, so this is the OpenAI path with the key made optional and
 * a much longer patience (a laptop GPU takes 20s–5min per picture).
 */
async function local(row, apiModel, s, signal, refImages) {
  const base = (s.localBase || "http://localhost:8080/v1").replace(/\/+$/, "");
  const { w, h } = dimsFor(row.aspect_ratio);
  const prompt = row.negative_prompt ? `${row.prompt}\n\nAvoid: ${row.negative_prompt}` : row.prompt;
  let res;
  try {
    res = await fetchWithTimeout(
      `${base}/images/generations`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(s.localKey?.trim() ? { Authorization: `Bearer ${s.localKey.trim()}` } : {}),
        },
        body: JSON.stringify({
          model: apiModel,
          prompt,
          size: `${w}x${h}`,
          response_format: "b64_json",
          ...(row.seed ? { seed: row.seed } : {}),
          // Hand the model a picture to work from. Verified against LocalAI with
          // flux.2-klein-4b: the same scene comes back with only the asked-for
          // change, which is what makes a consistent sprite sheet possible.
          ...(refImages?.length ? { ref_images: refImages } : {}),
        }),
      },
      900000, // local GPUs are slow — fifteen minutes before we give up
      signal
    );
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new Error(
      `Could not reach your local server at ${base}. Is it running? ` +
        `(LocalAI, ComfyUI, LM Studio — whichever you use.)`
    );
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(explainFailure(res.status, text, "local"));
  }
  const json = await res.json();
  const first = json.data?.[0];
  if (first?.b64_json) return { bytes: b64ToBytes(first.b64_json), mime: "image/png" };
  if (first?.url) {
    const abs = first.url.startsWith("http") ? first.url : `${base.replace(/\/v1$/, "")}${first.url}`;
    const img = await fetchWithTimeout(abs, {}, 300000, signal);
    if (!img.ok) throw new Error("The picture was made but could not be downloaded from your local server.");
    return { bytes: new Uint8Array(await img.arrayBuffer()), mime: img.headers.get("content-type") || "image/png" };
  }
  throw new Error(`Your local server replied without a picture. Is "${apiModel}" the right model name?`);
}

async function openaiCompat(row, apiModel, s, signal, exhaust, cooldownMs) {
  const pool = s.openaiKeys;
  const healthy = healthyKeys(pool);
  if (healthy.length === 0) {
    const withKey = (pool || []).filter((k) => k.key.trim());
    if (!withKey.length) throw new Error("No key for this endpoint yet — add one in Settings → Engines.");
    const earliest = Math.min(...withKey.map((k) => k.exhaustedUntil || Date.now()));
    throw new RateLimitError("Every endpoint key is resting.", Math.max(earliest, Date.now() + cooldownMs), "all");
  }
  const base = (s.openaiBase || "https://api.openai.com/v1").replace(/\/+$/, "");
  const { w, h } = dimsFor(row.aspect_ratio);
  const size = w === h ? `${w}x${h}` : w > h ? "1536x1024" : "1024x1536";
  let lastErr = null;
  for (const k of healthy) {
    try {
      const res = await fetchWithTimeout(
        `${base}/images/generations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${k.key.trim()}` },
          body: JSON.stringify({ model: apiModel, prompt: row.prompt, size, response_format: "b64_json" }),
        },
        180000,
        signal
      );
      if (res.status === 429 || res.status === 401) {
        exhaust("openaiKeys", k.id, Date.now() + cooldownMs);
        lastErr = new RateLimitError(`${k.label} hit its limit — trying the next key.`, Date.now() + cooldownMs, k.label);
        continue;
      }
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(explainFailure(res.status, text, "openai"));
      }
      const json = await res.json();
      const first = json.data?.[0];
      if (first?.b64_json) return { bytes: b64ToBytes(first.b64_json), mime: "image/png" };
      if (first?.url) {
        const img = await fetchWithTimeout(first.url, {}, 120000, signal);
        if (!img.ok) throw new Error("Could not download the finished image.");
        return { bytes: new Uint8Array(await img.arrayBuffer()), mime: img.headers.get("content-type") || "image/png" };
      }
      throw new Error("The endpoint replied without an image.");
    } catch (e) {
      if (e instanceof RateLimitError) {
        lastErr = e;
        continue;
      }
      throw e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Every endpoint key failed.");
}

/** Real generation against the routed engine, with key rotation on rate limits. */
async function generateBytesRaw(rawRow, s, signal, exhaust, cooldownMs, opts = {}) {
  const { engine, apiModel, pausedEngine } = resolveRoute(rawRow, s);
  if (engine === "retired") throw new RetiredModelError(apiModel, RETIRED_MODELS[apiModel]);
  if (engine === "paused") throw new PausedEngineError(PROVIDER_LABELS[pausedEngine] ?? pausedEngine ?? "That engine");
  // Models that cannot write get told not to try.
  const row = suppressTextIfWeak(rawRow, s);
  const refImages = opts.refImages ?? [];
  if (refImages.length && !["local", "gemini"].includes(engine)) {
    throw new Error(
      "Working from a reference picture needs either your own machine or a Google model. " +
        "Cloudflare and Pollinations cannot do it."
    );
  }
  if (engine === "local") return local(row, apiModel, s, signal, refImages);
  if (engine === "pollinations") return pollinations(row, apiModel, s, signal);
  if (engine === "ovh") return ovh(row, s, signal);
  if (engine === "gemini") return gemini(row, apiModel, s, signal, exhaust, cooldownMs, refImages);
  if (engine === "cloudflare") return cloudflare(row, apiModel, s, signal, exhaust, cooldownMs);
  if (engine === "openai") return openaiCompat(row, apiModel, s, signal, exhaust, cooldownMs);
  throw new Error("The practice forge draws its own pictures — it never goes online.");
}

/**
 * Real generation — and the type is read from the bytes, not trusted from
 * the engine. Every caller (the app, the batch collector, the MCP server)
 * names files from this, so correcting it here corrects it everywhere.
 */
export async function generateBytes(rawRow, s, signal, exhaust, cooldownMs, opts = {}) {
  const out = await generateBytesRaw(rawRow, s, signal, exhaust, cooldownMs, opts);
  const sniffed = mimeFromBytes(out?.bytes);
  return sniffed && sniffed !== out.mime ? { ...out, mime: sniffed } : out;
}
