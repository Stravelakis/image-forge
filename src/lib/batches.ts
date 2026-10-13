import type { AspectKey, Category, ManifestRow } from "../types";
import { ASPECTS, CATEGORIES, kindById } from "../types";
import { autoFixFilename } from "./validate";

export const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export interface BatchSetup {
  name: string;
  kind: string;
  styleId: string;
  model: string;
  aspect: "per-category" | AspectKey;
  linkFolder: boolean;
  runAfter: boolean;
  defaultNegative: string;
}

export const DEFAULT_SETUP: BatchSetup = {
  name: "",
  kind: "none",
  styleId: "claymation",
  model: "",
  aspect: "per-category",
  linkFolder: true,
  runAfter: false,
  defaultNegative: "",
};

/** A puppet's starting point, saved from the puppet maker (13 Oct 2026). */
export interface PuppetTemplate {
  description: string;
  style: string;
  framing: "head" | "waist" | "full";
  faceEngine: string;
  partEngine: string;
}

/** A template: a picture wizard setup (what "recipes" were), or a puppet's. */
export interface SavedSetup {
  id: string;
  name: string;
  createdAt: string;
  data: BatchSetup;
  /** absent = pictures, as every template saved before puppets existed */
  type?: "pictures" | "puppet";
  puppet?: PuppetTemplate;
}

export interface Batch {
  id: string;
  name: string;
  createdAt: string;
  setupName?: string;
  rowIds: number[];
}

export interface FactoryItem {
  filename: string;
  prompt: string;
  negative_prompt?: string;
  category?: Category;
}

/* ---------------- persistence ---------------- */

const LS_SETUPS = "image-forge-setups-v1";
const LS_BATCHES = "image-forge-batches-v1";

export function loadSetups(): SavedSetup[] {
  try {
    const raw = localStorage.getItem(LS_SETUPS);
    if (raw) return JSON.parse(raw) as SavedSetup[];
  } catch { /* fresh */ }
  return [];
}
export function saveSetups(s: SavedSetup[]): void {
  try { localStorage.setItem(LS_SETUPS, JSON.stringify(s)); } catch { /* full */ }
}
export function loadBatches(): Batch[] {
  try {
    const raw = localStorage.getItem(LS_BATCHES);
    if (raw) return JSON.parse(raw) as Batch[];
  } catch { /* fresh */ }
  return [];
}
export function saveBatches(b: Batch[]): void {
  try { localStorage.setItem(LS_BATCHES, JSON.stringify(b)); } catch { /* full */ }
}

/* ---------------- factory → rows ---------------- */

/**
 * The offline idea generator's subject THEMES.
 *
 * These used to be the manifest categories, which conflated two unrelated
 * ideas: what a picture depicts, and what kind of artefact a row produces. A
 * row is now an image / svg / lottie / sheet / gif, and a storefront is a
 * subject the generator happens to know about. Keeping them separate means
 * adding a theme costs nothing and changes no schema.
 */
type Theme = "shop" | "item" | "event" | "npc";
const THEMES: Theme[] = ["shop", "item", "event", "npc"];
const THEME_ASPECT: Record<Theme, AspectKey> = { shop: "16:9", item: "1:1", event: "16:9", npc: "4:3" };

/** A sensible default shape per kind of artefact. */
const CAT_ASPECT: Record<Category, AspectKey> = {
  image: "16:9",
  svg: "1:1",
  lottie: "1:1",
  sheet: "1:1",
  gif: "16:9",
};

export function factoryToRows(
  items: FactoryItem[],
  o: { styleId: string; kind: string; model: string; aspect: BatchSetup["aspect"]; defaultNegative: string; startId: number }
): ManifestRow[] {
  let next = o.startId;
  const kind = kindById(o.kind);
  return items
    .filter((i) => i.filename.trim() && i.prompt.trim())
    .map((i) => {
      const category: Category = i.category ?? "image";
      const aspect: AspectKey = o.aspect === "per-category" ? CAT_ASPECT[category] : o.aspect;
      return {
        id: next++,
        filename: autoFixFilename(i.filename, category),
        prompt: i.prompt.trim(),
        negative_prompt: i.negative_prompt?.trim() || o.defaultNegative.trim() || kind.negative || undefined,
        kind: kind.id === "none" ? undefined : kind.id,
        category,
        item_id: "", shop_id: "", event_id: "",
        style: o.styleId,
        aspect_ratio: aspect,
        seed: Math.floor(Math.random() * 98) + 1,
        model: o.model,
        status: "pending" as const,
        error: "",
        generated_at: "",
        imported_attachment_id: "",
      };
    });
}

