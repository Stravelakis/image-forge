/**
 * Picture maths for the puppet maker. Plain arrays only — no canvas, no DOM —
 * so the page, the tests and a headless run all use exactly this code.
 *
 * An Img is RGBA, 4 bytes a pixel, row by row (what canvas getImageData gives).
 */
import { bandFor, maxAreaPct, type PartKind, type PuppetFraming } from "./recipe";

export interface Img {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const blank = (width: number, height: number): Img => ({ width, height, data: new Uint8ClampedArray(width * height * 4) });

/** Bilinear resize. Engines sometimes hand back a different size than they were given. */
export function resize(src: Img, width: number, height: number): Img {
  if (src.width === width && src.height === height) return src;
  const out = blank(width, height);
  const sx = src.width / width;
  const sy = src.height / height;
  for (let y = 0; y < height; y++) {
    const fy = Math.min(src.height - 1, Math.max(0, (y + 0.5) * sy - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(src.height - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < width; x++) {
      const fx = Math.min(src.width - 1, Math.max(0, (x + 0.5) * sx - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(src.width - 1, x0 + 1);
      const tx = fx - x0;
      const o = (y * width + x) * 4;
      for (let c = 0; c < 4; c++) {
        const a = src.data[(y0 * src.width + x0) * 4 + c];
        const b = src.data[(y0 * src.width + x1) * 4 + c];
        const d = src.data[(y1 * src.width + x0) * 4 + c];
        const e = src.data[(y1 * src.width + x1) * 4 + c];
        out.data[o + c] = (a * (1 - tx) + b * tx) * (1 - ty) + (d * (1 - tx) + e * tx) * ty;
      }
    }
  }
  return out;
}

/**
 * The background colour, measured from the picture's border.
 *
 * Asked for pure magenta, a model returns its own idea of it — FLUX.2 drew
 * (232, 1, 117), hot pink, on 12 Oct 2026. Keying a fixed #FF00FF would miss
 * that entirely, so the colour actually drawn is read from the edges.
 */
export function borderColour(img: Img): [number, number, number] {
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  const take = (x: number, y: number) => {
    const i = (y * img.width + x) * 4;
    rs.push(img.data[i]);
    gs.push(img.data[i + 1]);
    bs.push(img.data[i + 2]);
  };
  const step = Math.max(1, Math.floor(Math.min(img.width, img.height) / 64));
  for (let x = 0; x < img.width; x += step) {
    take(x, 0);
    take(x, 1);
    take(x, img.height - 2);
  }
  for (let y = 0; y < img.height; y += step) {
    take(0, y);
    take(img.width - 1, y);
  }
  const med = (a: number[]) => a.sort((p, q) => p - q)[a.length >> 1];
  return [med(rs), med(gs), med(bs)];
}

/**
 * Make the background transparent — ONLY the background.
 *
 * FLOOD-FILLED FROM THE EDGES. The first version keyed every pixel near the
 * background colour, anywhere in the picture. Z-Image drew its "magenta" as a
 * pastel pink (12 Oct 2026), close enough to a fox's red fur and white chef's
 * hat that the face was riddled with holes, and the edge clean-up below
 * "subtracted pink" from what was left — the fox came out green. Now a pixel
 * only goes if it is background-coloured AND joined to the picture's border
 * through other background pixels. Pink inside the character stays.
 *
 * Then the soft edge: a feathered edge over pink is part pink, which is a halo
 * invisible on the pink and glaring on a park (course, Sep 2026). Pixels within
 * a few of the cleared area are treated as a mix of character and background —
 * opacity from how far they are from the background colour, and the
 * background's share taken out of their colour. Only those; the inside of the
 * character is never touched.
 *
 * `tolerance` is a colour distance (0–441) still counted as background.
 */
export function keyOut(img: Img, bg = borderColour(img), tolerance?: number): Img {
  // Strict first: 30 kept a fox's pink-lit hat whole where 60 bit holes in
  // it (12 Oct 2026). A patchy background that strict leaves standing along
  // the border gets one looser pass at a time.
  if (tolerance !== undefined) return keyWith(img, bg, tolerance);
  let out = keyWith(img, bg, 30);
  for (const t of [45, 60]) {
    if (borderLeft(out) < 0.2) break;
    out = keyWith(img, bg, t);
  }
  return out;
}

/** Share of the picture's border still opaque after keying. */
function borderLeft(img: Img): number {
  let n = 0;
  let all = 0;
  const at = (x: number, y: number) => {
    all++;
    if (img.data[(y * img.width + x) * 4 + 3] > 128) n++;
  };
  for (let x = 0; x < img.width; x += 2) {
    at(x, 0);
    at(x, 1);
  }
  for (let y = 0; y < img.height * 0.6; y += 2) {
    at(0, y);
    at(img.width - 1, y);
  }
  return n / all;
}

function keyWith(img: Img, bg: [number, number, number], tolerance: number): Img {
  const out: Img = { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) };
  const d = out.data;
  const W = img.width;
  const H = img.height;
  const dist = (p: number) => {
    const i = p * 4;
    const dr = d[i] - bg[0];
    const dg = d[i + 1] - bg[1];
    const db = d[i + 2] - bg[2];
    return Math.sqrt(dr * dr + dg * dg + db * db);
  };
  // 1. the background: everything background-coloured reachable from the border
  const gone = new Uint8Array(W * H);
  const stack: number[] = [];
  const seed = (p: number) => {
    if (!gone[p] && dist(p) <= tolerance) {
      gone[p] = 1;
      stack.push(p);
    }
  };
  for (let x = 0; x < W; x++) {
    seed(x);
    seed((H - 1) * W + x);
  }
  for (let y = 0; y < H; y++) {
    seed(y * W);
    seed(y * W + W - 1);
  }
  while (stack.length) {
    const p = stack.pop()!;
    const x = p % W;
    const y = (p / W) | 0;
    if (x > 0) seed(p - 1);
    if (x < W - 1) seed(p + 1);
    if (y > 0) seed(p - W);
    if (y < H - 1) seed(p + W);
  }
  // 2. the soft edge: up to EDGE pixels in from the cleared area
  const EDGE = Math.max(2, Math.round(W / 300));
  const near = new Uint8Array(W * H);
  for (let p = 0; p < W * H; p++) {
    if (!gone[p]) continue;
    const x = p % W;
    const y = (p / W) | 0;
    for (let dy = -EDGE; dy <= EDGE; dy++) {
      const yy = y + dy;
      if (yy < 0 || yy >= H) continue;
      for (let dx = -EDGE; dx <= EDGE; dx++) {
        const xx = x + dx;
        if (xx >= 0 && xx < W && !gone[yy * W + xx]) near[yy * W + xx] = 1;
      }
    }
  }
  const outer = tolerance * 2.2;
  for (let p = 0; p < W * H; p++) {
    const i = p * 4;
    if (gone[p]) {
      d[i + 3] = 0;
      continue;
    }
    if (!near[p]) continue;
    const e = dist(p);
    if (e >= outer) continue;
    const a = Math.max(0.05, (e - tolerance * 0.5) / (outer - tolerance * 0.5));
    // colour = a*fg + (1-a)*bg  →  fg = (colour - (1-a)*bg) / a
    for (let c = 0; c < 3; c++) d[i + c] = Math.max(0, Math.min(255, (d[i + c] - (1 - a) * bg[c]) / a));
    d[i + 3] = Math.round(d[i + 3] * a);
  }
  return out;
}

/** A soft rectangular edge, multiplied into whatever alpha the picture has. */
export function featherEdges(img: Img, feather: number): Img {
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const e = Math.min(x, y, img.width - 1 - x, img.height - 1 - y);
      if (e < feather) img.data[(y * img.width + x) * 4 + 3] = Math.round((img.data[(y * img.width + x) * 4 + 3] * e) / feather);
    }
  }
  return img;
}

/** How much of a keyed picture is left — a sanity check on the keying. */
export function opaqueShare(img: Img): number {
  let n = 0;
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i] > 128) n++;
  return n / (img.width * img.height);
}

