/**
 * THE PUPPET WORKSHOP (14 Oct 2026): every puppet, saved as it is made.
 *
 * Ak made a groom and a guy that never reached Made: a puppet lived only in the
 * open puppet maker until it was sent to Video Forge, so closing the window
 * lost it. Now each one is a folder here from the moment its face is chosen,
 * updated after every part, and opened again from Made to review, tweak part
 * by part ("redo with my note"), add a side view, and send.
 *
 *   <userData>/workshop/<slug>/meta.json      what it is, every part's state,
 *                                              the checker's and your notes
 *   <userData>/workshop/<slug>/base.png       the chosen face, background in
 *   <userData>/workshop/<slug>/<part>.*.png   each part: layer, keyed, pair…
 *
 * Plain Node, no Electron import, so the tests run the real code.
 */
import fs from "node:fs";
import path from "node:path";

const SLUG = /^[a-z0-9][a-z0-9-]{0,59}$/;
const FILE = /^[a-z0-9][a-z0-9_.-]{0,100}\.(png|json)$/i;
const MAX = 20 * 1024 * 1024;

export const workshopRoot = (userData) => path.join(userData, "workshop");

function safe(root, slug, file) {
  if (!SLUG.test(String(slug))) return null;
  if (file !== undefined && (!FILE.test(String(file)) || file !== path.basename(file))) return null;
  return file === undefined ? path.join(root, slug) : path.join(root, slug, file);
}

/** Every puppet in the workshop, newest first: its meta.json, as saved. */
export function listWorkshop(root) {
  if (!fs.existsSync(root)) return [];
  const out = [];
  for (const slug of fs.readdirSync(root)) {
    const p = safe(root, slug, "meta.json");
    if (!p || !fs.existsSync(p)) continue;
    try {
      out.push({ ...JSON.parse(fs.readFileSync(p, "utf8")), slug });
    } catch {
      /* a broken meta is skipped */
    }
  }
  return out.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
}

export function readWorkshopFile(root, slug, file) {
  const p = safe(root, slug, file);
  return p && fs.existsSync(p) ? fs.readFileSync(p) : null;
}

export function writeWorkshopFile(root, slug, file, bytes) {
  const p = safe(root, slug, file);
  if (!p) return { ok: false, problem: "bad name" };
  if (bytes.length > MAX) return { ok: false, problem: "too large" };
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, bytes);
  fs.renameSync(tmp, p);
  return { ok: true };
}

/** Moved aside to workshop-deleted, never erased. */
export function removeWorkshop(root, slug, now = new Date()) {
  const p = safe(root, slug);
  if (!p) return { ok: false, problem: "bad name" };
  if (!fs.existsSync(p)) return { ok: true, gone: false };
  const bin = path.join(path.dirname(root), "workshop-deleted");
  fs.mkdirSync(bin, { recursive: true });
  fs.renameSync(p, path.join(bin, `${slug}-${now.toISOString().replace(/[:.]/g, "-")}`));
  return { ok: true, gone: true };
}