/* ---------------- offline idea generator (fallback when no text engine) ----------------
   Subjects stay world-neutral; the KIND supplies the flavor, so the same idea
   works for D&D, cyberpunk, cozy… anything. */

const POOLS: Record<Theme, string[][]> = {
  shop: [
    ["forge stall", "glowing coals, hanging tools, a well-worn workbench in the window"],
    ["potion shop", "shelves of glowing flasks, crooked chimney, colored light spilling out"],
    ["tavern", "foaming tankard sign, warm windows, smoke curling from the chimney"],
    ["bakery", "stacked fresh loaves, flour dust hanging in the lantern light"],
    ["scroll merchant", "towers of scrolls, ink pots, a sleeping cat on the counter"],
    ["armory", "polished plates, a wall of shields, oil-lamp shine on steel"],
  ],
  item: [
    ["healing flask", "round glass bottle, glowing red liquid, cork stopper, tiny bubbles"],
    ["long blade", "polished steel, leather-wrapped grip, resting on plain cloth"],
    ["iron shield", "riveted kite shield, painted sun emblem, worn edges"],
    ["spell book", "cracked leather cover, brass clasp, faintly glowing runes"],
    ["rope coil", "sturdy rope, neatly coiled, merchant's knot on top"],
    ["lantern", "brass lantern, warm flame, moths circling the glass"],
  ],
  event: [
    ["escaped goat", "goat sprinting through the crowd, knocked fruit crate, kids chasing it"],
    ["street performer", "performer on a crate, small crowd tossing coins, instrument raised high"],
    ["fire drill", "bucket brigade passing water, dramatic and comedic, dusk light"],
    ["royal herald", "herald on a cart reading a proclamation, crowd leaning in"],
    ["cart mishap", "wagon tipped over, cabbages everywhere, apologetic driver"],
  ],
  npc: [
    ["city guard", "tired eyes, dented helm, polearm over shoulder, lantern rim light"],
    ["street merchant", "wide grin, colorful scarves, scales in hand, warm stall light"],
    ["old sage", "long grey beard, twinkling eyes, staff with a crystal, soft study light"],
    ["stable hand", "freckles, straw hat, hay wisps, gentle smile, golden hour"],
    ["tavern keeper", "apron and rolled sleeves, mug in hand, warm hearth behind"],
  ],
};

const LIGHTING = ["warm lantern light", "soft golden hour", "moody evening glow", "bright midday sun", "cozy candlelight"];
const MOOD = ["inviting and lived-in", "a little mysterious", "bustling and cheerful", "quiet and storied", "playfully chaotic"];

export function generateIdeas(topic: string, count: number, kindId = "none"): FactoryItem[] {
  const kind = kindById(kindId);

  const out: FactoryItem[] = [];
  const t = topic.trim().toLowerCase();
  for (let i = 0; i < count; i++) {
    const theme = THEMES[i % THEMES.length];
    const pool = POOLS[theme];
    const pick = pool[(i * 7 + t.length) % pool.length];
    const slug = pick[0].replace(/\s+/g, "_");
    const tag = kind.tag ? `${kind.tag}_` : "";
    const subject =
      theme === "shop"
        ? `${pick[0]} storefront`
        : theme === "item"
          ? `${pick[0]} item icon`
          : theme === "event"
            ? `${pick[0]} street scene`
            : `${pick[0]} portrait`;
    const prompt =
      `${t ? t + ", " : ""}${subject}. ${pick[1]}, ${LIGHTING[(i * 3) % LIGHTING.length]}, ${MOOD[(i * 5) % MOOD.length]}.` +
      (kind.flavor ? ` ${kind.flavor}.` : "");
    out.push({
      filename: `image_${tag}${slug}.png`,
      prompt,
      negative_prompt: kind.negative,
      category: "image",
    });
  }
  return out;
}

export const ideaCategories = (): Category[] => [...CATEGORIES];
export const aspectFor = (a: BatchSetup["aspect"], c: Category): AspectKey =>
  a === "per-category" ? CAT_ASPECT[c] : a;
export const aspectDims = (a: AspectKey) => ASPECTS[a];
