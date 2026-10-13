/**
 * The puppet maker, on real pictures: an owl made by Cloudflare FLUX.2 on
 * 12 Oct 2026 (base), and two edits of it (beak open, eyes shut). No engine is
 * called here — the "engine" hands back these files.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { borderColour, cutPart, keyOut, resize, type Img } from "../src/lib/puppet/pixels";
import { buildRig, puppetSlug } from "../src/lib/puppet/rig";
import { makeParts, makeBaseOptions, pictureBudget, type MakerIO } from "../src/lib/puppet/maker";
import { basePrompt, editPrompt, partsFor, PUPPET_PARTS } from "../src/lib/puppet/recipe";

const load = (name: string): Img => {
  const png = PNG.sync.read(fs.readFileSync(path.join(__dirname, "fixtures", "puppet", `${name}.png`)));
  return { width: png.width, height: png.height, data: new Uint8ClampedArray(png.data) };
};
const base = load("owl_base");
const ah = load("owl_AH");
const blink = load("owl_blink");

describe("puppet pictures", () => {
  it("reads the background colour the model actually drew (hot pink, not #FF00FF)", () => {
    const [r, g, b] = borderColour(base);
    expect(r).toBeGreaterThan(200);
    expect(g).toBeLessThan(40);
    expect(b).toBeGreaterThan(80);
    expect(b).toBeLessThan(160);
  });

  it("keys the background out and keeps the owl", () => {
    const k = keyOut(base);
    const alpha = (x: number, y: number) => k.data[(y * k.width + x) * 4 + 3];
    expect(alpha(5, 5)).toBe(0); // corner: background
    expect(alpha(256, 300)).toBe(255); // middle of the face
  });

  it("cuts the open beak out as a small mouth part below the eyes", () => {
    const cut = cutPart(base, ah, { kind: "mouth", framing: "head" });
    expect(cut.ok).toBe(true);
    if (!cut.ok) return;
    expect(cut.boxPct).toBeLessThan(15);
    // the beak is in the middle third, below the eye line (~y 0.47 of the picture)
    expect(cut.box.y + cut.box.h / 2).toBeGreaterThan(base.height * 0.5);
    expect(Math.abs(cut.box.x + cut.box.w / 2 - base.width / 2)).toBeLessThan(base.width * 0.1);
  });

  it("cuts the closed eyes out as a lid part", () => {
    const cut = cutPart(base, blink, { kind: "lid", framing: "head" });
    expect(cut.ok).toBe(true);
    if (!cut.ok) return;
    expect(cut.box.w).toBeGreaterThan(base.width * 0.3); // both eyes
    expect(cut.box.y + cut.box.h / 2).toBeLessThan(base.height * 0.6);
  });

  it("turns down an edit that changed nothing", () => {
    const cut = cutPart(base, base, { kind: "mouth", framing: "head" });
    expect(cut).toMatchObject({ ok: false, reason: "nothing-changed" });
  });

  it("turns down a mouth that reaches over the eyes", () => {
    const cut = cutPart(base, ah, { kind: "mouth", framing: "head", eyeY: base.height * 0.9 });
    expect(cut).toMatchObject({ ok: false, reason: "over-eyes" });
  });

  it("turns down a picture that was redrawn instead of edited", () => {
    const other = { ...base, data: new Uint8ClampedArray(base.data.map((v, i) => (i % 4 === 3 ? v : 255 - v))) };
    const cut = cutPart(base, other, { kind: "mouth", framing: "head" });
    expect(cut).toMatchObject({ ok: false, reason: "redrawn" });
  });

  it("resizes to the asked size", () => {
    const r = resize(base, 100, 50);
    expect([r.width, r.height, r.data.length]).toEqual([100, 50, 100 * 50 * 4]);
  });
});

describe("the recipe", () => {
  it("has 16 face parts, and arms only when shown from the waist up", () => {
    expect(partsFor("head")).toHaveLength(16);
    expect(partsFor("waist")).toHaveLength(20);
    expect(partsFor("head").some((p) => p.kind === "arms")).toBe(false);
  });

  it("every part has a unique id the rig understands", () => {
    const ids = PUPPET_PARTS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^(mouth|lid|brow|arms)_[A-Za-z]+$/);
  });

  it("asks for a closed mouth, parallel eyes and a flat background", () => {
    const p = basePrompt({ description: "a grey owl librarian", style: "pixar", framing: "head", inspirations: 0 });
    expect(p).toMatch(/closed/i);
    expect(p).toMatch(/parallel/i);
    expect(p).toMatch(/magenta/i);
    expect(p).not.toMatch(/inspiration/i);
    expect(basePrompt({ description: "x", style: "flat", framing: "waist", inspirations: 2 })).toMatch(/ARMS AND BOTH HANDS[\s\S]*INSPIRATION ONLY/);
  });

  it("every edit says what must NOT change", () => {
    for (const p of PUPPET_PARTS) expect(editPrompt(p)).toMatch(/Change ONLY/);
  });

  it("budgets pictures honestly", () => {
    expect(pictureBudget("head")).toEqual({ best: 20, worst: 52 });
  });
});

describe("the whole run, with stand-in engines", () => {
  /** An "engine" that knows two edits and returns the base for anything else. */
  const fakeEngine = (calls: string[]): MakerIO["generate"] => async (req) => {
    calls.push(req.prompt);
    if (/saying AH/.test(req.prompt)) return ah;
    if (/fully shut/.test(req.prompt)) return blink;
    return base;
  };

  it("makes the parts it can, gives up after 3 tries on the rest, and never loops", async () => {
    const calls: string[] = [];
    const events: string[] = [];
    const res = await makeParts({ base, framing: "head", only: ["lid_closed", "mouth_AH", "mouth_EE"] }, { generate: fakeEngine(calls) }, (e) => {
      if (e.type === "part") events.push(`${e.report.id}:${e.report.status}`);
    });
    expect(Object.keys(res.parts).sort()).toEqual(["lid_closed", "mouth_AH"]);
    const ee = res.reports.find((r) => r.id === "mouth_EE")!;
    expect(ee).toMatchObject({ status: "missing", tries: 3 });
    expect(ee.why).toMatch(/unchanged/);
    // lid first (1 call), AH (1 call), EE (3 calls) — nothing more
    expect(calls).toHaveLength(5);
    expect(events[0]).toBe("lid_closed:working");
  });

  it("a checker that says no three times leaves the part flagged 'unsure', not lost", async () => {
    const res = await makeParts(
      { base, framing: "head", only: ["mouth_AH"] },
      { generate: fakeEngine([]), judge: async () => ({ ok: false, why: "looks smudged" }) },
      () => {}
    );
    expect(res.reports[0]).toMatchObject({ status: "unsure", tries: 3, why: "looks smudged" });
    expect(res.parts.mouth_AH).toBeDefined();
  });

  it("makes base options with the inspiration pictures attached", async () => {
    const seen: number[] = [];
    const out = await makeBaseOptions(
      { description: "owl", style: "pixar", framing: "head", inspirations: [base, base], count: 2 },
      { generate: async (r) => (seen.push(r.refs.length), base) },
      () => {}
    );
    expect(out).toHaveLength(2);
    expect(seen).toEqual([2, 2]);
  });

  it("builds a Video Forge puppet from the parts", async () => {
    const res = await makeParts({ base, framing: "head", only: ["lid_closed", "mouth_AH"] }, { generate: fakeEngine([]) }, () => {});
    const rig = buildRig({ name: "owl", framing: "head", base, parts: res.parts });
    expect(rig.json.mouths["1"].file).toBe("mouth_AH.png");
    expect(rig.json.eyes.lids.closed.file).toBe("lid_closed.png");
    expect(rig.json.mouths["0"].file).toBe("empty.png");
    expect(rig.json.brows.serious.left.file).toBe("empty.png"); // resting brow draws nothing
    expect(Object.keys(rig.files).sort()).toEqual(["base.png", "empty.png", "lid_closed.png", "mouth_AH.png"]);
    // head framing crops the base to a head-and-shoulders square
    const b = rig.files["base.png"];
    expect(b.width).toBe(b.height);
    expect(b.width).toBeLessThanOrEqual(base.width);
    // layer offsets stay inside the picture
    for (const l of [rig.json.mouths["1"], rig.json.eyes.lids.closed]) {
      expect(Math.abs(l.x)).toBeLessThan(0.5);
      expect(Math.abs(l.y)).toBeLessThan(0.5);
    }
    // the mouth sits below the eyes
    expect(rig.json.mouths["1"].y).toBeGreaterThan(rig.json.eyes.lids.closed.y);
    // the neck is found under the chin, so the head can nod on its own
    expect(rig.json.neck).toBeDefined();
    expect(rig.json.neck!.y).toBeGreaterThan(rig.json.mouths["1"].y + 0.5);
    expect(rig.json.neck!.y).toBeLessThan(0.95);
  });

  it("the head-and-shoulders crop keeps the top of the character (a hat, ears) in the frame", async () => {
    const res = await makeParts({ base, framing: "head", only: ["lid_closed", "mouth_AH"] }, { generate: fakeEngine([]) }, () => {});
    const rig = buildRig({ name: "owl", framing: "head", base, parts: res.parts });
    const b = rig.files["base.png"];
    // the top rows of the cropped base are empty: there is air above the head
    let firstRow = -1;
    for (let y = 0; y < b.height && firstRow < 0; y++) for (let x = 0; x < b.width; x += 2) if (b.data[(y * b.width + x) * 4 + 3] > 40) { firstRow = y; break; }
    expect(firstRow).toBeGreaterThan(0);
  });

  it("makes safe file names", () => {
    expect(puppetSlug("Κυρία Κουκουβάγια")).toMatch(/^puppet-|^[a-z0-9-]+$/);
    expect(puppetSlug("Olive the Owl!")).toBe("olive-the-owl");
  });
});
