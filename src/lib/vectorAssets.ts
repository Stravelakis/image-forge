/**
 * Vectors and animated icons — drawn as CODE, not pixels.
 *
 * An image model cannot make an SVG. It makes pixels, and anything claiming
 * otherwise hands you a picture that merely looks like a vector. A *code* model
 * can write the SVG itself: real paths, infinitely scalable, a few kilobytes,
 * editable in any text editor.
 *
 * The same is true of Lottie, which is only JSON describing an animation.
 *
 * Codestral is built for exactly this, which is why the code engine is kept
 * separate from the prose engine.
 *
 * ── Safety ────────────────────────────────────────────────────────────────
 * Model-written SVG is untrusted code that ends up inside the page. SVG can
 * carry <script>, event handlers and external references, so everything here
 * goes through sanitiseSvg() before it is shown or saved. That is not
 * belt-and-braces; it is the whole reason this file has a sanitiser.
 */

import type { ForgeSettings } from "./providers";
import { scribeChat } from "./providers";

export type VectorKind = "svg-icon" | "svg-illustration" | "lottie";

export interface VectorAsset {
  kind: VectorKind;
  /** the SVG markup, or the Lottie JSON, as text */
  code: string;
  /** what the model called it */
  title: string;
  problem?: string;
}

/* ---------------- what we ask for ---------------- */

const SHARED_RULES = `Reply with ONLY the code. No prose, no explanation, no markdown fences.
Never include <script>, event handlers (onclick, onload and the like), <foreignObject>,
external images, or references to any URL. Everything must be self-contained.`;

export const SVG_ICON_SYSTEM = `You write clean, minimal SVG icons.

Rules:
- a single <svg> root with a viewBox of "0 0 24 24" and no width or height attributes
- strokes, not fills, unless a solid shape is clearly wanted
- stroke-width 1.5, stroke-linecap "round", stroke-linejoin "round"
- use currentColor for stroke and fill so the icon takes the colour around it
- simple geometry: a handful of paths, no gradients, no filters, no masks
- it must read clearly at 16 pixels across

${SHARED_RULES}`;

export const SVG_ILLUSTRATION_SYSTEM = `You write self-contained SVG illustrations.

Rules:
- a single <svg> root with a sensible viewBox and no width or height attributes
- flat vector shapes and a small deliberate palette, given as literal hex colours
- gradients are allowed; filters, masks and clip paths only if genuinely needed
- keep it under about 200 elements so it stays quick to draw and easy to edit

${SHARED_RULES}`;

export const LOTTIE_SYSTEM = `You write Lottie animation JSON, the bodymovin format.

Rules:
- a complete Lottie object with v, fr, ip, op, w, h and layers
- fr 60, ip 0, op 60 — a one second loop — unless asked otherwise
- shape layers only (ty 4). No images, no expressions, no fonts, no external assets
- animate with keyframes on transform properties (position, scale, rotation, opacity)
- keep it small and readable: a few layers, not dozens

${SHARED_RULES}`;

const SYSTEMS: Record<VectorKind, string> = {
  "svg-icon": SVG_ICON_SYSTEM,
  "svg-illustration": SVG_ILLUSTRATION_SYSTEM,
  lottie: LOTTIE_SYSTEM,
};

/* ---------------- making SVG safe ---------------- */

/*
 * An ALLOW-LIST, not a block-list.
 *
 * The first cleaner worked on text and removed a list of bad tags. It missed
 * `<svg><img/src=x/onerror=alert(1)></svg>` (an HTML parser lets <img> out of
 * the svg, and its onerror runs in the app's own page) and `<style>@import
 * url(…)</style>`. A block-list can only ever be as good as the attacker's
 * imagination is bad.
 *
 * This one parses the markup the way the browser will, walks the result, and
 * writes out ONLY the shapes and presentation attributes named below. Anything
 * else — unknown tags, every on… attribute, <style>, <image>, <a>, <foreignObject>,
 * links that leave the file — is dropped, and what was dropped is reported.
 * The output is built from scratch, never by re-serialising the parsed tree,
 * so there is nothing for a second parse to disagree about.
 */

/** Elements that may stay. The key is the lower-case name, the value how to write it. */
const ALLOWED_TAGS: Record<string, string> = Object.fromEntries(
  [
    "svg", "g", "defs", "symbol", "use", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
    "text", "tspan", "textPath", "title", "desc",
    "linearGradient", "radialGradient", "stop", "clipPath", "mask", "pattern", "marker",
    "filter", "feGaussianBlur", "feOffset", "feColorMatrix", "feComposite", "feFlood", "feMerge", "feMergeNode",
    "feDropShadow", "feBlend",
    // a spin or a pulse is the point of an animated icon; it may only ever animate `transform` (checked below)
    "animateTransform",
  ].map((t) => [t.toLowerCase(), t])
);

