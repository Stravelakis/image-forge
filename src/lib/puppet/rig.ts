/**
 * Turn a base picture and its cut parts into a Forge puppet — the file format
 * Video Forge draws (its src/store/puppetTypes.ts). Ported from Video Forge's
 * tools/make-rig-puppet.mjs, which built the course puppets, with arm poses
 * added for waist-up characters.
 *
 * Every layer is anchored to the whole picture ("head box" = the picture), so
 * a part's position is just its centre minus the middle — no guessing, no
 * nudging, because the cut coordinates are already exact.
 */
import { borderColour, crop, keyOut, type Box, type Img } from "./pixels";
import type { PuppetFraming } from "./recipe";

export interface CutPart {
  layer: Img;
  box: Box;
}

export interface ForgeLayer {
  file: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ForgePuppetJson {
  name: string;
  base: string;
  dir: string;
  head: { cx: number; cy: number; w: number };
  sourceHeadWidth: number;
  zoom: number;
  base_layers: ForgeLayer[];
  eyes: { whites: ForgeLayer; lids: Record<string, ForgeLayer> };
  brows: Record<string, { left: ForgeLayer; right: ForgeLayer }>;
  mouths: Record<string, ForgeLayer>;
  /** Where the head comes off the shoulders, so it can nod and shake on its
   *  own (Video Forge's puppetTypes `neck`). Fractions of the base's height. */
  neck?: { y: number; overlap: number; feather: number };
  /** Arm poses, drawn over the base and under the face. Waist-up puppets only. */
  poses?: Record<string, ForgeLayer>;
  /** How this puppet was made — engine, style, date. Read by people, not code. */
  madeBy?: Record<string, string>;
}

export interface ForgePuppet {
  json: ForgePuppetJson;
  /** file name → picture, all inside `dir` */
  files: Record<string, Img>;
}

const NOTHING: ForgeLayer = { file: "empty.png", x: 0, y: 0, w: 1, h: 1 };

/** Viseme ids Video Forge's lip-sync asks for (0 rest and 5 M·B·P are the base's closed mouth). */
const MOUTH_IDS: Record<string, string> = {
  mouth_AH: "1",
  mouth_EE: "2",
  mouth_OH: "3",
  mouth_OO: "4",
  mouth_FV: "6",
  mouth_L: "7",
  mouth_CHSH: "8",
  mouth_SMILE: "9",
};

/**
 * The head-and-shoulders square, so the round frame is filled by a face rather
 * than a bust. MEASURED from the closed-eyes part: its box is the eye line, and
 * the head's width is the drawn run across that line. Hair moves; the distance
 * between the ears does not (course, 16 Sep).
 */
export function bustBox(keyedBase: Img, eyes: Box | undefined): { s: number; x: number; y: number } | null {
  if (!eyes) return null;
  const eyeX = Math.round(eyes.x + eyes.w / 2);
  const eyeY = Math.round(eyes.y + eyes.h / 2);
  const opaque = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < keyedBase.width && y < keyedBase.height && keyedBase.data[(y * keyedBase.width + x) * 4 + 3] > 40;
  let left = eyeX;
  let right = eyeX;
  while (left > 0 && opaque(left - 1, eyeY)) left--;
  while (right < keyedBase.width - 1 && opaque(right + 1, eyeY)) right++;
  const headW = Math.max(right - left, keyedBase.width * 0.2);
  const EYE_AT = 0.42;
  // Never run past the bottom of the picture: the art stops there, and the
  // straight cut would show inside the circle like a bust on a shelf.
  const maxS = Math.floor((keyedBase.height - eyeY) / (1 - EYE_AT));
  const s = Math.min(Math.round(headW * 1.5), maxS, keyedBase.width);
  return { s, x: Math.round(eyeX - s / 2), y: Math.round(eyeY - s * EYE_AT) };
}

export function buildRig(o: { name: string; framing: PuppetFraming; base: Img; parts: Record<string, CutPart>; madeBy?: Record<string, string> }): ForgePuppet {
  const bg = borderColour(o.base);
  const keyedBase = keyOut(o.base, bg);
  // Waist-up keeps the whole picture: the arms are the point of it.
  const box = o.framing === "head" ? bustBox(keyedBase, o.parts.lid_closed?.box ?? o.parts.lid_half?.box) : null;
  const frame = box ? box.s : o.base.width;
  const files: Record<string, Img> = {
    "base.png": box ? crop(keyedBase, { x: box.x, y: box.y, w: box.s, h: box.s }) : keyedBase,
    "empty.png": { width: 1, height: 1, data: new Uint8ClampedArray(4) },
  };
  const ox = box?.x ?? 0;
  const oy = box?.y ?? 0;

  const layer = (id: string): ForgeLayer | null => {
    const p = o.parts[id];
    if (!p) return null;
    files[`${id}.png`] = keyOut(p.layer, bg);
    return {
      file: `${id}.png`,
      x: (p.box.x - ox + p.box.w / 2) / frame - 0.5,
      y: (p.box.y - oy + p.box.h / 2) / frame - 0.5,
      w: p.box.w,
      h: p.box.h,
    };
  };

  const mouths: Record<string, ForgeLayer> = { "0": NOTHING, "5": NOTHING };
  for (const [id, n] of Object.entries(MOUTH_IDS)) {
    const l = layer(id);
    if (l) mouths[n] = l;
  }

  // Video Forge's RESTING brow is called "serious" (a name from the first
  // puppets). The base already has calm brows, so resting draws nothing, and
  // the real serious drawing is published as "firm" — pointing "serious" at it
  // had the course cast scowling through every quiet moment.
  const rest = { left: NOTHING, right: NOTHING };
  const brows: ForgePuppetJson["brows"] = { rest, serious: rest };
  for (const [key, id] of Object.entries({ happy: "brow_happy", firm: "brow_serious", raised: "brow_raised", worried: "brow_worried", confused: "brow_confused" })) {
    const l = layer(id);
    // One picture holds both brows: it is the left entry, the right draws nothing.
    if (l) brows[key] = { left: l, right: NOTHING };
  }
  if (brows.worried) brows.sad = brows.worried;
  if (brows.firm) brows.angry = brows.firm;

  const lids: Record<string, ForgeLayer> = { open: NOTHING };
  for (const k of ["half", "closed", "wide"]) {
    const l = layer(`lid_${k}`);
    if (l) lids[k] = l;
  }

  const poses: Record<string, ForgeLayer> = {};
  for (const id of Object.keys(o.parts).filter((k) => k.startsWith("arms_"))) {
    const l = layer(id);
    if (l) poses[id.slice(5)] = l;
  }

  // THE NECK, measured: just under the chin, and the chin is the bottom of the
  // widest-open mouth (minus the soft edge cutPart padded it with). Below it
  // the body stays put; above it the head nods and shakes (Ak, 12 Oct 2026).
  const chinPart = o.parts.mouth_AH ?? o.parts.mouth_OH ?? o.parts.mouth_EE;
  const pad = Math.max(6, Math.round((o.base.width * 18) / 1024)) * 2;
  const neckY = chinPart ? (chinPart.box.y + chinPart.box.h - pad - oy) / frame + 0.03 : null;

  const json: ForgePuppetJson = {
    name: o.name,
    base: "base.png",
    // The pictures sit beside the rig file (Forge shelf: puppets/<slug>/).
    dir: ".",
    head: { cx: 0.5, cy: 0.5, w: 1 },
    sourceHeadWidth: frame,
    // Fill the round frame: at Video Forge's usual 90% the square's straight
    // bottom edge showed inside the circle.
    zoom: 1 / 0.9,
    base_layers: [],
    eyes: { whites: NOTHING, lids },
    brows,
    mouths,
    ...(neckY !== null && neckY > 0.3 && neckY < 0.95 ? { neck: { y: +neckY.toFixed(4), overlap: 0.05, feather: 0.015 } } : {}),
    ...(Object.keys(poses).length ? { poses } : {}),
    ...(o.madeBy ? { madeBy: o.madeBy } : {}),
  };
  return { json, files };
}

/** A safe folder and file name from whatever the character is called. */
export function puppetSlug(name: string): string {
  const ascii = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return ascii || `puppet-${Date.now().toString(36)}`;
}
