/**
 * The Start screen's brain: one sentence and a number in, a list of prompts out.
 *
 * The goal (HANDOFF §14.1) is high-volume image making that feels obvious.
 * Someone types "12 potion bottle icons, cute", presses one button, and gets
 * twelve different pictures — without meeting the manifest, the rules or the
 * engine settings first.
 *
 * Two ways to get variety, and the screen says which one it used:
 *   · with a text engine set up, it writes N genuinely different prompts;
 *   · without one, it adds a different framing to each copy of the sentence.
 *     Honest, free, and still far better than N identical requests — on an
 *     engine that ignores seeds, identical prompts come back near-identical.
 */
import type { ForgeSettings } from "./providers";

export const MAX_START = 60;

/** "12 potion bottle icons" → 12. Only a number at the start counts. */
export function countFromText(text: string): number | null {
  const m = /^\s*(\d{1,3})\b/.exec(text);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= MAX_START ? n : null;
}

/** Framings that change the picture without changing what it is of. */
const FRAMINGS = [
  "",
  "seen from a slightly different angle",
  "close-up",
  "wide view with more of the surroundings",
  "seen from above",
  "in soft morning light",
  "in warm evening light",
  "centred, simple composition",
  "slightly off-centre composition",
  "with a different colour accent",
  "in a quieter, calmer mood",
  "in a livelier, more playful mood",
];

/**
 * N prompts from one sentence with no text engine at all.
 *
 * A leading count is removed ("12 potion icons" → "potion icons") because a
 * picture model reads "12" as "draw twelve of them in one picture".
 */
export function builtInVariations(text: string, count: number): string[] {
  const base = text.replace(/^\s*\d{1,3}\s+/, "").trim();
  const n = Math.max(1, Math.min(MAX_START, Math.floor(count)));
  if (n === 1) return [base];
  return Array.from({ length: n }, (_, i) => {
    const framing = FRAMINGS[i % FRAMINGS.length];
    const round = Math.floor(i / FRAMINGS.length);
    const parts = [base, framing, round > 0 ? `variation ${round + 1}` : ""].filter(Boolean);
    return parts.join(", ");
  });
}

/** Pull a JSON array of strings out of a model reply, however it is wrapped. */
export function promptsFromReply(reply: string, count: number): string[] | null {
  const start = reply.indexOf("[");
  const end = reply.lastIndexOf("]");
  if (start < 0 || end <= start) return null;
  try {
    const arr = JSON.parse(reply.slice(start, end + 1)) as unknown;
    if (!Array.isArray(arr)) return null;
    const clean = arr.map((x) => String(x ?? "").trim()).filter((x) => x.length > 3);
    if (clean.length < Math.min(count, 1)) return null;
    // Too many: take the first N. Too few: the caller tops up.
    return clean.slice(0, count);
  } catch {
    return null;
  }
}

export interface StartPlan {
  prompts: string[];
  /** which way the variety was made, for the screen to say */
  how: "text-engine" | "built-in";
  /** set when the text engine was tried and failed */
  note?: string;
}

/**
 * Plan the list. `ask` is the text engine (scribeChat); passed in so this file
 * stays testable and has no network of its own.
 */
export async function planStart(
  text: string,
  count: number,
  settings: Pick<ForgeSettings, "scribe">,
  ask?: (system: string, user: string) => Promise<string>
): Promise<StartPlan> {
  const n = Math.max(1, Math.min(MAX_START, Math.floor(count)));
  const base = text.replace(/^\s*\d{1,3}\s+/, "").trim();
  if (n === 1 || !ask || !settings.scribe?.key?.trim()) {
    return { prompts: builtInVariations(text, n), how: "built-in" };
  }
  try {
    const reply = await ask(
      "You write image prompts. Reply with ONLY a JSON array of strings, nothing else.",
      `Write ${n} different image prompts for: "${base}". ` +
        `Each one describes ONE picture of the same kind of subject, varied in pose, detail, composition or colour, ` +
        `so the set looks like a matching collection. 15 to 40 words each. Do not number them. Do not mention a style.`
    );
    const got = promptsFromReply(reply, n);
    if (got && got.length > 0) {
      const topUp = builtInVariations(text, n).slice(got.length);
      return { prompts: [...got, ...topUp].slice(0, n), how: "text-engine" };
    }
    return { prompts: builtInVariations(text, n), how: "built-in", note: "the text engine's answer could not be read" };
  } catch (e) {
    return {
      prompts: builtInVariations(text, n),
      how: "built-in",
      note: `the text engine did not answer (${((e as { message?: string })?.message ?? "unknown").slice(0, 80)})`,
    };
  }
}
