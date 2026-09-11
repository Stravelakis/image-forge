/**
 * The style catalogue — the LOOK, with no subject baked in.
 *
 * Each style carries:
 *   · the wording appended to every prompt that uses it
 *   · negatives that keep the look honest
 *   · which models suit it, best first
 *   · whether it normally needs readable words in the picture
 *
 * On model recommendations — an honest note. Almost every style works on almost
 * every model; the differences that actually matter are narrow and known:
 *   · only Google's models and DALL·E write legible words, so anything
 *     text-shaped (infographics, posters, signs) must use one
 *   · the FLUX family and Z-Image are the strongest at photographic realism
 *   · small local models drift on long or abstract prompts, so styles that
 *     depend on precise composition list a cloud model first
 * Where there is no real difference, the order simply puts free before paid.
 * "local" means whichever model your own machine is set to.
 */

import type { StyleDef } from "../types";

/** A model suggestion: a registry id, or "local" for your own machine. */
export type StyleModel = string;

export interface StyleEntry extends StyleDef {
  group: StyleGroup;
  /** one plain sentence: what this looks like */
  blurb: string;
  /** style-specific negative prompt, added to whatever the row already has */
  negative: string;
  /** best first. "local" = your own machine. */
  recommended: StyleModel[];
  /** true when the look normally involves readable words in the picture */
  needsText?: boolean;
}

export type StyleGroup = "toy" | "drawn" | "anime" | "photo" | "graphic" | "tabletop";

export const STYLE_GROUPS: { id: StyleGroup; label: string; hint: string }[] = [
  { id: "toy", label: "Made things", hint: "clay, paper, yarn" },
  { id: "drawn", label: "Drawn & painted", hint: "by hand" },
  { id: "anime", label: "Anime & cartoon", hint: "japanese and western" },
  { id: "photo", label: "Photographic", hint: "looks real" },
  { id: "graphic", label: "Graphic & flat", hint: "vectors, diagrams" },
  { id: "tabletop", label: "Tabletop & RPG", hint: "for games" },
];

/* Model shorthands, so the lists below stay readable. */
const LOCAL = "local";
const FREE_CF = "cloudflare-flux";
const FREE_POLLI = "flux";
const FREE_OVH = "ovh-sdxl";
const G_LITE = "nano-banana-2-lite";
const G_FULL = "nano-banana-2";
const G_ONE = "nano-banana";
const G_PRO = "gemini-3-pro-image";
const OPENAI = "gpt-image-1";

/** The usual order: your machine, then free cloud, then cheap paid, then good paid. */
const USUAL: StyleModel[] = [LOCAL, FREE_CF, FREE_POLLI, FREE_OVH, G_LITE, G_FULL];
/** For looks that need precise composition — cloud first, local still offered. */
const PRECISE: StyleModel[] = [G_FULL, G_LITE, LOCAL, FREE_CF];
/**
 * For anything with readable words — the Nano Banana family only, by request.
 *
 * DALL·E / gpt-image-1 and gemini-3-pro-image can also spell reliably, but they
 * are deliberately NOT listed here: ask before adding either to a text style.
 */
const TEXTY: StyleModel[] = [G_FULL, G_LITE, G_ONE];

const CLEAN = "clean composition";

