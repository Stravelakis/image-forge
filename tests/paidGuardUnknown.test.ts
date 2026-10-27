/**
 * A price we do not know is not a price of zero, and Pro image models are
 * refused. (Audit 25 Oct 2026, finding C2.)
 *
 * A model name the catalogue has never heard of (typed in a table cell,
 * imported from a sheet, sent by another program) used to add $0 to the total,
 * and the run was announced as free while it spent real money.
 */
import { describe, expect, it } from "vitest";
import { checkPaidRun } from "../src/lib/paidGuard";
import { generateBytes } from "../src/lib/engines.mjs";
import type { ForgeSettings } from "../src/lib/providers";
import type { ManifestRow } from "../src/types";

const settings = (over: Record<string, unknown> = {}) =>
  ({
    provider: "gemini",
    geminiModel: "nano-banana-2",
    geminiImageSize: "1K",
    geminiKeys: [{ id: "a", label: "a", key: "secret-a", exhaustedUntil: 0 }],
    geminiPaidKeys: [],
    localBase: "http://localhost:8080/v1",
    localModel: "flux.2-klein-4b",
    localKey: "",
    cloudflare: { accountId: "acct", token: "tok" },
    cloudflareSteps: 4,
    pollinationsToken: "polli",
    pollinationsModel: "flux",
    pollinationsReferrer: "",
    openaiKeys: [],
    openaiBase: "https://api.openai.com/v1",
    openaiModel: "gpt-image-1",
    ...over,
  }) as unknown as ForgeSettings;

const rows = (n: number, model = ""): ManifestRow[] =>
  Array.from({ length: n }, (_, i) => ({ id: i, prompt: "x", aspect_ratio: "1:1", seed: 1, model }) as ManifestRow);

describe("an unknown price counts as paid", () => {
  it("flags an unknown Google model and says the price is unknown", () => {
    const c = checkPaidRun(rows(2, "gemini-9-ultra-image"), settings());
    expect(c.costs).toBe(true);
    expect(c.unknownPriceRows).toBe(2);
    expect(c.headline).toMatch(/price unknown/);
    expect(c.engine).toBe("gemini");
  });

  it("flags an unknown OpenAI-compatible model", () => {
    const c = checkPaidRun(rows(1, "some-new-image-model"), settings({ provider: "openai" }));
    expect(c.costs).toBe(true);
    expect(c.unknownPriceRows).toBe(1);
    expect(c.headline).toMatch(/price unknown/);
  });

  it("flags an unknown model typed on a row when the default engine is Google", () => {
    expect(checkPaidRun(rows(1, "mystery"), settings({ provider: "gemini" })).costs).toBe(true);
  });

  it("stays free for an unknown model on your own machine or a free engine", () => {
    expect(checkPaidRun(rows(3, "my-own-checkpoint"), settings({ provider: "local" })).costs).toBe(false);
    expect(checkPaidRun(rows(3, "@cf/some/new-model"), settings({ provider: "cloudflare" })).costs).toBe(false);
    expect(checkPaidRun(rows(3, "whatever"), settings({ provider: "pollinations" })).costs).toBe(false);
  });

  it("prices what it can and names the rest as unknown when they are mixed", () => {
    const mixed = [...rows(2, "nano-banana-2"), ...rows(1, "gemini-9-ultra-image")];
    const c = checkPaidRun(mixed, settings());
    expect(c.rows).toBe(3);
    expect(c.unknownPriceRows).toBe(1);
    expect(c.totalUsd).toBeCloseTo(0.134, 4);
    expect(c.headline).toMatch(/price unknown for the other 1/);
  });

  it("does not call a paused engine paid, because it fails before it bills", () => {
    const c = checkPaidRun(rows(2, "nano-banana-2"), settings({ pausedEngines: ["gemini"] }));
    expect(c.costs).toBe(false);
  });
});

describe("Pro image models are refused", () => {
  it.each(["gemini-3-pro-image", "nano-banana-pro", "gemini-3.0-pro-image-preview", "Gemini-Pro-Image"])(
    "the guard blocks %s",
    (model) => {
      expect(checkPaidRun(rows(1, model), settings()).blocked).toMatch(/Pro image models/);
    }
  );

  it("does not block ordinary models", () => {
    for (const m of ["nano-banana-2", "nano-banana-2-lite", "cloudflare-flux", "gemini-9-ultra-image"]) {
      expect(checkPaidRun(rows(1, m), settings()).blocked).toBeNull();
    }
  });

  it("does not catch a word that merely contains pro", () => {
    expect(checkPaidRun(rows(1, "gemini-prompt-image"), settings()).blocked).toBeNull();
  });

  it("does not block a model on your own machine that has pro in its name", () => {
    expect(checkPaidRun(rows(1, "flux-pro-local"), settings({ provider: "local" })).blocked).toBeNull();
  });

  it("generateBytes refuses before any network call, whatever the caller checked", async () => {
    for (const model of ["gemini-3-pro-image", "nano-banana-pro"]) {
      await expect(
        generateBytes(rows(1, model)[0] as never, settings() as never, undefined, () => {}, 0)
      ).rejects.toThrow(/Pro image models/);
    }
  });
});
