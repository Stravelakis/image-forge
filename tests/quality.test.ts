import { describe, expect, it } from "vitest";
import { brokenRules, factsQuestions, fixNote, panelVerdict, readAnswer, type PanelChecker } from "../src/lib/puppet/quality";
import { PUPPET_PARTS } from "../src/lib/puppet/recipe";

const part = (id: string) => PUPPET_PARTS.find((p) => p.id === id)!;
const lips = { key: { name: "magenta", hex: "#FF00FF" }, lips: true };
const noLips = { ...lips, lips: false };
// A stand-in checker: answers each single question from a table of facts.
const says = (name: string, facts: Record<string, unknown> | null): PanelChecker => ({
  name,
  answer: async (q) => {
    if (!facts) return null;
    const fq = factsQuestions(PUPPET_PARTS.find((p) => p.id === "mouth_L")!).find((x) => x.ask === q)!;
    const key = fq.key in facts ? fq.key : undefined;
    // a fact the table does not mention gets the "nothing wrong" answer
    if (key === undefined) return fq.key === "mouth_shape_pick" ? "9" : fq.key === "eyes_count_right" ? "2" : /same_|wanted_shape/.test(fq.key) ? "yes" : "no";
    return typeof facts[key] === "number" ? String(facts[key]) : facts[key] ? "yes" : "no";
  },
});

describe("the picture panel (15 Oct 2026)", () => {
  it("the rules decide, not the checker: a tongue past the teeth fails even if nothing else is wrong", () => {
    expect(brokenRules(part("mouth_L"), lips, { tongue_reaches_past_the_teeth_or_lips: true, right_mouth_is_the_wanted_shape: true })).toContain("tongue sticking out");
    expect(brokenRules(part("mouth_AH"), lips, { tongue_visible: true })).toContain("tongue showing");
    expect(brokenRules(part("mouth_OH"), lips, { tongue_visible: true })).toEqual([]);
  });

  it("lips: none on a lipless puppet; the same as the face on one with lips", () => {
    expect(brokenRules(part("mouth_EE"), noLips, { lips_drawn_right: true })).toContain("lips on a lipless puppet");
    expect(brokenRules(part("mouth_EE"), lips, { lips_drawn_left: false, lips_drawn_right: true })).toContain("lips differ from the face");
    expect(brokenRules(part("mouth_EE"), lips, { lips_drawn_left: true, lips_drawn_right: true })).toEqual([]);
  });

  it("facial hair, marks, a smile nobody asked for, a missing hand", () => {
    expect(brokenRules(part("mouth_OH"), lips, { beard_or_facial_hair_same_as_left: false })).toContain("facial hair changed");
    expect(brokenRules(part("mouth_OO"), lips, { smiling_right: true })).toContain("smile where none was asked");
    expect(brokenRules(part("mouth_SMILE"), lips, { smiling_right: true })).toEqual([]);
    expect(brokenRules(part("arms_wave"), lips, { arms_count_right: 2, hands_visible_right: 1 })).toContain("a hand missing");
    expect(brokenRules(part("brow_raised"), lips, { mouth_changed: true })).toContain("mouth changed too");
  });

  it("closed eyes are not 'looking somewhere else'", () => {
    expect(brokenRules(part("lid_closed"), lips, { eyes_look_same_direction_as_left: false })).toEqual([]);
  });

  it("what was wrong becomes the note for the next try", () => {
    expect(fixNote(["tongue sticking out", "facial hair changed"], part("mouth_L"))).toMatch(/smallest tip.*nothing added/);
  });

  it("strictest vote wins (Ak, 26 Oct 2026): one 'no' is no, a silent checker is 'maybe'", async () => {
    const clean = { right_mouth_is_the_wanted_shape: true };
    const bad = { tongue_reaches_past_the_teeth_or_lips: true };
    const v = (cs: PanelChecker[], tb?: PanelChecker) => panelVerdict(part("mouth_L"), lips, cs, tb);
    expect((await v([says("A", clean), says("B", clean)]))!.level).toBe("yes");
    expect((await v([says("A", clean), says("B", clean)], says("C", bad)))!.level).toBe("no");
    expect((await v([says("A", clean), says("B", bad)], says("C", clean)))!.ok).toBe(false);
    // one checker offline: only one looked, so not green
    expect((await v([says("A", clean), says("B", null)]))!.level).toBe("maybe");
    expect(await v([says("A", null), says("B", null)])).toBeNull();
  });
});

