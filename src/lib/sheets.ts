/**
 * Sheets — many frames of the SAME character.
 *
 * Two ways to build one, because they fail in opposite directions:
 *
 *   "one shot"    ask for the whole grid in a single picture. Fast and cheap,
 *                 but the model decides the layout, frames drift in size, and
 *                 you cannot use any one frame on its own.
 *
 *   "from a reference"  make the character once, then edit that same picture
 *                 into each pose. Slower — one generation per frame — but the
 *                 character actually stays the same, and every frame is a
 *                 separate usable image.
 *
 * The second only works on engines that accept a reference picture: a model on
 * your own machine, or Google. Verified on 2026-09-02 against LocalAI with
 * flux.2-klein-4b — the same scene came back with only the asked-for change.
 */

export type SheetKind = "sprite-walk" | "sprite-actions" | "turnaround" | "visemes" | "expressions" | "avatar-eyes" | "avatar-brows" | "cursor-chaser";

export interface SheetFrame {
  /** short name, used for the file and the label under the frame */
  id: string;
  /** what to ask for, appended to the character description */
  direction: string;
  /** shown in the UI */
  label: string;
}

export interface SheetDef {
  kind: SheetKind;
  label: string;
  blurb: string;
  /** sensible grid, columns first */
  columns: number;
  frames: SheetFrame[];
  /** wording added to every frame, to keep the set consistent */
  common: string;
  negative: string;
}

/*
 * What a talking head needs BEYOND the mouth.
 *
 * Ten visemes make a mouth move; they do not make a face look alive. Two
 * things do most of that work, and both are cheap:
 *
 *   · blinking. A face that never blinks reads as dead or menacing within a
 *     couple of seconds. People blink every few seconds, and a blink is three
 *     drawings, not one — open, half, shut — because cutting straight from
 *     open to shut reads as a glitch.
 *   · brows. They carry the tone of a sentence while the mouth is busy
 *     carrying the words, which is why a face with a fixed brow looks like it
 *     is reciting rather than speaking.
 *
 * Kept as separate sheets rather than multiplied into the visemes: ten mouths
 * times three eyes times three brows is ninety pictures, and the video tool
 * composites them anyway.
 */
const AVATAR_EYES: SheetFrame[] = [
  { id: "eyes_open", direction: "eyes fully open, natural relaxed gaze straight ahead", label: "open" },
  { id: "eyes_half", direction: "eyelids half lowered, mid-blink, pupils still visible", label: "half" },
  { id: "eyes_shut", direction: "eyes fully closed, lids relaxed, lashes down", label: "shut" },
];

const AVATAR_BROWS: SheetFrame[] = [
  { id: "brow_neutral", direction: "eyebrows in a neutral resting position", label: "neutral" },
  { id: "brow_raised", direction: "both eyebrows raised, an open and interested look", label: "raised" },
  { id: "brow_furrowed", direction: "eyebrows drawn down and together, concentrating", label: "furrowed" },
];

/* The classic ten mouth shapes animators use. Grouping sounds that look the
   same is the whole trick — "b", "m" and "p" are one drawing, not three. */
const VISEMES: SheetFrame[] = [
  { id: "rest", direction: "mouth closed and relaxed, neutral resting expression", label: "rest / silence" },
  { id: "ai", direction: "mouth open wide in an 'ah' shape, as in 'father' or 'I'", label: "A · I" },
  { id: "e", direction: "mouth open in a wide flat 'eh' shape, corners pulled slightly back, as in 'bed'", label: "E" },
  { id: "o", direction: "lips rounded into an 'oh' shape, as in 'go'", label: "O" },
  { id: "u", direction: "lips pushed forward and tightly rounded, as in 'you'", label: "U · W · Q" },
  { id: "mbp", direction: "lips pressed firmly together and closed, as when saying 'm', 'b' or 'p'", label: "M · B · P" },
  { id: "fv", direction: "top teeth resting on the lower lip, as when saying 'f' or 'v'", label: "F · V" },
  { id: "l", direction: "mouth open with the tongue tip touching behind the top teeth, as when saying 'l'", label: "L" },
  { id: "etc", direction: "mouth slightly open with teeth nearly together, as when saying 'c', 'd', 'k', 'n', 's' or 't'", label: "C · D · K · N · S · T" },
  { id: "th", direction: "mouth slightly open with the tongue tip visible between the teeth, as when saying 'th'", label: "TH" },
];

