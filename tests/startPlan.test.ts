/**
 * The Start screen: one sentence and a number in, a varied list out.
 *
 * The screen promises "describe it once, say how many, press the button".
 * These pin that it keeps that promise with or without a text engine, and
 * never leaves someone with fewer pictures than they asked for.
 */
import { describe, expect, it, vi } from "vitest";
import { MAX_START, builtInVariations, countFromText, planStart, promptsFromReply } from "../src/lib/startPlan";

const noKey = { scribe: { base: "", key: "", model: "" } } as never;
const withKey = { scribe: { base: "https://x", key: "k", model: "m" } } as never;

describe("reading a number from the sentence", () => {
  it("takes a leading number", () => {
    expect(countFromText("12 potion bottle icons")).toBe(12);
  });
  it("ignores numbers elsewhere, and silly ones", () => {
    expect(countFromText("potions for 3 heroes")).toBeNull();
    expect(countFromText("0 things")).toBeNull();
    expect(countFromText(`${MAX_START + 1} things`)).toBeNull();
  });
});

describe("variety without a text engine", () => {
  it("gives exactly as many as asked, all different", () => {
    const out = builtInVariations("12 potion icons", 12);
    expect(out).toHaveLength(12);
    expect(new Set(out).size).toBe(12);
  });

  it("removes the leading number, which a picture model would draw", () => {
    expect(builtInVariations("12 potion icons", 3).every((p) => !p.startsWith("12"))).toBe(true);
  });

  it("keeps going past its list of framings", () => {
    const out = builtInVariations("a fox", 40);
    expect(new Set(out).size).toBe(40);
  });

  it("returns the sentence alone for one picture", () => {
    expect(builtInVariations("a fox", 1)).toEqual(["a fox"]);
  });
});

describe("reading prompts back from a text engine", () => {
  it("finds the array however it is wrapped", () => {
    expect(promptsFromReply('Sure!\n```json\n["a red potion","a blue potion"]\n```', 2)).toEqual(["a red potion", "a blue potion"]);
  });
  it("gives up on anything that is not an array", () => {
    expect(promptsFromReply("no list here", 3)).toBeNull();
  });
});

describe("planning", () => {
  it("does not call a text engine that is not set up", async () => {
    const ask = vi.fn();
    const plan = await planStart("6 foxes", 6, noKey, ask);
    expect(ask).not.toHaveBeenCalled();
    expect(plan.how).toBe("built-in");
    expect(plan.prompts).toHaveLength(6);
  });

  it("uses the text engine when there is one", async () => {
    const ask = vi.fn().mockResolvedValue(JSON.stringify(["fox 1 sleeping", "fox 2 jumping", "fox 3 eating"]));
    const plan = await planStart("3 foxes", 3, withKey, ask);
    expect(plan.how).toBe("text-engine");
    expect(plan.prompts).toEqual(["fox 1 sleeping", "fox 2 jumping", "fox 3 eating"]);
  });

  it("tops up when the text engine writes too few", async () => {
    const ask = vi.fn().mockResolvedValue(JSON.stringify(["only one fox here"]));
    const plan = await planStart("5 foxes", 5, withKey, ask);
    expect(plan.prompts).toHaveLength(5);
  });

  it("falls back, and says why, when the text engine fails", async () => {
    const ask = vi.fn().mockRejectedValue(new Error("text engine 401"));
    const plan = await planStart("4 foxes", 4, withKey, ask);
    expect(plan.how).toBe("built-in");
    expect(plan.prompts).toHaveLength(4);
    expect(plan.note).toMatch(/401/);
  });

  it("never plans more than the maximum", async () => {
    const plan = await planStart("foxes", 500, noKey);
    expect(plan.prompts).toHaveLength(MAX_START);
  });
});
