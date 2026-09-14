import JSZip from "jszip";
import type { Category, ManifestRow } from "../types";
import { CATEGORIES, CATEGORY_META } from "../types";

/**
 * Where each kind of thing lands on disk.
 *
 * Derived from CATEGORY_META rather than written out again, because these two
 * lists drifting apart means files quietly saving to a folder nothing reads.
 */
export const CATEGORY_FOLDER = Object.fromEntries(
  CATEGORIES.map((c) => [c, CATEGORY_META[c].folder])
) as Record<Category, string>;

export const SUBFOLDERS: string[] = CATEGORIES.map((c) => CATEGORY_META[c].folder);

/* ---------------- blob helpers ---------------- */

export const b64ToBlob = (b64: string, mime: string): Blob => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
};

export const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((res, rej) => {
    const rd = new FileReader();
    rd.onload = () => res(String(rd.result));
    rd.onerror = () => rej(new Error("could not read blob"));
    rd.readAsDataURL(blob);
  });

export const dataUrlToBlob = (dataUrl: string): Blob => {
  // The type used to come out as "data:image/jpeg", which no MIME check
  // recognises — so a kept variant could never be named for what it was.
  const m = dataUrl.match(/^(?:data:)?([^;,]+);base64,(.*)$/s);
  if (m) return b64ToBlob(m[2], m[1]);
  return new Blob([dataUrl], { type: "image/svg+xml" });
};

export const svgToPngBlob = (svg: string, w: number, h: number): Promise<Blob> =>
  new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      if (!ctx) return rej(new Error("canvas unavailable"));
      ctx.drawImage(img, 0, 0, w, h);
      c.toBlob((b) => (b ? res(b) : rej(new Error("canvas export failed"))), "image/png");
    };
    img.onerror = () => rej(new Error("could not rasterize plate"));
    img.src = svg.startsWith("data:") ? svg : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });

/* ---------------- File System Access ---------------- */

type DirHandle = FileSystemDirectoryHandle;

export const fsSupported = (): boolean =>
  typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === "function";

export async function pickOutputFolder(): Promise<DirHandle> {
  const w = window as unknown as { showDirectoryPicker: (opts: { mode: string }) => Promise<DirHandle> };
  return w.showDirectoryPicker({ mode: "readwrite" });
}

export async function ensureSubfolders(h: DirHandle): Promise<{ found: string[]; created: string[] }> {
  const found: string[] = [];
  const created: string[] = [];
  for (const name of SUBFOLDERS) {
    try {
      await h.getDirectoryHandle(name, { create: false });
      found.push(name);
    } catch {
      await h.getDirectoryHandle(name, { create: true });
      created.push(name);
    }
  }
  return { found, created };
}

export async function writeImageFile(h: DirHandle, row: ManifestRow, blob: Blob): Promise<string> {
  const sub = await h.getDirectoryHandle(CATEGORY_FOLDER[row.category], { create: true });
  const fh = await sub.getFileHandle(row.filename, { create: true });
  const w = await fh.createWritable();
  await w.write(blob);
  await w.close();
  return `${h.name}/${CATEGORY_FOLDER[row.category]}/${row.filename}`;
}

export async function writeTextFile(h: DirHandle, name: string, text: string): Promise<void> {
  const fh = await h.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(text);
  await w.close();
}

/* ---------------- folder handle persistence (IndexedDB) ---------------- */

const openDb = (): Promise<IDBDatabase> =>
  new Promise((res, rej) => {
    const req = indexedDB.open("image-forge", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("kv");
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });

export async function saveDirHandle(h: DirHandle): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((res, rej) => {
      const tx = db.transaction("kv", "readwrite");
      tx.objectStore("kv").put(h, "dir");
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  } catch { /* best-effort */ }
}

export async function loadDirHandle(): Promise<DirHandle | null> {
  try {
    const db = await openDb();
    return await new Promise<DirHandle | null>((res) => {
      const tx = db.transaction("kv", "readonly");
      const req = tx.objectStore("kv").get("dir");
      req.onsuccess = () => res((req.result as DirHandle) ?? null);
      req.onerror = () => res(null);
    });
  } catch {
    return null;
  }
}

export async function clearDirHandle(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((res) => {
      const tx = db.transaction("kv", "readwrite");
      tx.objectStore("kv").delete("dir");
      tx.oncomplete = () => res();
      tx.onerror = () => res();
    });
  } catch { /* ignore */ }
}

/* ---------------- ZIP export ---------------- */

export async function buildZipBlob(
  rows: ManifestRow[],
  getBlob: (r: ManifestRow) => Promise<Blob | null>,
  csv: string
): Promise<{ blob: Blob; count: number }> {
  const zip = new JSZip();
  zip.file("marketplace-images.csv", csv);
  let count = 0;
  for (const r of rows) {
    if (r.status !== "done" && r.status !== "imported") continue;
    const b = await getBlob(r);
    if (b) {
      zip.file(`${CATEGORY_FOLDER[r.category]}/${r.filename}`, b);
      count++;
    }
  }
  const blob = await zip.generateAsync({ type: "blob" });
  return { blob, count };
}

export function downloadBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
