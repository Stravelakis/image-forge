/**
 * The puppet maker's connection to the page: pictures in and out of canvas,
 * Image Forge's engines as `generate`, a vision model as `judge`.
 *
 * Kept apart from maker.ts so the maker itself has no DOM in it and the tests
 * and a headless run use the same code.
 */
import { generateBytes, localRoute, type ProviderId } from "../engines.mjs";
import { panelVerdict, type Facts, type PanelChecker } from "./quality";
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

export interface PuppetEngine {
  id: string;
  label: string;
  free: boolean;
  /** can work FROM a picture — needed for the parts, and for inspiration pictures */
  refs: boolean;
  /** dollars a picture, 0 when free */
  price: number;
  note: string;
}

/** A LocalAI model that draws pictures (its list also holds chat, audio and voice models). */
export const isImageModel = (id: string) =>
  /image|flux|sdxl|sd-?\d|stable-diffusion|dreamshaper|kontext|hidream|pixart|playground|iris/i.test(id) && !/audio|sfx|tts|whisper|embed/i.test(id);

/** Which local models can edit a picture rather than only draw from words. */
export const localCanEdit = (id: string) => /klein|kontext|edit|flux\.?2/i.test(id);

/**
 * Every engine the puppet maker can use. Faces can come from any of them; the
 * parts need one that works from a picture (`refs`). Your own machine first —
 * free and unlimited — then the free services, then paid.
 */
export function puppetEngines(localModels: string[]): PuppetEngine[] {
  const local = localModels.filter(isImageModel).map((m) => ({
    id: `local:${m}`,
    label: `${m} · this computer`,
    free: true,
    refs: localCanEdit(m),
    price: 0,
    note: localCanEdit(m)
      ? "Free and unlimited. Works from a picture, so it can make the parts. Slower: it fills an 8 GB card."
      : /z-?image/i.test(m)
        ? "Free and unlimited. The best faces on this computer (Ak's pick, 12 Oct 2026). Draws from words only, so faces only."
        : "Free and unlimited. Draws from words only, so faces only.",
  }));
  return [
    ...local,
    ...(local.length ? [] : [{ id: "local", label: "Your own machine", free: true, refs: true, price: 0, note: "Free and unlimited. Start LocalAI (or similar) and its models appear here by name." }]),
    { id: "ovh-sdxl", label: "OVHcloud SDXL", free: true, refs: false, price: 0, note: "Free, no key. Older model; draws from words only, so faces only." },
    { id: "cloudflare-flux2-klein", label: "Cloudflare FLUX.2 klein", free: true, refs: true, price: 0, note: "Free daily allowance — only a few pictures a day." },
    { id: "cloudflare-flux2-dev", label: "Cloudflare FLUX.2 dev", free: true, refs: true, price: 0, note: "Best free quality online, but about 1–2 pictures a day on the free allowance." },
    { id: "nano-banana-2-lite", label: "Google Nano Banana 2 Lite", free: false, refs: true, price: 0.034, note: "Paid: about $0.034 a picture." },
    { id: "nano-banana-2", label: "Google Nano Banana 2", free: false, refs: true, price: 0.067, note: "Paid: about $0.067 a picture." },
  ];
}

/** The image models LocalAI (or similar) has, by name. Empty when it is not running. */
export async function listLocalImageModels(settings: ForgeSettings): Promise<string[]> {
  try {
    const { base, headers } = localRoute(settings.localBase);
    const r = await fetch(`${base}/models`, { headers: { ...headers, ...(settings.localKey?.trim() ? { Authorization: `Bearer ${settings.localKey.trim()}` } : {}) } });
    if (!r.ok) return [];
    const j = (await r.json()) as { data?: { id?: string }[] };
    return (j.data ?? []).map((d) => d.id ?? "").filter(isImageModel).sort();
  } catch {
    return [];
  }
}

/**
 * Ask the local server to let go of a model, so the next one has the whole
 * card. Two picture models do not fit an 8 GB card together: with Z-Image and
 * FLUX.2 klein both loaded the card sat full at 100% and an edit took over ten
 * minutes (12 Oct 2026). Best effort — some setups refuse, and LocalAI also
 * lets idle models go by itself.
 */
export async function unloadLocal(settings: ForgeSettings, model: string): Promise<void> {
  try {
    const { base, headers } = localRoute(settings.localBase);
    await fetch(`${base.replace(/\/v1$/, "")}/backend/shutdown`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ model }) });
  } catch {
    /* fine */
  }
}

/** Picture size for an engine: local cards are slow and hot at 1024. */
export const sizeFor = (engineId: string) => (engineId.startsWith("local") ? 768 : 1024);

/** A rest after each picture on your own machine, so the card can cool. */
export const LOCAL_REST_MS = 20000;

