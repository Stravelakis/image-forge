/**
 * DEV ONLY (`npm run dev`, then ?demo=workbench): the review workbench on a
 * made-up owl puppet, so the page can be seen without the desktop app. The
 * pictures are the owl fixtures in tests/fixtures/puppet; every record below is
 * sample data, not a real puppet. Not part of the built app (main.tsx loads it
 * only when import.meta.env.DEV).
 */
import { useMemo, useState } from "react";
import baseUrl from "../../tests/fixtures/puppet/owl_base.png?url";
import ahUrl from "../../tests/fixtures/puppet/owl_AH.png?url";
import blinkUrl from "../../tests/fixtures/puppet/owl_blink.png?url";
import PuppetWorkbench, { type WorkbenchIO } from "../components/PuppetWorkbench";
import { TipLayer } from "../components/TipLayer";
import type { TryRecord } from "../lib/puppet/maker";
import type { WorkshopMeta, PartReview } from "../lib/puppet/workshop";
import { DEFAULT_LOOK, EDIT_NEGATIVE, PUPPET_PARTS, editPrompt } from "../lib/puppet/recipe";

const B = {
  mouth: { x: 205, y: 240, w: 100, h: 115 },
  lid: { x: 130, y: 185, w: 250, h: 100 },
  brow: { x: 120, y: 130, w: 280, h: 75 },
  arms: { x: 40, y: 320, w: 430, h: 192 },
};
const ids = ["mouth_AH", "mouth_EE", "mouth_OH", "mouth_OO", "mouth_FV", "mouth_L", "mouth_SMILE", "lid_closed", "lid_half", "lid_wide", "brow_happy", "brow_serious", "brow_raised", "arms_wave", "arms_shrug", "side_mouth_AH", "side_mouth_EE", "side_brow_happy", "sit_arms_wave"];
const bare = (id: string) => id.replace(/^(side|sit)_/, "");
const kindBox = (id: string) => (/mouth_/.test(id) ? B.mouth : /lid_/.test(id) ? B.lid : /brow_/.test(id) ? B.brow : B.arms);
const labelOf = (id: string) => PUPPET_PARTS.find((p) => p.id === bare(id))?.label ?? id;
const LEVELS: Record<string, "yes" | "maybe" | "no" | null> = { mouth_AH: "yes", mouth_EE: "maybe", mouth_OH: "no", mouth_OO: "yes", mouth_FV: "maybe", mouth_L: null, mouth_SMILE: "yes", lid_closed: "yes", lid_half: "maybe", lid_wide: null, brow_happy: "yes", brow_serious: "no", brow_raised: "maybe", arms_wave: "maybe", arms_shrug: "no" };

const AT = (n: number) => new Date(Date.UTC(2026, 9, 26, 9, n)).toISOString();
const tryOf = (id: string, n: number, level: TryRecord["level"], at: string): TryRecord => {
  const part = PUPPET_PARTS.find((p) => p.id === bare(id))!;
  return {
    part: id, try: n, at, engine: "Nano Banana 2 (demo)", prompt: editPrompt(part, DEFAULT_LOOK), negative: EDIT_NEGATIVE, seed: 104729 + n * 7919,
    cut: n === 1 && level === "no" ? "the change is in the wrong place — the mouth moved above the eyes" : "ok", level,
    why: level === "yes" ? "" : level === "maybe" ? "C2 could not answer 2 questions" : level === "no" ? "tongue sticking out past the teeth" : "",
    votes: level === null ? undefined : level === "yes" ? "C1 ✓ · C2 ✓ · C3 ✓" : level === "maybe" ? "C1 ✓ · C2 ? · C3 ✓" : "C1 ✗ · C2 ✓ · C3 –",
    checkers: level === null ? undefined : [
      { name: "C1", facts: { ok: true }, faults: level === "no" ? ["tongue sticks out past the teeth"] : [], unanswered: [] },
      { name: "C2", facts: { ok: true }, faults: level === "maybe" ? ["~mouth may be a little wide"] : [], unanswered: level === "maybe" ? ["lips_drawn_right", "skin_marks_same_as_left"] : [] },
      { name: "C3", facts: level === "no" ? null : { ok: true }, faults: [], unanswered: [] },
    ],
    pixels: level === "no" ? ["2.1% of the picture changed outside the box", "a speck of background colour near the beak"] : n === 1 ? ["nothing changed outside the box"] : undefined,
  };
};
const tries: TryRecord[] = ids.flatMap((id) => {
  const end = LEVELS[bare(id)] ?? "yes";
  if (end === null) return [];
  return end === "no" ? [tryOf(id, 1, "no", AT(1)), tryOf(id, 2, "maybe", AT(2)), tryOf(id, 3, "no", AT(3))] : end === "maybe" ? [tryOf(id, 1, "no", AT(4)), tryOf(id, 2, "maybe", AT(5))] : [tryOf(id, 1, end, AT(6))];
});

