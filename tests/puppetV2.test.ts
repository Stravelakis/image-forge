/**
 * Prompt regime v2, the strictest vote, the free pixel checks and the try
 * records (Phase 1 of the ultra plan, 26 Oct 2026). No engine is called: the
 * owl pictures from tests/fixtures/puppet stand in for one.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { borderColour, cutPart, pixelChecks, type Img } from "../src/lib/puppet/pixels";
import { makeParts, type MakerEvent, type TryRecord } from "../src/lib/puppet/maker";
import { basePrompt, editNegative, editPrompt, eyeWords, factsSentence, KEEP_EXACTLY, PUPPET_PARTS, type PuppetLook } from "../src/lib/puppet/recipe";
import { brokenRules, factsQuestions, isSoft, panelVerdict, type PanelChecker } from "../src/lib/puppet/quality";

const load = (name: string): Img => {
  const png = PNG.sync.read(fs.readFileSync(path.join(__dirname, "fixtures", "puppet", `${name}.png`)));
  return { width: png.width, height: png.height, data: new Uint8ClampedArray(png.data) };
};
const base = load("owl_base");
const ah = load("owl_AH");
const blink = load("owl_blink");
const part = (id: string) => PUPPET_PARTS.find((p) => p.id === id)!;
const look: PuppetLook = { key: { name: "magenta", hex: "#FF00FF" }, lips: false };
const blip: PuppetLook = { ...look, facts: { species: "a small round robot", eyes: 1, colours: ["teal body (#1fa4a0)"], oneSided: ["a dent on the viewer's left cheek"], never: ["antenna"] } };

describe("prompt regime v2 (#51)", () => {
  it("a one-eyed character never hears 'both eyes' — the Blip bug", () => {
    for (const p of PUPPET_PARTS) expect(editPrompt(p, blip)).not.toMatch(/both (upper )?eye|both lines of sight|the two lines/i);
    expect(basePrompt({ description: "a small round robot", style: "flat", framing: "head", inspirations: 0, look: blip })).not.toMatch(/both eyes|PARALLEL/);
    expect(editPrompt(part("lid_closed"), blip)).toMatch(/the upper eyelid/);
  });
  it("two eyes stay exactly as before, three or more say 'all'", () => {
    const t = "Lower both upper eyelids; both eyes look ahead.";
    expect(eyeWords(t, 2)).toBe(t);
    expect(eyeWords(t, 3)).toBe("Lower every upper eyelid; all 3 eyes look ahead.");
  });
  it("every edit carries the facts sheet, its region first and its keep-exactly list", () => {
    for (const p of PUPPET_PARTS) {
      const t = editPrompt(p, blip);
      expect(t).toMatch(/^Edit only the /);
      expect(t).toMatch(/exactly ONE eye/);
      expect(t).toMatch(/on one side only: a dent on the viewer's left cheek/);
      expect(t).toMatch(/Keep exactly as in the original: /);
    }
    expect(KEEP_EXACTLY.mouth).toContain("the eyebrows");
  });
  it("the 'never' list goes to the things to avoid, never into the request", () => {
    expect(editNegative(blip)).toMatch(/antenna/);
    for (const p of PUPPET_PARTS) expect(editPrompt(p, blip)).not.toMatch(/antenna/);
  });
  it("no facts sheet = no facts sentence", () => {
    expect(factsSentence(look)).toBe("");
    expect(editPrompt(part("mouth_AH"), look)).not.toMatch(/Facts about/);
  });
});

/** A stand-in checker: answers every question from a table, else the "nothing wrong" answer. */
const says = (name: string, p: string, facts: Record<string, unknown> | null, l: PuppetLook = look): PanelChecker => ({
  name,
  answer: async (q) => {
    if (!facts) return null;
    const fq = factsQuestions(part(p), l).find((x) => x.ask === q)!;
    if (fq.key in facts) return facts[fq.key] === undefined ? "hard to say" : String(facts[fq.key] === true ? "yes" : facts[fq.key] === false ? "no" : facts[fq.key]);
    if (fq.key === "mouth_shape_pick") return "4";
    if (fq.key === "eyes_count_right") return String(l.facts?.eyes ?? 2);
    return /same_|wanted_shape|wanted_change/.test(fq.key) ? "yes" : "no";
  },
});