export function pageGenerate(settings: ForgeSettings, engineId: string, onExhaust: (pool: string, id: string, until: number) => void): MakerIO["generate"] {
  const localModel = engineId.startsWith("local:") ? engineId.slice(6) : engineId === "local" ? settings.localModel : "";
  let last = 0;
  return async (req, signal) => {
    if (localModel && last) {
      const wait = LOCAL_REST_MS - (Date.now() - last);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
    const refs = await Promise.all(req.refs.map(imgToB64));
    const row = {
      filename: "puppet.png",
      prompt: req.prompt,
      negative_prompt: req.negative ?? "",
      style: "",
      aspect_ratio: "1:1",
      category: "image",
      // Local engines take their model from settings; the others are catalogue ids.
      model: localModel ? "" : engineId,
      seed: req.seed,
    };
    const s = localModel ? { ...settings, provider: "local" as ProviderId, localModel } : settings;
    const out = await generateBytes(row as never, s as never, signal, onExhaust as never, 3600e3, { refImages: refs, size: { w: req.width, h: req.height } });
    last = Date.now();
    return blobToImg(new Blob([out.bytes as BlobPart], { type: out.mime }));
  };
}

/**
 * Inspiration pictures for an engine that cannot look at them: the picture
 * checker describes each one in words, and the words go into the prompt.
 */
export async function describeInspiration(settings: ForgeSettings, pictures: Img[]): Promise<string> {
  const engine = visionFor(settings);
  if (!engine || !pictures.length) return "";
  const parts: string[] = [];
  for (const p of pictures) {
    const r = await askVision(
      engine,
      await imgToB64(p),
      "Describe the look of the main character or subject in this picture in ONE sentence for an illustrator: species or kind, colours, hair or fur, clothing, distinctive features. No background, no story."
    );
    if (r.ok) parts.push(r.text.trim().replace(/\s+/g, " "));
  }
  return parts.join(" ");
}

/**
 * The picture checker. Image Forge's own vision engine when one is set up;
 * otherwise Google's small free model through the first Google key — the free
 * tier includes looking at pictures, unlike making them (checked 12 Oct 2026:
 * it judged three owl edits correctly, for nothing).
 */
function visionFor(settings: ForgeSettings): VisionEngine | null {
  const own = settings.vision;
  const googleKey = settings.geminiKeys.find((k) => k.key.trim())?.key.trim();
  return own?.base && own.model && (own.key || /localhost|127\.0\.0\.1/.test(own.base))
    ? own
    : googleKey
      ? { base: "https://generativelanguage.googleapis.com/v1beta/openai", key: googleKey, model: "gemini-flash-lite-latest" }
      : null;
}

export function pageJudge(settings: ForgeSettings): MakerIO["judge"] | undefined {
  const engine = visionFor(settings);
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

/**
 * THE PICTURE PANEL's checkers (quality.ts), from the text engines you have
 * keys for (15 Oct 2026, tested on the sample puppets): Gemma 4 31B and
 * NVIDIA's Nemotron Omni through NVIDIA, dots-3 through OpenRouter as the
 * tie-breaker. The same models through OpenRouter's free tier when there is
 * no NVIDIA key. Undefined when fewer than two can be reached.
 */
export function pageInspect(settings: ForgeSettings): MakerIO["inspect"] | undefined {
  const keyFor = (host: string) => settings.textProviders.find((p) => p.key.trim() && p.base.includes(host))?.key.trim() ?? "";
  const nv = keyFor("integrate.api.nvidia.com");
  const or = keyFor("openrouter.ai");
  const engine = (base: string, key: string, model: string, name: string) => (b64: Promise<string>): PanelChecker => ({
    name,
    async facts(question) {
      const r = await askVision({ base, key, model }, await b64, question);
      if (!r.ok) return null;
      try {
        return jsonFromReply(r.text) as Facts;
      } catch {
        return null;
      }
    },
  });
  const NV = "https://integrate.api.nvidia.com/v1";
  const OR = "https://openrouter.ai/api/v1";
  const pair = nv
    ? [engine(NV, nv, "google/gemma-4-31b-it", "Gemma"), engine(NV, nv, "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning", "Nemotron")]
    : or
      ? [engine(OR, or, "google/gemma-4-31b-it:free", "Gemma"), engine(OR, or, "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", "Nemotron")]
      : [];
  if (pair.length < 2) return undefined;
  const tie = or ? engine(OR, or, "dots-studio/dots-3-note-preview:free", "dots") : undefined;
  return async (part, look, picture) => {
    const b64 = imgToB64(picture);
    return panelVerdict(part, look, pair.map((c) => c(b64)), tie?.(b64));
  };
}
