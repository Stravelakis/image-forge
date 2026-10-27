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
  /** why this style is still experimental — fine detail that moves between pictures */
  experimental?: string;
  /** fine fur in this style moves between pictures, so it is drawn smoother (FUR_SMOOTH) */
  smoothFur?: boolean;
}

/**
 * HARD ANIMALS (Ak, 18 Oct 2026). Which breeds and animals the puppet maker
 * cannot do easily — and why — so they come with an "experimental" warning
 * instead of a disappointment. Learnt from the sample run: a mouth is cut out and
 * redrawn many times, and anything that hides it, or changes a lot from picture
 * to picture, fails more often.
 */
export const HARD_ANIMALS: { words: RegExp; why: string }[] = [
  {
    words: /\b(poodle|bichon|komondor|puli|shih ?tzu|lhasa apso|maltese|yorkie|yorkshire terrier|old english sheepdog|bearded collie|afghan hound|havanese|cockapoo|labradoodle|goldendoodle|doodle dog|briard|bergamasco)\b/i,
    why: "long, curly or corded fur over the face hides the mouth and changes in every picture",
  },
  {
    words: /\b(schnauzer|scottish terrier|scottie|westie|west highland|wire[- ]?haired|airedale|irish wolfhound|wolfhound|brussels griffon|affenpinscher)\b/i,
    why: "a beard or moustache of fur over the mouth — mouth shapes are hard to see and to keep the same",
  },
  {
    words: /\b(pug|bulldog|french bulldog|frenchie|boxer|shar[- ]?pei|bullmastiff|mastiff|boston terrier|pekingese|bloodhound|basset hound|dogue de bordeaux|neapolitan mastiff)\b/i,
    why: "a flat face, heavy jowls or deep wrinkles — the mouth hides in folds that move between pictures",
  },
  {
    words: /\b(pomeranian|chow ?chow|samoyed|keeshond|persian cat|maine coon|ragdoll|norwegian forest cat|alpaca|llama|sheep|lamb|angora)\b/i,
    why: "very fluffy fur — fine fur detail changes in every picture, so cut-outs show",
  },
  {
    words: /\b(bird|owl|owlet|parrot|penguin|duck|duckling|chick|chicken|eagle|hawk|pelican|toucan|flamingo|crow|raven|swan|goose)\b/i,
    why: "a beak has no lips or teeth, so most mouth shapes look the same — the talking shows less",
  },
  {
    words: /\b(horse|pony|donkey|zebra|giraffe|camel|crocodile|alligator|anteater|dolphin|shark)\b/i,
    why: "a long snout or jaw — the mouth is far from the eyes and side-on, and shapes are hard to read",
  },
  {
    words: /\b(fish|snake|lizard|turtle|tortoise|frog|toad|octopus|squid|jellyfish|insect|bug|bee|spider|ant|butterfly|snail|worm)\b/i,
    why: "no real lips or face to animate — mouth shapes and blinks are mostly guesswork",
  },
  {
    words: /\b(elephant|walrus|hedgehog|porcupine|bat)\b/i,
    why: "a trunk, tusks, spines or wings around the face get in the way of the mouth and the arms",
  },
];
/** The first hard-animal reason for a description, or "" when nothing on the list is mentioned. */
export const hardAnimalWhy = (description: string): string => HARD_ANIMALS.find((h) => h.words.test(description))?.why ?? "";

/**
 * FACIAL HAIR AND MARKS (Ak, 16 Oct 2026): off unless the description asks for
 * them — and then kept, with a note that they are experimental.
 */
export const asksForFaceMarks = (description: string) => /\b(beard|bearded|moustache|mustache|stubble|goatee|sideburns|freckle|freckles|freckled|mole|beauty mark|scar|scars|scarred|tattoo|tattoos|wrinkle|wrinkles|wrinkled|birthmark)\b/i.test(description);
export const faceMarksNote = "Facial hair and skin marks are experimental: they can shift a little between pictures, so check them in the review.";

/** Photoreal and lifelike faces: fine texture shifts from one picture to the next. */
const REAL_SKIN = "Real-looking skin and hair change a little in every picture, so more mouths need a redo.";
/** Furry characters in a detailed style (Ak, 16 Oct 2026): mid-detail fur instead of fine strands. */
export const FUR_SMOOTH =
  "The fur is smooth and mid-detailed: soft clumps with simple shapes and gentle shading, like a groomed plush toy, rather than thousands of fine strands.";
export const furNote = "Fur is experimental in this style: fine strands change between pictures. It is drawn smoother, mid-detail.";

