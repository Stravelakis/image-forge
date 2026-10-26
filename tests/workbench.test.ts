import { describe, expect, it } from "vitest";
import {
  acceptBlockers, acceptGroup, dirtyIds, draftOf, filterCounts, filterRows, groupInfos, groupOf, keyAction, levelKey, moveFocus,
  paddedBox, partLevel, redoNote, rowsOf, submitPage, toggleMark, triesFor, typingTarget, unacceptGroup, unionBox, type Draft,
} from "../src/lib/puppet/workbench";
import { markedParts, type WorkshopMeta } from "../src/lib/puppet/workshop";
import type { TryRecord } from "../src/lib/puppet/maker";

const box = { x: 100, y: 200, w: 80, h: 40 };
const rep = (id: string, status: "ok" | "unsure" | "missing" = "ok", more = {}) => ({ id, label: id, status, tries: 1, why: "", ...more });
const meta = (): WorkshopMeta => ({
  v: 1, slug: "owl", name: "Owl", description: "", style: "pixar", framing: "waist", look: { key: { name: "magenta", hex: "#FF00FF" }, lips: true },
  faceEngine: "a", partEngine: "b", createdAt: "", updatedAt: "", status: "review",
  reports: [rep("mouth_AH"), rep("mouth_EE", "unsure"), rep("mouth_OH", "missing"), rep("lid_closed"), rep("brow_happy"), rep("side_mouth_AH"), rep("sit_arms_wave")],
  boxes: { mouth_AH: box, mouth_EE: box, mouth_OH: box, lid_closed: box, brow_happy: box, side_mouth_AH: box, sit_arms_wave: box },
});
const t = (part: string, n: number, level: TryRecord["level"], at = `2026-10-26T10:0${n}:00Z`): TryRecord => ({ part, try: n, at, prompt: "p", negative: "n", seed: n, cut: "ok", level, why: "" });
const TRIES = [t("mouth_AH", 2, "yes"), t("mouth_AH", 1, "no"), t("mouth_EE", 1, "yes"), t("lid_closed", 1, null), t("brow_happy", 1, "maybe")];

describe("groups", () => {
  it("puts parts on their pages, views on their own", () => {
    expect(groupOf("mouth_AH")).toBe("mouths");
    expect(groupOf("lid_wide")).toBe("lids");
    expect(groupOf("brow_raised")).toBe("brows");
    expect(groupOf("arms_wave")).toBe("arms");
    expect(groupOf("side_mouth_AH")).toBe("side");
    expect(groupOf("sit_arms_wave")).toBe("sit");
  });
});

describe("levels: not checked is never green", () => {
  it("takes the last try's level, in time order", () => {
    expect(triesFor(TRIES, "mouth_AH").map((x) => x.try)).toEqual([1, 2]);
    expect(partLevel(rep("mouth_AH"), triesFor(TRIES, "mouth_AH"))).toBe("yes");
  });
  it("no try or no checker is grey, a missing part is red, an unsure part is never green", () => {
    expect(levelKey(partLevel(rep("x"), []))).toBe("none");
    expect(levelKey(partLevel(rep("lid_closed"), triesFor(TRIES, "lid_closed")))).toBe("none");
    expect(partLevel(rep("m", "missing"), [t("m", 1, "yes")])).toBe("no");
    expect(partLevel(rep("m", "unsure"), [t("m", 1, "yes")])).toBe("maybe");
  });
});

