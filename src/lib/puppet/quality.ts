/**
 * THE PICTURE PANEL — two checkers, and the rules decide (Ak, 15 Oct 2026).
 *
 * One checker asked "is this ok?" said yes to a tongue sticking out that it
 * had itself just described. So a checker here never judges: it only reports
 * FACTS ("tongue past the teeth: yes", "arms: 1"), and the rules below decide.
 *
 * Two checkers from different families look at every part. Both clean → kept.
 * Both find something → turned down. They disagree → a third casts the vote.
 * A part is green only when at least two checkers found nothing wrong.
 *
 * Pure: no network here. pageIO.ts passes the function that asks a checker.
 */
import type { PuppetLook, PuppetPart } from "./recipe";

export type Facts = Record<string, unknown>;

const COMMON =
  `"beard_or_facial_hair_same_as_left": bool (true if neither has any), "skin_marks_same_as_left": bool (freckles, moles, scars, wrinkles; true if none), ` +
  `"eyes_look_same_direction_as_left": bool, "right_looks_broken": bool (doubled or extra features, smears, a seam or box edge, letters or text drawn on it), "something_else_changed": "short description or none"`;

/** The question for one part. Facts only — the checker is told not to judge. */
export function factsQuestion(part: PuppetPart): string {
  if (part.kind === "mouth")
    return (
      `Left: a cartoon character. Right: the same character after an edit meant to change ONLY the mouth to: ${part.expect}. ` +
      `Look closely and report facts, do not judge. Answer only JSON: {"right_mouth_is_the_wanted_shape": bool, "tongue_visible": bool, ` +
      `"tongue_reaches_past_the_teeth_or_lips": bool, "smiling_right": bool, "lips_drawn_left": bool (a distinct lip shape or lip colour around the mouth), "lips_drawn_right": bool, ${COMMON}}`
    );
  if (part.kind === "lid" || part.kind === "brow")
    return (
      `Left: a cartoon character. Right: the same character after an edit meant to change ONLY the ${part.kind === "lid" ? "eyelids" : "eyebrows"}: ${part.expect}. ` +
      `Report facts, do not judge. Answer only JSON: {"wanted_change_visible": bool, "mouth_changed": bool, ${COMMON}}`
    );
  return (
    `Left: a cartoon character at rest. Right: the same character after an edit meant to change ONLY the arms: ${part.expect}. ` +
    `Report facts, do not judge. Answer only JSON: {"right_picture_shows_the_wanted_arm_pose": bool, "arms_count_right": number, "hands_visible_right": number, "hand_covers_face_right": bool, "face_changed": bool, ${COMMON}}`
  );
}

const SMILES_OK = new Set(["mouth_SMILE", "mouth_EE", "mouth_halfEE"]);
const EYES_SHUT = new Set(["lid_closed", "lid_half"]);

/** Ak's list of what is wrong, applied to one checker's facts. Empty = nothing wrong. */
export function brokenRules(part: PuppetPart, look: PuppetLook, f: Facts): string[] {
  const b: string[] = [];
  if (f.beard_or_facial_hair_same_as_left === false) b.push("facial hair changed");
  if (f.skin_marks_same_as_left === false) b.push("marks changed");
  if (f.eyes_look_same_direction_as_left === false && !EYES_SHUT.has(part.id)) b.push("eyes changed direction");
  if (f.right_looks_broken === true) b.push("picture broken");
  if (part.kind === "mouth") {
    if (f.right_mouth_is_the_wanted_shape === false) b.push("wrong mouth shape");
    if (f.tongue_reaches_past_the_teeth_or_lips === true) b.push("tongue sticking out");
    else if (part.id.endsWith("_AH") && f.tongue_visible === true) b.push("tongue showing");
    if (!look.lips && f.lips_drawn_right === true) b.push("lips on a lipless puppet");
    else if (look.lips && typeof f.lips_drawn_left === "boolean" && typeof f.lips_drawn_right === "boolean" && f.lips_drawn_left !== f.lips_drawn_right) b.push("lips differ from the face");
    if (f.smiling_right === true && !SMILES_OK.has(part.id.replace(/^(side|sit)_/, ""))) b.push("smile where none was asked");
  } else if (part.kind === "lid" || part.kind === "brow") {
    if (f.wanted_change_visible === false) b.push("change not visible");
    if (f.mouth_changed === true) b.push("mouth changed too");
  } else {
    if (f.right_picture_shows_the_wanted_arm_pose === false) b.push("pose wrong");
    if (typeof f.arms_count_right === "number" && f.arms_count_right !== 2) b.push(`${f.arms_count_right} arms`);
    if (typeof f.hands_visible_right === "number" && f.hands_visible_right < 2) b.push("a hand missing");
    if (f.hand_covers_face_right === true) b.push("hand over the face");
    if (f.face_changed === true) b.push("face changed");
  }
  return b;
}

