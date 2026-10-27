/**
 * The page's side of Canva (electron/canva.mjs): every call goes through the
 * desktop app, which holds the sign-in. Outside the desktop app there is no
 * /app route and these say so.
 */
import type { ForgeSettings } from "./providers";

const HEADERS = { "X-Forge-App": "1", "Content-Type": "application/json" };

async function call<T>(what: string, s: ForgeSettings, extra: Record<string, unknown> = {}): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`/app/canva/${what}`, { method: "POST", headers: HEADERS, body: JSON.stringify({ ...s.canva, ...extra }) });
  } catch {
    throw new Error("Canva works in the desktop app only.");
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Canva call failed (${r.status})`);
  return j as T;
}

export const canvaStatus = (s: ForgeSettings) => call<{ connected: boolean; name?: string; redirectUri: string }>("status", s);
export const canvaConnect = (s: ForgeSettings) => call<{ ok: boolean; redirectUri: string }>("connect", s);
export const canvaDisconnect = (s: ForgeSettings) => call<{ ok: boolean }>("disconnect", s);
export const canvaTemplates = (s: ForgeSettings) => call<{ items: { id: string; title: string; thumbnail?: { url: string } }[] }>("templates", s).then((r) => r.items);
export const canvaDataset = (s: ForgeSettings, id: string) =>
  call<{ dataset: Record<string, { type: "text" | "image" | "chart" }> }>("dataset", s, { id }).then((r) => r.dataset);

async function blobB64(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Put a picture into your Canva uploads; returns its Canva asset id. */
export async function canvaUpload(s: ForgeSettings, name: string, blob: Blob): Promise<string> {
  return (await call<{ assetId: string }>("upload", s, { name, b64: await blobB64(blob) })).assetId;
}

/** Fill a brand template and get the finished picture back. */
export async function canvaFill(
  s: ForgeSettings,
  templateId: string,
  data: Record<string, { type: "text"; text: string } | { type: "image"; asset_id: string }>,
  title: string
): Promise<{ blob: Blob; designUrl: string }> {
  const r = await call<{ b64: string; designUrl: string }>("fill", s, { templateId, data, title });
  const bytes = Uint8Array.from(atob(r.b64), (c) => c.charCodeAt(0));
  return { blob: new Blob([bytes], { type: "image/png" }), designUrl: r.designUrl };
}