export const STYLE_CATALOGUE: StyleEntry[] = [
  /* ---------------- made things ---------------- */
  {
    id: "claymation",
    name: "Claymation",
    group: "toy",
    blurb: "Soft modelling clay, gentle fingerprints, warm lamp light.",
    block: `claymation style, sculpted modelling clay, soft warm lighting, charming handmade illustration, ${CLEAN}`,
    negative: "photographic, harsh shadows, plastic sheen",
    swatch: ["#e8b06a", "#a5552f", "#7d9c5c"],
    recommended: USUAL,
  },
  {
    id: "stop-motion-clay",
    name: "Stop-Motion Clay",
    group: "toy",
    blurb: "Like a frame from a stop-motion film — visible thumbprints, practical lights.",
    block: `stop motion clay animation still, visible fingerprints in the clay, warm practical lighting, shallow depth of field, ${CLEAN}`,
    negative: "smooth CGI, flat lighting",
    swatch: ["#d99a5b", "#8f4a2c", "#5f7d4e"],
    recommended: USUAL,
  },
  {
    id: "crochet-diorama",
    name: "Crochet Diorama",
    group: "toy",
    blurb: "Everything knitted or crocheted in soft yarn — amigurumi, fuzzy and round.",
    block: `crocheted amigurumi diorama, soft chunky yarn texture, visible stitches and fibres, handmade wool craft, warm soft lighting, ${CLEAN}`,
    negative: "smooth plastic, metal, photographic realism, hard edges",
    swatch: ["#f0c48a", "#c2604a", "#7fa07a"],
    recommended: USUAL,
  },
  {
    id: "paper-diorama",
    name: "Paper Diorama",
    group: "toy",
    blurb: "Layered cut card, little paper trees, soft shadows between the layers.",
    block: `layered paper craft diorama, cut cardstock in stacked planes, soft shadows between layers, papercut illustration, ${CLEAN}`,
    negative: "photographic, glossy, metallic",
    swatch: ["#e5c98f", "#b06a3a", "#88a06b"],
    recommended: USUAL,
  },
  {
    id: "paper-cutout",
    name: "Paper Cutout",
    group: "toy",
    blurb: "Flat cut shapes on card, like a storybook collage.",
    block: `paper cutout style, layered cardstock textures, soft side lighting, charming illustration, ${CLEAN}`,
    negative: "photographic, 3d render",
    swatch: ["#e5c98f", "#b06a3a", "#88a06b"],
    recommended: USUAL,
  },
  {
    id: "felt-plush",
    name: "Felt & Plush",
    group: "toy",
    blurb: "Sewn felt and stuffed fabric, visible stitching, soft and huggable.",
    block: `handmade felt and plush toy, visible stitching and seams, soft fabric texture, gentle studio lighting, ${CLEAN}`,
    negative: "hard surfaces, photographic realism, metal",
    swatch: ["#efbf7d", "#b2564f", "#6f9b86"],
    recommended: USUAL,
  },
  {
    id: "shadow-puppet",
    name: "Shadow Puppet",
    group: "toy",
    blurb: "Cut-out silhouettes lit from behind, warm lantern glow.",
    block: `shadow puppet theatre, dramatic silhouette against warm backlight, cut paper figures, ${CLEAN}`,
    negative: "full colour detail inside the silhouette, photographic",
    swatch: ["#f0b45a", "#3a2a1c", "#1d1410"],
    recommended: USUAL,
  },
  {
    id: "low-poly",
    name: "Low-Poly",
    group: "toy",
    blurb: "Simple flat-shaded facets, like an early 3D game.",
    block: `low-poly 3d render, flat shaded triangular facets, simple palette, soft rim lighting, ${CLEAN}`,
    negative: "high detail, photographic texture, smooth curves",
    swatch: ["#d8a35e", "#9c5a34", "#6f9464"],
    recommended: USUAL,
  },

  /* ---------------- 3D & animation ---------------- */
  {
    id: "animated-feature-3d",
    name: "3D Animated Feature",
    group: "drawn",
    blurb: "The big-studio computer-animated film look — round, warm, expressive.",
    block: `3d animated feature film still, stylised proportions, expressive character design, warm cinematic lighting, subsurface skin shading, high production polish, ${CLEAN}`,
    negative: "photorealistic humans, uncanny realism, flat 2d",
    swatch: ["#f2b45c", "#3f7fc4", "#e2705a"],
    recommended: [G_FULL, LOCAL, FREE_CF, G_LITE],
  },
  {
    id: "hand-drawn-animation",
    name: "Hand-Drawn Animation",
    group: "drawn",
    blurb: "Classic cel animation — inked outlines, flat paint, painted backgrounds.",
    block: `classic hand-drawn cel animation still, clean ink outlines, flat painted colour fills, watercolour painted background, golden age animation, ${CLEAN}`,
    negative: "3d render, photographic, heavy shading",
    swatch: ["#f5cf8a", "#4a7fb5", "#c85a49"],
    recommended: [G_FULL, LOCAL, FREE_CF, G_LITE],
  },
  {
    id: "storybook",
    name: "Vintage Storybook",
    group: "drawn",
    blurb: "Mid-century children's book plate — muted inks, textured paper.",
    block: `vintage children's storybook illustration, muted limited palette, visible paper grain, soft ink linework, mid-century plate, ${CLEAN}`,
    negative: "digital sheen, photographic, neon colours",
    swatch: ["#e3c08a", "#9a6b4f", "#7d8f6b"],
    recommended: USUAL,
  },
  {
    id: "watercolour",
    name: "Watercolour",
    group: "drawn",
    blurb: "Wet washes, blooms and bleeds, white paper showing through.",
    block: `watercolour painting, soft wet-on-wet washes, pigment blooms, visible cold-press paper texture, white paper showing through, ${CLEAN}`,
    negative: "digital gradients, hard outlines, photographic",
    swatch: ["#e8d3a8", "#6f93b8", "#b4705f"],
    recommended: USUAL,
  },
  {
    id: "oil-painting",
    name: "Oil Painting",
    group: "drawn",
    blurb: "Thick visible brushwork, canvas weave, old-master light.",
    block: `oil painting on canvas, thick impasto brush strokes, visible canvas weave, chiaroscuro lighting, old master technique, ${CLEAN}`,
    negative: "flat digital colour, photographic sharpness",
    swatch: ["#d8b070", "#6e4a2f", "#4d5f47"],
    recommended: USUAL,
  },
  {
    id: "comic-inked",
    name: "Comic Book",
    group: "drawn",
    blurb: "Bold ink, dramatic angles, halftone dots.",
    block: `comic book illustration, bold confident ink linework, dramatic angle, cel shading with halftone dot texture, ${CLEAN}`,
    negative: "photographic, soft focus, muddy colour",
    swatch: ["#f0c04a", "#c2352f", "#2f5fa8"],
    recommended: USUAL,
  },
  {
    id: "stick-figures",
    name: "Stick Figures",
    group: "drawn",
    blurb: "Deliberately crude stick people — clear, funny, whiteboard-simple.",
    block: `simple stick figure drawing, plain black lines on white, minimal crude shapes, whiteboard sketch, no shading, ${CLEAN}`,
    negative: "detailed anatomy, shading, colour, realistic proportions, texture",
    swatch: ["#f4f0e6", "#2a2420", "#8f8578"],
    recommended: USUAL,
  },

  /* ---------------- anime & cartoon ---------------- */
  {
    id: "anime-modern",
    name: "Anime",
    group: "anime",
    blurb: "Modern Japanese animation — clean lines, big eyes, bright cel colour.",
    block: `modern anime illustration, clean confident linework, expressive large eyes, vibrant cel shading, detailed background art, ${CLEAN}`,
    negative: "photorealistic, western cartoon proportions, muddy colour",
    swatch: ["#ffd166", "#ef476f", "#118ab2"],
    recommended: USUAL,
  },
  {
    id: "anime-chibi",
    name: "Chibi",
    group: "anime",
    blurb: "Tiny bodies, huge heads, maximum cuteness.",
    block: `chibi anime style, oversized head on a tiny body, huge sparkling eyes, simplified rounded limbs, soft pastel cel shading, adorable, ${CLEAN}`,
    negative: "realistic proportions, detailed anatomy, gritty, photographic",
    swatch: ["#ffe0a3", "#ff9eb5", "#8fd3f4"],
    recommended: USUAL,
  },
  {
    id: "creature-collector",
    name: "Creature Collector",
    group: "anime",
    blurb: "Friendly collectible monsters — bold outlines, flat bright colour, clean background.",
    block: `collectible creature character design, friendly stylised monster, bold clean outlines, flat bright saturated colour, simple plain background, full body, game creature art, ${CLEAN}`,
    negative: "photorealistic, gore, cluttered background, human characters",
    swatch: ["#ffd93d", "#ff6b6b", "#4ecdc4"],
    recommended: USUAL,
  },
  {
    id: "retro-cartoon",
    name: "Retro Cartoon",
    group: "anime",
    blurb: "Rubber-hose 1930s cartoon — bouncy, black-and-white-ish, mischievous.",
    block: `1930s rubber hose cartoon style, bouncy curved limbs, pie-cut eyes, aged film grain, limited palette, ${CLEAN}`,
    negative: "modern anime, photorealistic, complex shading",
    swatch: ["#e8dcc0", "#2b2b2b", "#c9843e"],
    recommended: USUAL,
  },

  /*
   * Skilitsa — the house look, in two halves.
   *
   * The brief for this one said "Pixar-style". The studio's name is not in
   * the prompt, and that is deliberate: the catalogue has never named a
   * studio, because a prompt that leans on a trademark is both a legal grey
   * area and unreliable — several models refuse it outright and others water
   * it down. Everything the name was standing in for is written out instead,
   * which is what actually steers the render.
   *
   * The branded one carries a small "skilitsa.com" mark. That is text in the
   * picture, and only the models that can genuinely spell are offered for it:
   * on a free engine the mark comes out as convincing-looking nonsense, which
   * is worse than no mark at all because at thumbnail size it reads as real.
   * The plain one is the same look with no mark, and runs anywhere for free.
   */
  {
    id: "skilitsa",
    name: "Skilitsa",
    group: "anime",
    blurb: "Big-studio 3D cartoon in happy, sassy colour, with a small skilitsa.com mark worked into the scene.",
    block:
      `high-detail 3D animated cartoon in a modern animated-feature style, cinematic CGI render, ultra-detailed and polished, ` +
      `friendly slightly exaggerated proportions, large expressive eyes, clear readable silhouette, soft subsurface scattering on skin and fur, ` +
      `warm cinematic three-point lighting, soft shadows, gentle rim light, subtle ambient occlusion, ` +
      `happy sassy palette — saturated but harmonious, warm highlights, rich mid-tones, playful teal coral sunny-yellow electric-blue magenta accents, ` +
      `detailed supporting background with shallow depth of field, one clear focal subject in a dynamic story-like pose with an unmistakable emotion, ` +
      `a small discreet legible sans-serif "skilitsa.com" mark integrated naturally into the scene on a tag, sticker, sign or screen in a lower corner, ` +
      `about 3% of the image width, never covering the subject's face, ${CLEAN}`,
    negative:
      "dull muddy desaturated palette, flat lighting, cluttered composition, extra text or captions, " +
      "misspelled or garbled lettering, watermark across the subject's face, photorealistic human skin, 2D flat illustration",
    swatch: ["#ff7f5c", "#2ec4b6", "#ffd166"],
    // The mark has to be readable, so only the models that can spell.
    recommended: TEXTY,
    needsText: true,
  },
  {
    id: "skilitsa-plain",
    name: "Skilitsa Plain",
    group: "anime",
    blurb: "The same big-studio 3D cartoon and happy, sassy colour — no branding, so any free engine can make it.",
    block:
      `high-detail 3D animated cartoon in a modern animated-feature style, cinematic CGI render, ultra-detailed and polished, ` +
      `friendly slightly exaggerated proportions, large expressive eyes, clear readable silhouette, soft subsurface scattering on skin and fur, ` +
      `warm cinematic three-point lighting, soft shadows, gentle rim light, subtle ambient occlusion, ` +
      `happy sassy palette — saturated but harmonious, warm highlights, rich mid-tones, playful teal coral sunny-yellow electric-blue magenta accents, ` +
      `detailed supporting background with shallow depth of field, one clear focal subject in a dynamic story-like pose with an unmistakable emotion, ${CLEAN}`,
    negative:
      "dull muddy desaturated palette, flat lighting, cluttered composition, any text lettering signage or watermark, " +
      "photorealistic human skin, 2D flat illustration",
    swatch: ["#ff7f5c", "#2ec4b6", "#ffd166"],
    recommended: USUAL,
  },

  /* ---------------- photographic ---------------- */
  {
    id: "photoreal",
    name: "Photorealistic",
    group: "photo",
    blurb: "Looks like a real photograph — real lenses, real light.",
    block: `photorealistic photograph, natural lighting, shallow depth of field, 50mm lens, fine surface detail, true-to-life colour, ${CLEAN}`,
    negative: "illustration, painting, cartoon, cgi look, plastic skin",
    swatch: ["#cbb89a", "#6b6255", "#3c3a35"],
    recommended: [LOCAL, FREE_CF, G_FULL, G_LITE],
  },
  {
    id: "product-white",
    name: "Product Photo",
    group: "photo",
    blurb: "Catalogue shot on clean white — even light, no distractions.",
    block: `studio product photograph on a seamless pure white background, even three-point softbox lighting, sharp focus throughout, subtle contact shadow, commercial catalogue quality, ${CLEAN}`,
    negative: "busy background, harsh shadows, colour cast, props, text",
    swatch: ["#ffffff", "#d8d4cc", "#8a8579"],
    recommended: [LOCAL, FREE_CF, G_FULL, G_LITE],
  },
  {
    id: "cinematic",
    name: "Cinematic Still",
    group: "photo",
    blurb: "A frame from a film — wide lens, moody grade, anamorphic feel.",
    block: `cinematic film still, anamorphic widescreen framing, moody colour grade, volumetric light, shallow focus, 35mm film grain, ${CLEAN}`,
    negative: "flat lighting, snapshot, illustration",
    swatch: ["#d9a05b", "#2e4a63", "#8c3f38"],
    recommended: [LOCAL, FREE_CF, G_FULL, G_LITE],
  },

  /* ---------------- graphic & flat ---------------- */
  {
    id: "flat-vector",
    name: "Flat Vector",
    group: "graphic",
    blurb: "Clean flat shapes, no shading — the modern website illustration look.",
    block: `flat vector illustration, bold simple geometric shapes, limited flat colour palette, no gradients, no outlines, generous negative space, ${CLEAN}`,
    negative: "photographic, texture, shading, gradients, 3d",
    swatch: ["#4c6ef5", "#ffd43b", "#f06595"],
    recommended: USUAL,
  },
  {
    id: "line-art",
    name: "Technical Line Art",
    group: "graphic",
    blurb: "Precise even outlines on white — patent drawing, colouring-book clean.",
    block: `precise technical line art, uniform weight black outlines on pure white, no fill, no shading, patent drawing clarity, ${CLEAN}`,
    negative: "colour, shading, texture, background, photographic",
    swatch: ["#ffffff", "#1a1a1a", "#9a9a9a"],
    recommended: USUAL,
  },
  {
    id: "isometric",
    name: "Isometric",
    group: "graphic",
    blurb: "Tilted 3/4 view at a fixed angle — tidy little game-board worlds.",
    block: `isometric illustration, strict 45 degree axonometric projection, tiny detailed diorama, soft ambient occlusion, clean flat colour, ${CLEAN}`,
    negative: "perspective distortion, photographic, dramatic angle",
    swatch: ["#8ecae6", "#ffb703", "#fb8500"],
    recommended: PRECISE,
  },
  {
    id: "pixel-art",
    name: "Pixel Art",
    group: "graphic",
    blurb: "Deliberate chunky pixels, limited palette, retro game sprite.",
    block: `pixel art sprite, crisp chunky pixels, strictly limited retro palette, clean dithering, 16-bit era game art, ${CLEAN}`,
    negative: "smooth gradients, anti-aliasing, photographic, high resolution detail",
    swatch: ["#2d1b3d", "#f7a072", "#5bc0be"],
    recommended: PRECISE,
  },
  {
    id: "neon-synthwave",
    name: "Neon Synthwave",
    group: "graphic",
    blurb: "Hot pink and cyan glow, grid horizon, 1980s night.",
    block: `synthwave retrofuturism, glowing magenta and cyan neon, sunset gradient, chrome and grid horizon, volumetric haze, 1980s aesthetic, ${CLEAN}`,
    negative: "daylight, muted colour, rustic, natural",
    swatch: ["#ff2e97", "#00e5ff", "#2b0b3f"],
    recommended: USUAL,
  },
  {
    id: "infographic",
    name: "Infographic",
    group: "graphic",
    blurb: "Labelled diagram with real readable words — needs a model that can spell.",
    block: `clean infographic diagram, clear labelled callouts, simple icons, generous white space, restrained two-colour palette, legible sans-serif labels, ${CLEAN}`,
    negative: "photographic, cluttered, decorative flourishes, gibberish lettering",
    swatch: ["#264653", "#2a9d8f", "#e9c46a"],
    recommended: TEXTY,
    needsText: true,
  },
  {
    id: "poster-typographic",
    name: "Typographic Poster",
    group: "graphic",
    blurb: "Big bold lettering as the whole design — needs a model that can spell.",
    block: `bold typographic poster design, large confident display lettering as the main subject, strong grid, limited palette, high contrast, ${CLEAN}`,
    negative: "photographic, gibberish lettering, cluttered",
    swatch: ["#e63946", "#f1faee", "#1d3557"],
    recommended: TEXTY,
    needsText: true,
  },

  /* ---------------- tabletop & RPG ---------------- */
  {
    id: "rpg-item-icon",
    name: "RPG Item Icon",
    group: "tabletop",
    blurb: "A single object centred on parchment — inventory-card ready.",
    block: `fantasy RPG inventory item icon, single object centred on aged parchment, soft even lighting, painterly game art, no background clutter, ${CLEAN}`,
    negative: "multiple objects, busy background, text, characters, hands",
    swatch: ["#e8d3a8", "#8a5a32", "#5c4326"],
    recommended: USUAL,
  },
  {
    id: "rpg-portrait",
    name: "Character Portrait",
    group: "tabletop",
    blurb: "Head-and-shoulders character bust, painted, warm rim light.",
    block: `fantasy character portrait bust, head and shoulders, painterly digital illustration, warm rim lighting, simple dark vignette background, ${CLEAN}`,
    negative: "full body, busy background, text, multiple characters",
    swatch: ["#d9a05b", "#4a3a52", "#7d5240"],
    recommended: [LOCAL, FREE_CF, G_FULL, G_LITE],
  },
  {
    id: "rpg-map",
    name: "Fantasy Map",
    group: "tabletop",
    blurb: "Hand-drawn map on old paper — coastlines, hills, compass rose.",
    block: `hand-drawn fantasy map on aged parchment, ink coastlines and hatched hills, decorative compass rose, sepia wash, cartography illustration, ${CLEAN}`,
    negative: "photographic, modern road map, satellite imagery",
    swatch: ["#e3cfa4", "#8a6a42", "#4a5f6b"],
    recommended: PRECISE,
  },
  {
    id: "rpg-tavern-sign",
    name: "Hanging Sign",
    group: "tabletop",
    blurb: "A carved wooden shop sign — words optional, symbol always.",
    block: `carved hanging wooden shop sign on wrought iron brackets, weathered paint, bold carved symbol, warm lantern light, ${CLEAN}`,
    negative: "photographic, modern signage, plastic",
    swatch: ["#c98f4a", "#5c3a22", "#7d6b4f"],
    recommended: USUAL,
  },
  {
    id: "rpg-battle-map",
    name: "Battle Map Tile",
    group: "tabletop",
    blurb: "Top-down grid-ready terrain tile for the table.",
    block: `top-down orthographic battle map tile, seamless terrain texture, even flat lighting, tabletop RPG grid map art, no perspective, ${CLEAN}`,
    negative: "perspective, characters, dramatic lighting, text",
    swatch: ["#7d8f6b", "#8a6a42", "#5c6b7d"],
    recommended: PRECISE,
  },
];

