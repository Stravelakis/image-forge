/**
 * The Forge puppet recipe — what to ask the picture model for, in what order.
 *
 * Written down from the Skilitsa course puppets (Sep 2026, 70 videos), where
 * every rule below was paid for with a failure. The full story is in
 * docs/puppet-recipe.md; the short version:
 *
 *   1. ONE base picture, approved by a person. Everything inherits it.
 *   2. Edit that same picture once per part, "change ONLY …".
 *   3. Cut each part out by comparing the edit with the base (cut.ts).
 *
 * A part cut from the character's own face cannot disagree with it, and it
 * lands back where it came from, so nothing has to be lined up by hand.
 */

export type PuppetFraming = "head" | "waist";

export interface PuppetStyle {
  id: string;
  label: string;
  /** what the style is, said to the picture model */
  prompt: string;
  /** shown on the tile */
  blurb: string;
}

/** Simple styles first on purpose: flat shapes cut more cleanly than fur. */
export const PUPPET_STYLES: PuppetStyle[] = [
  {
    id: "pixar",
    label: "3D animated",
    blurb: "Soft, rounded, film-like",
    prompt:
      "a STYLISED 3D ANIMATED CARTOON CHARACTER in the style of a Pixar or Illumination feature film — appealing exaggerated proportions, big expressive cartoon eyes, soft rounded forms, beautifully rendered but unmistakably a cartoon and NOT a photograph",
  },
  {
    id: "flat",
    label: "Flat cartoon",
    blurb: "Clean lines, flat colours",
    prompt:
      "a FLAT 2D CARTOON CHARACTER with clean bold outlines and flat colours, simple shapes, like a modern explainer-video illustration, no gradients and no texture",
  },
  {
    id: "clay",
    label: "Claymation",
    blurb: "Plasticine, stop-motion",
    prompt:
      "a CLAYMATION CHARACTER made of smooth plasticine, like an Aardman stop-motion film — visible soft thumbprint texture, rounded chunky shapes, studio lighting",
  },
  {
    id: "paper",
    label: "Paper cut-out",
    blurb: "Layered paper, crafty",
    prompt:
      "a PAPER CUT-OUT CHARACTER built from layered coloured card, crisp cut edges, subtle paper texture and soft drop shadows between layers, like a craft stop-motion",
  },
  {
    id: "anime",
    label: "Anime",
    blurb: "Cel-shaded, expressive",
    prompt: "an ANIME-STYLE CHARACTER, clean cel shading, crisp line art, large expressive eyes, like a modern TV anime",
  },
  {
    id: "doodle",
    label: "Simple doodle",
    blurb: "Stick figures, blobs, monsters",
    prompt:
      "a VERY SIMPLE HAND-DRAWN DOODLE CHARACTER — thick black marker outlines, one or two flat colours, minimal detail, like a whiteboard-animation sketch",
  },
];

export const styleById = (id: string): PuppetStyle => PUPPET_STYLES.find((s) => s.id === id) ?? PUPPET_STYLES[0];

/** The flat background colour the base is drawn on, and later keyed out. */
export const KEY_COLOUR = "#FF00FF";

/**
 * The base picture's prompt. Each clause is there because its absence caused a
 * real failure on the course puppets — see the table in docs/puppet-recipe.md.
 */
export function basePrompt(o: { description: string; style: string; framing: PuppetFraming; inspirations: number }): string {
  const style = styleById(o.style);
  const frame =
    o.framing === "waist"
      ? "Shown from the waist up, facing the viewer, BOTH ARMS AND BOTH HANDS fully visible and relaxed at the sides, with generous empty space on both sides and above the head so a raised hand would still fit inside the picture. The head sits in the upper third."
      : "Head, neck and shoulders only, filling the frame, with generous headroom so the top of the head (and any ears or hair) is well clear of the top edge.";
  return [
    `A single character portrait: ${o.description.trim()}.`,
    `Drawn as ${style.prompt}.`,
    frame,
    "Mouth CLOSED and relaxed, calm friendly neutral expression.",
    "Eyes relaxed and normally open, upper lids resting over the top of the irises, little white above or below; both eyes look at a distant point far beyond the camera so the two lines of sight are PARALLEL — not cross-eyed, not staring.",
    "Eyebrows level and calm, the same colour as the character's own hair or fur.",
    "Short neck sitting low on the shoulders.",
    o.inspirations
      ? `The attached picture${o.inspirations > 1 ? "s are" : " is"} INSPIRATION ONLY: borrow the look, colours and costume, but draw ONE new character in the style described, on its own.`
      : "",
    `Centred on a completely flat, uniform, pure magenta background (${KEY_COLOUR}), edge to edge, with no shadow, no floor and no props.`,
  ]
    .filter(Boolean)
    .join(" ");
}

