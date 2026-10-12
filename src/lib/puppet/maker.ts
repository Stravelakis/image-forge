/**
 * The puppet maker, start to finish, with nobody watching.
 *
 * Ak, 12 Oct 2026: "the only thing of value we can do here is create the
 * process that will make the puppets … if that is only possible with lots of
 * trial and error, then we need to incorporate that in the system." So the
 * trial and error lives HERE, bounded:
 *
 *   every part gets up to `tries` attempts (default 3). An attempt is
 *   rejected by the mechanical checks in cutPart (nothing changed, redrawn,
 *   in the wrong place, mouth over the eyes) or by the picture checker (a
 *   vision model shown before/after). Three misses and the part is marked
 *   missing — the puppet is still usable without it — never retried forever.
 *
 * Engine-agnostic: the caller passes `generate` (any engine that can work from
 * a picture) and optionally `judge`. The page passes Image Forge's engines; a
 * test passes stand-ins; a headless overnight run could pass anything.
 */
import { composite, crop, cutPart, resize, sideBySide, type Box, type Img } from "./pixels";
import { BASE_NEGATIVE, basePrompt, editPrompt, partsFor, type PuppetFraming, type PuppetPart } from "./recipe";
import type { CutPart } from "./rig";

export interface Verdict {
  ok: boolean;
  why: string;
}

export interface MakerIO {
  /** One picture. `refs` are pictures to work from (the base, or inspiration). */
  generate(req: { prompt: string; negative?: string; refs: Img[]; seed: number; width: number; height: number }, signal?: AbortSignal): Promise<Img>;
  /** Look at a picture and answer a yes/no question. Null when no checker is set up. */
  judge?(question: string, picture: Img, signal?: AbortSignal): Promise<Verdict | null>;
}

export type PartStatus = "waiting" | "working" | "ok" | "unsure" | "missing";

export interface PartReport {
  id: string;
  label: string;
  status: PartStatus;
  tries: number;
  /** the last reason an attempt was turned down, in plain words */
  why: string;
}

export type MakerEvent =
  | { type: "base"; index: number; picture: Img; verdict: Verdict | null }
  | { type: "part"; report: PartReport; preview?: Img }
  | { type: "picture" }; // one more picture generated — for the running count

export const PUPPET_SIZE = 1024;

const seedFor = (n: number) => ((n * 7919 + 104729) % 2147483646) + 1;

/* ---------------- 1. the base options ---------------- */

export interface BaseRequest {
  description: string;
  style: string;
  framing: PuppetFraming;
  inspirations: Img[];
  count?: number;
  /** different every time "show me others" is pressed */
  round?: number;
}

export function baseQuestion(framing: PuppetFraming): string {
  return [
    "This picture is meant to be the starting point for an animated talking character.",
    'Answer only JSON: {"ok": true|false, "why": "short reason"}.',
    "ok is true only if ALL of these hold:",
    "one single character; its mouth is closed;",
    "both eyes look in the same direction (not cross-eyed, not wall-eyed);",
    "the whole head, including ears or hair, is inside the picture and not cut off at the top;",
    "the background is one flat plain colour;",
    framing === "waist" ? "both arms and both hands are visible." : "head and shoulders are shown.",
  ].join(" ");
}

export async function makeBaseOptions(req: BaseRequest, io: MakerIO, onEvent: (e: MakerEvent) => void, signal?: AbortSignal): Promise<Img[]> {
  const count = req.count ?? 4;
  const prompt = basePrompt({ description: req.description, style: req.style, framing: req.framing, inspirations: req.inspirations.length });
  const out: Img[] = [];
  for (let i = 0; i < count; i++) {
    if (signal?.aborted) break;
    const picture = resize(
      await io.generate({ prompt, negative: BASE_NEGATIVE, refs: req.inspirations.slice(0, 3), seed: seedFor((req.round ?? 0) * 100 + i + 1), width: PUPPET_SIZE, height: PUPPET_SIZE }, signal),
      PUPPET_SIZE,
      PUPPET_SIZE
    );
    onEvent({ type: "picture" });
    const verdict = io.judge ? await io.judge(baseQuestion(req.framing), shrink(picture, 512), signal).catch(() => null) : null;
    out.push(picture);
    onEvent({ type: "base", index: i, picture, verdict });
  }
  return out;
}

/* ---------------- 2. the parts ---------------- */

export function partQuestion(part: PuppetPart): string {
  return [
    "Left: a cartoon character. Right: the same character after an edit.",
    `The edit was meant to give: ${part.expect}.`,
    'Answer only JSON: {"ok": true|false, "why": "short reason"}.',
    "ok is true only if the change is clearly visible on the right,",
    "both eyes still look in the same direction as on the left and are not cross-eyed,",
    "and nothing looks broken: no doubled features, no smears, no visible seam or box edge.",
  ].join(" ");
}

