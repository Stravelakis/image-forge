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
import { pawWords, type PuppetLook, type PuppetPart } from "./recipe";

export type Facts = Record<string, unknown>;

/** One fact, asked on its own. "number" questions want a count, the rest yes or no. */
export interface FactQuestion {
  key: string;
  ask: string;
  number?: boolean;
}
const YN = " Answer only yes or no.";
const COMMON: FactQuestion[] = [
  { key: "beard_or_facial_hair_same_as_left", ask: "Compare the LEFT and RIGHT pictures. Is the facial hair (beard, moustache, stubble) the same on both? If neither has any, answer yes." + YN },
  { key: "skin_marks_same_as_left", ask: "Compare the LEFT and RIGHT pictures. Are the freckles, moles, scars and wrinkles the same on both? If neither has any, answer yes." + YN },
  { key: "eyes_look_same_direction_as_left", ask: "Compare the LEFT and RIGHT pictures. Do the eyes look in the same direction on both?" + YN },
  { key: "right_looks_broken", ask: "Does the RIGHT picture look broken — doubled or extra features, smears, a visible seam or box edge, or letters drawn on it?" + YN },
];

/** The questions for one part: facts only — the rules below decide. */
export function factsQuestions(part: PuppetPart, look?: PuppetLook): FactQuestion[] {
  const qs = factsQuestionsRaw(part);
  // an animal has paws: ask about paws (Ak, 16 Oct 2026)
  return part.kind === "arms" && look?.animal ? qs.map((q) => ({ ...q, ask: pawWords(q.ask).replace(/arms/g, "front legs") })) : qs;
}
function factsQuestionsRaw(part: PuppetPart): FactQuestion[] {
  if (part.kind === "mouth")
    return [
      { key: "right_mouth_is_the_wanted_shape", ask: `Look at the RIGHT picture only. Is the mouth this shape: ${part.expect}?` + YN },
      { key: "tongue_visible", ask: "Look at the RIGHT picture only. Can you see the tongue?" + YN },
      { key: "tongue_reaches_past_the_teeth_or_lips", ask: "Look at the RIGHT picture only. Does the tongue stick out of the mouth — past the teeth or past the lips, so part of it is outside the mouth?" + YN },
      { key: "smiling_right", ask: "Look at the RIGHT picture only. Is the character smiling, with the corners of the mouth turned up?" + YN },
      { key: "lips_drawn_left", ask: "Look at the LEFT picture only. Does the mouth have distinct drawn lips — a lip shape or a lip colour different from the skin?" + YN },
      { key: "lips_drawn_right", ask: "Look at the RIGHT picture only. Does the mouth have distinct drawn lips — a lip shape or a lip colour different from the skin?" + YN },
      ...COMMON,
    ];
  if (part.kind === "lid" || part.kind === "brow")
    return [
      { key: "wanted_change_visible", ask: `Compare the LEFT and RIGHT pictures. Does the RIGHT one show: ${part.expect}?` + YN },
      { key: "mouth_changed", ask: "Compare the LEFT and RIGHT pictures. Is the mouth different between them?" + YN },
      ...COMMON,
    ];
  return [
    { key: "right_picture_shows_the_wanted_arm_pose", ask: `Look at the RIGHT picture only. Does it show: ${part.expect}?` + YN },
    { key: "arms_count_right", ask: "Look at the RIGHT picture only. How many arms does the character have? Answer with a number only.", number: true },
    { key: "hands_visible_right", ask: "Look at the RIGHT picture only. How many hands can you see? Answer with a number only.", number: true },
    { key: "hand_covers_face_right", ask: "Look at the RIGHT picture only. Does a hand cover any part of the face?" + YN },
    { key: "face_changed", ask: "Compare the LEFT and RIGHT pictures. Is the face different between them?" + YN },
    ...COMMON,
  ];
}

/** A checker's answer, read: yes / no / a number / not readable. */
export function readAnswer(text: string | null, number?: boolean): boolean | number | undefined {
  if (!text) return undefined;
  const t = text.toLowerCase().replace(/<think>[\s\S]*?<\/think>/g, "");
  if (number) {
    const m = t.match(/\b(\d+)\b/g);
    return m ? Number(m[m.length - 1]) : undefined;
  }
  const yes = /\byes\b/.test(t), no = /\bno\b/.test(t);
  return yes && !no ? true : no && !yes ? false : undefined;
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

/** A checker, as the panel needs it: a name, and a way to ask one question (null = could not answer). */
export interface PanelChecker {
  name: string;
  answer(question: string): Promise<string | null>;
}

/** One checker's facts about one picture: every question, one at a time. */
async function factsFrom(c: PanelChecker, qs: FactQuestion[]): Promise<Facts | null> {
  const f: Facts = {};
  let answered = 0;
  // All questions at once (16 Oct 2026: one after another took 5–10 minutes a part);
  // the per-minute limit in pageIO.ts still spaces them out for each provider.
  const answers = await Promise.all(qs.map((q) => c.answer(q.ask).catch(() => null)));
  qs.forEach((q, i) => {
    const v = readAnswer(answers[i], q.number);
    if (v !== undefined) {
      f[q.key] = v;
      answered++;
    }
  });
  return answered >= qs.length / 2 ? f : null; // a checker that mostly could not answer has no vote
}

/**
 * Two checkers, and a third only when they disagree. A checker that cannot
 * answer counts as no vote; green needs TWO clean votes.
 */
export async function panelVerdict(part: PuppetPart, look: PuppetLook, checkers: PanelChecker[], tieBreak?: PanelChecker): Promise<PanelVerdict | null> {
  const qs = factsQuestions(part, look);
  const votes: { name: string; broken: string[] | null }[] = [];
  const ask = async (c: PanelChecker) => {
    const f = await factsFrom(c, qs);
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