export const BASE_NEGATIVE =
  "cross-eyed, converging eyes, wall-eyed, uneven pupils, wide staring eyes, bulging eyes, startled, open mouth, cropped head, cut-off ears, tight crop, text, watermark, extra characters, extra limbs, photorealistic photo";

/* ---------------- the parts ---------------- */

export type PartKind = "mouth" | "lid" | "brow" | "arms";

export interface PuppetPart {
  /** file name stem, and the name the rig knows it by */
  id: string;
  kind: PartKind;
  label: string;
  /** what the edit changes; KEEP_* is added after it */
  change: string;
  /** what a checker looks for, in one plain line */
  expect: string;
  /** waist-up puppets only */
  waistOnly?: boolean;
}

const EYES_STAY =
  "The eyes themselves do not change: the irises and pupils stay exactly the same size, shape, position and gaze direction, both lines of sight parallel.";

/**
 * Same order as the course: mouths, then lids, then brows, then arms. Lids are
 * the fragile part — the wording here is the one that finally held them.
 */
export const PUPPET_PARTS: PuppetPart[] = [
  { id: "mouth_AH", kind: "mouth", label: "AH", change: "Change only the mouth so it is open wide saying AH, with the tongue and lower teeth visible.", expect: "mouth open wide (AH)" },
  { id: "mouth_EE", kind: "mouth", label: "EE", change: "Change only the mouth so it is spread wide saying EE, with the teeth showing.", expect: "mouth spread wide, teeth showing (EE)" },
  { id: "mouth_OH", kind: "mouth", label: "OH", change: "Change only the mouth so it is rounded into an O saying OH.", expect: "mouth rounded into an O" },
  { id: "mouth_OO", kind: "mouth", label: "OO", change: "Change only the mouth so it is small and tightly rounded saying OO.", expect: "small tight round mouth (OO)" },
  { id: "mouth_FV", kind: "mouth", label: "F·V", change: "Change only the mouth so the top teeth rest on the lower lip saying F.", expect: "top teeth on the lower lip (F)" },
  { id: "mouth_L", kind: "mouth", label: "L", change: "Change only the mouth so it is part open with the tongue raised saying L.", expect: "mouth part open, tongue raised (L)" },
  { id: "mouth_CHSH", kind: "mouth", label: "SH", change: "Change only the mouth so the lips are pushed forward and rounded saying SH.", expect: "lips pushed forward and rounded (SH)" },
  { id: "mouth_SMILE", kind: "mouth", label: "smile", change: "Change only the mouth into a warm, gentle CLOSED-mouth smile, lips together, corners turned up, no teeth showing. Nothing above the mouth changes.", expect: "closed-mouth smile" },
  {
    id: "lid_closed",
    kind: "lid",
    label: "blink",
    change:
      "Lower both upper eyelids all the way down so the eyes are fully shut, as in a mid-blink. The eye OPENINGS stay exactly the same size, shape and position as in the original — you are closing lids over eyes that do not move, not drawing smaller or different eyes. The eyebrows do not move at all.",
    expect: "both eyes fully closed, same eye shape and position",
  },
  {
    id: "lid_half",
    kind: "lid",
    label: "half",
    change:
      "Lower both upper eyelids to the halfway point, so each lid covers the top half of the iris. The eye OPENINGS stay exactly the same size, shape and position, and the visible part of each eye below the lid is unchanged. The eyebrows do not move at all.",
    expect: "both eyelids half closed",
  },
  {
    id: "lid_wide",
    kind: "lid",
    label: "wide",
    change: `Raise both upper eyelids a little so the eyes look slightly wider open in surprise. The eye OPENINGS stay in exactly the same position. ${EYES_STAY} The eyebrows do not move.`,
    expect: "eyes a little wider open, same gaze",
  },
  { id: "brow_happy", kind: "brow", label: "happy", change: `Change only the eyebrows so both are raised high and strongly arched in a happy shape. ${EYES_STAY}`, expect: "eyebrows raised and arched (happy)" },
  { id: "brow_serious", kind: "brow", label: "firm", change: `Change only the eyebrows so both are low and drawn firmly inward in a serious shape. ${EYES_STAY}`, expect: "eyebrows low and drawn in (serious)" },
  { id: "brow_raised", kind: "brow", label: "surprised", change: `Change only the eyebrows so both are raised very high and rounded, in open surprise. ${EYES_STAY}`, expect: "eyebrows raised very high (surprise)" },
  { id: "brow_worried", kind: "brow", label: "worried", change: `Change only the eyebrows so the inner ends are lifted and pinched together and the outer ends droop, in a worried shape. ${EYES_STAY}`, expect: "worried eyebrows, inner ends lifted" },
  { id: "brow_confused", kind: "brow", label: "puzzled", change: `Change only the eyebrows so ONE is raised high and the other is lowered and drawn in, a puzzled look. ${EYES_STAY}`, expect: "one eyebrow up, one down (puzzled)" },
  // Arms: only on waist-up puppets. None of these touch the face, on purpose —
  // a hand over the mouth would hide the talking.
  { id: "arms_wave", kind: "arms", label: "wave", waistOnly: true, change: "Change only the arms: raise the character's right hand to shoulder height beside the head in a friendly open-palm wave. The hand stays clear of the face.", expect: "one hand raised in a wave, beside (not over) the face" },
  { id: "arms_point", kind: "arms", label: "point", waistOnly: true, change: "Change only the arms: the character's right arm points out to the side of the picture with the index finger, as if showing something next to them.", expect: "one arm pointing out to the side" },
  { id: "arms_shrug", kind: "arms", label: "shrug", waistOnly: true, change: "Change only the arms: both forearms lifted with the palms turned up and open in a shrug, hands at waist height.", expect: "palms up in a shrug" },
  { id: "arms_explain", kind: "arms", label: "explain", waistOnly: true, change: "Change only the arms: both hands raised in front of the chest, palms slightly open, as if explaining something. The hands stay below the chin.", expect: "both hands in front of the chest, explaining" },
];