const WALK: SheetFrame[] = [
  { id: "01_contact", direction: "mid-stride, front foot just landing, arms swinging in opposition", label: "contact" },
  { id: "02_down", direction: "weight settling onto the front leg, body at its lowest, knee bent", label: "down" },
  { id: "03_pass", direction: "passing position, back leg swinging through beneath the body, legs together", label: "pass" },
  { id: "04_up", direction: "body at its highest, pushing off the back foot, straight supporting leg", label: "up" },
  { id: "05_contact_b", direction: "mid-stride with the opposite foot landing, arms swapped", label: "contact (other foot)" },
  { id: "06_down_b", direction: "weight settling onto the other leg, body low", label: "down (other foot)" },
  { id: "07_pass_b", direction: "passing position with the other leg swinging through", label: "pass (other foot)" },
  { id: "08_up_b", direction: "body high again, pushing off the other foot", label: "up (other foot)" },
];

const ACTIONS: SheetFrame[] = [
  { id: "idle", direction: "standing still and relaxed, arms at their sides", label: "idle" },
  { id: "walk", direction: "mid-stride walking, one leg forward", label: "walk" },
  { id: "run", direction: "running hard, leaning forward, both feet off the ground", label: "run" },
  { id: "jump", direction: "at the top of a jump, knees tucked", label: "jump" },
  { id: "attack", direction: "swinging forward in an attack, weight committed", label: "attack" },
  { id: "hurt", direction: "recoiling backwards after being hit", label: "hurt" },
  { id: "cast", direction: "arms raised, casting or reaching upward", label: "cast" },
  { id: "down", direction: "collapsed on the ground, defeated", label: "down" },
];

const TURNAROUND: SheetFrame[] = [
  { id: "front", direction: "facing directly towards the camera, front view", label: "front" },
  { id: "three_quarter", direction: "turned forty-five degrees, three-quarter view", label: "3/4" },
  { id: "side", direction: "in full profile, side view, facing right", label: "side" },
  { id: "back_three_quarter", direction: "turned away at forty-five degrees, rear three-quarter view", label: "rear 3/4" },
  { id: "back", direction: "facing directly away from the camera, back view", label: "back" },
];

const EXPRESSIONS: SheetFrame[] = [
  { id: "neutral", direction: "a calm neutral expression", label: "neutral" },
  { id: "happy", direction: "smiling broadly, eyes bright and creased", label: "happy" },
  { id: "sad", direction: "downturned mouth, brows raised in the middle, eyes lowered", label: "sad" },
  { id: "angry", direction: "brows drawn down and together, mouth set hard", label: "angry" },
  { id: "surprised", direction: "eyes wide, brows high, mouth open in an O", label: "surprised" },
  { id: "afraid", direction: "eyes wide and tense, mouth drawn back, shoulders raised", label: "afraid" },
];

/** Every frame in a set must be framed identically or the sheet is useless. */
/** A cursor chaser (lib/cursorChaser.ts): run ×4, sit, sleep — all facing right. */
const CHASER: SheetFrame[] = [
  { id: "run_1", direction: "running fast to the RIGHT, side view, front legs stretched forward, back legs pushing off", label: "run 1" },
  { id: "run_2", direction: "running fast to the RIGHT, side view, all legs gathered under the body, mid-leap", label: "run 2" },
  { id: "run_3", direction: "running fast to the RIGHT, side view, back legs stretched behind, front legs reaching down", label: "run 3" },
  { id: "run_4", direction: "running fast to the RIGHT, side view, legs crossing under the body, ears and tail streaming back", label: "run 4" },
  { id: "sit", direction: "sitting down calmly, side view facing RIGHT, looking up and to the right, tail curled round", label: "sit" },
  { id: "sleep", direction: "curled up asleep, side view facing RIGHT, eyes closed, peaceful", label: "sleep" },
];
const CHASER_COMMON =
  "a small cute mascot creature, the WHOLE body visible and centred with space around it, side view facing RIGHT, " +
  "simple bold shapes and a clear outline that read well when tiny, identical character design, colours and size in every frame, " +
  "flat even lighting, plain solid flat background";

const SPRITE_COMMON =
  "full body, whole figure visible, centred in frame, identical character design in every frame, " +
  "same clothing, same colours, same proportions, same scale, flat even lighting, plain solid background, side-on game sprite";

const FACE_COMMON =
  "head and shoulders only, facing the camera straight on, identical character in every frame, " +
  "same hair, same clothing, same colours, same head size and position, flat even lighting, plain solid background";

const SHEET_NEGATIVE =
  "multiple characters, cropped head, cropped limbs, changing outfit, changing hairstyle, inconsistent proportions, " +
  "busy background, scenery, text, letters, watermark, motion blur";

