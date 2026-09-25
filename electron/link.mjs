/**
 * The link: how another app on this computer asks Image Forge for pictures.
 *
 * Decided 20 September 2026: two apps, not a merge. "Game recognising game" —
 * when both are installed they notice each other and cooperate. The first
 * neighbour is BYOK Vid Creator, which needs viseme sheets, sprites and
 * turnarounds for its puppets.
 *
 * It works through ordinary folders, on purpose:
 *
 *   <userData>/link/presence.json   "Image Forge is here" — version, port
 *   <userData>/link/inbox/<id>.json a request dropped by the other app
 *   <userData>/link/outbox/<id>/     the finished pictures + done.json
 *
 * Why folders rather than a network call:
 *   · API keys never leave the forge. The other app asks for pictures; it
 *     never sees, needs or stores a key.
 *   · Neither app has to be open at the same moment. A request dropped while
 *     the forge is closed is picked up the next time it opens.
 *   · It is inspectable. A person can open the folder and see exactly what was
 *     asked for and what came back.
 *
 * Plain Node, no Electron import, so the tests exercise the real code.
 */
import fs from "node:fs";
import path from "node:path";

export const LINK_VERSION = 1;

/** Hard limits. A request is text from another program — treat it as such. */
export const LIMITS = {
  requestBytes: 256 * 1024,
  rows: 60,
  prompt: 2000,
  negative: 1000,
  style: 60,
  from: 60,
};

const ID = /^[a-z0-9][a-z0-9-]{5,63}$/;
const FILE = /^[a-z0-9][a-z0-9_]{0,80}\.(png|jpg|jpeg|webp)$/;
const ASPECTS = new Set(["16:9", "1:1", "9:16", "4:3"]);
const CATEGORIES = new Set(["image", "sheet"]);

export function linkPaths(userData) {
  const root = path.join(userData, "link");
  return {
    root,
    presence: path.join(root, "presence.json"),
    inbox: path.join(root, "inbox"),
    rejected: path.join(root, "inbox", "rejected"),
    processing: path.join(root, "processing"),
    outbox: path.join(root, "outbox"),
  };
}

export function ensureLinkDirs(p) {
  for (const d of [p.root, p.inbox, p.rejected, p.processing, p.outbox]) fs.mkdirSync(d, { recursive: true });
}

/** Write atomically, so a reader never sees half a file. */
function writeAtomic(file, text) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