const meta0 = (): WorkshopMeta => ({
  v: 1, slug: "demo-owl", name: "Professor Owl (sample)", description: "an owl in a green cardigan", style: "pixar", framing: "waist", look: DEFAULT_LOOK,
  faceEngine: "demo", partEngine: "demo", createdAt: AT(0), updatedAt: AT(0), status: "review",
  reports: ids.map((id): PartReview => {
    const lv = LEVELS[bare(id)];
    return { id, label: labelOf(id), status: bare(id) === "mouth_OH" ? "missing" : lv === "no" || lv === "maybe" ? "unsure" : "ok", tries: tries.filter((t) => t.part === id).length, why: "" };
  }),
  boxes: Object.fromEntries(ids.map((id) => [id, kindBox(id)])),
  views: ["side", "sit"],
});

function cropUrl(src: string, box: { x: number; y: number; w: number; h: number }): Promise<string> {
  return new Promise((res) => {
    const im = new Image();
    im.onload = () => {
      const c = document.createElement("canvas");
      c.width = box.w;
      c.height = box.h;
      c.getContext("2d")!.drawImage(im, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
      res(c.toDataURL("image/png"));
    };
    im.src = src;
  });
}

const sourceFor = (id: string) => (/lid_/.test(id) ? blinkUrl : /mouth_/.test(id) && !/_(OH|FV)$/.test(id) ? ahUrl : baseUrl);

export default function WorkbenchDemo() {
  const [saved, setSaved] = useState<WorkshopMeta | null>(null);
  const [open, setOpen] = useState(true);
  const meta = useMemo(meta0, []);
  const io = useMemo<WorkbenchIO>(
    () => ({
      async pic(file) {
        if (file === "base.png") return baseUrl;
        const id = file.split(".")[0];
        if (/\.(layer|keyed)\.png$/.test(file)) return /\.keyed\.png$/.test(file) ? "" : cropUrl(sourceFor(id), kindBox(id));
        return sourceFor(id);
      },
      async tries() {
        return tries;
      },
      async save() {},
    }),
    []
  );
  const summary = saved ? { marks: saved.marks, acceptedGroups: saved.acceptedGroups, redo: saved.reports.filter((r) => r.redo).map((r) => [r.id, r.note]) } : null;
  return (
    <div className="min-h-screen bg-black text-white">
      <TipLayer />
      {open ? (
        <PuppetWorkbench meta={meta} io={io} onSave={setSaved} onClose={() => setOpen(false)} />
      ) : (
        <div className="p-10">
          <button className="forge-btn" onClick={() => setOpen(true)} data-tip="Opens the workbench again.">Open the workbench</button>
          <pre id="demo-saved" className="mt-6 max-h-[70vh] overflow-auto text-[11px] text-[#c3c9d6]">{JSON.stringify(summary, null, 1)}</pre>
        </div>
      )}
    </div>
  );
}