export const SHEET_DEFS: SheetDef[] = [
  {
    kind: "cursor-chaser",
    label: "Cursor chaser",
    blurb: "A little creature that runs after the mouse on a website, sits, and naps. Download it ready to add to any site.",
    columns: 6,
    frames: CHASER,
    common: CHASER_COMMON,
    negative: SHEET_NEGATIVE,
  },
  {
    kind: "sprite-walk",
    label: "Walk cycle",
    blurb: "Eight frames of a walk, the classic contact / down / pass / up beats.",
    columns: 4,
    frames: WALK,
    common: SPRITE_COMMON,
    negative: SHEET_NEGATIVE,
  },
  {
    kind: "sprite-actions",
    label: "Action set",
    blurb: "Idle, walk, run, jump, attack, hurt, cast, down — a game character's basics.",
    columns: 4,
    frames: ACTIONS,
    common: SPRITE_COMMON,
    negative: SHEET_NEGATIVE,
  },
  {
    kind: "turnaround",
    label: "Turnaround",
    blurb: "The same character from five angles, for reference or modelling.",
    columns: 5,
    frames: TURNAROUND,
    common: SPRITE_COMMON,
    negative: SHEET_NEGATIVE,
  },
  {
    kind: "visemes",
    label: "Mouth shapes (visemes)",
    blurb: "Ten mouth shapes for lip-sync, so an avatar can appear to speak.",
    columns: 5,
    frames: VISEMES,
    common: FACE_COMMON,
    negative: SHEET_NEGATIVE,
  },
  {
    kind: "avatar-eyes",
    label: "Avatar · eyes",
    blurb: "Three eye states so the face can blink. Without these a talking avatar stares, which reads as dead within seconds.",
    columns: 3,
    frames: AVATAR_EYES,
    common: FACE_COMMON,
    negative: SHEET_NEGATIVE,
  },
  {
    kind: "avatar-brows",
    label: "Avatar · brows",
    blurb: "Three brow positions. The mouth carries the words; the brows carry the tone.",
    columns: 3,
    frames: AVATAR_BROWS,
    common: FACE_COMMON,
    negative: SHEET_NEGATIVE,
  },
  {
    kind: "expressions",
    label: "Expressions",
    blurb: "Six faces — neutral, happy, sad, angry, surprised, afraid.",
    columns: 3,
    frames: EXPRESSIONS,
    common: FACE_COMMON,
    negative: SHEET_NEGATIVE,
  },
];

export const sheetByKind = (kind: SheetKind): SheetDef | undefined => SHEET_DEFS.find((s) => s.kind === kind);

/* ---------------- building the prompts ---------------- */

/** What each kind of sheet is allowed to change between frames. */
const CHANGE_ONLY: Record<SheetKind, string> = {
  "sprite-walk": "the pose of the body and limbs",
  "sprite-actions": "the pose of the body and limbs",
  turnaround: "which way the character is facing",
  visemes: "the shape of the mouth",
  expressions: "the expression on the face",
  "avatar-eyes": "how far the eyelids are lowered — the mouth must not move",
  "avatar-brows": "the position of the eyebrows — the mouth and eyes must not move",
  "cursor-chaser": "the pose of the body and legs — it always faces right",
};

/**
 * The prompt for one frame, when working from a reference picture.
 *
 * "Change ONLY x" matters: without it the model often returns the reference
 * untouched, having decided that keeping the character the same was the whole
 * instruction. Seen on 2026-09-02 — an "oh" mouth came back identical to the
 * resting frame until the wording was made this blunt.
 */
export function framePrompt(def: SheetDef, frame: SheetFrame, character: string): string {
  const only = CHANGE_ONLY[def.kind];
  return (
    `Keep this exact character unchanged — same face, same clothing, same colours, same art style, ` +
    `same position and same size in the frame. Change ONLY ${only}: ${frame.direction}. ${def.common}.` +
    (character.trim() ? ` The character is: ${character.trim()}.` : "")
  );
}

/**
 * A different seed for every frame.
 *
 * Reusing the reference picture's seed pushes the model towards reproducing it
 * exactly, so the requested change quietly never happens. Giving each frame its
 * own seed fixes that while the reference picture keeps the character steady.
 */
export function seedForFrame(baseSeed: number, index: number): number {
  const s = Math.abs(Math.round(baseSeed) || 1);
  // spread the frames far apart rather than 1,2,3 — adjacent seeds look alike
  return ((s + (index + 1) * 7919) % 2147483646) + 1;
}

