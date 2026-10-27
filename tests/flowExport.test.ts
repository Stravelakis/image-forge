import { describe, expect, it } from "vitest";
import { jobsFromRows, jobsFromTries, safeJobName, toFlowJobs } from "../src/lib/flowExport";
import type { ManifestRow } from "../src/types";
import type { TryRecord } from "../src/lib/puppet/maker";

const row = (over: Partial<ManifestRow> = {}): ManifestRow => ({
  id: 1,
  filename: "shop_bakery.png",
  prompt: "a warm bakery",
  category: "shop",
  item_id: "",
  shop_id: "bakery",
  event_id: "",
  style: "claymation",
  aspect_ratio: "16:9",
  seed: 42,
  model: "flux",
  status: "done",
  error: "",
  generated_at: "",
  imported_attachment_id: "",
  ...over,
});

const tryRec = (over: Partial<TryRecord> = {}): TryRecord => ({
  part: "mouth-open",
  try: 2,
  at: "2026-10-26T10:00:00Z",
  engine: "nb2.1",
  prompt: "Edit only the mouth.",
  negative: "extra teeth",
  seed: 7,
  cut: "ok",
  level: "yes",
  why: "clean",
  ...over,
});

describe("safeJobName", () => {
  it("drops the extension and unsafe characters", () => {
    expect(safeJobName("shop bakery/x.png")).toBe("shop_bakery_x");
  });
  it("never returns an empty name", () => {
    expect(safeJobName("...")).toBe("picture");
    expect(safeJobName("")).toBe("picture");
  });
});

describe("jobsFromRows", () => {
  it("turns a row into a job and keeps only what is filled in", () => {
    const [j] = jobsFromRows([row()]);
    expect(j).toEqual({ name: "shop_bakery", prompt: "a warm bakery", aspect: "16:9", style: "claymation", refs: [] });
  });
  it("carries the negative prompt and the note", () => {
    const [j] = jobsFromRows([row({ negative_prompt: " blurry ", note: "make it warmer" })]);
    expect(j.negative).toBe("blurry");
    expect(j.notes).toBe("make it warmer");
  });
  it("skips rows without a prompt", () => {
    expect(jobsFromRows([row({ prompt: "  " })])).toEqual([]);
  });
  it("gives repeated file names a number so nothing is overwritten", () => {
    const names = jobsFromRows([row({ id: 1 }), row({ id: 2 }), row({ id: 3, filename: "other.png" })]).map((j) => j.name);
    expect(names).toEqual(["shop_bakery", "shop_bakery_2", "other"]);
  });
});

describe("jobsFromTries", () => {
  it("names a try after its part and try number", () => {
    const [j] = jobsFromTries([tryRec()]);
    expect(j.name).toBe("mouth-open_try2");
    expect(j.prompt).toBe("Edit only the mouth.");
    expect(j.negative).toBe("extra teeth");
    expect(j.aspect).toBe("1:1");
    expect(j.notes).toContain("nb2.1");
  });
  it("adds the prefix and the reference file names (folders dropped)", () => {
    const [j] = jobsFromTries([tryRec()], { prefix: "Maria the Baker", refs: ["C:\\pics\\base.png", "face.png"] });
    expect(j.name).toBe("Maria_the_Baker_mouth-open_try2");
    expect(j.refs).toEqual(["base.png", "face.png"]);
  });
  it("says why a cut failed in the notes", () => {
    const [j] = jobsFromTries([tryRec({ cut: "mouth not found" })]);
    expect(j.notes).toContain("mouth not found");
  });
});

describe("toFlowJobs", () => {
  const now = new Date("2026-10-26T12:00:00Z");
  it("writes the versioned header", () => {
    const f = toFlowJobs({ rows: [row()], now, source: "test" });
    expect(f).toMatchObject({ format: "flow-jobs", version: 1, made: "2026-10-26T12:00:00.000Z", source: "test" });
    expect(f.jobs).toHaveLength(1);
  });
  it("joins rows and tries, and keeps names unique across both", () => {
    const f = toFlowJobs({ rows: [row({ filename: "mouth-open_try2.png" })], tries: [tryRec()], now });
    expect(f.jobs.map((j) => j.name)).toEqual(["mouth-open_try2", "mouth-open_try2_2"]);
  });
  it("survives a round trip through JSON", () => {
    const f = toFlowJobs({ rows: [row()], tries: [tryRec()], now });
    expect(JSON.parse(JSON.stringify(f))).toEqual(f);
  });
  it("an empty input gives an empty list, still a valid file", () => {
    expect(toFlowJobs({ now }).jobs).toEqual([]);
  });
});