export function crop(img: Img, box: Box): Img {
  const out = blank(box.w, box.h);
  for (let y = 0; y < box.h; y++) {
    const sy = y + box.y;
    if (sy < 0 || sy >= img.height) continue;
    for (let x = 0; x < box.w; x++) {
      const sx = x + box.x;
      if (sx < 0 || sx >= img.width) continue;
      const si = (sy * img.width + sx) * 4;
      const di = (y * box.w + x) * 4;
      out.data[di] = img.data[si];
      out.data[di + 1] = img.data[si + 1];
      out.data[di + 2] = img.data[si + 2];
      out.data[di + 3] = img.data[si + 3];
    }
  }
  return out;
}

/** Paint `top` over `under` at (x, y), alpha-blended. Returns a new picture. */
export function composite(under: Img, top: Img, x: number, y: number): Img {
  const out: Img = { width: under.width, height: under.height, data: new Uint8ClampedArray(under.data) };
  for (let ty = 0; ty < top.height; ty++) {
    const oy = ty + y;
    if (oy < 0 || oy >= out.height) continue;
    for (let tx = 0; tx < top.width; tx++) {
      const ox = tx + x;
      if (ox < 0 || ox >= out.width) continue;
      const ti = (ty * top.width + tx) * 4;
      const oi = (oy * out.width + ox) * 4;
      const a = top.data[ti + 3] / 255;
      if (a === 0) continue;
      const ua = out.data[oi + 3] / 255;
      const oa = a + ua * (1 - a);
      for (let c = 0; c < 3; c++) out.data[oi + c] = (top.data[ti + c] * a + out.data[oi + c] * ua * (1 - a)) / (oa || 1);
      out.data[oi + 3] = oa * 255;
    }
  }
  return out;
}