/** The prompt for the very first picture, which every frame is then based on. */
export function referencePrompt(def: SheetDef, character: string): string {
  const base = def.frames[0];
  return `${character.trim() || "a character"}, ${base.direction}, ${def.common}`;
}

/**
 * The prompt for the whole grid in a single picture.
 * Fast and cheap; the model decides the layout, so frames drift.
 */
export function oneShotPrompt(def: SheetDef, character: string): string {
  const rows = Math.ceil(def.frames.length / def.columns);
  const list = def.frames.map((f, i) => `${i + 1}. ${f.direction}`).join("; ");
  return (
    `A single ${def.columns} by ${rows} grid contact sheet showing the same character ${def.frames.length} times, ` +
    `evenly spaced, each cell the same size, no gaps and no borders. ` +
    `${character.trim() || "a character"}. ${def.common}. ` +
    `Reading left to right, top to bottom, the cells are: ${list}.`
  );
}

/** shop_hero.png + "walk" + frame → shop_hero_walk_03_pass.png */
export function frameFilename(base: string, kind: SheetKind, frameId: string): string {
  const stem = base.replace(/\.[a-z0-9]+$/i, "");
  return `${stem}_${kind.replace(/-/g, "_")}_${frameId}.png`;
}

export const sheetFilename = (base: string, kind: SheetKind): string =>
  `${base.replace(/\.[a-z0-9]+$/i, "")}_${kind.replace(/-/g, "_")}_sheet.png`;

/** How many pictures each way will cost you, in generations. */
export function frameCount(def: SheetDef, method: "one-shot" | "from-reference"): number {
  return method === "one-shot" ? 1 : def.frames.length + 1; // +1 for the reference itself
}

/* ---------------- laying the frames out ---------------- */

export interface SheetLayout {
  columns: number;
  rows: number;
  cellW: number;
  cellH: number;
  width: number;
  height: number;
}

export function layoutFor(count: number, columns: number, cellW: number, cellH: number): SheetLayout {
  const cols = Math.max(1, Math.min(columns, count));
  const rows = Math.ceil(count / cols);
  return { columns: cols, rows, cellW, cellH, width: cols * cellW, height: rows * cellH };
}

/** Where frame `i` sits on the sheet. */
export function cellPosition(i: number, layout: SheetLayout): { x: number; y: number } {
  return {
    x: (i % layout.columns) * layout.cellW,
    y: Math.floor(i / layout.columns) * layout.cellH,
  };
}

/* ---------------- handing frames to the animator ---------------- */

/**
 * A sheet is a pile of frames; the GIF maker plays frames in order. This is the
 * join between them, so a finished set of mouth shapes or a walk cycle can be
 * played back without leaving the app.
 */
export interface FrameStrip {
  /** frame ids, in the order they should play */
  order: string[];
  /** milliseconds each frame is held */
  frameMs: number;
  /** should it run forwards then backwards? */
  pingPong: boolean;
  label: string;
}

/**
 * Sensible playback for each kind of sheet.
 *
 * A walk cycle loops straight through — going backwards would moonwalk. A
 * turnaround reads better out and back. Mouth shapes are not an animation at
 * all on their own: they are a palette that real speech picks from, so the
 * default here is a slow readable cycle for checking the set, not for lip-sync.
 */
export function stripFor(def: SheetDef): FrameStrip {
  const ids = def.frames.map((f) => f.id);
  switch (def.kind) {
    case "sprite-walk":
      return { order: ids, frameMs: 90, pingPong: false, label: "walk cycle, looping" };
    case "cursor-chaser":
      return { order: ids, frameMs: 140, pingPong: false, label: "running, sitting, napping" };
    case "turnaround":
      return { order: ids, frameMs: 220, pingPong: true, label: "turning, out and back" };
    case "visemes":
      return { order: ids, frameMs: 260, pingPong: false, label: "every mouth shape in turn" };
    case "expressions":
      return { order: ids, frameMs: 500, pingPong: true, label: "each expression in turn" };
    case "avatar-eyes":
      // Out and back: that IS a blink, so the preview shows the real thing.
      return { order: ids, frameMs: 70, pingPong: true, label: "a blink" };
    case "avatar-brows":
      return { order: ids, frameMs: 600, pingPong: true, label: "each brow position" };
    default:
      return { order: ids, frameMs: 140, pingPong: false, label: "each frame in turn" };
  }
}

/**
 * Turn a line of text into the mouth shapes that would say it.
 *
 * Crude on purpose: it maps letters to visemes rather than doing real phonetics,
 * which is enough to make a face look like it is talking. Anything better needs
 * an actual phoneme aligner working from recorded audio.
 */
