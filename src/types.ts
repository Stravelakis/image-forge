/* File System Access permission API — not yet in TS's lib.dom */
declare global {
  interface FileSystemHandle {
    queryPermission(opts?: { mode?: "read" | "readwrite" }): Promise<"granted" | "denied" | "prompt">;
    requestPermission(opts?: { mode?: "read" | "readwrite" }): Promise<"granted" | "denied" | "prompt">;
  }
}

export type Status = "pending" | "generating" | "done" | "failed" | "skipped" | "imported";

/**
 * What KIND of thing a row makes — not what it depicts.
 *
 * These were shop / item / event / npc, which came from the D&D marketplace
 * this was first built for and meant nothing to anyone else. They now describe
 * the artefact, which is the thing the app actually varies: a picture, a
 * vector, an animation, a sheet of frames.
 *
 * Old manifests are migrated on load — see migrateCategory below.
 */
export type Category = "image" | "svg" | "lottie" | "sheet" | "gif";

/** shop/item/event/npc were all pictures. Anything unknown becomes one too. */
export function migrateCategory(old: string): Category {
  const v = (old || "").trim().toLowerCase();
  if (CATEGORIES.includes(v as Category)) return v as Category;
  return "image";
}

export type AspectKey = "16:9" | "1:1" | "9:16" | "4:3";

export interface ManifestRow {
  id: number;
  filename: string;
  prompt: string;
  negative_prompt?: string;
  note?: string;
  kind?: string;
  rating?: "like" | "dislike";
  category: Category;
  item_id: string;
  shop_id: string;
  event_id: string;
  style: string;
  aspect_ratio: AspectKey;
  seed: number;
  model: string;
  status: Status;
  error: string;
  generated_at: string;
  imported_attachment_id: string;
  retry_at?: string;
  /**
   * Set when another app asked for this picture through the link (see
   * electron/link.mjs). Kept in the app, not in the CSV.
   */
  request_id?: string;
  preview?: string;
}

export interface LogEntry {
  t: string;
  msg: string;
  kind: "ok" | "err" | "info" | "run";
}

export interface Toast {
  id: number;
  msg: string;
  kind: "ok" | "err" | "info";
  action?: { label: string; run: () => void };
}

export const STATUSES: Status[] = ["pending", "generating", "done", "failed", "skipped", "imported"];

export const STATUS_META: Record<Status, { label: string; hex: string; chip: string; dot: string }> = {
  pending: { label: "pending", hex: "#97876d", chip: "bg-[var(--color-dust)]/12 text-parch border-[var(--color-dust)]/35", dot: "bg-dust" },
  generating: { label: "generating", hex: "#f2a33c", chip: "bg-ember/12 text-ember border-ember/40", dot: "bg-ember" },
  done: { label: "done", hex: "#8cb56f", chip: "bg-moss/12 text-moss border-moss/40", dot: "bg-moss" },
  failed: { label: "failed", hex: "#e2593f", chip: "bg-blood/12 text-blood border-blood/40", dot: "bg-blood" },
  skipped: { label: "skipped", hex: "#7c746a", chip: "bg-[#7c746a]/12 text-[#a89e8f] border-[#7c746a]/40", dot: "bg-[#7c746a]" },
  imported: { label: "imported", hex: "#56b8a5", chip: "bg-lagoon/12 text-lagoon border-lagoon/40", dot: "bg-lagoon" },
};

export const CATEGORIES: Category[] = ["image", "svg", "lottie", "sheet", "gif"];

export const CATEGORY_META: Record<
  Category,
  { label: string; hex: string; chip: string; folder: string; hint: string }
> = {
  image: { label: "image", hex: "#f2a33c", chip: "bg-ember/10 text-ember border-ember/35", folder: "images", hint: "an ordinary picture" },
  svg: { label: "svg", hex: "#b18ce0", chip: "bg-potion/10 text-potion border-potion/35", folder: "vectors", hint: "a vector, written as code" },
  lottie: { label: "lottie", hex: "#56b8a5", chip: "bg-lagoon/10 text-lagoon border-lagoon/35", folder: "lottie", hint: "a JSON animation for the web" },
  sheet: { label: "sheet", hex: "#8cb56f", chip: "bg-moss/10 text-moss border-moss/35", folder: "sheets", hint: "many frames of one character" },
  gif: { label: "gif", hex: "#e2593f", chip: "bg-blood/10 text-blood border-blood/35", folder: "gifs", hint: "an animation made from a still" },
};

export const ASPECTS: Record<AspectKey, { w: number; h: number; vbW: number; vbH: number }> = {
  "16:9": { w: 1024, h: 576, vbW: 800, vbH: 450 },
  "1:1": { w: 768, h: 768, vbW: 620, vbH: 620 },
  "9:16": { w: 576, h: 1024, vbW: 450, vbH: 800 },
  "4:3": { w: 1024, h: 768, vbW: 720, vbH: 540 },
};

export const ASPECT_KEYS = Object.keys(ASPECTS) as AspectKey[];

import { STYLE_CATALOGUE } from "./lib/styleCatalogue";

/* ---------------- visual styles (the MEDIUM — no subject baked in) ---------------- */