export function writePresence(p, { version, port }) {
  ensureLinkDirs(p);
  writeAtomic(
    p.presence,
    JSON.stringify(
      {
        app: "image-forge",
        linkVersion: LINK_VERSION,
        version,
        port,
        pid: process.pid,
        inbox: p.inbox,
        outbox: p.outbox,
        updatedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );
}

export function removePresence(p) {
  try {
    fs.rmSync(p.presence, { force: true });
  } catch {
    /* quitting anyway */
  }
}

/** A name safe to write inside the outbox, or null. */
export function safeName(name) {
  const n = String(name || "").trim();
  if (!FILE.test(n)) return null;
  if (n !== path.basename(n)) return null;
  return n;
}

/**
 * Check a request and return it cleaned, or say plainly what is wrong.
 *
 * Everything the other app sends is checked here and only here. The page never
 * sees an unvalidated request.
 */
export function validateRequest(raw) {
  let r = raw;
  if (typeof raw === "string") {
    if (Buffer.byteLength(raw) > LIMITS.requestBytes) return { ok: false, problem: "the request is too large" };
    try {
      r = JSON.parse(raw);
    } catch {
      return { ok: false, problem: "the request is not valid JSON" };
    }
  }
  if (!r || typeof r !== "object") return { ok: false, problem: "the request is empty" };
  if (!ID.test(String(r.id || ""))) return { ok: false, problem: "the request id must be 6–64 lowercase letters, digits or dashes" };
  if (!Array.isArray(r.rows) || r.rows.length === 0) return { ok: false, problem: "the request has no pictures in it" };
  if (r.rows.length > LIMITS.rows) return { ok: false, problem: `a request may ask for at most ${LIMITS.rows} pictures` };

  const seen = new Set();
  const rows = [];
  for (let i = 0; i < r.rows.length; i++) {
    const x = r.rows[i] || {};
    const prompt = String(x.prompt || "").trim();
    if (!prompt) return { ok: false, problem: `picture ${i + 1} has no prompt` };
    if (prompt.length > LIMITS.prompt) return { ok: false, problem: `picture ${i + 1}'s prompt is too long` };
    const filename = safeName(x.filename);
    if (!filename) return { ok: false, problem: `picture ${i + 1}'s filename is not a plain lowercase name ending in .png/.jpg/.webp` };
    if (seen.has(filename)) return { ok: false, problem: `two pictures are both called ${filename}` };
    seen.add(filename);
    rows.push({
      filename,
      prompt,
      negative_prompt: String(x.negative_prompt || "").slice(0, LIMITS.negative),
      style: String(x.style || "").slice(0, LIMITS.style),
      aspect_ratio: ASPECTS.has(x.aspect_ratio) ? x.aspect_ratio : "1:1",
      category: CATEGORIES.has(x.category) ? x.category : "image",
      model: String(x.model || "").slice(0, 60),
      seed: Number.isInteger(x.seed) && x.seed > 0 ? x.seed : undefined,
    });
  }
  return {
    ok: true,
    request: {
      id: r.id,
      from: String(r.from || "another app").slice(0, LIMITS.from),
      note: String(r.note || "").slice(0, 300),
      createdAt: String(r.createdAt || new Date().toISOString()),
      rows,
    },
  };
}

/**
 * Requests waiting to be taken on: new ones in the inbox, plus any already
 * claimed but not finished (the forge was closed mid-way).
 *
 * A request that fails validation is moved aside with a note saying why, so
 * the other app can read the reason instead of waiting forever.
 */
export function pendingRequests(p) {
  ensureLinkDirs(p);
  const out = [];
  for (const f of fs.readdirSync(p.inbox)) {
    if (!f.endsWith(".json")) continue;
    const full = path.join(p.inbox, f);
    let text;
    try {
      text = fs.readFileSync(full, "utf8");
    } catch {
      continue; // still being written
    }
    const v = validateRequest(text);
    if (!v.ok) {
      const base = path.basename(f, ".json");
      try {
        fs.renameSync(full, path.join(p.rejected, f));
        writeAtomic(path.join(p.rejected, `${base}.why.txt`), v.problem);
      } catch {
        /* leave it; next pass tries again */
      }
      continue;
    }
    out.push({ ...v.request, state: "new" });
  }
  for (const f of fs.readdirSync(p.processing)) {
    if (!f.endsWith(".json")) continue;
    const v = validateRequest(fs.readFileSync(path.join(p.processing, f), "utf8"));
    if (v.ok && !fs.existsSync(path.join(p.outbox, v.request.id, "done.json"))) out.push({ ...v.request, state: "working" });
  }
  return out;
}

/** Take a request off the inbox so it is not offered twice. */
export function claimRequest(p, id) {
  if (!ID.test(id)) return false;
  // The folders may not exist yet if nothing has listed the inbox this run.
  ensureLinkDirs(p);
  const from = path.join(p.inbox, `${id}.json`);
  if (!fs.existsSync(from)) return fs.existsSync(path.join(p.processing, `${id}.json`));
  fs.renameSync(from, path.join(p.processing, `${id}.json`));
  fs.mkdirSync(path.join(p.outbox, id), { recursive: true });
  return true;
}

/** Write one finished picture into the request's outbox folder. */
export function writeResult(p, id, filename, bytes) {
  if (!ID.test(id)) return { ok: false, problem: "bad request id" };
  const name = safeName(filename);
  if (!name) return { ok: false, problem: "bad filename" };
  if (!fs.existsSync(path.join(p.processing, `${id}.json`))) return { ok: false, problem: "no such request" };
  const dir = path.join(p.outbox, id);
  fs.mkdirSync(dir, { recursive: true });
  writeAtomic(path.join(dir, name), bytes);
  return { ok: true, path: path.join(dir, name) };
}

/**
 * Close a request. done.json is the signal the other app waits for, so it is
 * written last and atomically.
 */
export function finishRequest(p, id, summary) {
  if (!ID.test(id)) return { ok: false, problem: "bad request id" };
  if (!fs.existsSync(path.join(p.processing, `${id}.json`))) return { ok: false, problem: "no such request" };
  const dir = path.join(p.outbox, id);
  fs.mkdirSync(dir, { recursive: true });
  const done = (Array.isArray(summary?.done) ? summary.done : []).map((f) => safeName(f)).filter(Boolean);
  const failed = (Array.isArray(summary?.failed) ? summary.failed : [])
    .map((x) => ({ filename: safeName(x?.filename) || String(x?.filename || "").slice(0, 90), error: String(x?.error || "").slice(0, 300) }));
  writeAtomic(
    path.join(dir, "done.json"),
    JSON.stringify({ id, linkVersion: LINK_VERSION, finishedAt: new Date().toISOString(), done, failed }, null, 2)
  );
  fs.rmSync(path.join(p.processing, `${id}.json`), { force: true });
  return { ok: true };
}
