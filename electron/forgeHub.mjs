/**
 * The Forge hub's list of everything made (13 Oct 2026) — the pantry the
 * coming Social Forge picks from, and the Content Forge writes beside.
 *
 * THE SAME FILE in both repos (Video Forge tools/lib/forgeHub.mjs, Image Forge
 * electron/forgeHub.mjs). Change one, copy it to the other.
 *
 *   %APPDATA%\Forge\made\register.jsonl   one line per finished thing
 *
 * One JSON object per line, appended, never rewritten — two forges can add at
 * the same moment without losing each other's lines, and a person can open it
 * in a text editor. Each entry says what it is, where the file is, its shape,
 * language and length, and what a poster would want next to it (a title, alt
 * text, caption drafts, tags). Fields a forge does not know are left out.
 *
 * Plain Node, no Electron import, so the tests run the real code.
 */
import fs from "node:fs";
import path from "node:path";

export const HUB_VERSION = 1;
export const MADE_KINDS = ["picture", "video", "puppet", "sheet", "gif", "post", "article"];
export const FORGES = ["image-forge", "video-forge", "social-forge", "content-forge"];

export const madeFile = (root) => path.join(root, "made", "register.jsonl");

const str = (v, n) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : undefined);
const num = (v) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined);

/** Check an entry and return it cleaned, or say what is wrong. */
export function cleanMade(raw) {
  if (!raw || typeof raw !== "object") return { ok: false, problem: "empty entry" };
  if (!FORGES.includes(raw.app)) return { ok: false, problem: `unknown app "${raw.app}"` };
  if (!MADE_KINDS.includes(raw.kind)) return { ok: false, problem: `unknown kind "${raw.kind}"` };
  const file = str(raw.file, 1000);
  if (!file) return { ok: false, problem: "no file" };
  const captions = raw.captions && typeof raw.captions === "object" ? Object.fromEntries(Object.entries(raw.captions).filter(([k, v]) => /^[a-z]{2}$/.test(k) && typeof v === "string").map(([k, v]) => [k, v.slice(0, 2200)])) : undefined;
  const entry = {
    v: HUB_VERSION,
    app: raw.app,
    kind: raw.kind,
    file,
    title: str(raw.title, 200),
    language: str(raw.language, 10),
    width: num(raw.width),
    height: num(raw.height),
    durationSec: num(raw.durationSec),
    altText: str(raw.altText, 500),
    captions: captions && Object.keys(captions).length ? captions : undefined,
    tags: Array.isArray(raw.tags) ? raw.tags.filter((t) => typeof t === "string" && t.trim()).map((t) => t.trim().slice(0, 60)).slice(0, 30) : undefined,
    link: str(raw.link, 1000),
    madeWith: str(raw.madeWith, 200),
    aiMade: raw.aiMade === false ? false : true,
    createdAt: str(raw.createdAt, 40) ?? new Date().toISOString(),
  };
  return { ok: true, entry: Object.fromEntries(Object.entries(entry).filter(([, v]) => v !== undefined)) };
}

/** Add one finished thing to the list. */
export function recordMade(root, raw) {
  const c = cleanMade(raw);
  if (!c.ok) return c;
  const file = madeFile(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(c.entry) + "\n");
  return { ok: true, entry: c.entry };
}

/** Everything made, newest first; filtered by kind and/or app. */
export function listMade(root, { kind, app, limit = 500 } = {}) {
  let text = "";
  try {
    text = fs.readFileSync(madeFile(root), "utf8");
  } catch {
    return [];
  }
  const out = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const c = cleanMade(JSON.parse(line));
      if (c.ok && (!kind || c.entry.kind === kind) && (!app || c.entry.app === app)) out.push(c.entry);
    } catch {
      /* a broken line is skipped, never fatal */
    }
  }
  return out.reverse().slice(0, limit);
}
