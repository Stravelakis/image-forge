/**
 * Turning what the chat said into something safe to run.
 *
 * The model is asked to end a message with a FORGE: line carrying a style, a
 * model, a prompt and an aspect ratio. It is told which ids exist. It will
 * still, sometimes, invent one — that is not a failure to prompt harder, it is
 * what language models do, and the same thing that made a hard-coded
 * `pixtral-large-latest` into a 404 on a live account.
 *
 * So nothing here trusts the reply. Every field is checked against the real
 * catalogue, an unusable choice is corrected rather than passed through, and
 * the correction is reported so the user sees what actually happened instead
 * of quietly getting a different picture from the one they were promised.
 */

import { MODELS } from "./engines.mjs";
import type { ForgeSettings } from "./providers";
import type { AspectKey } from "../types";
import { availableModelsForStyle, defaultModelForStyle, styleById, STYLE_CATALOGUE } from "./styleCatalogue";

export interface ChatPlan {
  style: string;
  model: string;
  prompt: string;
  aspect: AspectKey;
}

export interface ParsedReply {
  /** what to show in the conversation, with the machine line removed */
  say: string;
  plan: ChatPlan | null;
  /** a whole list of pictures, when asked for many at once */
  rows: ChatPlan[] | null;
  /** changes to rows that already exist, not yet applied */
  edits: RowEdit[] | null;
  /** what those changes would do, for showing before applying */
  previews: EditPreview[] | null;
  /** anything we had to correct, in plain words, for the user to see */
  corrections: string[];
}

/** The only shapes the manifest accepts. Kept in step with AspectKey. */
const ASPECTS: AspectKey[] = ["16:9", "1:1", "9:16", "4:3"];
const FALLBACK_ASPECT: AspectKey = "16:9";

const liveModelIds = () => new Set(MODELS.map((m) => m.id));

/** The lists the model is allowed to choose from, rendered for the prompt. */
export const styleListForPrompt = (): string =>
  STYLE_CATALOGUE.map((s) => `${s.id} — ${s.name}: ${s.blurb}`).join("\n");

export const modelListForPrompt = (): string =>
  MODELS.map((m) => {
    const price = m.priceUsd === 0 || m.priceUsd === null ? "FREE" : `$${m.priceUsd.toFixed(3)}`;
    return `${m.id} — ${m.label} (${price})`;
  }).join("\n");

/**
 * Pull the FORGE line out of a reply and validate it.
 *
 * A reply with no FORGE line is perfectly normal — it means the model is still
 * asking a question, or answering one about the app.
 */
/** Check one proposal against the real catalogue. Never trusts a field. */
function validate(raw: Record<string, unknown>, settings: ForgeSettings, corrections: string[]): ChatPlan | null {
  const prompt = String(raw.prompt ?? "").trim();
  if (!prompt) return null;

  let style = String(raw.style ?? "").trim();
  let entry = styleById(style);
  if (!entry) {
    const invented = style;
    entry = STYLE_CATALOGUE[0];
    style = entry.id;
    corrections.push(
      invented
        ? `There is no style called "${invented}", so "${entry.name}" was used instead.`
        : `No style was chosen, so "${entry.name}" was used.`
    );
  }

  const askedAspect = String(raw.aspect ?? "").trim();
  let aspect: AspectKey = FALLBACK_ASPECT;
  if (ASPECTS.includes(askedAspect as AspectKey)) aspect = askedAspect as AspectKey;
  else if (askedAspect) corrections.push(`"${askedAspect}" is not a shape the forge knows, so ${FALLBACK_ASPECT} was used.`);

  let model = String(raw.model ?? "").trim();
  const allowed = availableModelsForStyle(entry, settings);
  if (!liveModelIds().has(model)) {
    const invented = model;
    model = defaultModelForStyle(entry, settings);
    corrections.push(
      invented
        ? `There is no model called "${invented}", so ${model} was used instead.`
        : `No model was chosen, so ${model} was used.`
    );
  } else if (allowed.length > 0 && !allowed.includes(model)) {
    const wanted = model;
    model = defaultModelForStyle(entry, settings);
    corrections.push(`${wanted} cannot do the "${entry.name}" style, so ${model} was used instead.`);
  }

  return { style, model, prompt, aspect };
}