/** Only these hold text. Everywhere else a text node is dropped. */
const TEXT_TAGS = new Set(["text", "tspan", "textpath", "title", "desc"]);

/** Attributes that may stay, on any allowed element. Lower-case key, written form as value. */
const ALLOWED_ATTRS: Record<string, string> = Object.fromEntries(
  [
    // geometry
    "x", "y", "x1", "x2", "y1", "y2", "cx", "cy", "r", "rx", "ry", "fx", "fy", "width", "height", "d", "points",
    "transform", "viewBox", "preserveAspectRatio", "dx", "dy", "rotate", "textLength", "lengthAdjust", "startOffset",
    // painting
    "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "stroke-dashoffset",
    "stroke-miterlimit", "stroke-opacity", "fill-opacity", "fill-rule", "clip-rule", "opacity", "color",
    "stop-color", "stop-opacity", "offset", "flood-color", "flood-opacity", "color-interpolation-filters",
    "clip-path", "mask", "filter", "marker-start", "marker-mid", "marker-end", "paint-order", "vector-effect",
    "shape-rendering", "visibility", "display",
    // text
    "font-family", "font-size", "font-weight", "font-style", "text-anchor", "dominant-baseline", "letter-spacing",
    "text-decoration",
    // gradients, patterns, clips, markers, filters
    "gradientUnits", "gradientTransform", "spreadMethod", "patternUnits", "patternContentUnits", "patternTransform",
    "clipPathUnits", "maskUnits", "maskContentUnits", "markerWidth", "markerHeight", "markerUnits", "refX", "refY",
    "orient", "filterUnits", "primitiveUnits", "stdDeviation", "in", "in2", "result", "values", "type", "mode",
    "operator", "k1", "k2", "k3", "k4",
    // animateTransform
    "attributeName", "from", "to", "dur", "repeatCount", "begin", "end", "additive", "calcMode", "keyTimes",
    "keySplines", "accumulate", "repeatDur", "restart",
    // naming and accessibility
    "id", "version", "role", "aria-label", "aria-hidden", "aria-labelledby", "aria-describedby",
    "focusable",
  ].map((a) => [a.toLowerCase(), a])
);

/** The only elements that may point at something else, and only inside this file (#id). */
const REF_TAGS = new Set(["use", "lineargradient", "radialgradient", "pattern", "textpath"]);

/** Style declarations that are plain painting. Anything else in a style attribute is dropped. */
const STYLE_PROPS = new Set([
  "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "stroke-dashoffset",
  "stroke-miterlimit", "stroke-opacity", "fill-opacity", "fill-rule", "clip-rule", "opacity", "color",
  "stop-color", "stop-opacity", "flood-color", "flood-opacity", "font-family", "font-size", "font-weight",
  "font-style", "text-anchor", "dominant-baseline", "letter-spacing", "paint-order", "display", "visibility",
  "mix-blend-mode", "transform", "transform-origin", "transform-box",
]);

