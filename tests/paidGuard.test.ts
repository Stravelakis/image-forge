/**
 * Money should never leave without being asked. These pin that.
 */
import { describe, expect, it } from "vitest";
import { checkPaidRun, creditNoteFor, freeAlternativesFor, FREE_ENGINES } from "../src/lib/paidGuard";
import type { ForgeSettings } from "../src/lib/providers";
import type { ManifestRow } from "../src/types";

const DAY = 86_400_000;
const inDays = (n: number) => new Date(Date.now() + n * DAY).toISOString().slice(0, 10);

const key = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  label: id,
  key: `secret-${id}`,
  exhaustedUntil: 0,
  ...over,
});

const settings = (over: Record<string, unknown> = {}) =>
  ({
    provider: "gemini",
    geminiModel: "nano-banana-2",
    geminiImageSize: "1K",
    geminiKeys: [key("free1")],
    geminiPaidKeys: [key("paid1")],
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

describe("free engines are never gated", () => {
  it.each(["local", "cloudflare", "pollinations", "simulated"])("%s runs without asking", (provider) => {
    const c = checkPaidRun(rows(5), settings({ provider }));
    expect(c.costs).toBe(false);
    expect(c.headline).toMatch(/free/i);
  });

  it("knows the free engines by name", () => {
    for (const e of ["local", "simulated", "cloudflare", "pollinations"]) expect(FREE_ENGINES.has(e)).toBe(true);
    expect(FREE_ENGINES.has("gemini")).toBe(false);
    expect(FREE_ENGINES.has("openai")).toBe(false);
  });
});

describe("paid runs are always gated", () => {
  it("flags a Google run and totals it up", () => {
    const c = checkPaidRun(rows(4, "nano-banana-2"), settings());
    expect(c.costs).toBe(true);
    expect(c.totalUsd).toBeCloseTo(0.268, 4);
    expect(c.headline).toContain("4 pictures");
    expect(c.headline).toContain("Nano Banana 2");
  });

  it("shows the each-picture price when there is more than one", () => {
    expect(checkPaidRun(rows(3, "nano-banana-2"), settings()).headline).toMatch(/each/);
    expect(checkPaidRun(rows(1, "nano-banana-2"), settings()).headline).not.toMatch(/each/);
  });

  it("halves the total when it is a batch job, and says so", () => {
    const c = checkPaidRun(rows(4, "nano-banana-2"), settings(), { batch: true });
    expect(c.totalUsd).toBeCloseTo(0.136, 4);
    expect(c.headline).toMatch(/half-price/);
  });
});

describe("what it says about the credit", () => {
  it("counts the days left", () => {
    const note = creditNoteFor(key("k", { creditEndsOn: inDays(30), creditLabel: "tier 1 voucher" }));
    expect(note.daysLeft).toBeGreaterThanOrEqual(29);
    expect(note.expired).toBe(false);
    expect(note.endingSoon).toBe(false);
    expect(note.label).toBe("tier 1 voucher");
  });

  it("warns when a credit ends within a fortnight", () => {
    const c = checkPaidRun(rows(1, "nano-banana-2"), settings({ geminiKeys: [key("free1", { creditEndsOn: inDays(5) })] }));
    expect(c.credit?.endingSoon).toBe(true);
    expect(c.creditWarning).toMatch(/ends on/);
    // a credit is usable through the END of its last day, so "5 days ahead"
    // correctly reads as 6 days left
    expect(c.credit?.daysLeft).toBeGreaterThanOrEqual(5);
    expect(c.credit?.daysLeft).toBeLessThanOrEqual(6);
  });

  it("is blunt when the credit has already run out", () => {
    const c = checkPaidRun(rows(1, "nano-banana-2"), settings({ geminiKeys: [key("free1", { creditEndsOn: inDays(-2) })] }));
    expect(c.credit?.expired).toBe(true);
    expect(c.creditWarning).toMatch(/ran out/);
  });

  it("says one day, not one days", () => {
    const c = checkPaidRun(rows(1, "nano-banana-2"), settings({ geminiKeys: [key("free1", { creditEndsOn: inDays(1) })] }));
    expect(c.creditWarning).not.toMatch(/1 days/);
  });

  it("asks you to add a date when there is none", () => {
    expect(checkPaidRun(rows(1, "nano-banana-2"), settings()).creditWarning).toMatch(/have not said when/);
  });

  it("copes with a date that is nonsense", () => {
    const note = creditNoteFor(key("k", { creditEndsOn: "not a date" }));
    expect(note.daysLeft).toBeNull();
    expect(note.expired).toBe(false);
  });
});

describe("the free ways out", () => {
  it("offers every free engine that is set up", () => {
    const alts = freeAlternativesFor(settings());
    expect(alts.map((a) => a.id)).toEqual(["local", "cloudflare", "pollinations", "ovh"]);
  });

  it("offers only what is actually configured", () => {
    const alts = freeAlternativesFor(
      settings({ localBase: "", cloudflare: { accountId: "", token: "" }, pollinationsToken: "tok" })
    );
    expect(alts.map((a) => a.id)).toEqual(["pollinations", "ovh"]);
  });

  it("names your local model, so you know what you are switching to", () => {
    expect(freeAlternativesFor(settings())[0].label).toContain("flux.2-klein-4b");
  });

  it("still offers OVHcloud when nothing else is set up, because it needs nothing", () => {
    const alts = freeAlternativesFor(
      settings({ localBase: "", cloudflare: { accountId: "", token: "" }, pollinationsToken: "" })
    );
    expect(alts.map((a) => a.id)).toEqual(["ovh"]);
  });

  it("offers nothing when nothing free is set up and OVHcloud is paused, rather than pretending", () => {
    expect(
      freeAlternativesFor(
        settings({ localBase: "", cloudflare: { accountId: "", token: "" }, pollinationsToken: "", pausedEngines: ["ovh"] })
      )
    ).toEqual([]);
  });
});

describe("which credit gets named", () => {
  it("names the dated credit even when an undated free key comes first", () => {
    // free keys are tried first but carry no date, so naming only the first key
    // would say nothing about the credit actually being spent
    const c = checkPaidRun(
      rows(1, "nano-banana-2"),
      settings({
        geminiKeys: [key("free1")],
        geminiPaidKeys: [key("paid1", { creditEndsOn: inDays(20), creditLabel: "tier 1 voucher" })],
      })
    );
    expect(c.credit?.label).toBe("tier 1 voucher");
    expect(c.creditWarning).toContain("tier 1 voucher");
  });

  it("names the one running out soonest when several are dated", () => {
    const c = checkPaidRun(
      rows(1, "nano-banana-2"),
      settings({
        geminiKeys: [key("free1", { creditEndsOn: inDays(90), creditLabel: "the long one" })],
        geminiPaidKeys: [key("paid1", { creditEndsOn: inDays(3), creditLabel: "the urgent one" })],
      })
    );
    expect(c.credit?.label).toBe("the urgent one");
    expect(c.credit?.endingSoon).toBe(true);
  });

  it("ignores a key that is resting", () => {
    const c = checkPaidRun(
      rows(1, "nano-banana-2"),
      settings({
        geminiKeys: [key("free1", { exhaustedUntil: Date.now() + 60_000, creditEndsOn: inDays(1), creditLabel: "resting" })],
        geminiPaidKeys: [key("paid1", { creditEndsOn: inDays(40), creditLabel: "awake" })],
      })
    );
    expect(c.credit?.label).toBe("awake");
  });
});

/**
 * A queue that mixes free and paid rows.
 *
 * The `model` column routes every row on its own — that is the feature that
 * lets one batch run some pictures on Google and the rest on your own machine.
 * The dialog has to count the same way.
 *
 * It did not. The route came from rows[0] and was then applied to rows.length,
 * so a queue of two Google rows and twenty free ones announced "22 pictures on
 * Nano Banana 2 Lite" — eleven times the real number — while the total printed
 * underneath was correct. Overstating a bill is as corrosive as understating
 * one: the point of this dialog is that its number can be trusted.
 */
describe("a queue that mixes free and paid rows", () => {
  const mixed = (): ManifestRow[] => [
    ...rows(2, "nano-banana-2-lite"),
    // blank routes to whatever engine is selected; here that is the local one
    ...rows(20, "").map((r, i) => ({ ...r, id: 100 + i })),
  ];

  it("counts only the rows that are actually billed", () => {
    const c = checkPaidRun(mixed(), settings({ provider: "local" }));
    expect(c.costs).toBe(true);
    expect(c.rows).toBe(2);
    expect(c.headline).toContain("2 pictures");
    expect(c.headline).not.toContain("22 pictures");
  });

  it("charges for exactly those two and nothing else", () => {
    const c = checkPaidRun(mixed(), settings({ provider: "local" }));
    expect(c.totalUsd).toBeCloseTo(0.0336 * 2, 4);
  });

  it("says out loud that the rest are free", () => {
    const c = checkPaidRun(mixed(), settings({ provider: "local" }));
    expect(c.headline).toMatch(/other 20 are free/);
  });

  it("names the paid engine even when a free row sorts first", () => {
    // The bug in its purest form: row 0 is free, so the old code described the
    // whole run as free-engine work and priced it anyway.
    const freeFirst = [...rows(3, "").map((r, i) => ({ ...r, id: 200 + i })), ...rows(1, "nano-banana-2-lite")];
    const c = checkPaidRun(freeFirst, settings({ provider: "local" }));
    expect(c.costs).toBe(true);
    expect(c.model).toMatch(/Nano Banana 2 Lite/i);
    expect(c.rows).toBe(1);
  });

  it("still says a wholly free run is free", () => {
    const c = checkPaidRun(rows(22, ""), settings({ provider: "local" }));
    expect(c.costs).toBe(false);
    expect(c.rows).toBe(0);
    expect(c.headline).toMatch(/free/i);
  });

  it("does not mention free rows when every row is paid", () => {
    const c = checkPaidRun(rows(4, "nano-banana-2"), settings());
    expect(c.headline).not.toMatch(/are free/);
  });

  it("prices each picture at what a paid picture costs, not the queue average", () => {
    // $0.034 each is true of the two that bill. Averaging the same total over
    // all 22 rows printed "$0.0031 each" — a price no picture is ever charged.
    const c = checkPaidRun(mixed(), settings({ provider: "local" }));
    expect(c.headline).toContain("$0.034 each");
    expect(c.headline).not.toContain("$0.003 each");
  });
});
