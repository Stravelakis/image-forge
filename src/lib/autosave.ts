/**
 * The page's side of electron/autosave.mjs: a safety copy of every picture,
 * written the moment it arrives, so closing the app loses nothing even with no
 * output folder linked. Outside the desktop app there is no /app/ route and
 * every call here quietly says "not saved" — the caller then keeps the picture
 * on its list of unsaved ones, which the close warning reads.
 */
import type { ManifestRow } from "../types";
import { CATEGORY_FOLDER } from "./output";

const HEADERS = { "X-Forge-App": "1" };

const urlFor = (row: Pick<ManifestRow, "category" | "filename">) =>
  `/app/autosave/${encodeURIComponent(CATEGORY_FOLDER[row.category] ?? "images")}/${encodeURIComponent(row.filename)}`;

/** Write the picture to the app's own folder. True when it is safely on disk. */
export async function autosaveImage(row: Pick<ManifestRow, "category" | "filename">, blob: Blob): Promise<boolean> {
  try {
    const r = await fetch(urlFor(row), { method: "PUT", headers: HEADERS, body: blob });
    return r.ok;
  } catch {
    return false;
  }
}

/** Read a picture back from the safety copy, or null when there is none. */
export async function loadAutosaved(row: Pick<ManifestRow, "category" | "filename">): Promise<Blob | null> {
  try {
    const r = await fetch(urlFor(row), { headers: HEADERS });
    return r.ok ? await r.blob() : null;
  } catch {
    return null;
  }
}

/** The names of pictures held in memory that no copy of exists anywhere else. */
export function unsavedPictures(inMemory: Iterable<string>, persisted: ReadonlySet<string>): string[] {
  return [...inMemory].filter((name) => !persisted.has(name));
}