/**
 * Which of a style's suggested models you can actually use right now, best
 * first. A model counts as available when its engine is set up: your own
 * machine needs an address, Cloudflare needs its two boxes, Google needs a key.
 */
export function availableModelsForStyle(
  style: StyleEntry,
  s: {
    localBase?: string;
    localModel?: string;
    cloudflare?: { accountId: string; token: string };
    pollinationsToken?: string;
    geminiKeys?: { key: string }[];
    openaiKeys?: { key: string }[];
    pausedEngines?: string[];
  }
): StyleModel[] {
  const hasLocal = Boolean(s.localBase?.trim() && s.localModel?.trim());
  const hasCf = Boolean(s.cloudflare?.accountId.trim() && s.cloudflare?.token.trim());
  const hasPolli = Boolean(s.pollinationsToken?.trim());
  const hasGoogle = Boolean(s.geminiKeys?.some((k) => k.key.trim()));
  const hasOpenai = Boolean(s.openaiKeys?.some((k) => k.key.trim()));

  return style.recommended.filter((m) => {
    if (m === "local") return hasLocal;
    if (m === "cloudflare-flux") return hasCf;
    if (m === "flux" || m === "turbo") return hasPolli;
    if (m === "ovh-sdxl") return !s.pausedEngines?.includes("ovh"); // needs no setup, only not pausing
    if (m === "gpt-image-1" || m === "dall-e-3") return hasOpenai;
    return hasGoogle; // every remaining id is a Google model
  });
}

