/**
 * THE SAFETY COPY (audit finding H5): a picture is saved the moment it arrives.
 *
 * With no output folder linked, a finished picture used to live only in the
 * page's memory, so closing the app after a paid run lost it while the table
 * still said "done". Now every picture is also written here:
 *
 *   <userData>/images/<folder>/<filename>
 *
 * <folder> is one of the five the app uses (images, vectors, lottie, sheets,
 * gifs), the same as in a linked output folder. Plain Node, no Electron
 * import, so the tests run the real code.
 */
import fs from "node:fs";
import path from "node:path";

const FOLDERS = new Set(["images", "vectors", "lottie", "sheets", "gifs"]);
const FILE = /^[a-z0-9][a-z0-9_.-]{0,100}\.(png|jpg|jpeg|webp|gif|svg|json)$/i;
const MAX = 40 * 1024 * 1024;

export const autosaveRoot = (userData) => path.join(userData, "images");

function safe(root, folder, file) {
  if (!FOLDERS.has(String(folder))) return null;
  if (!FILE.test(String(file)) || file !== path.basename(file) || String(file).includes("..")) return null;
  return path.join(root, folder, file);
}

export function writeAutosave(root, folder, file, bytes) {
  const p = safe(root, folder, file);
  if (!p) return { ok: false, problem: "bad name" };
  if (bytes.length > MAX) return { ok: false, problem: "too large" };
  fs.mkdirSync(path.dirname(p), { recursive: true });
  // Written to a temp file and renamed, so a crash never leaves half a picture.
  const tmp = `${p}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, bytes);
  fs.renameSync(tmp, p);
  return { ok: true };
}

export function readAutosave(root, folder, file) {
  const p = safe(root, folder, file);
  return p && fs.existsSync(p) ? fs.readFileSync(p) : null;
}
