/**
 * The page's side of the Forge shelf (electron/forgeShelf.mjs): puppet orders
 * from Video Forge, and putting a finished puppet where Video Forge finds it.
 * Desktop app only — elsewhere every call quietly does nothing.
 */
import type { PuppetFraming } from "./recipe";
import type { ForgePuppet } from "./rig";
import { blobToImg, imgToPng } from "./pageIO";
import type { Img } from "./pixels";

const HEADERS = { "X-Forge-App": "1" };

export interface PuppetOrder {
  id: string;
  from: string;
  name: string;
  description: string;
  style: string;
  framing: PuppetFraming;
  /** make it with nobody there: pick the face automatically */
  auto?: boolean;
  inspirations: string[];
  createdAt: string;
}

export async function openOrders(): Promise<PuppetOrder[]> {
  try {
    const r = await fetch("/app/orders", { headers: HEADERS });
    if (!r.ok) return [];
    return ((await r.json())?.orders ?? []) as PuppetOrder[];
  } catch {
    return [];
  }
}

export async function orderPictures(o: PuppetOrder): Promise<Img[]> {
  const out: Img[] = [];
  for (const f of o.inspirations) {
    try {
      const r = await fetch(`/app/orders/${encodeURIComponent(o.id)}/${encodeURIComponent(f)}`, { headers: HEADERS });
      if (r.ok) out.push(await blobToImg(await r.blob()));
    } catch {
      /* a missing picture just means less inspiration */
    }
  }
  return out;
}

export async function finishOrder(id: string, result: { slug?: string; problem?: string }): Promise<void> {
  await fetch(`/app/orders/${encodeURIComponent(id)}/done`, {
    method: "POST",
    headers: { ...HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify(result),
  }).catch(() => {});
}

/**
 * Put a puppet on the shelf. Pictures first, the rig file LAST — Video Forge
 * only lists a puppet once its rig file exists, so it never sees half of one.
 */
export async function shelvePuppet(slug: string, rig: ForgePuppet): Promise<{ ok: boolean; problem?: string }> {
  const put = async (file: string, body: Blob) => {
    const r = await fetch(`/app/puppets/${encodeURIComponent(slug)}/${encodeURIComponent(file)}`, { method: "PUT", headers: HEADERS, body });
    if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.problem ?? `could not save ${file}`);
  };
  try {
    for (const [file, img] of Object.entries(rig.files)) await put(file, await imgToPng(img));
    await put(`${slug}.rig.json`, new Blob([JSON.stringify(rig.json, null, 1)], { type: "application/json" }));
    return { ok: true };
  } catch (e) {
    return { ok: false, problem: (e as Error).message };
  }
}

/** Is the shelf there at all (desktop app)? */
export async function shelfAvailable(): Promise<boolean> {
  try {
    return (await fetch("/app/puppets", { headers: HEADERS })).ok;
  } catch {
    return false;
  }
}