/** What to tell the picture engine next time, for each thing found wrong. */
// Said as what we WANT — an engine draws whatever it is told about.
const FIX: [RegExp, string][] = [
  [/tongue sticking out/, "only the smallest tip inside the mouth, behind the teeth"],
  [/tongue showing/, "the inside of the mouth plain, empty and dark"],
  [/lips on a lipless/, "the edge of the mouth the same colour as the skin around it"],
  [/lips differ/, "the lips exactly as on the original face"],
  [/facial hair|marks changed/, "the face exactly as in the original, nothing added and nothing taken away"],
  [/smile where none/, "the corners of the mouth level"],
  [/mouth changed too/, "the mouth exactly as in the original"],
  [/eyes changed/, "the eyes and where they look exactly as in the original"],
  [/arms|hand missing/, "two arms, both hands fully visible"],
  [/hand over the face/, "the hands beside the body, the face fully visible"],
  [/face changed/, "the face exactly as in the original"],
  [/picture broken/, "one clean, simple drawing"],
];
export function fixNote(reasons: string[], part: PuppetPart): string {
  const out = new Set<string>();
  for (const r of reasons) {
    const hit = FIX.find(([re]) => re.test(r));
    if (hit) out.add(hit[1]);
    else if (/wrong mouth shape|pose wrong|change not visible/.test(r)) out.add(`clearly: ${part.expect}`);
  }
  return [...out].join("; ");
}

export interface PanelVerdict {
  ok: boolean;
  /** plain words for the review card */
  why: string;
  reasons: string[];
  /** e.g. "Gemma ✓ · Nemotron ✗" */
  votes: string;
}

/** A checker, as the panel needs it: a name, and a way to ask for facts (null = could not answer). */
export interface PanelChecker {
  name: string;
  facts(question: string): Promise<Facts | null>;
}

/**
 * Two checkers, and a third only when they disagree. A checker that cannot
 * answer counts as no vote; green needs TWO clean votes.
 */
export async function panelVerdict(part: PuppetPart, look: PuppetLook, checkers: PanelChecker[], tieBreak?: PanelChecker): Promise<PanelVerdict | null> {
  const q = factsQuestion(part);
  const votes: { name: string; broken: string[] | null }[] = [];
  const ask = async (c: PanelChecker) => {
    const f = await c.facts(q).catch(() => null);
    votes.push({ name: c.name, broken: f ? brokenRules(part, look, f) : null });
  };
  await Promise.all(checkers.map(ask));
  const clean = () => votes.filter((v) => v.broken && v.broken.length === 0).length;
  const dirty = () => votes.filter((v) => v.broken && v.broken.length > 0).length;
  if (clean() < 2 && tieBreak && dirty() < 2) await ask(tieBreak);
  if (votes.every((v) => !v.broken)) return null; // nobody could look
  const reasons = [...new Set(votes.flatMap((v) => v.broken ?? []))];
  const ok = clean() >= 2;
  const tally = votes.map((v) => `${v.name} ${v.broken === null ? "–" : v.broken.length ? "✗" : "✓"}`).join(" · ");
  return { ok, reasons: ok ? [] : reasons, votes: tally, why: ok ? `green by ${clean()} checkers (${tally})` : `${reasons.join(", ") || "not enough checkers agreed"} (${tally})` };
}