/** Two pictures of the same height, side by side — what the checker is shown. */
export function sideBySide(a: Img, b: Img, gap = 8): Img {
  const out = blank(a.width + gap + b.width, Math.max(a.height, b.height));
  out.data.fill(255);
  const put = (img: Img, ox: number) => {
    for (let y = 0; y < img.height; y++) out.data.set(img.data.subarray(y * img.width * 4, (y + 1) * img.width * 4), (y * out.width + ox) * 4);
  };
  put(a, 0);
  put(b, a.width + gap);
  return out;
}

/* ---------------- cutting a part out of an edit ---------------- */

export interface CutOptions {
  kind: PartKind;
  framing: PuppetFraming;
  /** per-channel difference that counts as "changed" */
  threshold?: number;
  /** soft edge, in pixels */
  feather?: number;
  /** a cell counts when it holds at least this share of the busiest cell's change */
  density?: number;
  /** the eye line, once known (y of the eyes' centre). Mouths must start below it. */
  eyeY?: number;
}

export type CutResult =
  | { ok: true; layer: Img; keyed: Img; box: Box; areaPct: number; boxPct: number }
  | { ok: false; reason: "same-size" | "nothing-changed" | "redrawn" | "outside" | "over-eyes"; detail: string };

/**
 * Find the one region an edit changed, and cut it out with a soft edge.
 *
 * Two guards, both earned on the course puppets:
 *  · DENSITY, not a bounding box. The model re-renders the whole picture a
 *    little, so a plain box of changed pixels spans the head. Score a 16 px
 *    grid and keep only cells carrying real change.
 *  · BANDS. A part may only sit in its own band of the picture, so noise in an
 *    ear cannot drag a mouth up over the eyes.
 * Plus one added here: once the eyes are known, a mouth must start below them.
 */
