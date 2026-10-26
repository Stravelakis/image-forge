#!/usr/bin/env node
/**
 * Image Forge — MCP server (the "API" for Claude Code, Hermes, LangChain, n8n…).
 *
 *   node scripts/mcp-server.js
 *   node scripts/mcp-server.js --csv ./marketplace-images.csv --out ./generated-images \
 *                              --settings ./image-forge-backup-2026-09-01.json
 *
 * Speaks MCP over stdio. It drives the SAME marketplace-images.csv manifest the
 * web app uses, and generates through the SAME engines (src/lib/engines.mjs), so
 * an agent gets OVHcloud SDXL free with no key at all, and Cloudflare,
 * Pollinations, Google or any OpenAI-compatible endpoint as soon as keys are
 * supplied. So an agent can:
 *   · read the manifest           (forge_list / forge_status)
 *   · add new picture ideas       (forge_add_row)
 *   · generate the pending ones   (forge_generate_pending) → real PNGs on disk
 *   · retry failures              (forge_retry_failed)
 *
 * Keys come from --settings (a backup JSON exported from Settings → Advanced, or
 * a bare settings object) and/or the environment:
 *   GEMINI_API_KEY / GEMINI_API_KEYS (comma-separated)
 *   OPENAI_API_KEY / OPENAI_API_KEYS, OPENAI_BASE_URL, OPENAI_IMAGE_MODEL
 *   CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN, POLLINATIONS_TOKEN
 *   FORGE_PROVIDER (ovh | cloudflare | pollinations | gemini | openai | local)
 *   FORGE_ALLOW_PAID=1  let rows run on paid engines (default: refused)
 *   FORGE_MAX_USD       the most this server may spend in total (default 1 once paid is allowed)
 * With no keys at all the server uses OVHcloud SDXL, which needs none.
 *
 * Images land in images/ vectors/ lottie/ sheets/ gifs/ under --out
 * (default: ./generated-images), the same folders the app uses.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import fs from "node:fs";
import { nameForMime } from "../src/lib/engines.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  MODELS,
  RETIRED_MODELS,
  findModel,
  resolveRoute,
  generateBytes,
  estimateCost,
  formatUsd,
  rowSpend,
  RateLimitError,
  RetiredModelError,
} from "../src/lib/engines.mjs";

/* ---------------- config ---------------- */

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const CSV_PATH = path.resolve(flag("--csv", "marketplace-images.csv"));
const OUT_DIR = path.resolve(flag("--out", "generated-images"));
const SETTINGS_PATH = flag("--settings", "");

/**
 * Money. There is no human here to click "yes", so paid engines are OFF unless
 * the operator turned them on in the environment that starts this server:
 *   FORGE_ALLOW_PAID=1   let rows run on paid engines (default: refuse them)
 *   FORGE_MAX_USD=2.5    the most this server process may spend in total
 *                        (default 1 once paid is allowed; priced rows only)
 * A row whose price is unknown is treated as paid, never as free.
 */
const ALLOW_PAID = /^(1|true|yes)$/i.test(String(process.env.FORGE_ALLOW_PAID || "").trim());
const MAX_USD = (() => {
  const n = Number(process.env.FORGE_MAX_USD);
  return Number.isFinite(n) && n >= 0 && String(process.env.FORGE_MAX_USD).trim() !== "" ? n : 1;
})();
let spentUsd = 0;
const spentSoFar = () => spentUsd;

/** Raised when a row is not allowed to spend. The row stays as it was. */
class PaidRefusal extends Error {
  constructor(message, { stopRun = false } = {}) {
    super(message);
    this.name = "PaidRefusal";
    this.stopRun = stopRun;
  }
}

/**
 * Count one picture against the limit, or refuse it. Free engines pass.
 * Counted before the request goes out, because a request that fails half way
 * can still be billed.
 */
