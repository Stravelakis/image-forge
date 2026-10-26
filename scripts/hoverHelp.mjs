/**
 * "No click is naked" (Ak, 13 Oct 2026) — the check.
 *
 * THE SAME FILE in both forges (Video Forge tools/lib/hoverHelp.mjs, Image
 * Forge scripts/hoverHelp.mjs). It reads every .tsx file and lists each
 * button, field, link and clickable thing that has no hover help: no title=,
 * data-tip=, tip= or hint= of its own, and no ancestor carrying one. The tests
 * in both repos fail when that list is not empty.
 *
 * A JSX reader, not a full parser: opening tags are found and their attributes
 * read with braces and strings balanced. Good enough for this code, and it
 * says where it looked so a miss is easy to find.
 */
import fs from "node:fs";
import path from "node:path";

const NATIVE = new Set(["button", "input", "select", "textarea", "a"]);
// Things that SHOW words or numbers (labels, statuses, badges, readouts). The
// second check (opts.texts) wants each of these to be explained too: by its
// own tip or by a tip on something around it.
const TEXTY = new Set(["span", "p", "h1", "h2", "h3", "h4", "h5", "h6", "label", "dt", "dd", "li", "td", "th", "strong", "em", "small", "b", "i", "legend", "figcaption", "summary", "code", "output", "div"]);
const TAG_START = /<(\/?)([A-Za-z][A-Za-z0-9_.-]*)/g;

function stripComments(src) {
  src = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  return src
    .split("\n")
    .map((l) => (l.trimStart().startsWith("//") ? "" : l))
    .join("\n");
}

/** Every interactive tag in one file's source, and whether it is explained. */
export function scanSource(src, { custom = [], tipTags = [], texts = false, tipAttrs = ["title", "data-tip", "tip", "hint"] } = {}) {
  src = stripComments(src);
  const CUSTOM = new Set(custom);
  // Components whose own definition carries a hover help for everything inside them.
  const TIPTAGS = new Set(tipTags);
  const TIP = new RegExp(`(?<![\\w-])(${tipAttrs.map((a) => a.replace(/[-]/g, "\\-")).join("|")})\\s*=`);
  const lineStarts = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === "\n") lineStarts.push(i + 1);
  const lineOf = (pos) => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= pos) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
  const out = [];
  const stack = [];
  let i = 0;
  const n = src.length;
  for (;;) {
    TAG_START.lastIndex = i;
    const m = TAG_START.exec(src);
    if (!m) break;
    const s = m.index;
    const prev = s > 0 ? src[s - 1] : "\n";
    const name = m[2];
    if (m[1] === "/") {
      const close = /^\s*>/.exec(src.slice(TAG_START.lastIndex, TAG_START.lastIndex + 20));
      if (close) {
        for (let k = stack.length - 1; k >= 0; k--) {
          if (stack[k].name === name) {
            stack.length = k;
            break;
          }
        }
        i = TAG_START.lastIndex + close[0].length;
      } else i = TAG_START.lastIndex;
      continue;
    }
    if (/[A-Za-z0-9_)\]"'.]/.test(prev)) {
      i = TAG_START.lastIndex;
      continue;
    }
    let j = TAG_START.lastIndex;
    let depth = 0;
    let end = -1;
    let selfClose = false;
    const limit = Math.min(n, j + 4000);
    while (j < limit) {
      const c = src[j];
      if (depth === 0 && c === "/" && src[j + 1] === ">") {
        end = j;
        selfClose = true;
        j += 2;
        break;
      }
      if (depth === 0 && c === ">") {
        end = j;
        j += 1;
        break;
      }
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === '"' || c === "'" || c === "`") {
        const q = c;
        j++;
        while (j < n && src[j] !== q) {
          if (src[j] === "\\") j++;
          j++;
        }
      }
      j++;
    }
    if (end < 0) {
      i = TAG_START.lastIndex;
      continue;
    }
    const attrs = src.slice(TAG_START.lastIndex, end);
    const ownTip = TIP.test(attrs);
    const ancestorTip = stack.some((e) => e.tip);
    const hasClick = /(?<![\w])onClick\s*=/.test(attrs);
    let interactive = false;
    if (NATIVE.has(name)) {
      interactive = true;
      if (name === "input" && (/type\s*=\s*"hidden"/.test(attrs) || /className\s*=\s*"hidden"/.test(attrs))) interactive = false;
    } else if (CUSTOM.has(name)) interactive = true;
    // A whole area that listens for clicks (to close a menu, to drag) is not
    // a control: a tip there would pop up over everything inside it.
    else if (hasClick && !["aside", "main", "section", "header", "footer", "nav", "form"].includes(name)) interactive = true;
    if (/aria-hidden\s*=\s*(\{?true\}?|"true")/.test(attrs)) interactive = false;
    const passThrough = /\{\s*\.\.\.(rest|p|props)\s*\}/.test(attrs);
    if (interactive && !passThrough) {
      const after = src.slice(j, j + 90).split("<")[0].replace(/\s+/g, " ").trim().slice(0, 60);
      out.push({ line: lineOf(s), tag: name, covered: ownTip || ancestorTip, text: after });
    }
    // Words only a screen reader hears (sr-only) are not on screen.
    if (texts && !selfClose && TEXTY.has(name) && !interactive && !/sr-only/.test(attrs)) {
      // Direct text: words, or a {value}, between this tag and the next tag.
      const inner = src.slice(j, j + 400).split("<")[0].replace(/\{\s*\}/g, " ");
      const bare = inner.trim();
      // Words written straight in the tag, outside any {braces}.
      let lit = "";
      let d2 = 0;
      for (const ch of bare) {
        if (ch === "{") d2++;
        else if (ch === "}") d2 = Math.max(0, d2 - 1);
        else if (d2 === 0) lit += ch;
      }
      const hasWords = /[A-Za-z0-9Ͱ-Ͽ]/.test(lit);
      // A balanced {value} is a readout (a number, a name). An unbalanced one
      // is a list or a condition that holds more tags: not text.
      const balanced = d2 === 0 && (bare.match(/\{/g) || []).length === (bare.match(/\}/g) || []).length;
      const readout = balanced && /^\{[^{}]*\}$/.test(bare) && !/\.map\(/.test(bare) && !/^\{\s*children\s*\}$/.test(bare) && !/\.hint\s*\}$/.test(bare);
      // A sentence of seven words or more explains itself: it IS the help.
      const prose = lit.trim().split(/\s+/).filter((w) => /[A-Za-zͰ-Ͽ]{2,}/.test(w)).length >= 7;
      if (bare && !prose && (hasWords || readout)) {
        out.push({ line: lineOf(s), tag: name, covered: ownTip || ancestorTip, text: bare.replace(/\s+/g, " ").slice(0, 60), kind: "text" });
      }
    }
    if (!selfClose) stack.push({ name, tip: ownTip || TIPTAGS.has(name) });
    i = j;
  }
  return out;
}

