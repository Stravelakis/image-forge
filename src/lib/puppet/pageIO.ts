/**
 * The puppet maker's connection to the page: pictures in and out of canvas,
 * Image Forge's engines as `generate`, a vision model as `judge`.
 *
 * Kept apart from maker.ts so the maker itself has no DOM in it and the tests
 * and a headless run use the same code.
 */
import { findModel, formatUsd, generateBytes, localRoute, priceFor, resolveRoute, type ProviderId } from "../engines.mjs";
import { FREE_ENGINES } from "../paidGuard";
import type { PuppetSpend } from "./spend";
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
    paidEngine("nano-banana-2-lite", "Google Nano Banana 2 Lite"),
    paidEngine("nano-banana-2", "Google Nano Banana 2"),
  ];
}

/** A paid engine, priced from the model catalogue — never a number typed in here. */
function paidEngine(id: string, label: string): PuppetEngine {
  const price = priceFor(id) ?? findModel(id)?.priceUsd ?? 0;
  return { id, label, free: false, refs: true, price, note: `Paid: about ${formatUsd(price)} a picture.` };
}

/**
 * How a puppet engine id turns into a generation: your own machine takes its
 * model from settings, every other engine is a catalogue id. Shared by
 * pageGenerate and by the cost check, so the price asked about is the price
 * of the route that really runs.
 */
export function puppetRoute(settings: ForgeSettings, engineId: string): { localModel: string; model: string; settings: ForgeSettings } {
  const localModel = engineId.startsWith("local:") ? engineId.slice(6) : engineId === "local" ? settings.localModel : "";
  return {
    localModel,
    model: localModel ? "" : engineId,
    settings: localModel ? { ...settings, provider: "local" as ProviderId, localModel } : settings,
  };
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

/**
 * Count one picture against the approved spend, or refuse it. Free engines
 * cost nothing and pass. A price we cannot read from the catalogue counts as
 * unaffordable, not as free. Counted when the picture is asked for, because a
 * request that fails half way can still be billed.
 */
export function chargeOrRefuse(row: { model: string }, s: ForgeSettings, spend?: PuppetSpend): void {
  const route = resolveRoute(row as never, s as never) as { engine: string; def?: { id: string } };
  // A paused or retired engine stops with its own message further on and bills nothing.
  if (FREE_ENGINES.has(route.engine) || route.engine === "paused" || route.engine === "retired") return;
  const price = route.def ? priceFor(route.def.id) : null;
  if (price === null || !spend) {
    throw new Error("This engine's price is unknown, so the puppet maker will not use it. Pick a free engine or one with a listed price.");
  }
  if (spend.spentUsd + price > spend.approvedUsd + 1e-6) {
    throw new Error("The money approved for this puppet is used up, so it stopped. Press the button again to approve more, or pick a free engine.");
  }
  spend.spentUsd += price;
}

/**
 * Every picture the puppet maker draws comes through here, so this is also
 * where money is stopped. A free route passes. A paid route needs `spend` and
 * must fit inside what the person approved before the run started — the
 * dialog in PuppetMaker.tsx raises `spend.approvedUsd`; this only enforces it.
 * No `spend` means no paid pictures.
 */
export function pageGenerate(settings: ForgeSettings, engineId: string, onExhaust: (pool: string, id: string, until: number) => void, spend?: PuppetSpend): MakerIO["generate"] {
  const { localModel, model, settings: s } = puppetRoute(settings, engineId);
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
      model,
      seed: req.seed,
    };
    chargeOrRefuse(row, s, spend);
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
 * THE PER-MINUTE LIMIT (Ak, 16 Oct 2026: "we have a hard limit of 40 rpm"). Every
 * checker request to one provider waits its turn: at most 35 a minute per address,
 * so a free key never hits its hard limit, however many checks run at once.
 */
const PER_MINUTE = 35;
/** Checkers whose free allowance is used up, and until when they sit out. */
const spentUntil = new Map<string, number>();
const nextTurn = new Map<string, number>();
async function turnFor(base: string): Promise<void> {
  const now = Date.now();
  const at = Math.max(now, nextTurn.get(base) ?? 0);
  nextTurn.set(base, at + Math.ceil(60000 / PER_MINUTE));
  if (at > now) await new Promise((ok) => setTimeout(ok, at - now));
}

/**
 * THE PICTURE PANEL's checkers (quality.ts), scored against Ak's own verdicts on
 * Maria and Lucky (16 Oct 2026): Nemotron 3.5 Super VL 27 of 30, Step 5 26 of 30
 * (every tongue right), Nemotron Omni 24, Gemma 4 13 (mostly no answer).
 * Step 5 through NVIDIA; Super VL through OpenRouter's free tier when there is an
 * OpenRouter key — its own allowance, so the two share no limit — otherwise NVIDIA
 * too. Nemotron Omni breaks ties. Undefined when fewer than two can be reached.
 */
export function pageInspect(settings: ForgeSettings): MakerIO["inspect"] | undefined {
  const keyFor = (host: string) => settings.textProviders.find((p) => p.key.trim() && p.base.includes(host))?.key.trim() ?? "";
  const nv = keyFor("integrate.api.nvidia.com");
  const or = keyFor("openrouter.ai");
  const NV = "https://integrate.api.nvidia.com/v1";
  const OR = "https://openrouter.ai/api/v1";
  const engine = (base: string, key: string, model: string, name: string) => (b64: Promise<string>): PanelChecker => ({
    name,
    async answer(question) {
      // A free allowance used up for the day: this checker sits out until tomorrow
      // instead of retrying every question (OpenRouter's free models, ~1000 a day).
      if ((spentUntil.get(model) ?? 0) > Date.now()) return null;
      // Free tiers say "too busy" (429) or wobble (5xx): wait and ask again,
      // so a busy checker is not mistaken for one with nothing to say.
      await turnFor(base);
      let r = await askVision({ base, key, model }, await b64, question);
      const spent = (x: typeof r) => !x.ok && (x.status === 402 || (x.status === 429 && /per[- ]day|daily|credits/i.test(x.body ?? "")));
      if (spent(r)) {
        spentUntil.set(model, Date.now() + 6 * 3600_000);
        return null;
      }
      for (let t = 1; !r.ok && t <= 4 && (r.status === 429 || (r.status ?? 0) >= 500 || r.status === undefined); t++) {
        await new Promise((ok) => setTimeout(ok, 8000 * t));
        await turnFor(base);
        r = await askVision({ base, key, model }, await b64, question);
      }
      return r.ok ? r.text : null;
    },
  });
  const pair = [
    ...(nv ? [engine(NV, nv, "stepfun-ai/step-5-preview", "C1 Step 5")] : []),
    ...(or ? [engine(OR, or, "nvidia/nemotron-3.5-super-vl:free", "C2 Nemotron VL")] : nv ? [engine(NV, nv, "nvidia/nemotron-3.5-super-vl-120b-a12b", "C2 Nemotron VL")] : []),
  ];
  if (pair.length < 2) return undefined;
  // ALL THREE LOOK AT EVERY PART (Ak, 16 Oct 2026): C1, C2 and TB. Green = at
  // least two of them found nothing wrong. C1 and TB share NVIDIA's limit (turnFor).
  const tb = nv ? [engine(NV, nv, "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning", "TB Nemotron Omni")] : [];
  return async (part, look, picture) => {
    const b64 = imgToB64(picture);
    return panelVerdict(part, look, [...pair, ...tb].map((c) => c(b64)));
  };
}