export interface StyleDef {
  id: string;
  name: string;
  block: string;
  swatch: [string, string, string];
}

/**
 * The full catalogue lives in lib/styleCatalogue.ts (it carries per-style
 * negatives and model advice as well as the prompt wording). STYLES stays here
 * as the plain list everything else already reads.
 */
export const STYLES: StyleDef[] = STYLE_CATALOGUE;

/* ---------------- kinds (the SUBJECT WORLD — optional, "none" = generic) ---------------- */

export interface KindDef {
  id: string;
  label: string;
  /** subject flavor appended to every prompt; empty for generic */
  flavor: string;
  /** automatic negative prompt baseline */
  negative: string;
  /** short tag woven into generated filenames; empty for generic */
  tag: string;
  blurb: string;
}

export const KINDS: KindDef[] = [
  {
    id: "none",
    label: "Generic · none",
    flavor: "",
    negative: "text, watermark, logo, blurry, deformed, low quality",
    tag: "",
    blurb: "No world flavor at all — just your description and the visual style.",
  },
  {
    id: "dnd",
    label: "D&D fantasy",
    flavor: "medieval fantasy, D&D marketplace, tabletop RPG charm",
    negative: "modern technology, neon signs, text, watermark, photorealistic",
    tag: "dnd",
    blurb: "Swords, taverns and tavern-sized problems.",
  },
  {
    id: "cyberpunk",
    label: "Cyberpunk",
    flavor: "cyberpunk city, neon glow, rain-slick streets, synthwave palette",
    negative: "medieval, rustic wood, bright daylight, text, watermark",
    tag: "cyber",
    blurb: "Chrome, neon and noodle bars at 2 a.m.",
  },
  {
    id: "scifi",
    label: "Sci-fi",
    flavor: "far-future science fiction, sleek hulls, starlight, sterile light",
    negative: "medieval, magic, text, watermark, blurry",
    tag: "scifi",
    blurb: "Clean lines, quiet engines, big windows on space.",
  },
  {
    id: "cozy",
    label: "Cozy cottagecore",
    flavor: "cozy cottagecore, warm hearth light, storybook softness",
    negative: "horror, neon, harsh shadows, text, watermark",
    tag: "cozy",
    blurb: "Tea, gardens and soft blankets.",
  },
  {
    id: "gothic",
    label: "Gothic horror",
    flavor: "dark gothic, candle smoke, Victorian shadows, moody mist",
    negative: "bright daylight, cartoon, cheerful, text, watermark",
    tag: "gothic",
    blurb: "Creaking floors and things in the fog.",
  },
  {
    id: "steampunk",
    label: "Steampunk",
    flavor: "steampunk brass and gears, Victorian machinery, steam wisps",
    negative: "plastic, neon, digital screens, text, watermark",
    tag: "steam",
    blurb: "Brass, boilers and very polite robots.",
  },
  {
    id: "pirate",
    label: "Pirate seas",
    flavor: "golden-age piracy, salt spray, creaking ships, tropical light",
    negative: "modern, city, text, watermark, blurry",
    tag: "pirate",
    blurb: "Salt, gold and questionable maps.",
  },
  {
    id: "mythic",
    label: "Mythology",
    flavor: "ancient mythology, marble and godlight, epic scale",
    negative: "modern clothing, text, watermark, blurry",
    tag: "myth",
    blurb: "Temples, omens and dramatic family trees.",
  },
  {
    id: "western",
    label: "Old west",
    flavor: "old west frontier, dusty golden hour, desert light",
    negative: "neon, medieval, text, watermark",
    tag: "west",
    blurb: "Dust, spurs and one very slow clock.",
  },
  {
    id: "modern",
    label: "Modern life",
    flavor: "contemporary life, soft natural daylight, candid feel",
    negative: "fantasy, medieval, text, watermark",
    tag: "modern",
    blurb: "Coffee shops, crosswalks and golden afternoons.",
  },
  {
    id: "anime",
    label: "Anime",
    flavor: "anime key visual, cel shading, expressive light",
    negative: "photorealistic, text, watermark, blurry",
    tag: "anime",
    blurb: "Big skies, big feelings, perfect hair physics.",
  },
];

export const kindById = (id?: string): KindDef => KINDS.find((k) => k.id === id) ?? KINDS[0];

export const ACCENTS: { id: string; name: string; hex: string }[] = [
  { id: "ember", name: "Lantern Ember", hex: "#f2a33c" },
  { id: "lagoon", name: "Lagoon", hex: "#56b8a5" },
  { id: "potion", name: "Potion", hex: "#b18ce0" },
  { id: "moss", name: "Moss", hex: "#8cb56f" },
  { id: "blood", name: "Dragonfire", hex: "#e2593f" },
  { id: "ice", name: "Glacier", hex: "#7db8d8" },
];
export const accentHex = (id: string): string => ACCENTS.find((a) => a.id === id)?.hex ?? ACCENTS[0].hex;

export const ERROR_POOL = [
  "429 rate_limited — quota exceeded, retry after cooldown",
  "502 bad_gateway — image endpoint timed out after 60s",
  "content_filter — prompt flagged by moderation layer",
  "decoding_error — malformed base64 payload from endpoint",
  "500 model_overloaded — upstream returned empty response",
];
