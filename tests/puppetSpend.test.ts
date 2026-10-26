/**
 * The puppet maker may only spend what was approved for this puppet, priced
 * from the model catalogue. (Audit 25 Oct 2026, finding H1.)
 */
import { describe, expect, it } from "vitest";
import { chargeOrRefuse, puppetEngines, puppetRoute } from "../src/lib/puppet/pageIO";
import {
  capLeftUsd,
  fixPictures,
  headroomUsd,
  newPuppetSpend,
  partPictures,
  viewBasePictures,
  wholePuppetPictures,
} from "../src/lib/puppet/spend";
import { MODELS } from "../src/lib/engines.mjs";
import { DEFAULT_SETTINGS, normalizeSettings, type ForgeSettings } from "../src/lib/providers";

const settings = (over: Partial<ForgeSettings> = {}): ForgeSettings => normalizeSettings({ ...DEFAULT_SETTINGS, ...over });

describe("prices come from the catalogue", () => {
  it("the paid puppet engines carry the catalogue price, not a typed-in number", () => {
    const engines = puppetEngines([]);
    for (const id of ["nano-banana-2-lite", "nano-banana-2"]) {
      const eng = engines.find((e) => e.id === id)!;
      const model = MODELS.find((m) => m.id === id)!;
      expect(eng.free).toBe(false);
      expect(eng.price).toBe(model.priceUsd);
    }
  });

  it("the free engines are priced at zero", () => {
    for (const e of puppetEngines([]).filter((x) => x.free)) expect(e.price).toBe(0);
  });
});

describe("the worst case counts the fix rounds", () => {
  it("one part is three tries, and two fix rounds make it nine in all", () => {
    expect(partPictures(1)).toBe(3);
    expect(fixPictures(1)).toBe(6);
    expect(partPictures(1) + fixPictures(1)).toBe(9);
  });

  it("a whole puppet adds the faces, every view and the fixing", () => {
    const withFix = wholePuppetPictures({ frontParts: 20, views: [16, 15] });
    const without = wholePuppetPictures({ frontParts: 20, views: [16, 15], withFix: false });
    expect(without).toBe(4 + 20 * 3 + (viewBasePictures() + 16 * 3) + (viewBasePictures() + 15 * 3));
    expect(withFix).toBe(without + fixPictures(20 + 16 + 15));
    expect(withFix).toBeGreaterThan(without * 2);
  });
});

describe("pageGenerate's money gate", () => {
  const paid = { model: "nano-banana-2" };

  it("lets a free engine through with no spend object at all", () => {
    expect(() => chargeOrRefuse({ model: "cloudflare-flux2-klein" }, settings())).not.toThrow();
    expect(() => chargeOrRefuse({ model: "ovh-sdxl" }, settings())).not.toThrow();
  });

  it("lets your own machine through, whatever the model is called", () => {
    const r = puppetRoute(settings(), "local:some-model");
    expect(r.model).toBe("");
    expect(() => chargeOrRefuse({ model: r.model }, r.settings)).not.toThrow();
  });

  it("refuses a paid picture when nothing was approved", () => {
    expect(() => chargeOrRefuse(paid, settings())).toThrow(/price is unknown|unknown/);
    expect(() => chargeOrRefuse(paid, settings(), newPuppetSpend())).toThrow(/used up/);
  });

  it("counts each approved picture and stops at the approved amount", () => {
    const spend = { approvedUsd: 0.134, spentUsd: 0 };
    chargeOrRefuse(paid, settings(), spend);
    chargeOrRefuse(paid, settings(), spend);
    expect(spend.spentUsd).toBeCloseTo(0.134, 6);
    expect(() => chargeOrRefuse(paid, settings(), spend)).toThrow(/used up/);
    expect(spend.spentUsd).toBeCloseTo(0.134, 6);
  });

  it("refuses a model the catalogue cannot price on a paid engine", () => {
    expect(() => chargeOrRefuse({ model: "mystery" }, settings({ provider: "openai" }), { approvedUsd: 99, spentUsd: 0 })).toThrow(/unknown/);
  });
});

describe("the per-puppet limit", () => {
  it("defaults to zero: free engines only", () => {
    expect(DEFAULT_SETTINGS.puppetSpendCapUsd).toBe(0);
    expect(settings().puppetSpendCapUsd).toBe(0);
  });

  it("is never negative or junk", () => {
    expect(normalizeSettings({ puppetSpendCapUsd: -5 } as never).puppetSpendCapUsd).toBe(0);
    expect(normalizeSettings({ puppetSpendCapUsd: "abc" } as never).puppetSpendCapUsd).toBe(0);
    expect(normalizeSettings({ puppetSpendCapUsd: 2.5 } as never).puppetSpendCapUsd).toBe(2.5);
  });

  it("what is left is the limit minus what was already spent", () => {
    expect(capLeftUsd(2, { approvedUsd: 1, spentUsd: 0.5 })).toBeCloseTo(1.5, 6);
    expect(capLeftUsd(2, { approvedUsd: 5, spentUsd: 3 })).toBe(0);
    expect(headroomUsd({ approvedUsd: 1, spentUsd: 0.25 })).toBeCloseTo(0.75, 6);
  });
});