describe("the strictest vote (#12)", () => {
  it("all clean and at least two looked = yes", async () => {
    const v = await panelVerdict(part("mouth_AH"), look, [says("A", "mouth_AH", {}), says("B", "mouth_AH", {}), says("C", "mouth_AH", {})]);
    expect(v).toMatchObject({ ok: true, level: "yes" });
  });
  it("one 'no' among three is no", async () => {
    const v = await panelVerdict(part("mouth_AH"), look, [says("A", "mouth_AH", {}), says("B", "mouth_AH", {}), says("C", "mouth_AH", { tongue_visible: true })]);
    expect(v).toMatchObject({ ok: false, level: "no" });
    expect(v!.votes).toBe("A ✓ · B ✓ · C ✗");
  });
  it("an unanswered question is never yes: maybe", async () => {
    const v = await panelVerdict(part("mouth_AH"), look, [says("A", "mouth_AH", {}), says("B", "mouth_AH", { tongue_visible: undefined })]);
    expect(v!.level).toBe("maybe");
    expect(v!.why).toMatch(/B could not answer 1 question/);
  });
  it("picking another shape is a 'maybe no', not a veto", async () => {
    const v = await panelVerdict(part("mouth_AH"), look, [says("A", "mouth_AH", {}), says("B", "mouth_AH", { mouth_shape_pick: 6 })]);
    expect(v!.level).toBe("maybe");
    expect(v!.reasons.some(isSoft)).toBe(true);
  });
  it("the wrong number of eyes is a fault, read against the facts sheet", () => {
    expect(brokenRules(part("lid_half"), blip, { eyes_count_right: 2 })).toContain("2 eyes, should be 1");
    expect(brokenRules(part("lid_half"), blip, { eyes_count_right: 1 })).toEqual([]);
    expect(brokenRules(part("lid_half"), look, { eyes_count_right: 2 })).toEqual([]);
  });
  it("every checker's facts are kept for the record", async () => {
    const v = await panelVerdict(part("mouth_AH"), look, [says("A", "mouth_AH", {}), says("B", "mouth_AH", null)]);
    expect(v!.detail.map((d) => [d.name, !!d.facts])).toEqual([["A", true], ["B", false]]);
    expect(v!.level).toBe("maybe"); // only one could look
  });
});

describe("free pixel checks (#12)", () => {
  const cut = cutPart(base, ah, { kind: "mouth", framing: "head" });
  if (!cut.ok) throw new Error("fixture cut failed");
  it("a clean edit passes them", () => {
    expect(pixelChecks(base, ah, cut, "mouth")).toEqual([]);
  });
  it("a character that moved is caught", () => {
    const moved: Img = { width: ah.width, height: ah.height, data: new Uint8ClampedArray(ah.data.length) };
    const bg = borderColour(base);
    for (let i = 0; i < moved.data.length; i += 4) moved.data.set([...bg, 255], i);
    const dx = 12;
    for (let y = 0; y < ah.height; y++) moved.data.set(ah.data.subarray(y * ah.width * 4, (y * ah.width + ah.width - dx) * 4), (y * ah.width + dx) * 4);
    expect(pixelChecks(base, moved, cut, "mouth").join(" ")).toMatch(/moved/);
  });
  it("background colour left on the cut edge is caught", () => {
    const keyed = { ...cut.keyed, data: new Uint8ClampedArray(cut.keyed.data) };
    const bg = borderColour(base);
    for (let i = 0; i < keyed.data.length; i += 4 * 20) keyed.data.set([...bg, 255], i);
    expect(pixelChecks(base, ah, { box: cut.box, keyed }, "mouth").join(" ")).toMatch(/background colour left/);
  });
});

describe("every try kept, and 'not checked' is never green (#11, #12)", () => {
  const engine = async (req: { prompt: string }) => (/relaxed oval, the opening about half/.test(req.prompt) ? ah : /fully shut/.test(req.prompt) ? blink : base);
  it("each try is recorded with its prompt, things to avoid, seed and engine", async () => {
    const tries: TryRecord[] = [];
    await makeParts({ base, framing: "head", only: ["mouth_AH", "mouth_EE"], look: blip }, { generate: engine, engine: "stand-in" }, (e: MakerEvent) => {
      if (e.type === "try") tries.push(e.record);
    });
    expect(tries.filter((t) => t.part === "mouth_AH")).toHaveLength(1);
    expect(tries.filter((t) => t.part === "mouth_EE")).toHaveLength(3); // unchanged pictures, three tries
    expect(tries[0]).toMatchObject({ part: "mouth_AH", try: 1, engine: "stand-in", cut: "ok", level: null });
    expect(tries[0].prompt).toMatch(/exactly ONE eye/);
    expect(tries[0].negative).toMatch(/antenna/);
    expect(tries.find((t) => t.part === "mouth_EE")!.cut).toMatch(/unchanged/);
  });
  it("with no checker at all, a kept part waits for you as 'unsure'", async () => {
    const res = await makeParts({ base, framing: "head", only: ["mouth_AH"] }, { generate: engine }, () => {});
    expect(res.reports[0]).toMatchObject({ status: "unsure" });
    expect(res.reports[0].why).toMatch(/not checked/);
    expect(res.parts.mouth_AH).toBeDefined();
  });
  it("a green from the panel stays green only if the pixel checks agree", async () => {
    const inspect = async () => ({ ok: true, level: "yes" as const, why: "green", reasons: [], votes: "A ✓ · B ✓", detail: [] });
    const res = await makeParts({ base, framing: "head", only: ["mouth_AH"] }, { generate: engine, inspect }, () => {});
    expect(res.reports[0].status).toBe("ok");
  });
});