describe("rows, filters, counts", () => {
  const rows = rowsOf(meta(), TRIES);
  it("lists every part once, in page order", () => {
    expect(rows.map((r) => r.id)).toEqual(["mouth_AH", "mouth_EE", "mouth_OH", "lid_closed", "brow_happy", "side_mouth_AH", "sit_arms_wave"]);
  });
  it("counts per filter", () => {
    // mouth_EE is unsure (capped at maybe), brow_happy maybe, mouth_OH missing = no
    expect(filterCounts(rows)).toEqual({ all: 7, needs: 7, maybe: 2, no: 1, accepted: 0 });
  });
  it("accepted parts leave the other filters", () => {
    const r = rowsOf(acceptGroup(meta(), "mouths"), TRIES);
    expect(filterRows(r, "accepted").map((x) => x.id)).toEqual(["mouth_AH", "mouth_EE", "mouth_OH"]);
    expect(filterRows(r, "no")).toEqual([]);
  });
  it("group info counts what the filter shows", () => {
    const g = groupInfos(rows, "maybe");
    expect(g.find((x) => x.id === "mouths")).toMatchObject({ total: 3, accepted: 0, shown: 1, done: false });
    expect(g.map((x) => x.id)).toEqual(["mouths", "lids", "brows", "side", "sit"]);
  });
});

describe("marks", () => {
  it("has three states: unmarked, ok, bad", () => {
    let r = toggleMark({}, "mouth", "ok");
    expect(r).toEqual({ mouth: "ok" });
    r = toggleMark(r, "mouth", "bad");
    expect(r).toEqual({ mouth: "bad" });
    r = toggleMark(r, "mouth", "bad");
    expect(r).toEqual({});
  });
});

describe("submit the page", () => {
  const draft = (over: Partial<Draft>): Draft => ({ regions: {}, note: "", remake: false, ...over });
  const ids = ["mouth_AH", "mouth_EE", "mouth_OH"];
  it("saves marks and notes and sends bad parts back with the note", () => {
    const m = submitPage(meta(), { mouth_AH: draft({ regions: { mouth: "bad", eyes: "ok" }, note: "less tongue" }), mouth_EE: draft({ regions: { mouth: "ok" } }) }, ids, "NOW");
    expect(m.marks?.mouth_AH).toEqual({ regions: { mouth: "bad", eyes: "ok" }, note: "less tongue", at: "NOW" });
    expect(m.marks?.mouth_EE?.regions).toEqual({ mouth: "ok" });
    const ah = m.reports.find((r) => r.id === "mouth_AH")!;
    expect(ah.redo).toBe(true);
    expect(ah.note).toBe("less tongue Problem areas: mouth.");
    expect(m.reports.find((r) => r.id === "mouth_EE")!.redo).toBeFalsy();
    expect(markedParts(m).map((r) => r.id)).toEqual(["mouth_AH"]);
  });
  it("a ticked remake without marks is sent back with just the note", () => {
    const m = submitPage(meta(), { mouth_OH: draft({ remake: true, note: "closer to the original" }) }, ids, "NOW");
    expect(markedParts(m).map((r) => [r.id, r.note])).toEqual([["mouth_OH", "closer to the original"]]);
  });
  it("only touches the ids on this page", () => {
    const m = submitPage(meta(), { lid_closed: draft({ remake: true }) }, ids, "NOW");
    expect(markedParts(m)).toEqual([]);
  });
  it("clearing everything removes the record and the remake request", () => {
    const first = submitPage(meta(), { mouth_AH: draft({ remake: true, regions: { mouth: "bad" } }) }, ids, "NOW");
    const again = submitPage(first, { mouth_AH: draft({}) }, ids, "LATER");
    expect(again.marks?.mouth_AH).toBeUndefined();
    expect(markedParts(again)).toEqual([]);
  });
  it("sending a part back takes its acceptance away", () => {
    const m = submitPage(acceptGroup(meta(), "mouths"), { mouth_AH: draft({ remake: true }) }, ids, "NOW");
    expect(m.reports.find((r) => r.id === "mouth_AH")!.approved).toBe(false);
    expect(m.acceptedGroups).not.toContain("mouths");
  });
  it("knows what has changed since the last save", () => {
    const m = submitPage(meta(), { mouth_AH: draft({ regions: { mouth: "ok" } }) }, ids, "NOW");
    expect(dirtyIds(m, { mouth_AH: draftOf(m, "mouth_AH") }, ids)).toEqual([]);
    expect(dirtyIds(m, { mouth_AH: draft({ regions: { mouth: "bad" } }) }, ids)).toEqual(["mouth_AH"]);
  });
  it("builds the redo note", () => {
    expect(redoNote(draft({ regions: { eyes: "bad", ears: "bad" } }))).toBe("Problem areas: eyes, ears.");
    expect(redoNote(draft({}))).toBeUndefined();
  });
});

