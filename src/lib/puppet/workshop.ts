/**
 * The page's side of the puppet workshop (electron/workshop.mjs): a puppet is
 * saved as it is made — face, every part, every note — and can be opened again
 * from Made to review and tweak, part by part (14 Oct 2026).
 */
import type { Img } from "./pixels";
import type { CutPart } from "./rig";
import type { PartReport } from "./maker";
import type { PuppetFraming, PuppetLook } from "./recipe";
import { blobToImg, imgToPng } from "./pageIO";

const H = { "X-Forge-App": "1" };

/** One part's review: what the checker said, and what you said. */
export interface PartReview extends PartReport {
  /** you looked and agree it is right */
  approved?: boolean;
  /** your note for the next try ("less tongue", "no smile") */
  note?: string;
}

export interface WorkshopMeta {
  v: 1;
  slug: string;
  name: string;
  description: string;
  style: string;
  framing: PuppetFraming;
  look: PuppetLook;
  faceEngine: string;
  partEngine: string;
  createdAt: string;
  updatedAt: string;
  /** making: parts still coming · review: all tried, waiting for you · approved: every part looked at */
  status: "making" | "review" | "approved";
  shelved?: boolean;
  reports: PartReview[];
  /** each part's place on the picture, so the cut layers can be put back */
  boxes: Record<string, { x: number; y: number; w: number; h: number }>;
  /** views made for this puppet ("side", "sit"): their parts, prefixed */
  views?: string[];
}

export const workshopAvailable = async (): Promise<boolean> => {
  try {
    return (await fetch("/app/workshop", { headers: H })).ok;
  } catch {
    return false;
  }
};

export async function listWorkshop(): Promise<WorkshopMeta[]> {
  try {
    const r = await fetch("/app/workshop", { headers: H });
    return r.ok ? ((await r.json()).puppets as WorkshopMeta[]) : [];
  } catch {
    return [];
  }
}

async function put(slug: string, file: string, body: Blob | string): Promise<void> {
  await fetch(`/app/workshop/${encodeURIComponent(slug)}/${encodeURIComponent(file)}`, { method: "PUT", headers: H, body });
}

export const saveMeta = (m: WorkshopMeta) => put(m.slug, "meta.json", JSON.stringify({ ...m, updatedAt: new Date().toISOString() }, null, 1));
export const saveImg = async (slug: string, file: string, img: Img) => put(slug, file, await imgToPng(img));

/** Save one part: the cut layer (as checked), the keyed one (as used), the whole edit for arms. */
export async function savePart(slug: string, id: string, p: CutPart): Promise<void> {
  await saveImg(slug, `${id}.layer.png`, p.layer);
  if (p.keyed) await saveImg(slug, `${id}.keyed.png`, p.keyed);
  if (p.full) await saveImg(slug, `${id}.full.png`, p.full);
}

export async function loadImg(slug: string, file: string): Promise<Img | null> {
  try {
    const r = await fetch(`/app/workshop/${encodeURIComponent(slug)}/${encodeURIComponent(file)}`, { headers: H });
    return r.ok ? await blobToImg(await r.blob()) : null;
  } catch {
    return null;
  }
}

export const workshopUrl = (slug: string, file: string) => `/app/workshop/${encodeURIComponent(slug)}/${encodeURIComponent(file)}`;

/** Everything needed to carry on: the face and every part saved so far. */
export async function loadWorkshop(meta: WorkshopMeta): Promise<{ base: Img | null; parts: Record<string, CutPart> }> {
  const base = await loadImg(meta.slug, "base.png");
  const parts: Record<string, CutPart> = {};
  for (const [id, box] of Object.entries(meta.boxes ?? {})) {
    const layer = await loadImg(meta.slug, `${id}.layer.png`);
    if (!layer) continue;
    const keyed = (await loadImg(meta.slug, `${id}.keyed.png`)) ?? undefined;
    const full = id.includes("arms_") ? (await loadImg(meta.slug, `${id}.full.png`)) ?? undefined : undefined;
    parts[id] = { layer, keyed, box, ...(full ? { full } : {}) };
  }
  return { base, parts };
}

export const removeWorkshop = (slug: string) => fetch(`/app/workshop/${encodeURIComponent(slug)}`, { method: "DELETE", headers: H });
