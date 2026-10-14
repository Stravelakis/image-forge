/**
 * The Forge shelf: puppet orders and finished puppets, shared by Video Forge
 * and Image Forge on one computer (12 Oct 2026).
 *
 * THE SAME FILE lives in both repos — Video Forge `tools/lib/forgeShelf.mjs`,
 * Image Forge `electron/forgeShelf.mjs`. Change one, copy it to the other.
 *
 *   %APPDATA%\Forge\orders\<id>.json        an order: "make me this puppet"
 *   %APPDATA%\Forge\orders\<id>\insp_0.png   its inspiration pictures
 *   %APPDATA%\Forge\orders\<id>.done.json    the answer: which puppet, or why not
 *   %APPDATA%\Forge\puppets\<slug>\<slug>.rig.json + its pictures
 *
 * Video Forge places orders and reads puppets; Image Forge takes orders and
 * writes puppets. Plain folders, like the link before it: nothing has to be
 * open at the same moment, and a person can look inside and see everything.
 * Everything read from here is checked — it is another program's writing.
 *
 * Plain Node, no Electron import, so the tests run the real code.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const SHELF_VERSION = 1;
const ID = /^[a-z0-9][a-z0-9-]{5,63}$/;
const SLUG = /^[a-z0-9][a-z0-9-]{0,59}$/;
const FILE = /^[a-z0-9][a-z0-9_.-]{0,80}\.(png|json)$/i;
const STYLES = new Set(["pixar", "lifelike", "photo", "flat", "clay", "paper", "anime", "doodle"]);
const MAX_PICTURE = 12 * 1024 * 1024;

export function shelfRoot(env = process.env) {
  return path.join(env.APPDATA || path.join(os.homedir(), ".config"), "Forge");
}
const dirs = (root) => ({ orders: path.join(root, "orders"), puppets: path.join(root, "puppets") });

function writeAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

/** Check an order and return it cleaned, or say what is wrong. */
export function validateOrder(raw) {
  let o = raw;
  if (typeof raw === "string") {
    try {
      o = JSON.parse(raw);
    } catch {
      return { ok: false, problem: "the order is not valid JSON" };
    }
  }
  if (!o || typeof o !== "object") return { ok: false, problem: "the order is empty" };
  if (!ID.test(String(o.id || ""))) return { ok: false, problem: "bad order id" };
  const description = String(o.description || "").trim().slice(0, 1500);
  if (!description) return { ok: false, problem: "the order does not describe the character" };
  return {
    ok: true,
    order: {
      id: o.id,
      kind: "puppet",
      // Which forge it is for. Only Image Forge makes puppets today; the field
      // is here so the Social and Content Forges can order from any forge
      // without a new format (13 Oct 2026).
      to: ["image-forge", "video-forge", "social-forge", "content-forge"].includes(o.to) ? o.to : "image-forge",
      from: String(o.from || "another app").slice(0, 40),
      name: String(o.name || "").trim().slice(0, 60) || "puppet",
      description,
      style: STYLES.has(o.style) ? o.style : "pixar",
      framing: o.framing === "waist" || o.framing === "full" ? o.framing : "head",
      // Make it with nobody there: the first face the checker likes is used.
      auto: o.auto === true,
      inspirations: (Array.isArray(o.inspirations) ? o.inspirations : []).filter((f) => FILE.test(f) && /\.png$/i.test(f)).slice(0, 3),
      createdAt: String(o.createdAt || new Date().toISOString()),
    },
  };
}

/** Video Forge: place an order. `pictures` are PNG Buffers (inspiration). */
export function placeOrder(root, order, pictures = []) {
  const { orders } = dirs(root);
  const inspirations = pictures.slice(0, 3).map((_, i) => `insp_${i}.png`);
  const v = validateOrder({ ...order, inspirations });
  if (!v.ok) return v;
  pictures.slice(0, 3).forEach((buf, i) => {
    if (buf.length <= MAX_PICTURE) writeAtomic(path.join(orders, v.order.id, `insp_${i}.png`), buf);
  });
  writeAtomic(path.join(orders, `${v.order.id}.json`), JSON.stringify({ ...v.order, shelfVersion: SHELF_VERSION }, null, 2));
  return { ok: true, order: v.order };
}