/** Every control without help under `root` (a folder of .tsx files). */
export function nakedControls(root, opts = {}) {
  const found = [];
  const allow = new Set(opts.allow ?? []);
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!(opts.skipDirs ?? []).includes(e.name)) walk(p);
      } else if (e.name.endsWith(".tsx") && (opts.skipFiles ?? []).includes(e.name)) {
        continue;
      } else if (e.name.endsWith(".tsx")) {
        for (const c of scanSource(fs.readFileSync(p, "utf8"), opts)) {
          if (!c.covered && !allow.has(`${path.relative(root, p).split(path.sep).join("/")}:${c.text}`)) found.push({ file: path.relative(root, p).split(path.sep).join("/"), ...c });
        }
      }
    }
  };
  walk(root);
  return found;
}

/** Words a person reads on screen: help texts, labels, placeholders, and lines of plain words in the markup. */
export function visibleStrings(root) {
  const out = [];
  const attr = /(?:data-tip|title|label|placeholder|aria-label|tip|hint)\s*=\s*(?:"([^"]*)"|\{`([^`]*)`\})/g;
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".tsx")) {
        const src = fs.readFileSync(p, "utf8");
        const file = path.relative(root, p).split(path.sep).join("/");
        let m;
        attr.lastIndex = 0;
        while ((m = attr.exec(src))) out.push({ file, kind: "tip", text: (m[1] ?? m[2]).replace(/\$\{[^}]*\}/g, "X") });
        for (const line of stripComments(src).split("\n")) {
          const t = line.trim();
          // a line of plain words inside the markup: no code characters
          if (t && /^[A-Za-zͰ-Ͽ][^<>{}=;()[\]|&]*$/.test(t) && / /.test(t)) out.push({ file, kind: "text", text: t });
        }
      }
    }
  };
  walk(root);
  return out;
}

/** Sentences in a help text. */
export function sentenceCount(text) {
  return text.split(/(?<=[.!?])\s+(?=[A-Z“"Ͱ-Ͽ])/).filter(Boolean).length;
}
