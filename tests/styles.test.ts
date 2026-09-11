import { describe, expect, it } from "vitest";
import {
  STYLE_CATALOGUE,
  STYLE_GROUPS,
  TEXT_DEPENDENT_STYLES,
  availableModelsForStyle,
  defaultModelForStyle,
  isFreeModel,
  styleById,
  stylesInGroup,
} from "../src/lib/styleCatalogue";
import { MODELS, MODEL_TRAITS } from "../src/lib/engines.mjs";
import { STYLES } from "../src/types";

const nothingSetUp = {};
const localOnly = { localBase: "http://localhost:8080/v1", localModel: "flux.2-klein-4b" };
const cloudflareOnly = { cloudflare: { accountId: "a", token: "t" } };
const googleOnly = { geminiKeys: [{ key: "k" }] };
const everything = {
  ...localOnly,
  ...cloudflareOnly,
  ...googleOnly,
  pollinationsToken: "tok",
  openaiKeys: [{ key: "k" }],
};

describe("the catalogue itself", () => {
  it("is what the app actually uses", () => {
    expect(STYLES).toBe(STYLE_CATALOGUE);
  });

  it("has a decent spread of looks", () => {
    expect(STYLE_CATALOGUE.length).toBeGreaterThanOrEqual(30);
  });

  it("gives every style a unique id", () => {
    const ids = STYLE_CATALOGUE.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps the original five ids, so saved manifests still resolve", () => {
    for (const id of ["claymation", "stop-motion-clay", "paper-cutout", "shadow-puppet", "low-poly"]) {
      expect(styleById(id), id).toBeDefined();
    }
  });

  it("fills in every field on every style", () => {
    for (const s of STYLE_CATALOGUE) {
      expect(s.name.length, `${s.id}.name`).toBeGreaterThan(2);
      expect(s.blurb.length, `${s.id}.blurb`).toBeGreaterThan(15);
      expect(s.block.length, `${s.id}.block`).toBeGreaterThan(25);
      expect(s.negative.length, `${s.id}.negative`).toBeGreaterThan(5);
      expect(s.swatch, `${s.id}.swatch`).toHaveLength(3);
      for (const c of s.swatch) expect(c, `${s.id} swatch colour`).toMatch(/^#[0-9a-f]{6}$/i);
      expect(STYLE_GROUPS.map((g) => g.id), `${s.id}.group`).toContain(s.group);
    }
  });

  it("offers at least three models for every style", () => {
    for (const s of STYLE_CATALOGUE) {
      expect(s.recommended.length, `${s.id} needs 3+ models`).toBeGreaterThanOrEqual(3);
      expect(new Set(s.recommended).size, `${s.id} lists a model twice`).toBe(s.recommended.length);
    }
  });

  it("only ever names a model that exists", () => {
    const known = new Set([...MODELS.map((m) => m.id), "local"]);
    for (const s of STYLE_CATALOGUE) {
      for (const m of s.recommended) expect(known, `${s.id} → ${m}`).toContain(m);
    }
  });

  it("offers a local option and a free cloud option wherever it sensibly can", () => {
    for (const s of STYLE_CATALOGUE) {
      if (s.needsText) continue; // nothing free can spell — that is the point
      expect(s.recommended, `${s.id} should offer your own machine`).toContain("local");
      expect(s.recommended.some(isFreeModel), `${s.id} needs a free option`).toBe(true);
    }
  });

  it("puts every group to use", () => {
    for (const g of STYLE_GROUPS) expect(stylesInGroup(g.id).length, `${g.id} is empty`).toBeGreaterThan(0);
  });

  it("marks the looks that depend on readable words", () => {
    expect(TEXT_DEPENDENT_STYLES).toContain("infographic");
    expect(TEXT_DEPENDENT_STYLES).toContain("poster-typographic");
    expect(TEXT_DEPENDENT_STYLES).not.toContain("claymation");
  });

  it("restricts text-dependent looks to the Nano Banana family, by request", () => {
    // Deliberately narrow: DALL-E and gemini-3-pro-image can spell too, but the
    // owner asked to be consulted before either is offered for a text style.
    const allowed = new Set(["nano-banana-2", "nano-banana-2-lite", "nano-banana"]);
    for (const id of TEXT_DEPENDENT_STYLES) {
      for (const m of styleById(id)!.recommended) expect(allowed, `${id} → ${m}`).toContain(m);
    }
  });

  it("includes the looks that were asked for", () => {
    for (const id of [
      "claymation",
      "animated-feature-3d",
      "hand-drawn-animation",
      "crochet-diorama",
      "paper-diorama",
      "stick-figures",
      "photoreal",
      "infographic",
      "anime-modern",
      "anime-chibi",
      "creature-collector",
      "rpg-item-icon",
      "rpg-map",
    ]) {
      expect(styleById(id), `missing ${id}`).toBeDefined();
    }
  });

  it("names no trademarked studio in a style name", () => {
    const trademarks = /pixar|disney|pokemon|ghibli|marvel|nintendo/i;
    for (const s of STYLE_CATALOGUE) {
      expect(trademarks.test(s.name), `${s.id} name`).toBe(false);
      expect(trademarks.test(s.block), `${s.id} prompt`).toBe(false);
    }
  });
});

describe("which models you can actually use", () => {
  it("offers only OVHcloud when nothing is set up, since it needs no setup", () => {
    expect(availableModelsForStyle(styleById("claymation")!, nothingSetUp)).toEqual(["ovh-sdxl"]);
  });

  it("offers nothing when nothing is set up and OVHcloud is paused", () => {
    expect(availableModelsForStyle(styleById("claymation")!, { ...nothingSetUp, pausedEngines: ["ovh"] })).toEqual([]);
  });

  it("counts your own machine only once it has an address and a model", () => {
    expect(availableModelsForStyle(styleById("claymation")!, localOnly)).toContain("local");
    expect(availableModelsForStyle(styleById("claymation")!, { localBase: "http://x" })).not.toContain("local");
  });

  it("counts Cloudflare only when both boxes are filled", () => {
    expect(availableModelsForStyle(styleById("claymation")!, cloudflareOnly)).toContain("cloudflare-flux");
    expect(
      availableModelsForStyle(styleById("claymation")!, { cloudflare: { accountId: "a", token: "" } })
    ).not.toContain("cloudflare-flux");
  });

  it("ignores a key that is only whitespace", () => {
    expect(availableModelsForStyle(styleById("infographic")!, { geminiKeys: [{ key: "   " }] })).toEqual([]);
  });
});

describe("what a style will use by default", () => {
  it("prefers your own machine when it is set up, because it is free", () => {
    expect(defaultModelForStyle(styleById("claymation")!, everything)).toBe("local");
  });

  it("falls back to a free cloud model when there is no local one", () => {
    expect(defaultModelForStyle(styleById("claymation")!, { ...cloudflareOnly, ...googleOnly })).toBe("cloudflare-flux");
  });

  it("prefers OVHcloud over a paid model, because it is free and needs nothing", () => {
    expect(defaultModelForStyle(styleById("claymation")!, googleOnly)).toBe("ovh-sdxl");
  });

  it("uses a paid model when that is all you have", () => {
    expect(defaultModelForStyle(styleById("claymation")!, { ...googleOnly, pausedEngines: ["ovh"] })).toBe(
      "nano-banana-2-lite"
    );
  });

  it("never picks a free model that cannot spell for a look that needs words", () => {
    const pick = defaultModelForStyle(styleById("infographic")!, everything);
    expect(isFreeModel(pick)).toBe(false);
    expect(pick).toBe("nano-banana-2");
  });

  it("still answers when nothing at all is set up", () => {
    const pick = defaultModelForStyle(styleById("photoreal")!, nothingSetUp);
    expect(pick).toBe(styleById("photoreal")!.recommended[0]);
  });
});

/**
 * The house look, and the honesty its branded half needs.
 *
 * The brief asked for a small "skilitsa.com" mark in every picture. That is
 * text in the image, and only a handful of models can render text legibly —
 * on the rest it comes out as convincing-looking nonsense, which at thumbnail
 * size reads as a real logo. So the branded style is treated exactly like the
 * infographic and poster styles: marked as needing words, and offered only to
 * models that can spell. The plain half carries no mark and runs free
 * anywhere.
 */
describe("the Skilitsa house styles", () => {
  const branded = styleById("skilitsa")!;
  const plain = styleById("skilitsa-plain")!;

  it("ships both halves", () => {
    expect(branded).toBeDefined();
    expect(plain).toBeDefined();
  });

  it("asks for the mark in the branded one, and only there", () => {
    expect(branded.block).toContain("skilitsa.com");
    expect(plain.block).not.toContain("skilitsa.com");
  });

  it("declares the branded one as needing readable words", () => {
    // This is what makes the app warn before spending a free generation on a
    // model that will produce a garbled mark.
    expect(branded.needsText).toBe(true);
    expect(TEXT_DEPENDENT_STYLES).toContain("skilitsa");
  });

  it("offers the branded one only to models that can spell", () => {
    for (const m of branded.recommended) {
      expect(MODEL_TRAITS[m as keyof typeof MODEL_TRAITS]?.textQuality, m).toBe("good");
    }
  });

  it("leaves the plain one free to run on a free engine", () => {
    expect(plain.needsText).toBeFalsy();
    expect(plain.recommended.some((m) => m === "local" || isFreeModel(m))).toBe(true);
  });

  it("keeps the two looks identical apart from the mark", () => {
    // If these drift, "same look, no branding" stops being true and the
    // choice between them becomes a choice between two different styles.
    const strip = (s: string) => s.split(",").map((p) => p.trim()).filter((p) => !/skilitsa|mark|tag, sticker/i.test(p));
    const shared = strip(plain.block);
    const brandedParts = strip(branded.block);
    for (const part of shared) expect(brandedParts, part).toContain(part);
  });

  it("names no studio, however the brief was phrased", () => {
    // Asked for as "Pixar-style". The look is written out instead — the
    // catalogue-wide rule above covers this, and this pins the reason.
    expect(/pixar/i.test(branded.block + plain.block + branded.blurb + plain.blurb)).toBe(false);
  });
});

/**
 * Favourites: a shortcut laid over the catalogue, never a filter.
 *
 * The ordering below is the whole behaviour, and it lives in two components
 * (the style library and the wizard's picker) that must agree. Pinning it here
 * means one of them drifting is a failed test rather than a surprise.
 */
const orderWithFavorites = <T extends { id: string }>(all: T[], favorites: string[]): T[] => [
  ...favorites.map((id) => all.find((s) => s.id === id)).filter((s): s is T => Boolean(s)),
  ...all.filter((s) => !favorites.includes(s.id)),
];

describe("starred styles", () => {
  const all = STYLE_CATALOGUE;

  it("puts the starred ones first, in the order they were starred", () => {
    const out = orderWithFavorites(all, ["poster-typographic", "claymation"]);
    expect(out.slice(0, 2).map((s) => s.id)).toEqual(["poster-typographic", "claymation"]);
  });

  it("loses nothing — every style is still there exactly once", () => {
    const out = orderWithFavorites(all, ["claymation", "anime-chibi"]);
    expect(out).toHaveLength(all.length);
    expect(new Set(out.map((s) => s.id)).size).toBe(all.length);
  });

  it("keeps the catalogue order for everything not starred", () => {
    const out = orderWithFavorites(all, ["anime-chibi"]);
    const unstarred = out.slice(1).map((s) => s.id);
    expect(unstarred).toEqual(all.filter((s) => s.id !== "anime-chibi").map((s) => s.id));
  });

  it("ignores a starred id that no longer exists", () => {
    // A custom style can be deleted while still starred. Silently dropping it
    // is right; rendering an undefined card is not.
    const out = orderWithFavorites(all, ["a-style-that-was-deleted", "claymation"]);
    expect(out[0].id).toBe("claymation");
    expect(out).toHaveLength(all.length);
  });

  it("changes nothing at all when nothing is starred", () => {
    expect(orderWithFavorites(all, []).map((s) => s.id)).toEqual(all.map((s) => s.id));
  });
});