export interface SanitiseResult {
  svg: string;
  /** what was taken out, so it can be reported rather than hidden */
  removed: string[];
  ok: boolean;
}

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Does a value try to run something or fetch something from outside the file? */
function unsafeValue(v: string): string | null {
  const t = v.replace(/[\u0000- \u007f]+/g, "").toLowerCase(); // "java\nscript:" is still javascript:
  if (/javascript:|vbscript:/.test(t)) return "javascript: urls";
  if (/data:|expression\(|@import|-moz-binding|behavior:/.test(t)) return "external references";
  // url(...) is fine only when it points at an #id inside this file
  for (const m of t.matchAll(/url\(([^)]*)\)/g)) {
    const target = m[1].replace(/^['"]|['"]$/g, "");
    if (!target.startsWith("#")) return "external references";
  }
  return null;
}

/** A style attribute with only the plain painting declarations left. */
function cleanStyle(v: string, note: (what: string) => void): string {
  const keep: string[] = [];
  for (const decl of v.split(";")) {
    const i = decl.indexOf(":");
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim().toLowerCase();
    const val = decl.slice(i + 1).trim();
    const bad = unsafeValue(val);
    if (bad) note(bad);
    else if (STYLE_PROPS.has(prop)) keep.push(`${prop}:${val}`);
  }
  return keep.join(";");
}

/** The markup as a DOM, the way the browser will read it. Null when this environment has no parser. */
function parseMarkup(markup: string): Element | null {
  if (typeof DOMParser === "undefined") return null;
  const parser = new DOMParser();
  // Strict XML first: it keeps well-formed SVG exactly as written.
  try {
    const xml = parser.parseFromString(markup, "image/svg+xml");
    const root = xml.documentElement;
    if (root && root.localName === "svg" && !xml.getElementsByTagName("parsererror").length) return root;
  } catch {
    /* fall through to the forgiving parser */
  }
  // Models often write slightly broken SVG (a bare &, a missing quote). The HTML
  // parser copes; what it does with it is exactly what a browser would do.
  const html = parser.parseFromString(markup, "text/html");
  return html.querySelector("svg");
}

/**
 * Keep only what is on the allow-list of model-written SVG, and say what went.
 * Needs a DOM parser (every browser and Electron page has one); without one it
 * keeps nothing, which is the safe failure.
 */
export function sanitiseSvg(raw: string): SanitiseResult {
  const removed: string[] = [];
  const note = (what: string) => {
    if (!removed.includes(what)) removed.push(what);
  };
  let svg = String(raw);

  // markdown fences, if the model added them despite being told not to
  svg = svg.replace(/^\s*```[a-z]*\s*/i, "").replace(/```\s*$/i, "");

  // keep only from the first <svg to the last </svg>
  const start = svg.search(/<svg[\s>]/i);
  const end = svg.toLowerCase().lastIndexOf("</svg>");
  if (start < 0 || end < 0) return { svg: "", removed: ["no <svg> element found"], ok: false };
  svg = svg.slice(start, end + 6);

  const root = parseMarkup(svg);
  if (!root) return { svg: "", removed: ["could not read the SVG safely"], ok: false };

  // Tags the text had in it that are not on the list, so the report is honest even for
  // ones an HTML parser would have thrown out of the picture (the <img> trick).
  for (const m of svg.matchAll(/<\s*([a-z][a-z0-9:-]*)/gi)) {
    const tag = m[1].toLowerCase();
    if (!ALLOWED_TAGS[tag] && tag !== "a") note(`<${tag}>`);
  }

  const walk = (el: Element, isRoot = false): string => {
    const lower = el.localName.toLowerCase();
    // <a> only wraps shapes: keep what is inside, drop the link.
    if (lower === "a") {
      note("links");
      return Array.from(el.childNodes).map((n) => (n.nodeType === 1 ? walk(n as Element) : "")).join("");
    }
    const tag = ALLOWED_TAGS[lower];
    if (!tag) {
      // dropped, with everything inside it (the tag itself is reported above)
      if (el.hasAttribute("href") || el.hasAttribute("xlink:href") || el.hasAttribute("src")) note("external references");
      return "";
    }

    const attrs: string[] = [];
    for (const a of Array.from(el.attributes)) {
      const name = a.name.toLowerCase();
      const value = a.value;
      if (name.startsWith("on")) {
        note("event handlers");
        continue;
      }
      if (name === "xmlns") continue; // written once on the root, below, always the right one
      if (name === "href" || name === "xlink:href") {
        // inside-the-file references only, and only where they mean something
        if (REF_TAGS.has(lower) && value.trim().startsWith("#")) attrs.push(` ${name}="${esc(value.trim())}"`);
        else note("external references");
        continue;
      }
      if (name === "style") {
        const s = cleanStyle(value, note);
        if (s) attrs.push(` style="${esc(s)}"`);
        continue;
      }
      if (name.startsWith("xmlns:") || name === "xml:space") continue; // other namespaces carry nothing we draw
      const written = ALLOWED_ATTRS[name];
      if (!written) continue; // unknown attribute: dropped quietly
      const bad = unsafeValue(value);
      if (bad) {
        note(bad);
        continue;
      }
      // an animation may only ever move the picture, never rewrite another attribute
      if (lower === "animatetransform" && name === "attributename" && value.trim().toLowerCase() !== "transform") {
        note("animation of other attributes");
        return "";
      }
      attrs.push(` ${written}="${esc(value)}"`);
    }
    if (lower === "use" && !attrs.some((a) => a.startsWith(" href=") || a.startsWith(" xlink:href="))) return ""; // a <use> with nothing local to use

    let inner = "";
    for (const n of Array.from(el.childNodes)) {
      if (n.nodeType === 1) inner += walk(n as Element);
      else if ((n.nodeType === 3 || n.nodeType === 4) && TEXT_TAGS.has(lower)) inner += esc(n.textContent ?? "");
    }
    const open = isRoot ? `<${tag} xmlns="http://www.w3.org/2000/svg"${attrs.join("")}` : `<${tag}${attrs.join("")}`;
    return inner ? `${open}>${inner}</${tag}>` : `${open}/>`;
  };

  const out = walk(root, true).trim();
  return { svg: out, removed, ok: out.startsWith("<svg") };
}

/** Does this look like a usable icon? */
export function checkSvg(svg: string): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  if (!/<svg[\s>]/i.test(svg)) problems.push("there is no <svg> element");
  if (!/viewBox\s*=/i.test(svg)) problems.push("it has no viewBox, so it will not scale");
  const opens = (svg.match(/<[a-z]/gi) ?? []).length;
  if (opens < 2) problems.push("it is empty — nothing would be drawn");
  if (svg.length > 400_000) problems.push("it is enormous; something has gone wrong");
  return { ok: problems.length === 0, problems };
}

/** Does this look like a real Lottie animation? */
export function checkLottie(text: string): { ok: boolean; problems: string[]; data?: Record<string, unknown> } {
  const problems: string[] = [];
  let data: Record<string, unknown>;
  const cleaned = text.replace(/^\s*```[a-z]*\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    data = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    return { ok: false, problems: ["it is not valid JSON"] };
  }
  for (const key of ["v", "fr", "ip", "op", "w", "h", "layers"]) {
    if (!(key in data)) problems.push(`missing "${key}"`);
  }
  if (!Array.isArray(data.layers)) problems.push('"layers" is not a list');
  else if (data.layers.length === 0) problems.push("it has no layers, so nothing would move");
  if (typeof data.fr === "number" && (data.fr <= 0 || data.fr > 120)) problems.push("the frame rate is not sensible");
  if (JSON.stringify(data).includes('"ty":2')) problems.push("it uses an image layer, which will not be self-contained");
  return { ok: problems.length === 0, problems, data };
}

/* ---------------- asking the code model ---------------- */

/** Which engine writes the code: the code model if set, otherwise the prose one. */
export function codeEngineFor(settings: ForgeSettings): { engine: ForgeSettings["coder"]; usingFallback: boolean } {
  if (settings.coder.key.trim()) return { engine: settings.coder, usingFallback: false };
  return { engine: settings.scribe, usingFallback: true };
}

export async function makeVector(
  kind: VectorKind,
  description: string,
  settings: ForgeSettings,
  signal?: AbortSignal
): Promise<VectorAsset> {
  const title = description.trim().slice(0, 60) || "untitled";
  const { engine, usingFallback } = codeEngineFor(settings);

  if (!engine.key.trim()) {
    return {
      kind,
      code: "",
      title,
      problem: "no code-engine key — add Codestral under Settings → Text engines",
    };
  }

  let answer: string;
  try {
    answer = await scribeChat(engine, SYSTEMS[kind], description.trim(), signal);
  } catch (e) {
    return { kind, code: "", title, problem: (e as { message?: string })?.message ?? "the code engine could not be reached" };
  }

  if (kind === "lottie") {
    const check = checkLottie(answer);
    if (!check.ok) return { kind, code: "", title, problem: check.problems.join("; ") };
    return { kind, code: JSON.stringify(check.data, null, 2), title };
  }

  const clean = sanitiseSvg(answer);
  if (!clean.ok) return { kind, code: "", title, problem: clean.removed.join("; ") || "the model did not return an SVG" };
  const check = checkSvg(clean.svg);
  if (!check.ok) return { kind, code: clean.svg, title, problem: check.problems.join("; ") };

  return {
    kind,
    code: clean.svg,
    title,
    ...(clean.removed.length
      ? { problem: `removed for safety: ${clean.removed.join(", ")}` }
      : usingFallback
        ? { problem: "written by your prose model — Codestral would do this better" }
        : {}),
  };
}

/** icon_anvil + svg-icon → icon_anvil.svg */
export function vectorFilename(base: string, kind: VectorKind): string {
  const stem = base.replace(/\.[a-z0-9]+$/i, "") || "asset";
  return kind === "lottie" ? `${stem}.json` : `${stem}.svg`;
}

/** A data URL for previewing an SVG without putting it in the DOM. */
export const svgToDataUrl = (svg: string): string =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