export const partsFor = (framing: PuppetFraming): PuppetPart[] =>
  PUPPET_PARTS.filter((p) => framing === "waist" || !p.waistOnly);

/** Added after every edit's own instruction. */
export const KEEP =
  "Keep absolutely everything else in the picture identical: the same character at the same size, position and angle, the same face, eyes, hair or fur, clothing, colours, lighting and the same flat magenta background. Change ONLY what is described. Do not redraw the picture.";

export const editPrompt = (part: PuppetPart): string => `Edit this picture. ${part.change}\n\n${KEEP}`;

/**
 * Where on the picture each kind of part may sit, as fractions of the height.
 * The model re-renders the whole picture a little; without these a stray
 * change in an ear pulls a mouth layer up over the eyes (course, 10 Sep).
 */
export function bandFor(kind: PartKind, framing: PuppetFraming): [number, number] {
  if (framing === "head") return { mouth: [0.42, 1], lid: [0.2, 0.7], brow: [0.12, 0.62], arms: [0, 1] }[kind] as [number, number];
  return { mouth: [0.12, 0.62], lid: [0.04, 0.48], brow: [0.02, 0.45], arms: [0, 1] }[kind] as [number, number];
}

/** The most of the picture one part may cover before it counts as "redrawn". */
export const maxAreaPct = (kind: PartKind): number => (kind === "arms" ? 60 : 30);
