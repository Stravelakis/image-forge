import { describe, expect, it } from "vitest";
import { brokenRules, fixNote, panelVerdict, type PanelChecker } from "../src/lib/puppet/quality";
import { PUPPET_PARTS } from "../src/lib/puppet/recipe";

const part = (id: string) => PUPPET_PARTS.find((p) => p.id === id)!;
const lips = { key: { name: "magenta", hex: "#FF00FF" }, lips: true };
const noLips = { ...lips, lips: false };
const says = (name: string, facts: Record<string, unknown> | null): PanelChecker => ({ name, facts: async () => facts });

describe("the picture panel (15 Oct 2026)", () => {
  it("the rules decide, not the checker: a tongue past the teeth fails even if nothing else is wrong", () => {
    expect(brokenRules(part("mouth_L"), lips, { tongue_reaches_past_the_teeth_or_lips: true, mouth_matches_wanted_shape: true })).toContain("tongue sticking out");
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
    expect(fixNote(["tongue sticking out", "facial hair changed"], part("mouth_L"))).toMatch(/tongue stays inside.*beard/);
  });

  it("green needs two clean checkers; a split asks the third", async () => {
    const clean = { mouth_matches_wanted_shape: true };
    const bad = { tongue_reaches_past_the_teeth_or_lips: true };
    expect((await panelVerdict(part("mouth_L"), lips, [says("A", clean), says("B", clean)]))!.ok).toBe(true);
    expect((await panelVerdict(part("mouth_L"), lips, [says("A", bad), says("B", bad)], says("C", clean)))!.ok).toBe(false);
    expect((await panelVerdict(part("mouth_L"), lips, [says("A", clean), says("B", bad)], says("C", clean)))!.ok).toBe(true);
    expect((await panelVerdict(part("mouth_L"), lips, [says("A", clean), says("B", bad)], says("C", bad)))!.ok).toBe(false);
    // one checker silent and no third: not green
    expect((await panelVerdict(part("mouth_L"), lips, [says("A", clean), says("B", null)]))!.ok).toBe(false);
    expect(await panelVerdict(part("mouth_L"), lips, [says("A", null), says("B", null)])).toBeNull();
  });
});