export function parseReply(
  reply: string,
  settings: ForgeSettings,
  rows: Parameters<typeof parseEdits>[1] = []
): ParsedReply {
  const corrections: string[] = [];

  // EDIT first: changes to rows that already exist. Nothing is applied here —
  // this only works out what WOULD change, so it can be shown before it is.
  const edited = reply.match(/^EDIT:\s*(\[[\s\S]*?\])\s*$/m);
  if (edited) {
    const say = reply.slice(0, edited.index).trim();
    let list: unknown;
    try {
      list = JSON.parse(edited[1]);
    } catch {
      return { say, plan: null, rows: null, edits: null, previews: null, corrections: ["It tried to change some rows and garbled it. Ask again."] };
    }
    const { edits, previews } = parseEdits(list, rows, corrections);
    if (edits.length === 0) {
      return { say, plan: null, rows: null, edits: null, previews: null, corrections: corrections.length ? corrections : ["Nothing would actually change."] };
    }
    return { say, plan: null, rows: null, edits, previews, corrections };
  }

  // ROWS first: a list of pictures for the manifest. This is the bulk job the
  // Scribe used to do behind a button nobody could find.
  const many = reply.match(/^ROWS:\s*(\[[\s\S]*?\])\s*$/m);
  if (many) {
    const say = reply.slice(0, many.index).trim();
    let list: unknown;
    try {
      list = JSON.parse(many[1]);
    } catch {
      return { say, plan: null, rows: null, edits: null, previews: null, corrections: ["It tried to write a list of pictures and garbled it. Ask again."] };
    }
    if (!Array.isArray(list) || list.length === 0) {
      return { say, plan: null, rows: null, edits: null, previews: null, corrections: ["It returned an empty list, so nothing was added."] };
    }
    const rows = list
      .map((r) => validate((r ?? {}) as Record<string, unknown>, settings, corrections))
      .filter((r): r is ChatPlan => r !== null);
    const dropped = list.length - rows.length;
    if (dropped > 0) corrections.push(`${dropped} of ${list.length} had no prompt and were skipped.`);
    return { say, plan: null, rows: rows.length > 0 ? rows : null, edits: null, previews: null, corrections };
  }

  const line = reply.match(/^FORGE:\s*(\{[\s\S]*?\})\s*$/m);
  const say = (line ? reply.slice(0, line.index) : reply).trim();
  if (!line) return { say, plan: null, rows: null, edits: null, previews: null, corrections: [] };

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(line[1]) as Record<string, unknown>;
  } catch {
    // It meant to propose something and mangled the JSON. Better to keep the
    // words and drop the plan than to guess at what it intended.
    return { say, plan: null, rows: null, edits: null, previews: null, corrections: ["It tried to suggest a picture but garbled it. Ask again."] };
  }

  const plan = validate(raw, settings, corrections);
  if (!plan) return { say, plan: null, rows: null, edits: null, previews: null, corrections: ["It suggested a picture with no prompt, so nothing was made."] };
  return { say, plan, rows: null, edits: null, previews: null, corrections };
}

/** A filename that obeys the seven rules, derived from what was asked for. */
export function filenameFor(prompt: string, category = "image", taken: string[] = []): string {
  const stem =
    prompt
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .trim()
      .split(/\s+/)
      .slice(0, 4)
      .join("_") || "picture";
  let name = `${category}_${stem}.png`;
  if (!taken.includes(name)) return name;
  let n = 2;
  while (taken.includes(`${category}_${stem}_${n}.png`)) n++;
  return `${category}_${stem}_${n}.png`;
}

/* ---------------- editing rows that already exist ---------------- */

/**
 * A change to a row already in the manifest.
 *
 * This is the Scribe's real job — improving what is there — moved somewhere
 * people can find it. Only fields a person would sensibly ask to change are
 * allowed: nothing here can alter a row's status, its error, when it was made,
 * or its id. A chat rewriting history is not a feature.
 */
export interface RowEdit {
  id: number;
  prompt?: string;
  negative_prompt?: string;
  note?: string;
  filename?: string;
  style?: string;
  model?: string;
  aspect?: AspectKey;
}

