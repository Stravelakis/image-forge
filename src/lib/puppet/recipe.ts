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

/** head: face and shoulders · waist: waist up, with arms · full: head to feet,
 *  standing (legs do not move, but they are there — Ak, 13 Oct 2026). */
export type PuppetFraming = "head" | "waist" | "full";

/**
 * OTHER VIEWS of the same puppet (13 Oct 2026), each a whole second set of
 * parts made from an edit of the finished front picture:
 *  · side — turned three-quarters, for two characters talking to each other
 *    ("too many animated videos have 2 people talking", Ak). Facing the
 *    viewer's left; Video Forge mirrors it for the other side.
 *  · sit — the same character sitting, full-body puppets only.
 */
export type PuppetViewId = "side" | "sit";
export const VIEW_EDITS: Record<PuppetViewId, string> = {
  side:
    "Edit this picture: turn the character to a three-quarter view — the head and body turned about 35 degrees towards the viewer's left, eyes looking towards the viewer's left too, as if talking to someone standing there. The same character at the same size and position, the same face, clothes, colours and style, mouth closed, the same flat background.",
  sit:
    "Edit this picture: the same character now SITTING on a simple plain wooden stool, seen from the front, full body from head to feet, hands resting on the knees, facing the viewer, mouth closed. The same face, clothes, colours, style and the same flat background; the head about the same size as before.",
};
/** The parts a view gets: enough to talk, blink and react — fewer than the front. */
export const VIEW_PARTS: Record<PuppetViewId, string[]> = {
  side: ["lid_closed", "lid_half", "mouth_AH", "mouth_EE", "mouth_OH", "mouth_OO", "mouth_FV", "mouth_L", "mouth_halfAH", "mouth_halfOH", "mouth_halfEE", "mouth_SMILE", "brow_happy", "brow_raised", "arms_explain", "arms_point"],
  sit: ["lid_closed", "lid_half", "mouth_AH", "mouth_EE", "mouth_OH", "mouth_OO", "mouth_FV", "mouth_L", "mouth_halfAH", "mouth_halfOH", "mouth_halfEE", "mouth_SMILE", "brow_happy", "brow_raised", "arms_explain"],
};

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
  // CLOSEST TO REAL (Ak, 14 Oct 2026). Lifelike 3D is the realistic end that
  // still cuts cleanly: a rendered character with real-looking skin and hair.
  // Photoreal works for the picture, but a real face's fine texture shifts
  // between edits, so more mouths come back "unsure" — hence "experimental".
  {
    id: "lifelike",
    label: "Lifelike 3D",
    blurb: "Cinematic, high detail, nearly real",
    prompt:
      "a LIFELIKE, HIGH-DETAIL 3D CHARACTER like a modern video-game cinematic or a high-end animated film — realistic skin, hair and fabric texture, natural proportions, soft cinematic studio lighting; believable and detailed, but still a rendered character, not a photograph",
  },
  {
    // TOUCHED-UP PHOTOREAL (Ak, 14 Oct 2026: "the art of the possible — the
    // best that can reasonably be done with consistency"). A real photograph's
    // fine detail moves between edits, so the things that move most are left
    // out on purpose — see PHOTO_EXCLUDED, said in the prompt and in the
    // things-to-avoid list.
    id: "photo",
    label: "Touched-up photoreal",
    blurb: "Like a retouched studio photo · fewer details",
    prompt:
      "a TOUCHED-UP PHOTOREALISTIC studio portrait, like a magazine photo retouched for a clean look — smooth even skin, neat short hair kept off the face, plain solid-colour matte clothing, soft even studio light, sharp focus. Clean-shaven, no glasses, no jewellery, no patterns, no logos",
  },
  {
    id: "stick",
    label: "Stick figure",
    blurb: "Hand-drawn, simplest of all",
    prompt:
      "a SIMPLE HAND-DRAWN STICK FIGURE — a round head with a simple face (dot eyes, a line mouth), single black lines for the body, arms and legs, drawn with a marker on white paper, charming and minimal",
  },
  {
    id: "stick2d",
    label: "2D vector stick figure",
    blurb: "Clean vector animation, bold lines",
    prompt:
      "a 2D VECTOR ANIMATION STICK FIGURE, like a modern motion-graphics explainer or an Alan Becker-style animation — perfectly clean, smooth, bold uniform strokes, a round head with a simple expressive face, flat solid colours, no texture, no shading",
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
 * THE BACKGROUND, PER CHARACTER (13 Oct 2026). Magenta works for most, but a
 * pink or purple character bleeds into it and comes out with holes and a
 * pink fringe (Ak's bridezilla, the fox's pink-lit hat). So the colour the
 * character is NOT is chosen: magenta, else green, else blue.
 */
export interface KeyColour {
  name: "magenta" | "green" | "blue";
  hex: string;
}
const KEYS: { key: KeyColour; clashes: RegExp }[] = [
  { key: { name: "magenta", hex: "#FF00FF" }, clashes: /\b(pink|magenta|purple|violet|lilac|lavender|fuchsia|rose|mauve|plum|orchid|bridezilla|bride)\b/i },
  { key: { name: "green", hex: "#00FF00" }, clashes: /\b(green|lime|olive|emerald|mint|frog|leaf|leaves|grass|jade|cactus|alien|zombie|dinosaur|ogre|goblin)\b/i },
  { key: { name: "blue", hex: "#0000FF" }, clashes: /(?!)/ },
];
export function keyColourFor(description: string): KeyColour {
  return (KEYS.find((k) => !k.clashes.test(description)) ?? KEYS[KEYS.length - 1]).key;
}

/**
 * LIPS OR NO LIPS — one or the other for the whole puppet (Ak, 13 Oct 2026).
 * A mouth that has lips in one shape and is a bare opening in the next looks
 * like two characters. Animals, doodles and anime faces default to no lips.
 */
export function lipsFor(description: string, style: string): boolean {
  if (style === "doodle" || style === "anime" || style === "stick" || style === "stick2d") return false;
  return !/\b(owl|bird|parrot|penguin|duck|chick|fox|dog|puppy|cat|kitten|bear|rabbit|bunny|mouse|rat|wolf|lion|tiger|monkey|frog|fish|dragon|dinosaur|monster|robot|blob|alien|creature|animal|beast|cow|pig|sheep|goat|horse|deer|squirrel|hedgehog|owlet|bee|bug|insect)\b/i.test(description);
}

/** What a puppet keeps the same in every picture: its background and its mouth's kind. */
export interface PuppetLook {
  key: KeyColour;
  lips: boolean;
}
export const DEFAULT_LOOK: PuppetLook = { key: { name: "magenta", hex: KEY_COLOUR }, lips: true };

const lipsClause = (look: PuppetLook) =>
  look.lips
    ? "The mouth has clearly drawn LIPS, the same colour and thickness in every picture."
    : "The mouth is a plain opening cut straight into the face: its edge is the same colour as the skin or fur around it, with no outline, no rim and no colour change around it, the same in every picture.";

/**
 * Mouth wording for a puppet without lips (Ak, 14 Oct 2026: EE, OH, OO, the
 * halves and the smile grew lips on lipless characters). The word "lip" in a
 * prompt draws lips, so a lipless puppet never sees it.
 */
export const withoutLipWords = (text: string): string =>
  text
    .replace(/the lower lip tucked slightly under them/g, "the lower edge of the mouth tucked slightly under them")
    .replace(/the middle of the lower lip/g, "the middle of the lower edge of the mouth")
    .replace(/the lips are pushed forward and squared off/g, "the mouth is pushed forward and squared off")
    .replace(/lips pushed forward and squared/g, "mouth pushed forward and squared")
    .replace(/the lower lip/g, "the lower edge of the mouth");

/** The negative prompt for an edit: a lipless puppet also says no to lips. */
export const editNegative = (look: PuppetLook = DEFAULT_LOOK): string =>
  look.lips ? EDIT_NEGATIVE : `${EDIT_NEGATIVE}, lips, lipstick, coloured lips, outlined lips, red rim around the mouth`;

/**
 * The base picture's prompt. Each clause is there because its absence caused a
 * real failure on the course puppets — see the table in docs/puppet-recipe.md.
 */
export function basePrompt(o: { description: string; style: string; framing: PuppetFraming; inspirations: number; look?: PuppetLook }): string {
  const style = styleById(o.style);
  const look = o.look ?? DEFAULT_LOOK;
  const frame =
    o.framing === "full"
      ? "FULL BODY from the top of the head to the feet, standing, facing the viewer, both arms relaxed at the sides, both feet on the ground, with empty space all around — above the head, beside the hands and below the feet. The head is in the top quarter of the picture."
      : o.framing === "waist"
      ? "Shown from the waist up, facing the viewer, BOTH ARMS AND BOTH HANDS fully visible and relaxed at the sides, with generous empty space on both sides and above the head so a raised hand would still fit inside the picture. The head sits in the upper third."
      : "Head, neck and shoulders only, filling the frame, with generous headroom so the top of the head (and any ears or hair) is well clear of the top edge.";
  return [
    `A single character portrait: ${o.description.trim()}.`,
    `Drawn as ${style.prompt}.`,
    frame,
    "Mouth CLOSED and relaxed, calm friendly neutral expression.",
    lipsClause(look),
    "Eyes relaxed and normally open, upper lids resting over the top of the irises, little white above or below; both eyes look at a distant point far beyond the camera so the two lines of sight are PARALLEL — not cross-eyed, not staring.",
    "Eyebrows level and calm, the same colour as the character's own hair or fur.",
    "Short neck sitting low on the shoulders.",
    o.inspirations
      ? `The attached picture${o.inspirations > 1 ? "s are" : " is"} INSPIRATION ONLY: borrow the look, colours and costume, but draw ONE new character in the style described, on its own.`
      : "",
    `Centred on a completely flat, uniform, pure ${look.key.name} background (${look.key.hex}), edge to edge, with no shadow, no floor and no props. No ${look.key.name} anywhere on the character itself.`,
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * What touched-up photoreal leaves out, because it changes between edits and
 * breaks the cut parts (Ak asked for the list, 14 Oct 2026):
 *  · face: beards, stubble and moustaches; freckles, moles and scars; heavy
 *    make-up and lipstick; glasses (the reflections change); piercings;
 *    hair falling over the face or eyes; curly or flyaway hair near the face
 *  · clothing: patterns (stripes, checks, florals), knits and wool, fur and
 *    fluffy collars, lace, sequins and glitter, shiny or see-through fabric,
 *    logos and printed text; earrings, necklaces and other jewellery; hats
 * What stays: a clean face, neat short or tied-back hair, plain matte clothes.
 */
export const PHOTO_EXCLUDED =
  "beard, stubble, moustache, freckles, moles, scars, heavy make-up, lipstick, glasses, sunglasses, piercings, hair over the face, curly hair near the face, " +
  "striped clothing, checked clothing, floral pattern, knitwear, wool, fur, fluffy collar, lace, sequins, glitter, shiny fabric, see-through fabric, logo, printed text, earrings, necklace, jewellery, hat";

/** What the base picture must not be — a photo, unless a photo is the point. */
export const baseNegative = (style: string): string =>
  style === "photo" ? `${BASE_NEGATIVE.replace(", photorealistic photo", ", cartoon, illustration, 3d render, plastic skin")}, ${PHOTO_EXCLUDED}` : BASE_NEGATIVE;

export const BASE_NEGATIVE =
  "cross-eyed, converging eyes, wall-eyed, uneven pupils, wide staring eyes, bulging eyes, startled, open mouth, cropped head, cut-off ears, tight crop, text, watermark, extra characters, extra limbs, photorealistic photo, letters, words";

/** For every edit: what must not appear. Kept OUT of the request itself — naming letters there is what drew them (13 Oct 2026). */
export const EDIT_NEGATIVE = "text, letters, words, writing, captions, symbols on the teeth, tongue sticking out, extra mouth, extra row of teeth, blurry";

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
  // SHAPES, NEVER SOUNDS. "Saying fff" put letters on the teeth and "saying
  // L" stuck the tongue out (Ak, 13 Oct 2026): only what the lips, teeth and
  // tongue do is described. editPrompt adds the puppet's lips rule.
  { id: "mouth_AH", kind: "mouth", label: "AH", change: "Change only the mouth so it is open wide in a relaxed tall oval, the jaw dropped. The inside of the mouth is a plain dark shape with NO tongue showing; at most a thin line of the upper teeth at the top edge.", expect: "mouth open wide in a tall oval, no tongue showing" },
  { id: "mouth_EE", kind: "mouth", label: "EE", change: "Change only the mouth so it is stretched wide to the sides and only slightly open, both rows of teeth showing close together, like a wide grin.", expect: "mouth stretched wide, teeth showing close together" },
  { id: "mouth_OH", kind: "mouth", label: "OH", change: "Change only the mouth so it forms a round open circle of medium size, the inside of the mouth dark.", expect: "mouth rounded into a medium open circle" },
  { id: "mouth_OO", kind: "mouth", label: "OO", change: "Change only the mouth so it is pushed forward into a small, tight, round opening, much smaller than a circle.", expect: "small tight round mouth" },
  { id: "mouth_FV", kind: "mouth", label: "F·V", change: "Change only the mouth so the upper front teeth rest lightly on the middle of the lower lip, the lower lip tucked slightly under them, and the mouth otherwise closed. The teeth are plain and white.", expect: "upper teeth resting on the lower lip, plain white teeth with nothing drawn on them" },
  { id: "mouth_L", kind: "mouth", label: "L", change: "Change only the mouth so it is only a little open, the upper front teeth showing, and behind them, deep inside the mouth, the smallest hint of the tongue tip — a tiny sliver, mostly hidden by the teeth. The tongue never reaches past the teeth.", expect: "mouth a little open, at most a tiny sliver of tongue behind the upper teeth" },
  { id: "mouth_CHSH", kind: "mouth", label: "SH", change: "Change only the mouth so the lips are pushed forward and squared off, slightly open, with the teeth close together and visible.", expect: "lips pushed forward and squared, teeth close together" },
  // HALF-OPEN (13 Oct 2026): the steps between shapes and the quiet syllables,
  // so the mouth flows rather than snapping (Video Forge timeline.ts).
  { id: "mouth_halfAH", kind: "mouth", label: "½ AH", change: "Change only the mouth so it is a little open in a small relaxed oval, about half as open as a wide-open mouth, the teeth barely showing.", expect: "mouth a little open, a small oval" },
  { id: "mouth_halfOH", kind: "mouth", label: "½ OH", change: "Change only the mouth so it forms a small round opening, about half the size of a wide round mouth.", expect: "small round opening" },
  { id: "mouth_halfEE", kind: "mouth", label: "½ EE", change: "Change only the mouth so it is a little wider than at rest and just parted, a thin line of teeth showing.", expect: "mouth slightly widened and just parted" },
  { id: "mouth_SMILE", kind: "mouth", label: "smile", change: "Change only the mouth into a warm, gentle CLOSED-mouth smile, corners turned up, no teeth showing. Nothing above the mouth changes.", expect: "closed-mouth smile" },
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
  { id: "arms_wave", kind: "arms", label: "wave", waistOnly: true, change: "Change only the arms: raise the character's right hand to shoulder height beside the head in a friendly open-palm wave. The hand stays clear of the face. Each arm is drawn exactly once: an arm that moves is no longer resting at the side.", expect: "one hand raised in a wave, beside (not over) the face" },
  { id: "arms_point", kind: "arms", label: "point", waistOnly: true, change: "Change only the arms: the character's right arm points out to the side of the picture with the index finger, as if showing something next to them. Each arm is drawn exactly once: an arm that moves is no longer resting at the side.", expect: "one arm pointing out to the side" },
  { id: "arms_shrug", kind: "arms", label: "shrug", waistOnly: true, change: "Change only the arms: both forearms lifted with the palms turned up and open in a shrug, hands at waist height. Each arm is drawn exactly once: an arm that moves is no longer resting at the side.", expect: "palms up in a shrug" },
  { id: "arms_explain", kind: "arms", label: "explain", waistOnly: true, change: "Change only the arms: both hands raised in front of the chest, palms slightly open, as if explaining something. The hands stay below the chin. Each arm is drawn exactly once: an arm that moves is no longer resting at the side.", expect: "both hands in front of the chest, explaining" },
];

export const partsFor = (framing: PuppetFraming): PuppetPart[] =>
  PUPPET_PARTS.filter((p) => framing !== "head" || !p.waistOnly);

/** Added after every edit's own instruction. */
export const keepFor = (look: PuppetLook = DEFAULT_LOOK) =>
  `Keep absolutely everything else in the picture identical: the same character at the same size, position and angle, the same face, eyes, hair or fur, the same facial hair, freckles, moles, scars and marks — no more and no fewer, in the same places — the same clothing, colours, lighting and the same flat ${look.key.name} background. Change ONLY what is described. Do not redraw the picture.`;
export const KEEP = keepFor();

export const editPrompt = (part: PuppetPart, look: PuppetLook = DEFAULT_LOOK): string =>
  `Edit this picture. ${part.kind === "mouth" && !look.lips ? withoutLipWords(part.change) : part.change}${part.kind === "mouth" ? ` ${lipsClause(look)} ${look.lips ? "Keep the lips exactly as they are in the original picture — the same colour and thickness." : "The edge of the mouth stays exactly like the original: no rim and no colour around it."}` : ""}\n\n${keepFor(look)}`;

/**
 * Where on the picture each kind of part may sit, as fractions of the height.
 * The model re-renders the whole picture a little; without these a stray
 * change in an ear pulls a mouth layer up over the eyes (course, 10 Sep).
 */
export function bandFor(kind: PartKind, framing: PuppetFraming): [number, number] {
  if (framing === "head") return { mouth: [0.42, 1], lid: [0.2, 0.7], brow: [0.12, 0.62], arms: [0, 1] }[kind] as [number, number];
  // Full body: the face is small and near the top.
  if (framing === "full") return { mouth: [0.06, 0.34], lid: [0.02, 0.28], brow: [0.0, 0.26], arms: [0, 1] }[kind] as [number, number];
  return { mouth: [0.12, 0.62], lid: [0.04, 0.48], brow: [0.02, 0.45], arms: [0, 1] }[kind] as [number, number];
}

/** The most of the picture one part may cover before it counts as "redrawn". */
export const maxAreaPct = (kind: PartKind): number => (kind === "arms" ? 60 : 30);