function chargeOrRefuse(row, settings = SETTINGS) {
  const s = rowSpend({ model: (row.model || "").trim() }, settings);
  if (!s.paid) return;
  if (s.banned) throw new PaidRefusal("refused: Pro image models are switched off in this forge.");
  if (!ALLOW_PAID) {
    throw new PaidRefusal(
      `refused: ${row.filename} would run on a paid engine (${s.engine}) and FORGE_ALLOW_PAID is not set. ` +
        "Use a free engine, or ask the operator to start the server with FORGE_ALLOW_PAID=1 and a FORGE_MAX_USD limit."
    );
  }
  if (s.price === null) {
    throw new PaidRefusal(`refused: the price of ${row.filename}'s model is unknown, so it cannot be kept under FORGE_MAX_USD.`);
  }
  if (spentUsd + s.price > MAX_USD + 1e-9) {
    throw new PaidRefusal(
      `refused: ${row.filename} would take this server past FORGE_MAX_USD (${formatUsd(MAX_USD)}; ${formatUsd(spentUsd)} spent so far).`,
      { stopRun: true }
    );
  }
  spentUsd += s.price;
}

const COLUMNS = [
  "id", "filename", "prompt", "negative_prompt", "category", "style",
  "aspect_ratio", "seed", "model", "status", "error", "generated_at",
];
/**
 * The same folders the app writes to (CATEGORY_META in src/types.ts).
 *
 * This was still shop/item/event/npc after the app moved to categories that
 * describe what a row makes, so every "image" row from an agent landed in a
 * folder called items/ that the app never uses. Old category names are still
 * accepted and count as images, exactly as the app reads them.
 */
const FOLDERS = {
  image: "images",
  svg: "vectors",
  lottie: "lottie",
  sheet: "sheets",
  gif: "gifs",
  shop: "images",
  item: "images",
  event: "images",
  npc: "images",
};
const ASPECTS = ["16:9", "1:1", "9:16", "4:3"];
const CATEGORIES = ["image", "svg", "lottie", "sheet", "gif", "shop", "item", "event", "npc"];

/** Where a row's file goes. Unknown categories are pictures. */
function folderFor(category) {
  return FOLDERS[String(category || "").toLowerCase()] || "images";
}
/** Seeds are passed straight to the engines; keep the space wide so batches don't collide. */
const SEED_MAX = 2147483647;
const MODEL_IDS = MODELS.map((m) => m.id);

/* ---------------- settings (keys, provider, cooldowns) ---------------- */

const LS_SETTINGS = "image-forge-settings-v1";

/**
 * Read any of the files the app can give you.
 *
 *   · Settings → Back up to a file   { kind: "image-forge-settings", settings }
 *   · Settings → Advanced → Backup   { "image-forge-settings-v1": {...}, ... }
 *   · a bare settings object
 *
 * The first did not exist when this was written, so pointing --settings at it
 * silently gave the agent no keys at all.
 */
function unwrapSettingsFile(parsed) {
  if (!parsed || typeof parsed !== "object") return {};
  if (parsed.kind === "image-forge-settings" && parsed.settings && typeof parsed.settings === "object") {
    return parsed.settings;
  }
  return parsed[LS_SETTINGS] ?? parsed;
}

/**
 * Which engine an agent gets when a row does not name one.
 *
 * Forced by FORGE_PROVIDER first, then whatever the backup had selected, then
 * the first engine that is actually set up, cheapest-and-free first — and
 * finally OVHcloud, because it needs nothing.
 *
 * That last step used to be Pollinations. Pollinations stopped serving
 * anonymous requests, so an agent with no keys was handed an engine that
 * refused every single picture. STANDARDS #4: a keyless fallback must work.
 */
function pickProvider({ forced, saved, cloudflare, pollinationsToken, geminiKeys, openaiKeys }) {
  if (forced) return forced;
  if (saved && saved !== "simulated") return saved;
  if (cloudflare?.accountId && cloudflare?.token) return "cloudflare";
  if (pollinationsToken) return "pollinations";
  if (geminiKeys?.length) return "gemini";
  if (openaiKeys?.length) return "openai";
  return "ovh";
}