/** Is this model free to use? */
export const isFreeModel = (m: StyleModel): boolean =>
  m === "local" || m === "cloudflare-flux" || m === "flux" || m === "turbo" || m === "ovh-sdxl";

/**
 * The model this style should use by default: the best FREE one you have set
 * up, falling back to the best paid one, falling back to the style's first
 * suggestion so there is always an answer.
 */
export function defaultModelForStyle(
  style: StyleEntry,
  settings: Parameters<typeof availableModelsForStyle>[1]
): StyleModel {
  const usable = availableModelsForStyle(style, settings);
  // A style that needs readable words must never default to a model that cannot
  // write, even when a free one is sitting right there.
  const free = usable.filter(isFreeModel);
  if (!style.needsText && free.length) return free[0];
  if (usable.length) return usable[0];
  return style.recommended[0];
}

/** Styles that normally need readable words, so we can warn on a weak model. */
export const TEXT_DEPENDENT_STYLES = STYLE_CATALOGUE.filter((s) => s.needsText).map((s) => s.id);

export const styleById = (id: string): StyleEntry | undefined => STYLE_CATALOGUE.find((s) => s.id === id);

export const stylesInGroup = (g: StyleGroup): StyleEntry[] => STYLE_CATALOGUE.filter((s) => s.group === g);