/** The area a checker should look at: the part plus room around it. */
function viewBox(box: Box, img: Img): Box {
  const grow = Math.max(box.w, box.h) * 0.6;
  const side = Math.min(Math.max(box.w, box.h) + grow * 2, img.width, img.height);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const x = Math.round(Math.min(Math.max(0, cx - side / 2), img.width - side));
  const y = Math.round(Math.min(Math.max(0, cy - side / 2), img.height - side));
  return { x, y, w: Math.round(side), h: Math.round(side) };
}

function shrink(img: Img, max: number): Img {
  const k = Math.min(1, max / Math.max(img.width, img.height));
  return k === 1 ? img : resize(img, Math.round(img.width * k), Math.round(img.height * k));
}

export interface PartsRequest {
  base: Img;
  framing: PuppetFraming;
  /** parts already made (a resumed run) — skipped */
  done?: Record<string, CutPart>;
  /** only these ids; default every part for the framing */
  only?: string[];
  tries?: number;
}

export interface PartsResult {
  parts: Record<string, CutPart>;
  reports: PartReport[];
  /** pictures generated in this run */
  pictures: number;
}

/**
 * Lids go first: the closed-eyes part gives the eye line, and from then on a
 * mouth that reaches up over the eyes is turned down (it would stop the
 * character blinking on that sound).
 */
const ORDER: Record<string, number> = { lid: 0, mouth: 1, brow: 2, arms: 3 };

export async function makeParts(req: PartsRequest, io: MakerIO, onEvent: (e: MakerEvent) => void, signal?: AbortSignal): Promise<PartsResult> {
  const tries = req.tries ?? 3;
  const parts: Record<string, CutPart> = { ...(req.done ?? {}) };
  const wanted = partsFor(req.framing)
    .filter((p) => !req.only || req.only.includes(p.id))
    .sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
  const reports: PartReport[] = wanted.map((p) => ({ id: p.id, label: p.label, status: parts[p.id] ? "ok" : "waiting", tries: 0, why: "" }));
  let pictures = 0;
  const eyeYOf = () => {
    const lid = parts.lid_closed ?? parts.lid_half;
    return lid ? lid.box.y + lid.box.h / 2 : undefined;
  };

  for (const [n, part] of wanted.entries()) {
    const report = reports[n];
    if (parts[part.id]) continue;
    let fallback: CutPart | null = null;
    report.status = "working";
    onEvent({ type: "part", report: { ...report } });
    for (let t = 1; t <= tries; t++) {
      if (signal?.aborted) throw new DOMException("stopped", "AbortError");
      report.tries = t;
      const edit = resize(
        await io.generate({ prompt: editPrompt(part), refs: [req.base], seed: seedFor(n * 31 + t), width: req.base.width, height: req.base.height }, signal),
        req.base.width,
        req.base.height
      );
      pictures++;
      onEvent({ type: "picture" });
      const cut = cutPart(req.base, edit, { kind: part.kind, framing: req.framing, eyeY: part.kind === "mouth" ? eyeYOf() : undefined });
      if (!cut.ok) {
        report.why = cut.detail;
        onEvent({ type: "part", report: { ...report } });
        continue;
      }
      const candidate: CutPart = { layer: cut.layer, box: cut.box };
      const view = viewBox(cut.box, req.base);
      const after = composite(req.base, cut.layer, cut.box.x, cut.box.y);
      const pair = shrink(sideBySide(crop(req.base, view), crop(after, view)), 768);
      const verdict = io.judge ? await io.judge(partQuestion(part), pair, signal).catch(() => null) : null;
      if (!verdict || verdict.ok) {
        parts[part.id] = candidate;
        report.status = "ok";
        report.why = verdict ? "checked" : "not checked (no picture checker set up)";
        fallback = null;
        onEvent({ type: "part", report: { ...report }, preview: pair });
        break;
      }
      // The checker said no, but the cut itself was clean. Keep the best
      // so far, so three "no"s still leave a usable — flagged — part.
      fallback ??= candidate;
      report.why = verdict.why || "the checker turned it down";
      onEvent({ type: "part", report: { ...report }, preview: pair });
    }
    if (report.status !== "ok") {
      if (fallback) {
        parts[part.id] = fallback;
        report.status = "unsure";
      } else {
        report.status = "missing";
      }
      onEvent({ type: "part", report: { ...report } });
    }
  }
  return { parts, reports, pictures };
}

/** How many pictures a whole puppet takes at best and at worst. */
export function pictureBudget(framing: PuppetFraming, tries = 3, baseOptions = 4): { best: number; worst: number } {
  const n = partsFor(framing).length;
  return { best: baseOptions + n, worst: baseOptions + n * tries };
}
