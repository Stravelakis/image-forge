/**
 * The puppet maker's connection to the page: pictures in and out of canvas,
 * Image Forge's engines as `generate`, a vision model as `judge`.
 *
 * Kept apart from maker.ts so the maker itself has no DOM in it and the tests
 * and a headless run use the same code.
 */
import { generateBytes, type ProviderId } from "../engines.mjs";
import type { ForgeSettings } from "../providers";
import { askVision, jsonFromReply, type VisionEngine } from "../visionEngine";
import type { Img } from "./pixels";
import type { MakerIO, Verdict } from "./maker";

export async function blobToImg(blob: Blob): Promise<Img> {
  const bmp = await createImageBitmap(blob);
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  const g = c.getContext("2d")!;
  g.drawImage(bmp, 0, 0);
  const d = g.getImageData(0, 0, bmp.width, bmp.height);
  bmp.close();
  return { width: d.width, height: d.height, data: d.data };
}

export async function imgToPng(img: Img): Promise<Blob> {
  const c = new OffscreenCanvas(img.width, img.height);
  c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  return c.convertToBlob({ type: "image/png" });
}

const blobToB64 = (b: Blob): Promise<string> =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1]);
    r.onerror = () => rej(new Error("could not read the picture"));
    r.readAsDataURL(b);
  });

export const imgToB64 = async (img: Img): Promise<string> => blobToB64(await imgToPng(img));

export async function imgToUrl(img: Img): Promise<string> {
  return URL.createObjectURL(await imgToPng(img));
}

/** The engines that can work from a picture, cheapest first. */
export const PUPPET_ENGINES: { id: string; label: string; engine: ProviderId; free: boolean; note: string }[] = [
  { id: "local", label: "Your own machine", engine: "local", free: true, note: "Free and unlimited. Needs LocalAI or similar running a FLUX.2 klein model (Settings → Engines)." },
  { id: "cloudflare-flux2-klein", label: "Cloudflare FLUX.2 klein", engine: "cloudflare", free: true, note: "Free daily allowance — a few pictures a day, so a puppet takes several days." },
  { id: "cloudflare-flux2-dev", label: "Cloudflare FLUX.2 dev", engine: "cloudflare", free: true, note: "Best free quality, but about 1–2 pictures a day on the free allowance." },
  { id: "nano-banana-2-lite", label: "Google Nano Banana 2 Lite", engine: "gemini", free: false, note: "Paid: about $0.034 a picture." },
  { id: "nano-banana-2", label: "Google Nano Banana 2", engine: "gemini", free: false, note: "Paid: about $0.067 a picture. What the course puppets were made with (its older sibling)." },
];

export function pageGenerate(settings: ForgeSettings, modelId: string, onExhaust: (pool: string, id: string, until: number) => void): MakerIO["generate"] {
  return async (req, signal) => {
    const refs = await Promise.all(req.refs.map(imgToB64));
    const row = {
      filename: "puppet.png",
      prompt: req.prompt,
      negative_prompt: req.negative ?? "",
      style: "",
      aspect_ratio: "1:1",
      category: "image",
      // "local" is the engine itself; the others are model ids from the catalogue.
      model: modelId === "local" ? "" : modelId,
      seed: req.seed,
    };
    const s = modelId === "local" ? { ...settings, provider: "local" as ProviderId } : settings;
    const out = await generateBytes(row as never, s as never, signal, onExhaust as never, 3600e3, { refImages: refs, size: { w: req.width, h: req.height } });
    return blobToImg(new Blob([out.bytes as BlobPart], { type: out.mime }));
  };
}

/**
 * The picture checker. Image Forge's own vision engine when one is set up;
 * otherwise Google's small free model through the first Google key — the free
 * tier includes looking at pictures, unlike making them (checked 12 Oct 2026:
 * it judged three owl edits correctly, for nothing).
 */
export function pageJudge(settings: ForgeSettings): MakerIO["judge"] | undefined {
  const own = settings.vision;
  const googleKey = settings.geminiKeys.find((k) => k.key.trim())?.key.trim();
  const engine: VisionEngine | null =
    own?.base && own.model && (own.key || /localhost|127\.0\.0\.1/.test(own.base))
      ? own
      : googleKey
        ? { base: "https://generativelanguage.googleapis.com/v1beta/openai", key: googleKey, model: "gemini-flash-lite-latest" }
        : null;
  if (!engine) return undefined;
  return async (question, picture, signal): Promise<Verdict | null> => {
    const r = await askVision(engine, await imgToB64(picture), question, signal);
    if (!r.ok) return null; // a checker that cannot answer is not a "no"
    try {
      const j = jsonFromReply(r.text) as { ok?: unknown; why?: unknown };
      return { ok: j.ok === true, why: String(j.why ?? "") };
    } catch {
      return null;
    }
  };
}

/** Who checks, in a few words, for the screen. */
export function judgeName(settings: ForgeSettings): string {
  const own = settings.vision;
  if (own?.base && own.model && (own.key || /localhost|127\.0\.0\.1/.test(own.base))) return `your vision engine (${own.model})`;
  if (settings.geminiKeys.some((k) => k.key.trim())) return "Google's free picture checker";
  return "";
}
