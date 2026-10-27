/**
 * Small thumbnails of everything made, kept on this computer (13 Oct 2026).
 *
 * A row's picture lived only in memory: after a restart the gallery showed
 * "no plate yet" for everything, which is why it looked ancient (Ak). The full
 * pictures go to your folder as before; this keeps a ~200 px JPEG of each in
 * the browser's own database (IndexedDB — far roomier than the settings
 * storage), keyed by file name, so "Made" can show everything, always.
 */

const DB = "image-forge-thumbs";
const STORE = "thumbs";

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

/** A small JPEG data URL from any picture (blob or data URL). */
export async function makeThumb(src: Blob | string, max = 220): Promise<string> {
  const blob = typeof src === "string" ? await (await fetch(src)).blob() : src;
  const bmp = await createImageBitmap(blob);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = new OffscreenCanvas(Math.max(1, Math.round(bmp.width * k)), Math.max(1, Math.round(bmp.height * k)));
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  const out = await c.convertToBlob({ type: "image/jpeg", quality: 0.78 });
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(out);
  });
}

export async function saveThumb(filename: string, src: Blob | string): Promise<void> {
  try {
    const thumb = await makeThumb(src);
    const db = await open();
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(thumb, filename);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
    db.close();
  } catch {
    /* a missing thumbnail is a blank card, never a failure */
  }
}

/** Every thumbnail kept, by file name. */
export async function loadThumbs(): Promise<Record<string, string>> {
  try {
    const db = await open();
    const out: Record<string, string> = {};
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).openCursor();
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) return res();
        out[String(cur.key)] = String(cur.value);
        cur.continue();
      };
      req.onerror = () => rej(req.error);
    });
    db.close();
    return out;
  } catch {
    return {};
  }
}

export async function dropThumb(filename: string): Promise<void> {
  try {
    const db = await open();
    db.transaction(STORE, "readwrite").objectStore(STORE).delete(filename);
    db.close();
  } catch {
    /* fine */
  }
}