export function cutPart(base: Img, edit: Img, o: CutOptions): CutResult {
  if (edit.width !== base.width || edit.height !== base.height) {
    return { ok: false, reason: "same-size", detail: `edit is ${edit.width}×${edit.height}, base is ${base.width}×${base.height}` };
  }
  const T = o.threshold ?? 26;
  // The grid and the soft edge scale with the picture: 16 px cells and an
  // 18 px edge at 1024, as on the course puppets.
  const CELL = Math.max(8, Math.round(base.width / 64));
  const FEATHER = o.feather ?? Math.max(6, Math.round((base.width * 18) / 1024));
  const { width: W, height: H } = base;
  const gw = Math.ceil(W / CELL);
  const gh = Math.ceil(H / CELL);
  // Two scores per cell: how MANY pixels changed (to tell "nothing happened"),
  // and how MUCH (to tell an edit from a shimmer). A one-pixel shift of an
  // edge changes many pixels a little; an opened beak changes some a lot.
  const count = new Float32Array(gw * gh);
  const grid = new Float32Array(gw * gh);
  let changed = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const d = Math.max(
        Math.abs(edit.data[i] - base.data[i]),
        Math.abs(edit.data[i + 1] - base.data[i + 1]),
        Math.abs(edit.data[i + 2] - base.data[i + 2])
      );
      if (d > T) {
        changed++;
        const c = ((y / CELL) | 0) * gw + ((x / CELL) | 0);
        count[c]++;
        grid[c] += (d - T) * (d - T);
      }
    }
  }
  const areaPct = (changed / (W * H)) * 100;
  const [bandTop, bandBot] = bandFor(o.kind, o.framing);
  const gyMin = Math.floor(bandTop * gh);
  const gyMax = Math.min(gh, Math.ceil(bandBot * gh));
  let peak = 0;
  let peakCount = 0;
  for (let gy = gyMin; gy < gyMax; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      peak = Math.max(peak, grid[gy * gw + gx]);
      peakCount = Math.max(peakCount, count[gy * gw + gx]);
    }
  }
  // A cell with only a few changed pixels is noise, not an edit.
  if (peakCount < CELL * CELL * 0.08) return { ok: false, reason: "nothing-changed", detail: "the picture came back (almost) unchanged" };
  const cut = peak * (o.density ?? 0.18);
  // PATCHES, not every busy cell. Texture shimmers on every re-render — a
  // knitted cardigan did on the first FLUX.2 owl (12 Oct 2026) — and a box
  // around every busy cell took the beak AND the cardigan and called the
  // edit "redrawn". So busy cells are grouped into patches (touching, or one
  // cell apart), and only patches carrying at least a quarter of the biggest
  // one's change are kept. Two eyes are two strong patches; shimmer is many
  // weak ones.
  const busy = (gx: number, gy: number) => gy >= gyMin && gy < gyMax && gx >= 0 && gx < gw && grid[gy * gw + gx] >= cut;
  const patchOf = new Int32Array(gw * gh).fill(-1);
  const weights: number[] = [];
  for (let gy = gyMin; gy < gyMax; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      if (!busy(gx, gy) || patchOf[gy * gw + gx] !== -1) continue;
      const id = weights.length;
      let weight = 0;
      const stack = [gy * gw + gx];
      patchOf[gy * gw + gx] = id;
      while (stack.length) {
        const c = stack.pop()!;
        weight += grid[c];
        const cx = c % gw;
        const cy = (c / gw) | 0;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (!busy(nx, ny) || patchOf[ny * gw + nx] !== -1) continue;
            patchOf[ny * gw + nx] = id;
            stack.push(ny * gw + nx);
          }
        }
      }
      weights.push(weight);
    }
  }
  const strongest = Math.max(...weights);
  const keep = new Set(weights.map((w, i) => (w >= strongest * 0.25 ? i : -1)).filter((i) => i >= 0));
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let gy = gyMin; gy < gyMax; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      if (!keep.has(patchOf[gy * gw + gx])) continue;
      const px = gx * CELL;
      const py = gy * CELL;
      x0 = Math.min(x0, px);
      y0 = Math.min(y0, py);
      x1 = Math.max(x1, Math.min(W - 1, px + CELL - 1));
      y1 = Math.max(y1, Math.min(H - 1, py + CELL - 1));
    }
  }
  if (x1 < 0) return { ok: false, reason: "outside", detail: "the change is not where this part belongs" };
  const boxPct = (((x1 - x0 + 1) * (y1 - y0 + 1)) / (W * H)) * 100;
  if (boxPct > maxAreaPct(o.kind)) {
    return { ok: false, reason: "redrawn", detail: `the change covers ${boxPct.toFixed(0)}% of the picture — it was redrawn, not edited` };
  }
  if (o.kind === "mouth" && o.eyeY !== undefined && y0 < o.eyeY) {
    return { ok: false, reason: "over-eyes", detail: "the mouth change reaches up over the eyes" };
  }
  const pad = FEATHER * 2;
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  x1 = Math.min(W - 1, x1 + pad);
  y1 = Math.min(H - 1, y1 + pad);
  const box: Box = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  // Feather the rectangle's edge so the part blends instead of showing a seam.
  const layer = featherEdges(crop(edit, box), FEATHER);
  // The same part with the background taken out of the WHOLE edit first, so
  // the keying sees the picture's real border (an arm reaching past the base's
  // outline still keeps its own edge). What the puppet is built from.
  const keyed = featherEdges(crop(keyOut(edit, borderColour(base)), box), FEATHER);
  return { ok: true, layer, keyed, box, areaPct, boxPct };
}