export function visemesForText(text: string, msPerShape = 90): FrameStrip {
  const order: string[] = [];
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);

  for (const word of words) {
    for (let i = 0; i < word.length; i++) {
      const c = word[i];
      if ("aáà".includes(c) || c === "i") order.push("ai");
      else if (c === "e") order.push("e");
      else if (c === "o") order.push("o");
      else if (c === "u" || c === "w" || c === "q") order.push("u");
      else if ("mbp".includes(c)) order.push("mbp");
      else if ("fv".includes(c)) order.push("fv");
      else if (c === "l") order.push("l");
      else if (c === "t" && word[i + 1] === "h") {
        order.push("th");
        i++;
      } else if (/[a-z]/.test(c)) order.push("etc");
    }
    order.push("rest"); // a beat between words
  }

  if (!order.length) order.push("rest");
  return { order, frameMs: msPerShape, pingPong: false, label: `saying "${text.slice(0, 40)}"` };
}

/* ---------------- a track a video tool can actually play ---------------- */

/**
 * Everything a talking-head shot needs, on one timeline.
 *
 * `visemesForText` gives mouth shapes and nothing else. A video built from
 * only that looks wrong in a way people notice but cannot name: the face never
 * blinks. This adds the two layers that fix it, on their own schedules, so a
 * renderer can composite mouth + eyes + brows per frame.
 *
 * The blink timing is not invented. Resting adults blink roughly every 2–8
 * seconds and a blink lasts about a tenth to a fifth of a second, so blinks are
 * scattered in that window rather than placed on a metronome — a perfectly
 * regular blink is its own kind of uncanny.
 */
export interface AvatarCue<T extends string = string> {
  /** milliseconds from the start */
  at: number;
  /** how long to hold it */
  ms: number;
  /** the frame id to show */
  frame: T;
}

export interface AvatarTrack {
  /** total length in milliseconds */
  durationMs: number;
  mouth: AvatarCue[];
  eyes: AvatarCue[];
  brows: AvatarCue[];
  /** the line being spoken, for reference */
  line: string;
}

/** Deterministic jitter, so the same line always produces the same take. */
function wobble(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export function avatarTrackForText(
  text: string,
  opts: { msPerShape?: number; seed?: number; brow?: "neutral" | "lively" } = {}
): AvatarTrack {
  const msPerShape = opts.msPerShape ?? 90;
  const rnd = wobble(opts.seed ?? 1);

  const strip = visemesForText(text, msPerShape);
  const mouth: AvatarCue[] = strip.order.map((frame, i) => ({ at: i * msPerShape, ms: msPerShape, frame }));
  const durationMs = Math.max(msPerShape, strip.order.length * msPerShape);

  // Blinks: open by default, with a three-frame shut-and-open where they land.
  const eyes: AvatarCue[] = [];
  const BLINK_HALF = 40;
  const BLINK_SHUT = 60;
  let at = 900 + rnd() * 1500; // not immediately — a blink on frame one looks like a flinch
  while (at + BLINK_HALF * 2 + BLINK_SHUT < durationMs) {
    eyes.push({ at, ms: BLINK_HALF, frame: "eyes_half" });
    eyes.push({ at: at + BLINK_HALF, ms: BLINK_SHUT, frame: "eyes_shut" });
    eyes.push({ at: at + BLINK_HALF + BLINK_SHUT, ms: BLINK_HALF, frame: "eyes_half" });
    at += 2000 + rnd() * 6000;
  }

  // Brows: one position per sentence, so the face phrases what it is saying.
  const brows: AvatarCue[] = [];
  if (opts.brow === "lively") {
    const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
    const per = sentences.length > 0 ? durationMs / sentences.length : durationMs;
    sentences.forEach((sentence, i) => {
      const frame = /\?$/.test(sentence.trim())
        ? "brow_raised"
        : /!$/.test(sentence.trim())
          ? "brow_raised"
          : rnd() < 0.3
            ? "brow_furrowed"
            : "brow_neutral";
      brows.push({ at: Math.round(i * per), ms: Math.round(per), frame });
    });
  } else {
    brows.push({ at: 0, ms: durationMs, frame: "brow_neutral" });
  }

  return { durationMs, mouth, eyes, brows, line: text };
}

/** Which frames a track actually needs, so you only generate those. */
export function framesNeededFor(track: AvatarTrack): string[] {
  const used = new Set<string>();
  for (const c of [...track.mouth, ...track.eyes, ...track.brows]) used.add(c.frame);
  // eyes_open is the resting state and is never cued explicitly.
  used.add("eyes_open");
  return [...used].sort();
}