/** Simple styles first on purpose: flat shapes cut more cleanly than fur. */
export const PUPPET_STYLES: PuppetStyle[] = [
  {
    id: "pixar",
    label: "3D animated",
    blurb: "Soft, rounded, film-like",
    smoothFur: true,
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
    smoothFur: true,
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
    experimental: REAL_SKIN,
    smoothFur: true,
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
    label: "Retouched photo",
    blurb: "High-fashion retouch · ironed-out detail",
    experimental: REAL_SKIN,
    smoothFur: true,
    // IRONED OUT (Ak, 16 Oct 2026): "a lot of high fashion photography has
    // ironed out details" — the smoother the skin and hair, the steadier the edits.
    prompt:
      "a HIGH-FASHION EDITORIAL PHOTOGRAPH retouched to perfection, like a beauty-magazine cover — flawless airbrushed skin with an even, porcelain-smooth finish, sleek simple hair styled away from the face, plain solid-colour matte clothing, soft diffused beauty lighting from the front, sharp focus. Clean-shaven, no glasses, no jewellery, no patterns, no logos",
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
const ANIMAL = /\b(owl|bird|parrot|penguin|duck|chick|fox|dog|puppy|cat|kitten|bear|rabbit|bunny|mouse|rat|wolf|lion|tiger|monkey|frog|fish|dragon|dinosaur|monster|robot|blob|alien|creature|animal|beast|cow|pig|sheep|goat|horse|deer|squirrel|hedgehog|owlet|bee|bug|insect)\b/i;

export function lipsFor(description: string, style: string): boolean {
  if (style === "doodle" || style === "anime" || style === "stick" || style === "stick2d") return false;
  return !ANIMAL.test(description);
}


/** What a puppet keeps the same in every picture: its background and its mouth's kind. */
export interface PuppetLook {
  key: KeyColour;
  lips: boolean;
  /** an animal: its own teeth, never human ones (Ak, 15 Oct 2026) */
  animal?: boolean;
  /** the TOOTH PROTOCOL's words for this character's teeth (teethFor) */
  teeth?: string;
  /** the character's facts sheet, written once when the base is approved */
  facts?: PuppetFacts;
}

/**
 * THE FACTS SHEET (prompt regime v2, Ak, 26 Oct 2026). What is true of this
 * character in every picture, written once when its base is approved and
 * said in every edit — so an edit can't give a one-eyed robot two eyes (Blip,
 * 25 Oct) or move a scar to the other cheek. The checks (quality.ts) read the
 * same sheet for the answers they expect.
 */
export interface PuppetFacts {
  /** what it is, in a few words: "a small grey robot", "a young woman" */
  species?: string;
  /** how many eyes; 2 when not said */
  eyes?: number;
  /** "two upright pointed ears", "no visible ears" */
  ears?: string;
  /** the main colours, plain words with a hex where known: "teal body (#1fa4a0)" */
  colours?: string[];
  clothing?: string;
  /** details that are on one side only — said with the side, as the viewer sees it */
  oneSided?: string[];
  /** what must never appear on this character; goes to the "things to avoid" list, never into the request */
  never?: string[];
}

export const eyesOf = (look?: PuppetLook): number => look?.facts?.eyes ?? 2;

/**
 * The recipe is written for two eyes ("both eyes … parallel"). A one-eyed
 * character gets every eye sentence in the singular, and three or more get
 * "all" — the wording itself drew a second eye on Blip (25 Oct 2026).
 */
export function eyeWords(text: string, eyes: number): string {
  if (eyes === 2) return text;
  if (eyes === 1)
    return text
      .replace(/both upper eyelids/g, "the upper eyelid")
      .replace(/Lower both/g, "Lower the")
      .replace(/Raise both/g, "Raise the")
      .replace(/The eye OPENINGS stay/g, "The eye OPENING stays")
      .replace(/the eyes are fully shut/g, "the eye is fully shut")
      .replace(/each lid covers/g, "the lid covers")
      .replace(/the visible part of each eye/g, "the visible part of the eye")
      .replace(/the eyes look slightly wider/g, "the eye looks slightly wider")
      .replace(/closing lids over eyes that do not move, not drawing smaller or different eyes/g, "closing a lid over an eye that does not move, not drawing a smaller or different eye")
      .replace(/Change only the eyebrows so both are/g, "Change only the single eyebrow so it is")
      .replace(/so ONE is raised high and the other is lowered and drawn in/g, "so it is raised high on one end and lowered on the other")
      .replace(/the inner ends are lifted and pinched together and the outer ends droop/g, "its middle is lifted and both ends droop")
      .replace(/both eyes look at a distant point far beyond the camera so the two lines of sight are PARALLEL — not cross-eyed, not staring/g, "the eye looks at a distant point far beyond the camera, not staring")
      .replace(/both eyes look in the same direction/g, "the eye looks straight ahead")
      .replace(/both lines of sight parallel/g, "looking straight ahead")
      .replace(/The eyes themselves do not change: the irises and pupils stay/g, "The eye itself does not change: the iris and pupil stay")
      .replace(/the eyes and where they look/g, "the eye and where it looks")
      .replace(/Eyebrows level and calm/g, "The eyebrow level and calm")
      .replace(/Eyes relaxed and normally open, upper lids resting over the top of the irises/g, "The eye relaxed and normally open, the upper lid resting over the top of the iris");
  return text
    .replace(/both upper eyelids/g, "every upper eyelid")
    .replace(/Lower both/g, "Lower every")
    .replace(/Raise both/g, "Raise every")
    .replace(/both eyes/g, `all ${eyes} eyes`)
    .replace(/the two lines of sight/g, "all the lines of sight")
    .replace(/both lines of sight parallel/g, "all looking the same way");
}

/** The facts sheet, said as plain positive facts for the request. */
export function factsSentence(look: PuppetLook = DEFAULT_LOOK): string {
  const f = look.facts;
  if (!f) return "";
  const eyes = f.eyes ?? 2;
  const said = [
    f.species ? `it is ${f.species}` : "",
    `it has exactly ${eyes === 1 ? "ONE eye" : eyes === 2 ? "TWO eyes" : `${eyes} eyes`}`,
    look.lips ? "its mouth has drawn lips" : "its mouth has no separate lips",
    f.ears ? `ears: ${f.ears}` : "",
    f.colours?.length ? `colours: ${f.colours.join(", ")}` : "",
    f.clothing ? `clothing: ${f.clothing}` : "",
    ...(f.oneSided ?? []).map((d) => `on one side only: ${d}`),
  ].filter(Boolean);
  return `Facts about this character, true in every picture: ${said.join("; ")}.`;
}

/**
 * THE TOOTH PROTOCOL (Ak, 16 Oct 2026). Which teeth a character has, said
 * once per kind of creature — "all dogs have 4 teeth between their canines,
 * just as pointy as the canines, but smaller, shorter" — and which teeth show
 * in which mouth shape (TEETH_SHOWN). Shapes that show none never mention teeth.
 */
const TEETH: [RegExp, string][] = [
  [/\b(dog|puppy|wolf|fox|coyote|jackal)\b/i, "the teeth are a dog's: two long pointed canines and, between them, four small pointed teeth, shorter than the canines, all white"],
  [/\b(cat|kitten|lion|tiger|leopard|cheetah|panther)\b/i, "the teeth are a cat's: two small sharp fangs and a row of tiny teeth between them, all white"],
  [/\b(owl|bird|parrot|penguin|duck|chick|owlet|chicken|eagle)\b/i, "it has a beak and no teeth"],
  [/\b(rabbit|bunny|mouse|rat|squirrel|hamster|beaver)\b/i, "the teeth are two long flat front teeth, side by side"],
  [/\b(horse|cow|sheep|goat|deer|pig)\b/i, "the teeth are broad, flat and blunt"],
  [/\b(frog|fish|blob|robot|alien|monster)\b/i, "teeth only if the original face already has them, drawn the same way"],
];
const HUMAN_TEETH = "the teeth are natural human teeth: even, small and white, in proportion to the face";
export const teethFor = (description: string): string => (TEETH.find(([re]) => re.test(description)) ?? [null, HUMAN_TEETH])[1];

/** Which teeth each mouth shape shows — none for the round and closed shapes. */
export const TEETH_SHOWN: Record<string, string> = {
  mouth_AH: "only a thin line of the upper teeth",
  mouth_halfAH: "at most a thin line of the upper teeth",
  mouth_EE: "both rows, close together",
  mouth_halfEE: "a thin line of both rows",
  mouth_FV: "only the edges of the upper front teeth",
  mouth_L: "only the upper front teeth",
  mouth_CHSH: "both rows, close together",
};

/** Animal words in a description — the same list that decides "no lips". */
export const isAnimal = (description: string) => ANIMAL.test(description);
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
    .replace(/the lower lip/g, "the lower edge of the mouth")
    .replace(/, the lips gently rounded forward around it/g, ", its edge gently rounded around it")
    .replace(/, the lips gently parted/g, ", just parted")
    .replace(/the lips keep their original colour/g, "the edge of the mouth keeps the same colour as the skin around it");

/** The negative prompt for an edit: a lipless puppet also says no to lips. */
// The facts sheet's "never" list lives here, never in the request: naming a thing draws it.
export const editNegative = (look: PuppetLook = DEFAULT_LOOK): string =>
  look.facts?.never?.length ? `${EDIT_NEGATIVE}, ${look.facts.never.join(", ")}` : EDIT_NEGATIVE;

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
  const prompt = [
    `A single character portrait: ${o.description.trim()}.`,
    `Drawn as ${style.prompt}.`,
    ...(style.smoothFur && isAnimal(o.description) ? [FUR_SMOOTH] : []),
    // Clean faces unless asked (Ak, 16 Oct 2026): facial hair and marks drift between pictures.
    ...(!isAnimal(o.description) && !asksForFaceMarks(o.description) ? ["Clean-shaven, with smooth, clear, even skin."] : []),
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
  return eyeWords(prompt, eyesOf(look));
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
// Only things no prompt names: an engine that has no real "negative" reads these as words to draw.
export const EDIT_NEGATIVE = "text, letters, words, writing, captions, blurry";

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
  /** what this shape tends to go wrong with, said out loud (15 Oct 2026, from the double check) */
  avoid?: string;
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
  { id: "mouth_AH", kind: "mouth", label: "AH", avoid: "Open, but moderately — not a wide yawn.", change: "Change only the mouth so it is open in a relaxed oval, the opening about half as tall as the mouth is wide. The inside of the mouth is a plain, empty, softly shaded dark shape — deep shadow, not pure black, with a thin line of the upper teeth at the top edge.", expect: "mouth open wide in a tall oval, the inside plain and dark" },
  { id: "mouth_EE", kind: "mouth", label: "EE", avoid: "The corners move out only slightly — the mouth stays about the same width as at rest.", change: "Change only the mouth so it is a little wider than at rest and slightly open, both rows of teeth showing close together.", expect: "mouth stretched wide, teeth showing close together" },
  { id: "mouth_OH", kind: "mouth", label: "OH", avoid: "The opening is round, its inside in soft deep shadow rather than pure black; the corners stay level.", change: "Change only the mouth so it forms a round open circle of medium size, the inside of the mouth dark.", expect: "mouth rounded into a medium open circle" },
  { id: "mouth_OO", kind: "mouth", label: "OO", avoid: "The opening is clearly open and round, its inside in soft deep shadow rather than pure black, and the lips keep their original colour.", change: "Change only the mouth so it forms a small round opening, as tall as it is wide, about a third as wide as the mouth at rest, the lips gently rounded forward around it.", expect: "small tight round mouth" },
  { id: "mouth_FV", kind: "mouth", label: "F·V", avoid: "Only the edges of the upper front teeth show, small and natural in size.", change: "Change only the mouth so the edges of the upper front teeth rest lightly on the middle of the lower lip, the lower lip tucked slightly under them, and the mouth otherwise closed.", expect: "upper teeth resting on the lower lip, plain white teeth with nothing drawn on them" },
  { id: "mouth_L", kind: "mouth", avoid: "Everything pink stays inside the mouth, behind the teeth.", label: "L", change: "Change only the mouth so it is only slightly open, the upper front teeth showing. High inside the mouth, the tip of the tongue presses up against the back of the upper front teeth, so only a small pink edge shows just under them. Below that the mouth is in soft deep shadow.", expect: "mouth slightly open, a small pink edge just under the upper teeth, nothing past the teeth" },
  { id: "mouth_CHSH", kind: "mouth", label: "SH", avoid: "The corners stay level.", change: "Change only the mouth so the lips are pushed forward and squared off, slightly open, with the teeth close together and visible.", expect: "lips pushed forward and squared, teeth close together" },
  // HALF-OPEN (13 Oct 2026): the steps between shapes and the quiet syllables,
  // so the mouth flows rather than snapping (Video Forge timeline.ts).
  { id: "mouth_halfAH", kind: "mouth", label: "½ AH", avoid: "At most a thin line of the upper teeth shows — fewer teeth than a wide-open mouth.", change: "Change only the mouth so it is just a little open in a small relaxed oval, the lips gently parted.", expect: "mouth a little open, a small oval" },
  { id: "mouth_halfOH", kind: "mouth", label: "½ OH", avoid: "The corners stay level.", change: "Change only the mouth so it forms a small round opening, clearly open, about half the size of a wide round mouth.", expect: "small round opening" },
  { id: "mouth_halfEE", kind: "mouth", label: "½ EE", avoid: "Only a little wider than at rest.", change: "Change only the mouth so it is a little wider than at rest and just parted, a thin line of teeth showing.", expect: "mouth slightly widened and just parted" },
  { id: "mouth_SMILE", kind: "mouth", label: "smile", avoid: "The mouth stays closed.", change: "Change only the mouth into a warm, gentle CLOSED-mouth smile, corners turned up, no teeth showing. Nothing above the mouth changes.", expect: "closed-mouth smile" },
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
  `Keep absolutely everything else in the picture identical: the same character at the same size, position and angle, the same face, eyes, hair or fur, the same skin exactly as it is with nothing added or taken away, the same clothing, colours, lighting and the same flat ${look.key.name} background. Change ONLY what is described. Do not redraw the picture.`;
export const KEEP = keepFor();

/**
 * What every edit of a kind keeps, from the double check of the ten sample
 * puppets (15 Oct 2026): mouths grew lipstick, smiles and lost beards;
 * eyebrow and eyelid edits changed the mouth too.
 */
const guardFor = (part: PuppetPart, look: PuppetLook): string =>
  part.kind === "mouth"
    ? `${part.id === "mouth_SMILE" || part.id.endsWith("EE") ? "The corners of the mouth stay where the shape puts them. " : "The corners of the mouth stay level. "}${look.lips ? "The lips keep exactly their original colour, shape and size." : "The edge of the mouth keeps the same colour as the skin around it."} ${TEETH_SHOWN[part.id] ? ` Teeth showing: ${TEETH_SHOWN[part.id]}; ${look.teeth ?? HUMAN_TEETH}.` : /OH|OO/.test(part.id) ? " The inside of the opening is plain, in soft deep shadow rather than pure black." : ""}${look.animal ? " Any tongue lies low and flat inside the mouth." : ""} Everything around the mouth stays exactly as in the original, with nothing added.`
    : part.kind === "arms"
      ? "Both hands are fully visible. The face stays exactly as it is."
      : "The mouth stays exactly as it is.";

/** "Hand" words, said as "paw" words for an animal. */
export const pawWords = (text: string): string =>
  text
    .replace(/open-palm /g, "")
    .replace(/the index finger/g, "a raised paw")
    .replace(/palms slightly open/g, "paws slightly open")
    .replace(/the palms turned up and open/g, "the paws turned up")
    .replace(/palms/g, "paws")
    .replace(/hands/g, "paws")
    .replace(/hand/g, "paw")
    .replace(/Both paws are fully visible\./g, "Both front paws are fully visible.");

/** The area each kind of edit may touch — said first, so the edit stays inside it (prompt regime v2). */
export const REGION: Record<PartKind, string> = {
  mouth: "the mouth area",
  lid: "the eyelids",
  brow: "the eyebrows",
  arms: "the arms and hands",
};

/**
 * What each kind of edit keeps exactly, named one by one (prompt regime v2,
 * 26 Oct 2026): a list the engine can tick off holds better than "everything
 * else". Said as what stays, never as what not to draw.
 */
export const KEEP_EXACTLY: Record<PartKind, string[]> = {
  mouth: ["the eyes and where they look", "the eyelids", "the eyebrows", "the nose", "the outline of the head and face", "the hair or fur", "the ears", "every colour", "the background"],
  lid: ["the eye openings' size, shape and position", "the eyebrows", "the mouth", "the nose", "the outline of the head and face", "the hair or fur", "every colour", "the background"],
  brow: ["the eyes and where they look", "the eyelids", "the mouth", "the nose", "the outline of the head and face", "the hair or fur", "every colour", "the background"],
  arms: ["the face and the head", "the body's size and position", "the clothing", "the legs and feet", "every colour", "the background"],
};

export const editPrompt = (part: PuppetPart, look: PuppetLook = DEFAULT_LOOK): string => {
  const raw = editPromptRaw(part, look);
  return eyeWords(part.kind === "arms" && look.animal ? pawWords(raw) : raw, eyesOf(look));
};
const editPromptRaw = (part: PuppetPart, look: PuppetLook): string =>
  `Edit only ${REGION[part.kind]} of this picture. ${part.kind === "mouth" && !look.lips ? withoutLipWords(part.change) : part.change}${part.avoid ? ` ${part.kind === "mouth" && !look.lips ? withoutLipWords(part.avoid) : part.avoid}` : ""} ${guardFor(part, look)}${part.kind === "mouth" ? ` ${lipsClause(look)} ${look.lips ? "Keep the lips exactly as they are in the original picture — the same colour and thickness." : "The edge of the mouth stays exactly like the original: no rim and no colour around it."}` : ""}${look.facts ? ` ${factsSentence(look)}` : ""}\n\nKeep exactly as in the original: ${KEEP_EXACTLY[part.kind].join(", ")}. ${keepFor(look)}`;

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