/** What a row looked like before, so a change can be shown rather than assumed. */
export interface EditPreview {
  id: number;
  filename: string;
  changes: { field: string; from: string; to: string }[];
}

const EDITABLE = ["prompt", "negative_prompt", "note", "filename", "style", "model", "aspect"] as const;

/**
 * A compact view of the manifest for the chat to work from.
 *
 * Capped hard. The whole thing goes into every request, so a 400-row manifest
 * would cost more per message than the pictures do — and a model given 400
 * rows picks worse than one given the 60 that matter.
 */
export function manifestDigest(
  rows: { id: number; filename: string; prompt: string; style: string; model: string; status: string }[],
  max = 60
): string {
  if (rows.length === 0) return "The manifest is empty.";
  const shown = rows.slice(0, max);
  const lines = shown.map(
    (r) =>
      `#${r.id} ${r.filename} [${r.status}] style=${r.style || "-"} model=${r.model || "default"} :: ${r.prompt.slice(0, 90)}`
  );
  const more = rows.length > max ? `\n(and ${rows.length - max} more, not listed)` : "";
  return `${rows.length} rows in the manifest:\n${lines.join("\n")}${more}`;
}

/**
 * Read an EDIT: block and check every change against the real row.
 *
 * Unknown ids are dropped rather than guessed at — "row 12" when there is no
 * row 12 must not quietly become row 2.
 */
export function parseEdits(
  raw: unknown,
  rows: { id: number; filename: string; prompt: string; style: string; model: string; aspect_ratio: string; note?: string; negative_prompt?: string }[],
  corrections: string[]
): { edits: RowEdit[]; previews: EditPreview[] } {
  const edits: RowEdit[] = [];
  const previews: EditPreview[] = [];
  if (!Array.isArray(raw)) return { edits, previews };

  for (const item of raw) {
    const o = (item ?? {}) as Record<string, unknown>;
    const id = Number(o.id);
    const row = rows.find((r) => r.id === id);
    if (!row) {
      corrections.push(`There is no row #${o.id}, so that change was skipped.`);
      continue;
    }

    const edit: RowEdit = { id };
    const changes: EditPreview["changes"] = [];

    for (const field of EDITABLE) {
      if (!(field in o)) continue;
      const next = String(o[field] ?? "").trim();
      if (!next) continue;

      if (field === "style" && !styleById(next)) {
        corrections.push(`There is no style called "${next}", so row #${id} kept its own.`);
        continue;
      }
      if (field === "model" && !liveModelIds().has(next)) {
        corrections.push(`There is no model called "${next}", so row #${id} kept its own.`);
        continue;
      }
      if (field === "aspect" && !ASPECTS.includes(next as AspectKey)) {
        corrections.push(`"${next}" is not a shape the forge knows, so row #${id} kept its own.`);
        continue;
      }

      const current =
        field === "aspect"
          ? row.aspect_ratio
          : String((row as unknown as Record<string, unknown>)[field] ?? "");
      if (current === next) continue;

      (edit as unknown as Record<string, unknown>)[field] = next;
      changes.push({ field, from: current, to: next });
    }

    if (changes.length > 0) {
      edits.push(edit);
      previews.push({ id, filename: row.filename, changes });
    }
  }
  return { edits, previews };
}

/**
 * The image engines this person can actually use right now.
 *
 * Offering Cloudflare to someone who never entered a token is offering a
 * failure. The check is per engine, using the same credentials the router
 * uses, so the list cannot claim something the forge would then refuse.
 */
export function usableModels(settings: ForgeSettings): typeof MODELS {
  const has = {
    local: Boolean(settings.localBase?.trim()),
    cloudflare: Boolean(settings.cloudflare?.accountId?.trim() && settings.cloudflare?.token?.trim()),
    pollinations: Boolean(settings.pollinationsToken?.trim()),
    // nothing to set up
    ovh: true,
    gemini:
      (settings.geminiKeys ?? []).some((k) => k.key.trim()) ||
      (settings.geminiPaidKeys ?? []).some((k) => k.key.trim()),
    openai: (settings.openaiKeys ?? []).some((k) => k.key.trim()),
  } as Record<string, boolean>;

  const paused = new Set(settings.pausedEngines ?? []);
  return MODELS.filter((m) => has[m.engine] === true && !paused.has(m.engine));
}
