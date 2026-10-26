/**
 * The one door every generation goes through. These pin that a missing or
 * ignored dialog can never turn into a silent charge.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureAffordable, registerPaidAsker, resetPaidGate } from "../src/lib/paidGate";
import type { ForgeSettings } from "../src/lib/providers";
import type { ManifestRow } from "../src/types";

const settings = (over: Record<string, unknown> = {}) =>
  ({
    provider: "gemini",
    geminiModel: "nano-banana-2",
    geminiImageSize: "1K",
    geminiKeys: [{ id: "a", label: "a", key: "k", exhaustedUntil: 0 }],
    geminiPaidKeys: [],
    localBase: "",
    localModel: "",
    cloudflare: { accountId: "", token: "" },
    pollinationsToken: "",
    openaiKeys: [],
    openaiModel: "gpt-image-1",
    confirmPaidRuns: true,
    ...over,
  }) as unknown as ForgeSettings;

const rows = (n: number, model = ""): ManifestRow[] =>
  Array.from({ length: n }, (_, i) => ({ id: i, prompt: "x", aspect_ratio: "1:1", seed: 1, model }) as ManifestRow);

afterEach(() => {
  registerPaidAsker(null);
  resetPaidGate();
});

describe("ensureAffordable", () => {
  it("lets a free run through without asking", async () => {
    const ask = vi.fn();
    registerPaidAsker(ask);
    const r = await ensureAffordable(rows(3), settings({ provider: "cloudflare" }));
    expect(r.ok).toBe(true);
    expect(ask).not.toHaveBeenCalled();
  });

  it("asks before a paid run and goes ahead only on approval", async () => {
    const ask = vi.fn().mockResolvedValue({ kind: "approve" });
    registerPaidAsker(ask);
    const r = await ensureAffordable(rows(2, "nano-banana-2"), settings());
    expect(ask).toHaveBeenCalledOnce();
    expect(r.ok).toBe(true);
  });

  it("says no when the question is cancelled", async () => {
    registerPaidAsker(async () => ({ kind: "cancel" }));
    const r = await ensureAffordable(rows(2, "nano-banana-2"), settings());
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/Nothing was spent/);
  });

  it("reports a switch to a free engine, and does not approve the paid run", async () => {
    registerPaidAsker(async () => ({ kind: "free", engineId: "ovh" }));
    const r = await ensureAffordable(rows(1, "nano-banana-2"), settings());
    expect(r.ok).toBe(false);
    expect(r.useFree).toBe("ovh");
  });

  it("refuses a paid run when nobody is there to ask", async () => {
    const r = await ensureAffordable(rows(1, "nano-banana-2"), settings());
    expect(r.ok).toBe(false);
  });

  it("asks about an unknown price too", async () => {
    const ask = vi.fn().mockResolvedValue({ kind: "cancel" });
    registerPaidAsker(ask);
    await ensureAffordable(rows(1, "gemini-9-ultra-image"), settings());
    expect(ask).toHaveBeenCalledOnce();
    expect(ask.mock.calls[0][0].headline).toMatch(/price unknown/);
  });

  it("skips the question only when the owner switched it off in Settings", async () => {
    const r = await ensureAffordable(rows(1, "nano-banana-2"), settings({ confirmPaidRuns: false }));
    expect(r.ok).toBe(true);
  });

  it("refuses a Pro model even when the question is switched off", async () => {
    const r = await ensureAffordable(rows(1, "gemini-3-pro-image"), settings({ confirmPaidRuns: false }));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/Pro image models/);
  });

  it("refuses a second question while one is open", async () => {
    let release: (a: { kind: "approve" }) => void = () => {};
    registerPaidAsker(() => new Promise((res) => (release = res)));
    const first = ensureAffordable(rows(1, "nano-banana-2"), settings());
    const second = await ensureAffordable(rows(1, "nano-banana-2"), settings());
    expect(second.ok).toBe(false);
    release({ kind: "approve" });
    expect((await first).ok).toBe(true);
  });

  describe("a spending cap", () => {
    it("with a cap of $0 refuses any paid engine and never asks", async () => {
      const ask = vi.fn().mockResolvedValue({ kind: "approve" });
      registerPaidAsker(ask);
      const r = await ensureAffordable(rows(1, "nano-banana-2"), settings(), { capUsd: 0, capFor: "a puppet" });
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/switched off for a puppet/);
      expect(ask).not.toHaveBeenCalled();
    });

    it("lets a free engine through under a cap of $0", async () => {
      const r = await ensureAffordable(rows(5), settings({ provider: "cloudflare" }), { capUsd: 0 });
      expect(r.ok).toBe(true);
    });

    it("refuses when the worst case is over the cap", async () => {
      registerPaidAsker(async () => ({ kind: "approve" }));
      const r = await ensureAffordable(rows(100, "nano-banana-2"), settings(), { capUsd: 1 });
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/over your limit/);
    });

    it("asks when the worst case is under the cap", async () => {
      const ask = vi.fn().mockResolvedValue({ kind: "approve" });
      registerPaidAsker(ask);
      const r = await ensureAffordable(rows(5, "nano-banana-2"), settings(), { capUsd: 5 });
      expect(r.ok).toBe(true);
      expect(ask).toHaveBeenCalledOnce();
    });

    it("refuses an unknown price under any cap", async () => {
      const r = await ensureAffordable(rows(1, "gemini-9-ultra-image"), settings(), { capUsd: 50 });
      expect(r.ok).toBe(false);
    });
  });
});
