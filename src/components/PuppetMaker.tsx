/**
 * Make a puppet — the third kind of character art Image Forge makes, after the
 * classic sprite sheet and the classic viseme sheet: a talking, blinking,
 * waving puppet for Video Forge (12 Oct 2026).
 *
 * Four steps, one decision for a person (which face), the rest automatic with
 * bounded retries (lib/puppet/maker.ts). Opened from the menu, or by an order
 * Video Forge placed on the Forge shelf.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Toast } from "../types";
import type { ForgeSettings } from "../lib/providers";
import { formatUsd } from "../lib/providers";
import { findModel } from "../lib/engines.mjs";
import { PUPPET_STYLES, partsFor, type PuppetFraming } from "../lib/puppet/recipe";
import { baseQuestion, makeBaseOptions, makeParts, pictureBudget, PUPPET_SIZE, type PartReport, type Verdict } from "../lib/puppet/maker";
import { resize, type Img } from "../lib/puppet/pixels";
import { buildRig, puppetSlug, type CutPart, type ForgePuppet } from "../lib/puppet/rig";
import { blobToImg, imgToPng, imgToUrl, judgeName, pageGenerate, pageJudge, PUPPET_ENGINES } from "../lib/puppet/pageIO";
import { finishOrder, orderPictures, shelfAvailable, shelvePuppet, type PuppetOrder } from "../lib/puppet/shelf";
import { downloadBlob } from "../lib/output";
import { Btn, IX } from "./ui";

const field =
  "w-full rounded-lg border border-line bg-[var(--color-field)] px-3 py-2 text-[13px] text-cream placeholder:text-dust/60";
const label = "mb-1.5 block font-mono text-[10px] tracking-[0.2em] text-dust uppercase";
const tile = (on: boolean) =>
  `btn-press rounded-xl border p-3 text-left transition ${on ? "border-ember/60 bg-ember/10" : "border-line bg-[var(--color-field)] hover:border-line2"}`;

type Step = "describe" | "pick" | "build" | "done";

interface Pic {
  img: Img;
  url: string;
  verdict?: Verdict | null;
}

const STATUS_LOOK: Record<PartReport["status"], { dot: string; word: string }> = {
  waiting: { dot: "bg-line2", word: "waiting" },
  working: { dot: "bg-ember animate-pulse", word: "making" },
  ok: { dot: "bg-emerald-400", word: "done" },
  unsure: { dot: "bg-amber-400", word: "unsure" },
  missing: { dot: "bg-red-400", word: "missing" },
};

export default function PuppetMaker({
  settings,
  order,
  onClose,
  pushToast,
  pushLog,
  onExhaust,
}: {
  settings: ForgeSettings;
  /** an order from Video Forge, if that is what opened this */
  order?: PuppetOrder | null;
  onClose: () => void;
  pushToast: (kind: Toast["kind"], msg: string) => void;
  pushLog: (msg: string, kind: "info" | "ok" | "err" | "run") => void;
  onExhaust: (pool: "geminiKeys" | "geminiPaidKeys" | "openaiKeys", id: string, until: number) => void;
}) {
  const [step, setStep] = useState<Step>("describe");
  const [name, setName] = useState(order?.name ?? "");
  const [description, setDescription] = useState(order?.description ?? "");
  const [style, setStyle] = useState(order?.style ?? "pixar");
  const [framing, setFraming] = useState<PuppetFraming>(order?.framing ?? "head");
  const [inspo, setInspo] = useState<Pic[]>([]);
  const [engineId, setEngineId] = useState(() => (settings.provider === "local" ? "local" : settings.cloudflare?.token ? "cloudflare-flux2-klein" : "local"));
  const [bases, setBases] = useState<Pic[]>([]);
  const [round, setRound] = useState(0);
  const [base, setBase] = useState<Pic | null>(null);
  const [reports, setReports] = useState<PartReport[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [parts, setParts] = useState<Record<string, CutPart>>({});
  const [pictures, setPictures] = useState(0);
  const [busy, setBusy] = useState("");
  const [problem, setProblem] = useState("");
  const [rig, setRig] = useState<ForgePuppet | null>(null);
  const [canShelve, setCanShelve] = useState(false);
  const [shelved, setShelved] = useState("");
  const stopRef = useRef<AbortController | null>(null);

  useEffect(() => void shelfAvailable().then(setCanShelve), []);
  // An order's inspiration pictures arrive from the shelf.
  useEffect(() => {
    if (!order?.inspirations.length) return;
    void orderPictures(order).then(async (imgs) => setInspo(await Promise.all(imgs.map(async (img) => ({ img, url: await imgToUrl(img) })))));
  }, [order]);

  const engine = PUPPET_ENGINES.find((e) => e.id === engineId) ?? PUPPET_ENGINES[0];
  const price = findModel(engineId)?.priceUsd ?? 0;
  const budget = pictureBudget(framing);
  const checker = judgeName(settings);
  const io = useMemo(
    () => ({ generate: pageGenerate(settings, engineId, onExhaust as never), judge: pageJudge(settings) }),
    [settings, engineId, onExhaust]
  );
  const slug = puppetSlug(name || description.split(/[,.]/)[0] || "puppet");

  const addInspo = useCallback(async (files: FileList | File[]) => {
    const add: Pic[] = [];
    for (const f of Array.from(files).filter((f) => f.type.startsWith("image/")).slice(0, 3)) {
      const img = await blobToImg(f);
      // Small is plenty for inspiration, and engines cap the size they accept.
      const k = Math.min(1, 768 / Math.max(img.width, img.height));
      const small = resize(img, Math.round(img.width * k), Math.round(img.height * k));
      add.push({ img: small, url: await imgToUrl(small) });
    }
    setInspo((p) => [...p, ...add].slice(0, 3));
  }, []);

  const fail = (e: unknown) => {
    const err = e as { name?: string; message?: string };
    if (err?.name === "AbortError" || /halted|stopped/.test(err?.message ?? "")) return "Stopped. Everything made so far is kept — press Continue to carry on.";
    return err?.message ?? "something went wrong";
  };

  /* ---------- step 1 → 2: four faces ---------- */
  const makeFaces = useCallback(async () => {
    setProblem("");
    setBusy("Drawing four faces…");
    setStep("pick");
    setBases([]);
    const ctrl = new AbortController();
    stopRef.current = ctrl;
    try {
      await makeBaseOptions(
        { description, style, framing, inspirations: inspo.map((p) => p.img), count: 4, round },
        io,
        async (e) => {
          if (e.type === "picture") setPictures((n) => n + 1);
          if (e.type === "base") {
            const url = await imgToUrl(e.picture);
            setBases((p) => [...p, { img: e.picture, url, verdict: e.verdict }]);
          }
        },
        ctrl.signal
      );
      pushLog(`✓ puppet faces drawn for ${name || "a new character"}`, "ok");
    } catch (e) {
      setProblem(fail(e));
    } finally {
      setBusy("");
      setRound((r) => r + 1);
    }
  }, [description, style, framing, inspo, round, io, name, pushLog]);

  const useOwnPicture = useCallback(async (f: File) => {
    const img = resize(await blobToImg(f), PUPPET_SIZE, PUPPET_SIZE);
    const pic: Pic = { img, url: await imgToUrl(img), verdict: null };
    setBases((p) => [pic, ...p]);
    setBase(pic);
    // Your own picture gets the same look-over as a drawn one.
    if (io.judge) {
      const verdict = await io.judge(baseQuestion(framing), resize(img, 512, 512)).catch(() => null);
      setBases((p) => p.map((b) => (b.url === pic.url ? { ...b, verdict } : b)));
    }
  }, [io, framing]);

  /* ---------- step 3: the parts ---------- */
  const build = useCallback(
    async (only?: string[]) => {
      if (!base) return;
      setProblem("");
      setStep("build");
      setBusy("Making the parts…");
      const ctrl = new AbortController();
      stopRef.current = ctrl;
      const keep = only ? Object.fromEntries(Object.entries(parts).filter(([k]) => !only.includes(k))) : parts;
      try {
        const res = await makeParts(
          { base: base.img, framing, done: keep, only },
          io,
          async (e) => {
            if (e.type === "picture") setPictures((n) => n + 1);
            if (e.type === "part") {
              setReports((prev) => {
                const next = prev.length ? [...prev] : partsFor(framing).map((p) => ({ id: p.id, label: p.label, status: "waiting" as const, tries: 0, why: "" }));
                const i = next.findIndex((r) => r.id === e.report.id);
                if (i >= 0) next[i] = e.report;
                return next;
              });
              if (e.preview) {
                const url = await imgToUrl(e.preview);
                setPreviews((p) => ({ ...p, [e.report.id]: url }));
              }
            }
          },
          ctrl.signal
        );
        const all = { ...keep, ...res.parts };
        setParts(all);
        const made = buildRig({
          name: slug,
          framing,
          base: base.img,
          parts: all,
          madeBy: { name: name || slug, description, style, framing, engine: engine.label, app: "Image Forge", madeAt: new Date().toISOString() },
        });
        setRig(made);
        setStep("done");
        const missing = res.reports.filter((r) => r.status === "missing").length;
        pushLog(`✓ puppet ${name || slug}: ${Object.keys(all).length} parts${missing ? `, ${missing} missing` : ""}, ${res.pictures} pictures`, "ok");
      } catch (e) {
        setProblem(fail(e));
        // The part being made when it stopped is not "making" any more.
        setReports((prev) => prev.map((r) => (r.status === "working" ? { ...r, status: "waiting" } : r)));
      } finally {
        setBusy("");
      }
    },
    [base, framing, io, parts, slug, name, description, style, engine.label, pushLog]
  );

  const stop = () => stopRef.current?.abort();

  /* ---------- step 4: keep it ---------- */
  const sendToVideoForge = useCallback(async () => {
    if (!rig) return;
    setBusy("Putting it on the shelf…");
    const r = await shelvePuppet(slug, rig);
    setBusy("");
    if (!r.ok) return setProblem(r.problem ?? "could not save the puppet");
    if (order) await finishOrder(order.id, { slug });
    setShelved(slug);
    pushToast("ok", `${name || slug} is ready in Video Forge (Cast → Face).`);
  }, [rig, slug, order, name, pushToast]);

  const saveZip = useCallback(async () => {
    if (!rig) return;
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    const dir = zip.folder(slug)!;
    for (const [file, img] of Object.entries(rig.files)) dir.file(file, await imgToPng(img));
    dir.file(`${slug}.rig.json`, JSON.stringify(rig.json, null, 1));
    downloadBlob(`${slug}-puppet.zip`, await zip.generateAsync({ type: "blob" }));
  }, [rig, slug]);

  const close = () => {
    stop();
    if (order && !shelved && step !== "describe") void finishOrder(order.id, { problem: "closed before it was finished" });
    onClose();
  };

  const counts = reports.reduce((m, r) => ((m[r.status] = (m[r.status] ?? 0) + 1), m), {} as Record<string, number>);
  const redo = reports.filter((r) => r.status === "unsure" || r.status === "missing").map((r) => r.id);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm">
      <div className="my-6 w-full max-w-5xl rounded-2xl border border-line bg-panel shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div>
            <p className="font-display text-[17px] tracking-wide text-cream">Make a puppet</p>
            <p className="font-mono text-[10.5px] text-dust">a character that talks, blinks and moves — for Video Forge</p>
          </div>
          <div className="flex items-center gap-3">
            <Steps step={step} />
            <button onClick={close} className="btn-press rounded-lg p-2 text-dust hover:bg-raise hover:text-cream" aria-label="Close">
              <IX size={16} />
            </button>
          </div>
        </div>

        {order && (
          <p className="mx-5 mt-4 rounded-lg border border-ember/40 bg-ember/10 px-3 py-2 text-[12px] text-ember">
            Ordered by {order.from}. When it is finished it goes straight back there.
          </p>
        )}

        {step === "describe" && (
          <div className="grid gap-5 p-5 lg:grid-cols-[1fr_340px]">
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
                <div>
                  <label className={label} title="What the puppet is called. Becomes its file name.">name</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Hoolio" className={field} />
                </div>
                <div>
                  <label className={label} title="Who the character is: what they are, what they wear, their colours. One or two sentences.">describe the character</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    placeholder="a friendly grey owl librarian with round glasses and a green knitted cardigan"
                    className={`${field} resize-y`}
                  />
                </div>
              </div>

              <div>
                <label className={label}>style</label>
                <div className="grid gap-2 sm:grid-cols-3">
                  {PUPPET_STYLES.map((s) => (
                    <button key={s.id} onClick={() => setStyle(s.id)} className={tile(style === s.id)} title={s.prompt}>
                      <span className="block text-[13px] font-semibold text-cream">{s.label}</span>
                      <span className="mt-0.5 block text-[11.5px] leading-snug text-dust">{s.blurb}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className={label}>how much of them</label>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button onClick={() => setFraming("head")} className={tile(framing === "head")} title="Face and shoulders fill the frame. Talks, blinks, raises its brows.">
                    <span className="block text-[13px] font-semibold text-cream">Head and shoulders</span>
                    <span className="mt-0.5 block text-[11.5px] text-dust">Talks, blinks, raises its brows · {partsFor("head").length} parts</span>
                  </button>
                  <button onClick={() => setFraming("waist")} className={tile(framing === "waist")} title="Waist up, with arms. Adds a wave, pointing, a shrug and explaining hands.">
                    <span className="block text-[13px] font-semibold text-cream">Waist up, with arms</span>
                    <span className="mt-0.5 block text-[11.5px] text-dust">All that, plus wave · point · shrug · explain · {partsFor("waist").length} parts</span>
                  </button>
                </div>
              </div>

              <div>
                <label className={label} title="Pictures to borrow the look from — a photo, a drawing, a pet. They inspire; they are not copied.">inspiration pictures (optional, up to 3)</label>
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    void addInspo(e.dataTransfer.files);
                  }}
                  className="flex min-h-[92px] flex-wrap items-center gap-3 rounded-xl border border-dashed border-line2 bg-[var(--color-field)] p-3"
                >
                  {inspo.map((p, i) => (
                    <div key={p.url} className="relative">
                      <img src={p.url} alt="" className="h-20 w-20 rounded-lg object-cover" />
                      <button onClick={() => setInspo((x) => x.filter((_, j) => j !== i))} className="absolute -right-2 -top-2 rounded-full bg-panel p-1 text-dust hover:text-cream" aria-label="Remove">
                        <IX size={12} />
                      </button>
                    </div>
                  ))}
                  {inspo.length < 3 && (
                    <label className="cursor-pointer text-[12px] text-dust">
                      Drop pictures here, or <span className="text-ember underline">choose</span>
                      <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => e.target.files && void addInspo(e.target.files)} />
                    </label>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className={label} title="Which picture engine makes it. It must be able to work FROM a picture.">engine</label>
                <div className="space-y-2">
                  {PUPPET_ENGINES.map((e) => (
                    <button key={e.id} onClick={() => setEngineId(e.id)} className={`${tile(engineId === e.id)} w-full`} title={e.note}>
                      <span className="flex items-center justify-between text-[13px] font-semibold text-cream">
                        {e.label}
                        <span className={`font-mono text-[10px] ${e.free ? "text-emerald-300" : "text-amber-300"}`}>{e.free ? "free" : "paid"}</span>
                      </span>
                      <span className="mt-0.5 block text-[11.5px] leading-snug text-dust">{e.note}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-line bg-[var(--color-field)] px-3 py-2.5 text-[12px] leading-relaxed text-parch">
                <p>
                  <b className="text-cream">{budget.best}–{budget.worst} pictures.</b> {budget.best} if every part works first time; each part gets at most 3 tries, then it is marked missing and the
                  puppet still works without it.
                </p>
                {price > 0 && (
                  <p className="mt-1 text-amber-300">
                    About {formatUsd(price * budget.best)}–{formatUsd(price * budget.worst)} on {engine.label}.
                  </p>
                )}
                <p className="mt-1 text-dust">
                  {checker ? `Each part is checked by ${checker}.` : "No picture checker set up: parts are checked by their shape only. A Google key or a vision engine (Settings) adds a second look."}
                </p>
              </div>
              <Btn variant="primary" onClick={() => void makeFaces()} disabled={!description.trim()} className="w-full">
                Draw 4 faces to choose from
              </Btn>
              <label className="block cursor-pointer text-center text-[12px] text-dust">
                …or <span className="text-ember underline">start from my own picture</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void useOwnPicture(f).then(() => setStep("pick"));
                  }}
                />
              </label>
            </div>
          </div>
        )}

        {step === "pick" && (
          <div className="space-y-4 p-5">
            <p className="text-[13px] text-parch">
              Pick the face. <span className="text-dust">Everything else is made from it, so choose the one you would be happy to see in every video. Look for a closed mouth and eyes that point the same way.</span>
            </p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {bases.map((b, i) => (
                <button key={b.url} onClick={() => setBase(b)} className={`${tile(base?.url === b.url)} p-2`}>
                  <img src={b.url} alt={`option ${i + 1}`} className="aspect-square w-full rounded-lg object-cover" />
                  <span className={`mt-1.5 block text-[11px] ${b.verdict == null ? "text-dust" : b.verdict.ok ? "text-emerald-300" : "text-amber-300"}`}>
                    {b.verdict == null ? "not checked" : b.verdict.ok ? "✓ looks right" : `⚠ ${b.verdict.why}`}
                  </span>
                </button>
              ))}
              {busy && Array.from({ length: Math.max(0, 4 - bases.length) }).map((_, i) => <div key={i} className="aspect-square animate-pulse rounded-xl border border-line bg-[var(--color-field)]" />)}
            </div>
            {problem && <p className="rounded-lg border border-red-400/40 bg-red-400/10 px-3 py-2 text-[12px] text-red-300">{problem}</p>}
            <div className="flex flex-wrap gap-2">
              <Btn variant="primary" disabled={!base || !!busy} onClick={() => void build()}>
                Make the puppet from this face
              </Btn>
              <Btn disabled={!!busy} onClick={() => void makeFaces()}>
                Draw 4 others
              </Btn>
              <Btn disabled={!!busy} onClick={() => setStep("describe")}>
                Change the description
              </Btn>
              {busy && <Btn onClick={stop}>Stop</Btn>}
            </div>
          </div>
        )}

        {(step === "build" || step === "done") && (
          <div className="grid gap-5 p-5 lg:grid-cols-[1fr_320px]">
            <div>
              <div className="mb-2 flex items-center justify-between text-[12px] text-dust">
                <span>
                  {counts.ok ?? 0} done · {counts.unsure ?? 0} unsure · {counts.missing ?? 0} missing · {pictures} pictures made
                </span>
                {busy && <span className="text-ember">{busy}</span>}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(reports.length ? reports : partsFor(framing).map((p) => ({ id: p.id, label: p.label, status: "waiting" as const, tries: 0, why: "" }))).map((r) => (
                  <div key={r.id} className="rounded-lg border border-line bg-[var(--color-field)] p-2" title={r.why}>
                    {previews[r.id] ? <img src={previews[r.id]} alt="" className="mb-1.5 h-16 w-full rounded object-cover" /> : <div className="mb-1.5 h-16 rounded bg-black/30" />}
                    <div className="flex items-center gap-1.5 text-[11.5px] text-cream">
                      <span className={`h-2 w-2 rounded-full ${STATUS_LOOK[r.status].dot}`} />
                      {r.label}
                      <span className="ml-auto font-mono text-[10px] text-dust">{STATUS_LOOK[r.status].word}{r.tries > 1 ? ` · try ${r.tries}` : ""}</span>
                    </div>
                    {(r.status === "unsure" || r.status === "missing") && r.why && <p className="mt-1 line-clamp-2 text-[10.5px] leading-snug text-dust">{r.why}</p>}
                  </div>
                ))}
              </div>
              {problem && <p className="mt-3 rounded-lg border border-red-400/40 bg-red-400/10 px-3 py-2 text-[12px] text-red-300">{problem}</p>}
            </div>

            <div className="space-y-3">
              {rig ? <PuppetPreview rig={rig} /> : base && <img src={base.url} alt="" className="aspect-square w-full rounded-xl object-cover opacity-70" />}
              <div className="flex flex-col gap-2">
                {busy ? (
                  <Btn onClick={stop}>Stop</Btn>
                ) : step === "build" ? (
                  <Btn variant="primary" onClick={() => void build()}>
                    Continue
                  </Btn>
                ) : (
                  <>
                    {canShelve && (
                      <Btn variant="primary" onClick={() => void sendToVideoForge()} disabled={!!shelved}>
                        {shelved ? "✓ In Video Forge" : "Send to Video Forge"}
                      </Btn>
                    )}
                    <Btn onClick={() => void saveZip()}>Save the puppet (zip)</Btn>
                    {redo.length > 0 && <Btn onClick={() => void build(redo)}>Try the {redo.length} unsure/missing again</Btn>}
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Steps({ step }: { step: Step }) {
  const all: [Step, string][] = [
    ["describe", "Describe"],
    ["pick", "Pick a face"],
    ["build", "Build"],
    ["done", "Try it"],
  ];
  const at = all.findIndex(([s]) => s === step);
  return (
    <ol className="hidden items-center gap-1.5 font-mono text-[10px] md:flex">
      {all.map(([s, t], i) => (
        <li key={s} className={`rounded-full px-2.5 py-1 ${i === at ? "bg-ember/20 text-ember" : i < at ? "text-parch" : "text-dust"}`}>
          {i + 1} {t}
        </li>
      ))}
    </ol>
  );
}

/**
 * The puppet, alive: talking (mouth shapes), blinking every few seconds,
 * brows moving, and — waist-up — cycling its arm poses. Drawn the way Video
 * Forge draws it: base, arms, mouth, brows, lids last.
 */
function PuppetPreview({ rig }: { rig: ForgePuppet }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0;
    let alive = true;
    const bitmaps: Record<string, ImageBitmap> = {};
    void (async () => {
      for (const [f, img] of Object.entries(rig.files)) bitmaps[f] = await createImageBitmap(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height));
      const c = ref.current;
      if (!c || !alive) return;
      const g = c.getContext("2d")!;
      const S = c.width;
      const baseBmp = bitmaps[rig.json.base];
      const k = S / baseBmp.width;
      const draw = (l?: { file: string; x: number; y: number; w: number; h: number }) => {
        if (!l || l.file === "empty.png" || !bitmaps[l.file]) return;
        const w = l.w * k;
        const h = l.h * k;
        g.drawImage(bitmaps[l.file], (l.x + 0.5) * S - w / 2, (l.y + 0.5) * S - h / 2, w, h);
      };
      const talk = ["1", "2", "3", "0", "4", "6", "1", "7", "8", "0", "0", "9", "9"];
      const browKeys = Object.keys(rig.json.brows).filter((b) => !["rest", "serious", "sad", "angry"].includes(b));
      const poseKeys = Object.keys(rig.json.poses ?? {});
      const t0 = performance.now();
      const neck = rig.json.neck;
      /** The head's movement now: a nod, a shake and a laugh in turn, a few
       *  seconds apart — the same three moves Video Forge makes from the script. */
      const headMove = (t: number) => {
        const c = t % 9;
        const l = c % 3;
        const fade = Math.exp(-l * 1.6) * (l < 1.4 ? 1 : 0);
        if (c < 3) return { dy: Math.max(0, Math.sin(l * Math.PI * 2 * 2.4)) * 0.035 * fade, rot: 0, label: "nod" };
        if (c < 6) return { dy: 0, rot: Math.sin(l * Math.PI * 2 * 5.5) * 5 * Math.exp(-l * 2.2) * (l < 1.4 ? 1 : 0), label: "shake" };
        return { dy: -0.012 * fade + Math.abs(Math.sin(l * Math.PI * 2 * 6.4)) * 0.022 * fade, rot: -3.5 * fade, label: "laugh" };
      };
      const frame = (now: number) => {
        const t = (now - t0) / 1000;
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, S, S);
        g.fillStyle = "#3b6b3a";
        g.fillRect(0, 0, S, S);
        const pose = poseKeys.length ? poseKeys[Math.floor(t / 2.6) % (poseKeys.length + 1)] : undefined;
        const move = neck ? headMove(t) : { dy: 0, rot: 0 };
        if (neck) {
          // Body: everything below the neck line, still.
          g.save();
          g.beginPath();
          g.rect(0, neck.y * S, S, S);
          g.clip();
          g.drawImage(baseBmp, 0, 0, S, S);
          g.restore();
        }
        draw(pose ? rig.json.poses?.[pose] : undefined);
        // Head: everything above the neck line (plus the overlap that hides the
        // join), turned about the neck, with its face parts riding along.
        g.save();
        if (neck) {
          const px = S / 2;
          const py = neck.y * S;
          g.translate(px, py + move.dy * S);
          g.rotate((move.rot * Math.PI) / 180);
          g.translate(-px, -py);
          g.beginPath();
          g.rect(0, 0, S, (neck.y + neck.overlap) * S);
          g.clip();
        }
        g.drawImage(baseBmp, 0, 0, S, S);
        draw(rig.json.mouths[talk[Math.floor(t * 8) % talk.length]]);
        const brow = browKeys.length && Math.floor(t / 1.9) % 2 ? browKeys[Math.floor(t / 3.8) % browKeys.length] : "rest";
        draw(rig.json.brows[brow]?.left);
        const b = t % 3.2;
        draw(b < 0.06 || (b > 0.18 && b < 0.24) ? rig.json.eyes.lids.half : b < 0.18 ? rig.json.eyes.lids.closed : undefined);
        g.restore();
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    })();
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [rig]);
  return <canvas ref={ref} width={320} height={320} className="aspect-square w-full rounded-xl border border-line" aria-label="The puppet, talking and blinking" />;
}
