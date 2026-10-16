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
import { BASE_NEGATIVE, DEFAULT_LOOK, baseNegative, EDIT_NEGATIVE, editNegative, pawWords, VIEW_EDITS, basePrompt, editPrompt, partsFor, type PuppetFraming, type PuppetLook, type PuppetPart, type PuppetViewId } from "./recipe";
import type { CutPart } from "./rig";
import { fixNote, type PanelVerdict } from "./quality";

export interface Verdict {
  ok: boolean;
  why: string;
}

export interface MakerIO {
  /** One picture. `refs` are pictures to work from (the base, or inspiration). */
  generate(req: { prompt: string; negative?: string; refs: Img[]; seed: number; width: number; height: number }, signal?: AbortSignal): Promise<Img>;
  /** Look at a picture and answer a yes/no question. Null when no checker is set up. */
  judge?(question: string, picture: Img, signal?: AbortSignal): Promise<Verdict | null>;
  /**
   * The picture panel (quality.ts): several checkers report facts about a
   * part, the rules decide. Used for parts instead of judge when present.
   */
  inspect?(part: PuppetPart, look: PuppetLook, picture: Img, signal?: AbortSignal): Promise<PanelVerdict | null>;
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
  /** a part was kept (checked, or the best of three) — save it now */
  | { type: "kept"; id: string; part: CutPart }
  /** a part that did not get to green: its best tries, for you to choose from */
  | { type: "options"; id: string; options: { part: CutPart; preview: Img; why: string }[] }
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
  /** background colour and lips — the same in every picture of this puppet */
  look?: PuppetLook;
  /** picture size in pixels (square). Default PUPPET_SIZE; local engines use
   *  768 — an 8 GB card took 5 min 40 s per edit at 1024 (12 Oct 2026). */
  size?: number;
}

export function baseQuestion(framing: PuppetFraming, look: PuppetLook = DEFAULT_LOOK): string {
  return [
    "This picture is meant to be the starting point for an animated talking character.",
    'Answer only JSON: {"ok": true|false, "why": "short reason"}.',
    "ok is true only if ALL of these hold:",
    "one single character; its mouth is closed;",
    "both eyes look in the same direction (not cross-eyed, not wall-eyed);",
    // Not "nothing touches the top": a tall chef's hat grazing the edge failed
    // good pictures (13 Oct 2026). The face and ears are what must fit.
    "the face, eyes and ears are fully inside the picture (a hat or hair touching the top edge is fine);",
    `the background is one flat plain colour, and none of that colour shows on the character itself;`,
    look.lips ? "the mouth has drawn lips;" : "the mouth has no separate drawn lips;",
    framing === "full"
      ? "the whole body from head to feet is visible, both arms and both hands too."
      : framing === "waist"
      ? "both arms and both hands are visible."
      : "head and shoulders are shown.",
  ].join(" ");
}

export async function makeBaseOptions(req: BaseRequest, io: MakerIO, onEvent: (e: MakerEvent) => void, signal?: AbortSignal): Promise<Img[]> {
  const count = req.count ?? 4;
  const size = req.size ?? PUPPET_SIZE;
  const prompt = basePrompt({ description: req.description, style: req.style, framing: req.framing, inspirations: req.inspirations.length, look: req.look });
  const out: Img[] = [];
  for (let i = 0; i < count; i++) {
    if (signal?.aborted) break;
    const picture = resize(
      await io.generate({ prompt, negative: baseNegative(req.style), refs: req.inspirations.slice(0, 3), seed: seedFor((req.round ?? 0) * 100 + i + 1), width: size, height: size }, signal),
      size,
      size
    );
    onEvent({ type: "picture" });
    const verdict = io.judge ? await io.judge(baseQuestion(req.framing, req.look), shrink(picture, 512), signal).catch(() => null) : null;
    out.push(picture);
    onEvent({ type: "base", index: i, picture, verdict });
  }
  return out;
}

/**
 * A VIEW's own starting picture: the finished front picture, edited (turned to
 * the side, or sat down). Up to `tries` attempts; the checker, when there is
 * one, must agree it is still one clean character on a flat background.
 */