describe("accept a group", () => {
  it("approves every part of the group together and nothing else", () => {
    const m = acceptGroup(meta(), "mouths");
    expect(m.reports.filter((r) => r.approved).map((r) => r.id)).toEqual(["mouth_AH", "mouth_EE", "mouth_OH"]);
    expect(m.acceptedGroups).toEqual(["mouths"]);
    expect(unacceptGroup(m, "mouths").reports.some((r) => r.approved)).toBe(false);
  });
  it("drops remake requests inside the group", () => {
    const sent = submitPage(meta(), { mouth_AH: { regions: {}, note: "x", remake: true } }, ["mouth_AH"], "N");
    expect(markedParts(acceptGroup(sent, "mouths"))).toEqual([]);
  });
  it("warns about red and marked-wrong parts first", () => {
    const rows = rowsOf(meta(), TRIES);
    expect(acceptBlockers(rows, {}, "mouths").map((r) => r.id)).toEqual(["mouth_OH"]);
    expect(acceptBlockers(rows, { mouth_AH: { regions: { eyes: "bad" }, note: "", remake: false } }, "mouths").map((r) => r.id)).toEqual(["mouth_AH", "mouth_OH"]);
  });
});

describe("zoom boxes", () => {
  it("pads inside the picture", () => {
    expect(paddedBox({ x: 10, y: 10, w: 100, h: 40 }, 512, 512, 0.5)).toEqual({ x: 0, y: 0, w: 160, h: 70 });
    expect(paddedBox({ x: 460, y: 480, w: 50, h: 30 }, 512, 512, 1)).toEqual({ x: 410, y: 450, w: 102, h: 62 });
  });
  it("one box holds them all", () => {
    expect(unionBox([{ x: 10, y: 20, w: 10, h: 10 }, { x: 40, y: 5, w: 10, h: 10 }])).toEqual({ x: 10, y: 5, w: 40, h: 25 });
    expect(unionBox([])).toBeNull();
  });
});

describe("keyboard", () => {
  it("maps keys", () => {
    expect(keyAction("ArrowRight")).toEqual({ type: "move", part: 1 });
    expect(keyAction("ArrowUp")).toEqual({ type: "move", region: -1 });
    expect(keyAction("y")).toEqual({ type: "mark", mark: "ok" });
    expect(keyAction("n")).toEqual({ type: "mark", mark: "bad" });
    expect(keyAction("0")).toEqual({ type: "mark", mark: "clear" });
    expect(keyAction("Enter")).toEqual({ type: "submit" });
    expect(keyAction("c", { ctrl: true })).toEqual({ type: "none" });
  });
  it("stays on the page", () => {
    expect(moveFocus({ part: 0, region: 0 }, { type: "move", part: -1 }, 3)).toEqual({ part: 0, region: 0 });
    expect(moveFocus({ part: 2, region: 7 }, { type: "move", part: 1, region: 1 }, 3)).toEqual({ part: 2, region: 7 });
    expect(moveFocus({ part: 1, region: 2 }, { type: "move", region: 1 }, 3)).toEqual({ part: 1, region: 3 });
  });
  it("leaves typing alone", () => {
    expect(typingTarget({ tagName: "TEXTAREA" })).toBe(true);
    expect(typingTarget({ tagName: "BUTTON" })).toBe(false);
    expect(typingTarget(null)).toBe(false);
  });
});