const asKeys = (raw) =>
  String(raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((key, i) => ({ id: `env-${i + 1}`, label: `env-${i + 1}`, key, exhaustedUntil: 0 }));

function loadSettings() {
  /** @type {any} */
  let file = {};
  if (SETTINGS_PATH) {
    try {
      const parsed = JSON.parse(fs.readFileSync(path.resolve(SETTINGS_PATH), "utf8"));
      // accept either a full app backup or a bare settings object
      file = unwrapSettingsFile(parsed);
    } catch (e) {
      process.stderr.write(`[image-forge] could not read --settings: ${e.message || e}\n`);
    }
  }
  const envGemini = asKeys(process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY);
  const envOpenai = asKeys(process.env.OPENAI_API_KEYS || process.env.OPENAI_API_KEY);
  const geminiKeys = [...(Array.isArray(file.geminiKeys) ? file.geminiKeys : []), ...envGemini].filter(
    (k) => k && typeof k.key === "string" && k.key.trim()
  );
  const openaiKeys = [...(Array.isArray(file.openaiKeys) ? file.openaiKeys : []), ...envOpenai].filter(
    (k) => k && typeof k.key === "string" && k.key.trim()
  );
  const cloudflare = {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID || file.cloudflare?.accountId || "",
    token: process.env.CLOUDFLARE_API_TOKEN || file.cloudflare?.token || "",
  };
  const pollinationsToken = process.env.POLLINATIONS_TOKEN || file.pollinationsToken || "";

  // Pick whatever is actually usable, cheapest-and-free first. "imagen" in an
  // old backup means Google, whose endpoints changed when Imagen was retired.
  const saved = file.provider === "imagen" ? "gemini" : file.provider;
  const provider = pickProvider({
    forced: process.env.FORGE_PROVIDER,
    saved,
    cloudflare,
    pollinationsToken,
    geminiKeys,
    openaiKeys,
  });

  return {
    provider,
    pollinationsModel: file.pollinationsModel || "flux",
    pollinationsToken,
    pollinationsReferrer: file.pollinationsReferrer || "image-forge",
    geminiKeys: geminiKeys.map((k) => ({ exhaustedUntil: 0, ...k })),
    geminiModel: process.env.GEMINI_IMAGE_MODEL || file.geminiModel || "nano-banana-2",
    geminiImageSize: file.geminiImageSize || "1K",
    cloudflare,
    cloudflareSteps: Number(file.cloudflareSteps) || 4,
    openaiKeys: openaiKeys.map((k) => ({ exhaustedUntil: 0, ...k })),
    openaiBase: process.env.OPENAI_BASE_URL || file.openaiBase || "https://api.openai.com/v1",
    openaiModel: process.env.OPENAI_IMAGE_MODEL || file.openaiModel || "gpt-image-1",
    localBase: process.env.FORGE_LOCAL_BASE || file.localBase || "http://localhost:8080/v1",
    localModel: process.env.FORGE_LOCAL_MODEL || file.localModel || "flux.2-klein-4b",
    localKey: process.env.FORGE_LOCAL_KEY || file.localKey || "",
    localTextQuality: file.localTextQuality || "poor",
    // Same default as the app: models that cannot spell are told not to try,
    // otherwise an agent quietly produces pictures covered in gibberish.
    suppressTextOnWeakModels: file.suppressTextOnWeakModels !== false,
    cooldowns: file.cooldowns && typeof file.cooldowns === "object" ? file.cooldowns : {},
  };
}

const SETTINGS = loadSettings();

/** Benching a key is per-process: the app owns the persisted cooldowns. */
const exhaust = (poolName, keyId, untilMs) => {
  const k = SETTINGS[poolName].find((x) => x.id === keyId);
  if (k) k.exhaustedUntil = untilMs;
};

const cooldownMsFor = (row) => {
  // The model this row will really use. This looked up the Pollinations model
  // whenever a row named none, whatever engine was actually selected.
  const def = resolveRoute({ model: (row.model || "").trim() }, SETTINGS).def;
  const id = def?.id;
  const custom = id ? SETTINGS.cooldowns[id] : undefined;
  const hours = typeof custom === "number" && custom >= 0 ? custom : def?.defaultCooldownH ?? 1;
  return hours * 3600e3;
};

/* ---------------- tiny CSV ---------------- */

/**
 * RFC-4180-ish state machine. Deliberately byte-for-byte equivalent to
 * parseCsv() in src/lib/csv.ts — tests/csv-parity.test.ts pins the two together
 * so a file written by one side always reads back the same on the other.
 */
function parseCsv(input) {
  const text = String(input).replace(/^\uFEFF/, "");
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  if (!rows.length) return { headers: COLUMNS, records: [] };
  return { headers: rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_")), records: rows.slice(1) };
}

function toCsv(headers, records) {
  const q = (v) => (/[",\n\r]/.test(v) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v));
  return [headers, ...records].map((r) => r.map(q).join(",")).join("\n") + "\n";
}

function loadManifest() {
  if (!fs.existsSync(CSV_PATH)) return { headers: COLUMNS, records: [] };
  return parseCsv(fs.readFileSync(CSV_PATH, "utf8"));
}
/** Written to a temp file and renamed, so a crash never leaves half a manifest. */
function saveManifest(m) {
  const tmp = `${CSV_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, toCsv(m.headers, m.records), "utf8");
  fs.renameSync(tmp, CSV_PATH);
}

/**
 * Change ONE row on the file as it is right now.
 *
 * A long run used to hold the manifest it read at the start and save that old
 * copy after every row, wiping out rows added meanwhile. This reads the file
 * again, changes only the named row, and saves. Returns false when the row is
 * not there any more.
 */
function updateRow(filename, fields) {
  const fresh = loadManifest();
  const rec = fresh.records.find((x) => get(fresh.headers, x, "filename") === filename);
  if (!rec) return false;
  for (const [k, v] of Object.entries(fields)) set(fresh.headers, rec, k, v);
  saveManifest(fresh);
  return true;
}

/**
 * Only one generating run at a time, across every copy of this server.
 *
 * Two overlapping runs (an agent's call times out and it calls again) would
 * generate the same pending rows twice: double cost, double files. The lock is
 * a file next to the manifest holding the process that owns it; a lock whose
 * process is gone, or that is very old, is stale and is taken over.
 */
const LOCK_PATH = `${CSV_PATH}.lock`;
const LOCK_MAX_AGE_MS = 6 * 3600e3;
let runActive = false;

const processAlive = (pid) => {
  try {
    process.kill(pid, 0); // signal 0 only asks "is it there?" — it never stops anything
    return true;
  } catch (e) {
    return e && e.code === "EPERM";
  }
};

function acquireRunLock() {
  if (runActive) return false;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      fs.writeFileSync(LOCK_PATH, JSON.stringify({ pid: process.pid, at: Date.now() }), { flag: "wx" });
      runActive = true;
      return true;
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      let stale = false;
      try {
        const held = JSON.parse(fs.readFileSync(LOCK_PATH, "utf8"));
        stale = !processAlive(Number(held.pid)) || Date.now() - Number(held.at) > LOCK_MAX_AGE_MS;
      } catch {
        stale = true; // unreadable lock: nobody can be relying on it
      }
      if (!stale) return false;
      try {
        fs.unlinkSync(LOCK_PATH);
      } catch {
        /* someone else took it over first — loop and see */
      }
    }
  }
  return false;
}
function releaseRunLock() {
  if (!runActive) return;
  runActive = false;
  try {
    fs.unlinkSync(LOCK_PATH);
  } catch {
    /* already gone */
  }
}
const BUSY_MESSAGE =
  "another generating run is already active on this manifest — wait for it to finish (check forge_status), then call again. Nothing was started.";
const col = (headers, name) => headers.indexOf(name);
const get = (headers, rec, name) => {
  const i = col(headers, name);
  return i >= 0 && i < rec.length ? rec[i] : "";
};
const set = (headers, rec, name, val) => {
  let i = col(headers, name);
  if (i < 0) { headers.push(name); i = headers.length - 1; }
  rec[i] = val;
};
const toRows = (m) =>
  m.records.map((rec) => {
    const o = {};
    for (const h of m.headers) o[h] = get(m.headers, rec, h);
    return o;
  });

/* ---------------- filenames ---------------- */

/**
 * Filenames arrive from agents, so they never touch the filesystem unchecked:
 * strip any directory part, then hold the result to the app's own naming rule.
 */
export function safeFilename(raw) {
  const name = String(raw || "").trim();
  // Reject rather than silently rewrite: quietly turning "a/b/shop.png" into
  // "shop.png" could collide with a different row that legitimately owns it.
  if (/[/\\]/.test(name) || name.includes("..") || path.basename(name) !== name) {
    throw new Error(`unsafe filename "${raw}" — a bare filename only, no path separators`);
  }
  // Any picture extension, because the engine decides the format: Google and
  // Cloudflare return JPEG. This used to insist on .png, so every JPEG an
  // agent made was written out under a name claiming to be PNG.
  if (!/^[a-z0-9][a-z0-9_]*\.(png|jpg|jpeg|webp|gif)$/.test(name)) {
    throw new Error(`unsafe filename "${raw}" — use lowercase a–z, 0–9 and underscores, ending in .png, .jpg, .webp or .gif`);
  }
  return name;
}

/* ---------------- generation ---------------- */

async function generateImage(row, taken = new Set()) {
  const filename = safeFilename(row.filename);
  const { bytes, mime } = await generateBytes(
    {
      prompt: row.prompt,
      negative_prompt: row.negative_prompt,
      aspect_ratio: ASPECTS.includes(row.aspect_ratio) ? row.aspect_ratio : "1:1",
      seed: Number(row.seed) || 1,
      model: (row.model || "").trim(),
    },
    SETTINGS,
    undefined,
    exhaust,
    cooldownMsFor(row)
  );
  const folder = folderFor(row.category);
  const dir = path.join(OUT_DIR, folder);
  fs.mkdirSync(dir, { recursive: true });
  // Name the file for what it really is, exactly as the app does — unless
  // another row already owns that name, which would overwrite its picture.
  const wanted = nameForMime(filename, mime);
  const finalName = wanted !== filename && !taken.has(wanted) ? safeFilename(wanted) : filename;
  const dest = path.join(dir, finalName);
  fs.writeFileSync(dest, bytes);
  return { dest, filename: finalName };
}

const describeEngine = () => {
  const { engine, apiModel, def } = resolveRoute({ model: "" }, SETTINGS);
  const cost = def
    ? def.priceUsd === 0
      ? "free"
      : `${formatUsd(def.priceUsd)} per image`
    : engine === "local" || engine === "simulated"
      ? "free"
      : "price unknown";
  const wired = [
    SETTINGS.cloudflare.accountId && SETTINGS.cloudflare.token ? "cloudflare ✓" : "cloudflare ✗",
    SETTINGS.pollinationsToken ? "pollinations token ✓" : "pollinations token ✗",
    "ovhcloud ✓ (needs no key)",
    `${SETTINGS.geminiKeys.length} google key(s)`,
    `${SETTINGS.openaiKeys.length} endpoint key(s)`,
  ].join(" · ");
  const money = ALLOW_PAID
    ? `paid engines: allowed up to ${formatUsd(MAX_USD)} in total (${formatUsd(spentUsd)} spent so far)`
    : "paid engines: refused (the operator has not set FORGE_ALLOW_PAID)";
  return `default engine: ${engine} (${apiModel}) · ${cost}\n${wired}\n${money}`;
};

/** Rows still aimed at a model the provider switched off. */
const retiredRows = (rows) =>
  rows.filter((r) => RETIRED_MODELS[(r.model || "").trim()]).map((r) => r.filename);

/* ---------------- MCP server ---------------- */

const server = new Server(
  { name: "image-forge", version: "1.1.0" },
  { capabilities: { tools: {} } }
);

/**
 * Every tool declares BOTH a Zod schema (used to validate incoming arguments)
 * and the JSON Schema the MCP wire format actually requires.
 */
const SCHEMAS = {
  forge_status: z.object({}).strict(),
  forge_list: z.object({ status: z.string().optional() }).strict(),
  forge_add_row: z
    .object({
      filename: z.string(),
      prompt: z.string().min(1),
      negative_prompt: z.string().optional(),
      category: z.enum(CATEGORIES).default("image"),
      aspect_ratio: z.enum(ASPECTS).default("1:1"),
      seed: z.number().int().min(1).max(SEED_MAX).optional(),
      model: z.enum(MODEL_IDS).optional(),
    })
    .strict(),
  forge_generate_pending: z.object({ limit: z.number().int().min(1).optional() }).strict(),
  forge_generate_one: z.object({ filename: z.string() }).strict(),
  forge_retry_failed: z.object({}).strict(),
  forge_fix_retired: z.object({}).strict(),
  forge_models: z.object({}).strict(),
};

const obj = (properties = {}, required = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

const TOOLS = [
  {
    name: "forge_status",
    description: "Summarize the image manifest: how many pending, done, failed, etc. Also reports which engine is wired up.",
    inputSchema: obj(),
  },
  {
    name: "forge_list",
    description: "List manifest rows (filename, category, status). Optional status filter.",
    inputSchema: obj({ status: { type: "string", description: "pending | generating | done | failed | imported" } }),
  },
  {
    name: "forge_add_row",
    description: "Add a picture idea to the manifest.",
    inputSchema: obj(
      {
        filename: { type: "string", description: "lowercase, underscores, e.g. image_bakery.png" },
        prompt: { type: "string" },
        negative_prompt: { type: "string" },
        category: { type: "string", enum: CATEGORIES, default: "image" },
        aspect_ratio: { type: "string", enum: ASPECTS, default: "1:1" },
        seed: { type: "integer", minimum: 1, maximum: SEED_MAX },
        model: { type: "string", enum: MODEL_IDS, description: "leave empty to use the server's default engine" },
      },
      ["filename", "prompt"]
    ),
  },
  {
    name: "forge_generate_pending",
    description: "Generate images for all pending rows through the configured engine (keyless OVHcloud unless keys are supplied). Writes PNGs to disk and marks rows done. Rows that would run on a paid engine are skipped unless the operator allowed it (FORGE_ALLOW_PAID, FORGE_MAX_USD). Only one run at a time.",
    inputSchema: obj({ limit: { type: "integer", minimum: 1, description: "max rows to generate" } }),
  },
  {
    name: "forge_generate_one",
    description: "Generate a single row by filename.",
    inputSchema: obj({ filename: { type: "string" } }, ["filename"]),
  },
  {
    name: "forge_retry_failed",
    description: "Reset all failed rows back to pending so they can be generated again.",
    inputSchema: obj(),
  },
  {
    name: "forge_fix_retired",
    description:
      "Move any row still pointing at a model the provider switched off (the Imagen models Google retired on 2026-08-17) onto its current replacement.",
    inputSchema: obj(),
  },
  {
    name: "forge_models",
    description: "List every available model with its price per image, batch price, and free allowance.",
    inputSchema: obj(),
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: rawArgs = {} } = req.params;
  const text = (s, isError = false) => ({ content: [{ type: "text", text: s }], ...(isError ? { isError: true } : {}) });

  const schema = SCHEMAS[name];
  if (!schema) return text(`unknown tool: ${name}`, true);
  const parsed = schema.safeParse(rawArgs);
  if (!parsed.success) {
    const why = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    return text(`bad arguments for ${name} — ${why}`, true);
  }
  const a = parsed.data;
  const m = loadManifest();

  try {
    switch (name) {
      case "forge_status": {
        const rows = toRows(m);
        const by = (s) => rows.filter((r) => r.status === s).length;
        const pending = rows.filter((r) => (r.status || "pending") === "pending");
        const { total, unknown } = estimateCost(pending, SETTINGS);
        const costLine =
          pending.length === 0
            ? "nothing pending"
            : `generating the ${pending.length} pending row(s) would cost ${formatUsd(total)}` +
              (unknown ? ` (+${unknown} row(s) at an unknown price)` : "");
        const stale = retiredRows(rows);
        return text(
          `manifest: ${CSV_PATH}\n` +
          `total=${rows.length} pending=${by("pending")} done=${by("done")} ` +
          `failed=${by("failed")} generating=${by("generating")} imported=${by("imported")}\n` +
          `output folder: ${OUT_DIR}\n` +
          `${describeEngine()}\n` +
          `${costLine}` +
          (stale.length
            ? `\n⚠ ${stale.length} row(s) still use a model the provider switched off: ${stale.slice(0, 5).join(", ")}` +
              `${stale.length > 5 ? "…" : ""}. Use forge_fix_retired to move them.`
            : "")
        );
      }
      case "forge_fix_retired": {
        let n = 0;
        const changes = [];
        for (const rec of m.records) {
          const model = (get(m.headers, rec, "model") || "").trim();
          const info = RETIRED_MODELS[model];
          if (!info) continue;
          set(m.headers, rec, "model", info.replacedBy);
          changes.push(`${get(m.headers, rec, "filename")}: ${model} → ${info.replacedBy}`);
          n++;
        }
        if (!n) return text("no rows are using a retired model");
        saveManifest(m);
        return text(`moved ${n} row(s) onto current models:\n${changes.slice(0, 20).join("\n")}`);
      }
      case "forge_models": {
        return text(
          MODELS.map((mo) => {
            const price = mo.priceUsd === 0 ? "free" : `${formatUsd(mo.priceUsd)}/image`;
            const batch = mo.batchPriceUsd !== null ? ` · batch ${formatUsd(mo.batchPriceUsd)}` : "";
            const retires = mo.retiresOn ? ` · RETIRES ${mo.retiresOn}` : "";
            return `${mo.id} — ${mo.label} · ${price}${batch} · ${mo.allowance}${retires}\n    ${mo.note}`;
          }).join("\n")
        );
      }
      case "forge_list": {
        let rows = toRows(m);
        if (a.status) rows = rows.filter((r) => r.status === a.status);
        if (!rows.length) return text("(no rows" + (a.status ? ` with status ${a.status}` : "") + ")");
        return text(rows.map((r) => `${r.filename} [${r.category}] ${r.status || "pending"}`).join("\n"));
      }
      case "forge_add_row": {
        const filename = safeFilename(a.filename);
        if (toRows(m).some((r) => r.filename === filename)) return text(`${filename} is already in the manifest`, true);
        const maxId = toRows(m).reduce((mx, r) => Math.max(mx, parseInt(r.id) || 0), 0);
        const rec = [];
        set(m.headers, rec, "id", String(maxId + 1));
        set(m.headers, rec, "filename", filename);
        set(m.headers, rec, "prompt", a.prompt);
        set(m.headers, rec, "negative_prompt", a.negative_prompt || "");
        set(m.headers, rec, "category", a.category);
        set(m.headers, rec, "aspect_ratio", a.aspect_ratio);
        set(m.headers, rec, "seed", String(a.seed || Math.floor(Math.random() * SEED_MAX) + 1));
        set(m.headers, rec, "model", a.model || "");
        set(m.headers, rec, "status", "pending");
        m.records.push(rec);
        saveManifest(m);
        return text(`added ${filename} (id ${maxId + 1}) as pending`);
      }
      case "forge_generate_pending": {
        if (!acquireRunLock()) return text(BUSY_MESSAGE, true);
        try {
          // A row left "generating" by a run that died may or may not have been billed.
          // Park it as failed, so only a deliberate forge_retry_failed makes it run again.
          for (const r of toRows(loadManifest()).filter((x) => x.status === "generating")) {
            updateRow(r.filename, { status: "failed", error: "interrupted by a crash — it may already have been billed; check before retrying" });
          }
          let rows = toRows(loadManifest()).filter((r) => (r.status || "pending") === "pending");
          if (a.limit) rows = rows.slice(0, a.limit);
          if (!rows.length) return text("nothing pending to generate");
          const results = [];
          for (const r of rows) {
            // The file may have changed while an earlier picture was being made.
            const cur = toRows(loadManifest()).find((x) => x.filename === r.filename);
            if (!cur || (cur.status || "pending") !== "pending") {
              results.push(`· ${r.filename} changed meanwhile — skipped`);
              continue;
            }
            try {
              // Spending is checked first (and counted once): a refused row stays exactly as it was.
              chargeOrRefuse(cur);
            } catch (e) {
              if (e instanceof PaidRefusal) {
                results.push(`· ${r.filename} — ${e.message}`);
                if (e.stopRun) {
                  results.push("· spending limit reached — stopping this run early");
                  break;
                }
                continue;
              }
              throw e;
            }
            try {
              // Saved BEFORE the request goes out, so a second call can never pick this row up again.
              updateRow(r.filename, { status: "generating", error: "" });
              const taken = new Set(toRows(loadManifest()).map((x) => x.filename).filter((f) => f !== r.filename));
              const { dest, filename: savedAs } = await generateImage(cur, taken);
              updateRow(r.filename, {
                ...(savedAs !== r.filename ? { filename: savedAs } : {}),
                status: "done",
                generated_at: new Date().toISOString(),
                error: "",
              });
              results.push(`✓ ${r.filename} → ${dest}`);
            } catch (e) {
              updateRow(r.filename, { status: "failed", error: String(e.message || e).slice(0, 120) });
              results.push(`✗ ${r.filename} — ${e.message || e}`);
              if (e instanceof RateLimitError) {
                results.push("· every key is benched — stopping this run early");
                break;
              }
              if (e instanceof RetiredModelError) {
                results.push("· stopping — run forge_fix_retired to move these rows onto a current model");
                break;
              }
            }
          }
          return text(results.join("\n"));
        } finally {
          releaseRunLock();
        }
      }
      case "forge_generate_one": {
        const filename = safeFilename(a.filename);
        const rec = m.records.find((x) => get(m.headers, x, "filename") === filename);
        if (!rec) return text(`no row named ${filename}`, true);
        if (!acquireRunLock()) return text(BUSY_MESSAGE, true);
        try {
          const row = toRows(loadManifest()).find((r) => r.filename === filename);
          if (!row) return text(`no row named ${filename}`, true);
          try {
            chargeOrRefuse(row);
          } catch (e) {
            if (e instanceof PaidRefusal) return text(e.message, true);
            throw e;
          }
          try {
            updateRow(filename, { status: "generating", error: "" });
            const taken = new Set(toRows(loadManifest()).map((x) => x.filename).filter((f) => f !== filename));
            const { dest, filename: savedAs } = await generateImage(row, taken);
            updateRow(filename, {
              ...(savedAs !== filename ? { filename: savedAs } : {}),
              status: "done",
              generated_at: new Date().toISOString(),
              error: "",
            });
            return text(`✓ ${filename} → ${dest}`);
          } catch (e) {
            updateRow(filename, { status: "failed", error: String(e.message || e).slice(0, 120) });
            return text(`✗ ${filename} — ${e.message || e}`, true);
          }
        } finally {
          releaseRunLock();
        }
      }
      case "forge_retry_failed": {
        let n = 0;
        for (const rec of m.records) {
          if (get(m.headers, rec, "status") === "failed") {
            set(m.headers, rec, "status", "pending");
            set(m.headers, rec, "error", "");
            n++;
          }
        }
        saveManifest(m);
        return text(n ? `reset ${n} failed row(s) to pending` : "no failed rows");
      }
      default:
        return text(`unknown tool: ${name}`, true);
    }
  } catch (e) {
    return text(`error: ${e.message || e}`, true);
  }
});

export {
  parseCsv,
  toCsv,
  TOOLS,
  SCHEMAS,
  pickProvider,
  folderFor,
  unwrapSettingsFile,
  // money, lock and manifest helpers — exported so tests can pin them
  server,
  PaidRefusal,
  chargeOrRefuse,
  acquireRunLock,
  releaseRunLock,
  updateRow,
  loadManifest,
  saveManifest,
  LOCK_PATH,
  spentSoFar,
};

/* Only speak MCP when run as a program — importing this file (tests) must not connect. */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // (runs until the host closes the connection)
}