export async function makeViewBase(
  o: { base: Img; view: PuppetViewId; framing: PuppetFraming; look?: PuppetLook; tries?: number },
  io: MakerIO,
  signal?: AbortSignal
): Promise<Img | null> {
  const framing: PuppetFraming = o.view === "sit" ? "full" : o.framing;
  for (let t = 1; t <= (o.tries ?? 3); t++) {
    if (signal?.aborted) throw new DOMException("stopped", "AbortError");
    const pic = resize(
      await io.generate({ prompt: `${VIEW_EDITS[o.view]}\n\nNever draw letters or extra characters.`, negative: BASE_NEGATIVE, refs: [o.base], seed: seedFor(900 + t), width: o.base.width, height: o.base.height }, signal),
      o.base.width,
      o.base.height
    );
    const verdict = io.judge ? await io.judge(baseQuestion(framing, o.look), shrink(pic, 512), signal).catch(() => null) : null;
    if (!verdict || verdict.ok) return pic;
  }
  return null;
}

/* ---------------- 2. the parts ---------------- */

export function partQuestion(part: PuppetPart, look: PuppetLook = DEFAULT_LOOK, note?: string): string {
  return [
    ...(note ? [`The person asked for this change too: "${note}". It must be done.`] : []),
    ...(part.kind === "mouth" ? [look.lips ? "The mouth must have drawn lips." : "The mouth must have no separate drawn lips."] : []),
    ...(part.kind === "arms" ? ["Each arm must appear exactly once — no extra arm left resting at the side."] : []),
    "Left: a cartoon character. Right: the same character after an edit.",
    `The edit was meant to give: ${part.expect}.`,
    'Answer only JSON: {"ok": true|false, "why": "short reason"}.',
    "ok is true only if the change is clearly visible on the right,",
    "both eyes still look in the same direction as on the left and are not cross-eyed,",
    "and nothing looks broken: no doubled features, no smears, no visible seam or box edge, no letters or text drawn on it.",
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
  look?: PuppetLook;
  /** your notes per part, for a redo ("less tongue", "no smile") — added to the request and told to the checker */
  notes?: Record<string, string>;
  /** a fresh set of seeds — a re-run after the panel turned a part down */
  reseed?: boolean;
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
    // The best turned-down try so far — fewest things wrong — and its picture,
    // so the card shows exactly the picture the puppet keeps (Ak, 15 Oct 2026).
    let fallbackPair: Img | null = null;
    let fallbackScore = Infinity;
    // every clean-cut try with what the checkers said — the options if none is green
    const tried: { part: CutPart; preview: Img; why: string; score: number }[] = [];
    // What the panel found wrong last try, told to the picture engine next try.
    let fix = "";
    report.status = "working";
    onEvent({ type: "part", report: { ...report } });
    for (let t = 1; t <= tries; t++) {
      if (signal?.aborted) throw new DOMException("stopped", "AbortError");
      report.tries = t;
      const edit = resize(
        await io.generate({ prompt: editPrompt(part, req.look) + (req.notes?.[part.id] ? ` Also, and this matters most: ${req.notes[part.id]}.` : "") + (fix ? ` Make sure: ${part.kind === "arms" && req.look?.animal ? pawWords(fix) : fix}.` : ""), negative: editNegative(req.look), refs: [req.base], seed: seedFor(n * 31 + t + (req.notes?.[part.id] || req.reseed ? Date.now() % 9973 : 0)), width: req.base.width, height: req.base.height }, signal),
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
      // An arm pose keeps the WHOLE edit too: it becomes a body that replaces
      // the resting one (rig.ts poseBody), so the old arms are gone.
      const candidate: CutPart = { layer: cut.layer, keyed: cut.keyed, box: cut.box, ...(part.kind === "arms" ? { full: edit } : {}) };
      const view = viewBox(cut.box, req.base);
      const after = composite(req.base, cut.layer, cut.box.x, cut.box.y);
      const pair = shrink(sideBySide(crop(req.base, view), crop(after, view)), 768);
      // Arms are judged on the whole picture: a missing hand is outside any close-up.
      const whole = part.kind === "arms" ? shrink(sideBySide(req.base, edit), 1024) : pair;
      const panel = io.inspect ? await io.inspect(part, req.look ?? DEFAULT_LOOK, whole, signal).catch(() => null) : null;
      const verdict: Verdict | null = panel ?? (io.judge ? await io.judge(partQuestion(part, req.look, req.notes?.[part.id]), pair, signal).catch(() => null) : null);
      if (panel && !panel.ok) fix = fixNote(panel.reasons, part);
      // With a panel set up, "nobody could look" is not a pass.
      if ((!verdict && !io.inspect) || verdict?.ok) {
        parts[part.id] = candidate;
        onEvent({ type: "kept", id: part.id, part: candidate });
        report.status = "ok";
        report.why = verdict ? (panel ? panel.why : "checked") : "not checked (no picture checker set up)";
        fallback = null;
        onEvent({ type: "part", report: { ...report }, preview: pair });
        break;
      }
      // The checker said no, but the cut itself was clean. Keep the best
      // so far, so three "no"s still leave a usable — flagged — part.
      const score = panel ? panel.reasons.length : 1;
      tried.push({ part: candidate, preview: pair, why: verdict?.why || "not checked", score });
      if (score < fallbackScore) {
        fallback = candidate;
        fallbackPair = pair;
        fallbackScore = score;
      }
      report.why = verdict?.why || (io.inspect ? "no checker could look at it" : "the checker turned it down");
      onEvent({ type: "part", report: { ...report }, preview: pair });
    }
    if (report.status !== "ok") {
      if (fallback) {
        parts[part.id] = fallback;
        onEvent({ type: "kept", id: part.id, part: fallback });
        report.status = "unsure";
        // Up to three best tries, fewest problems first: yours to pick from.
        const best = tried.sort((a, b) => a.score - b.score).slice(0, 3);
        if (best.length > 1) onEvent({ type: "options", id: part.id, options: best.map(({ part: p, preview, why }) => ({ part: p, preview, why })) });
      } else {
        report.status = "missing";
      }
      onEvent({ type: "part", report: { ...report }, ...(fallbackPair ? { preview: fallbackPair } : {}) });
    }
  }
  return { parts, reports, pictures };
}

/** How many pictures a whole puppet takes at best and at worst. */
export function pictureBudget(framing: PuppetFraming, tries = 3, baseOptions = 4): { best: number; worst: number } {
  const n = partsFor(framing).length;
  return { best: baseOptions + n, worst: baseOptions + n * tries };
}

/* ---------------- 3. checking what is already made ---------------- */

/** The before/after picture a checker looks at, for a part already made. */
export function reviewPicture(base: Img, part: PuppetPart, cut: CutPart): Img {
  if (part.kind === "arms" && cut.full) return shrink(sideBySide(base, cut.full), 1024);
  const view = viewBox(cut.box, base);
  const after = composite(base, cut.layer, cut.box.x, cut.box.y);
  return shrink(sideBySide(crop(base, view), crop(after, view)), 768);
}

/**
 * Look at every part already made with the panel, without drawing anything:
 * which are green, which are not and why. A puppet made before the panel
 * existed gets its honest report this way.
 */
export async function recheckParts(
  req: { base: Img; framing: PuppetFraming; parts: Record<string, CutPart>; look?: PuppetLook; only?: string[] },
  io: Required<Pick<MakerIO, "inspect">>,
  onReport: (report: PartReport, preview: Img) => void,
  signal?: AbortSignal
): Promise<PartReport[]> {
  const out: PartReport[] = [];
  for (const part of partsFor(req.framing)) {
    if (req.only && !req.only.includes(part.id)) continue;
    const cut = req.parts[part.id];
    if (signal?.aborted) throw new DOMException("stopped", "AbortError");
    if (!cut) {
      out.push({ id: part.id, label: part.label, status: "missing", tries: 0, why: "not made yet" });
      continue;
    }
    const pic = reviewPicture(req.base, part, cut);
    const v = await io.inspect(part, req.look ?? DEFAULT_LOOK, pic, signal).catch(() => null);
    const report: PartReport = { id: part.id, label: part.label, status: v?.ok ? "ok" : "unsure", tries: 0, why: v ? v.why : "no checker could look at it" };
    out.push(report);
    onReport(report, pic);
  }
  return out;
}