import { asksForFaceMarks, basePrompt, teethFor, editPrompt as editP } from "../src/lib/puppet/recipe";
describe("clean faces and the tooth protocol (16 Oct 2026)", () => {
  it("faces are clean unless the description asks for facial hair or marks", () => {
    expect(asksForFaceMarks("a bearded sea captain")).toBe(true);
    expect(asksForFaceMarks("a freckled girl")).toBe(true);
    expect(asksForFaceMarks("a cheerful baker")).toBe(false);
    expect(basePrompt({ description: "a cheerful baker", style: "pixar", framing: "head", inspirations: 0 })).toMatch(/Clean-shaven/);
    expect(basePrompt({ description: "a bearded sea captain", style: "pixar", framing: "head", inspirations: 0 })).not.toMatch(/Clean-shaven/);
  });
  it("dogs get dog teeth, and only shapes that show teeth mention them", () => {
    expect(teethFor("a scruffy dog")).toMatch(/four small pointed teeth/);
    expect(teethFor("a baker")).toMatch(/human teeth/);
    const look = { key: { name: "magenta", hex: "#FF00FF" }, lips: false, animal: true, teeth: teethFor("a dog") };
    expect(editP(PUPPET_PARTS.find((p) => p.id === "mouth_EE")!, look)).toMatch(/canines/);
    expect(editP(PUPPET_PARTS.find((p) => p.id === "mouth_OO")!, look)).not.toMatch(/teeth/i);
  });
});

describe("one plain question at a time (16 Oct 2026)", () => {
  it("every part asks single questions, each answerable with yes, no or a number", () => {
    for (const p of PUPPET_PARTS) for (const q of factsQuestions(p)) expect(q.ask).toMatch(q.number ? /number only/ : /only yes or no/);
  });
  it("reads yes, no and numbers, and ignores a model's thinking", () => {
    expect(readAnswer("Yes.")).toBe(true);
    expect(readAnswer("<think>maybe yes</think> No")).toBe(false);
    expect(readAnswer("I count 2 hands.", true)).toBe(2);
    expect(readAnswer("hard to say")).toBeUndefined();
  });
});

describe("animals have paws (16 Oct 2026)", () => {
  it("arm poses and their questions say paws for an animal", () => {
    const dog = { key: { name: "magenta", hex: "#FF00FF" }, lips: false, animal: true };
    for (const p of PUPPET_PARTS.filter((x) => x.kind === "arms")) {
      expect(editP(p, dog)).not.toMatch(/\bhands?\b|\bpalms?\b|finger/i);
      expect(factsQuestions(p, dog).map((q) => q.ask).join(" ")).not.toMatch(/\bhands?\b/i);
    }
  });
});

import { hardAnimalWhy } from "../src/lib/puppet/recipe";
describe("hard animals are experimental (18 Oct 2026)", () => {
  it("names the reason for a hard breed or animal, and nothing for an easy one", () => {
    expect(hardAnimalWhy("a white standard poodle")).toMatch(/curly/);
    expect(hardAnimalWhy("a grumpy pug")).toMatch(/flat face/);
    expect(hardAnimalWhy("a wise old owl")).toMatch(/beak/);
    expect(hardAnimalWhy("a scruffy beagle")).toBe("");
    expect(hardAnimalWhy("a cheerful baker")).toBe("");
  });
});