/** Image Forge: orders not answered yet, oldest first. */
export function openOrders(root) {
  const { orders } = dirs(root);
  if (!fs.existsSync(orders)) return [];
  const out = [];
  for (const f of fs.readdirSync(orders)) {
    if (!f.endsWith(".json") || f.endsWith(".done.json")) continue;
    const id = f.slice(0, -5);
    if (fs.existsSync(path.join(orders, `${id}.done.json`))) continue;
    try {
      const v = validateOrder(fs.readFileSync(path.join(orders, f), "utf8"));
      if (v.ok) out.push(v.order);
    } catch {
      /* being written */
    }
  }
  return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** One inspiration picture of an order, or null. */
export function orderPicture(root, id, file) {
  if (!ID.test(id) || !FILE.test(file)) return null;
  const p = path.join(dirs(root).orders, id, file);
  return fs.existsSync(p) ? fs.readFileSync(p) : null;
}

/** Image Forge: answer an order — with a puppet's slug, or a reason. */
export function finishOrder(root, id, result) {
  if (!ID.test(id)) return { ok: false, problem: "bad order id" };
  const slug = result?.slug && SLUG.test(result.slug) ? result.slug : null;
  writeAtomic(
    path.join(dirs(root).orders, `${id}.done.json`),
    JSON.stringify({ id, slug, problem: slug ? null : String(result?.problem || "not made").slice(0, 300), finishedAt: new Date().toISOString() }, null, 2)
  );
  return { ok: true };
}

/** Video Forge: what became of an order. Null while it is still being made. */
export function orderResult(root, id) {
  if (!ID.test(id)) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(dirs(root).orders, `${id}.done.json`), "utf8"));
  } catch {
    return null;
  }
}

/** Image Forge: write one file of a puppet. */
export function savePuppetFile(root, slug, file, bytes) {
  if (!SLUG.test(slug)) return { ok: false, problem: "bad puppet name" };
  if (!FILE.test(file) || file !== path.basename(file)) return { ok: false, problem: "bad file name" };
  if (bytes.length > MAX_PICTURE) return { ok: false, problem: "file too large" };
  const p = path.join(dirs(root).puppets, slug, file);
  writeAtomic(p, bytes);
  return { ok: true, path: p };
}

/** Both: one file of a puppet (its face picture, for a thumbnail), or null. */
export function puppetFile(root, slug, file) {
  if (!SLUG.test(slug) || !FILE.test(file) || file !== path.basename(file)) return null;
  const p = path.join(dirs(root).puppets, slug, file);
  return fs.existsSync(p) ? fs.readFileSync(p) : null;
}

/**
 * Both: take a puppet off the shelf (Ak, 13 Oct 2026: "a bridezilla that was
 * not something to keep"). Not erased: moved to puppets-deleted/, so a click
 * too many can still be undone by hand.
 */
export function removePuppet(root, slug, now = new Date()) {
  if (!SLUG.test(slug)) return { ok: false, problem: "bad puppet name" };
  const from = path.join(dirs(root).puppets, slug);
  if (!fs.existsSync(from)) return { ok: true, gone: false };
  const bin = path.join(root, "puppets-deleted");
  fs.mkdirSync(bin, { recursive: true });
  const to = path.join(bin, `${slug}-${now.toISOString().replace(/[:.]/g, "-")}`);
  fs.renameSync(from, to);
  return { ok: true, gone: true, to };
}

/** Both: every finished puppet on the shelf, newest first. */
export function listPuppets(root) {
  const { puppets } = dirs(root);
  if (!fs.existsSync(puppets)) return [];
  const out = [];
  for (const slug of fs.readdirSync(puppets)) {
    if (!SLUG.test(slug)) continue;
    const rig = path.join(puppets, slug, `${slug}.rig.json`);
    if (!fs.existsSync(rig)) continue; // still being written: the rig file goes last
    try {
      const j = JSON.parse(fs.readFileSync(rig, "utf8"));
      out.push({
        slug,
        name: String(j.madeBy?.name || j.name || slug),
        rigPath: rig,
        basePath: path.join(puppets, slug, String(j.base || "base.png")),
        framing: j.madeBy?.framing === "full" ? "full" : j.poses ? "waist" : "head",
        madeAt: String(j.madeBy?.madeAt || fs.statSync(rig).mtime.toISOString()),
      });
    } catch {
      /* a broken rig is skipped, not fatal */
    }
  }
  return out.sort((a, b) => b.madeAt.localeCompare(a.madeAt));
}
