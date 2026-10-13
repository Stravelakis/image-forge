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
import { PUPPET_STYLES, keyColourFor, lipsFor, partsFor, type PuppetFraming } from "../lib/puppet/recipe";
import { baseQuestion, makeBaseOptions, makeParts, pictureBudget, PUPPET_SIZE, type PartReport, type Verdict } from "../lib/puppet/maker";
import { resize, type Img } from "../lib/puppet/pixels";
import { buildRig, puppetSlug, type CutPart, type ForgePuppet } from "../lib/puppet/rig";
import { type PuppetEngine, sizeFor, blobToImg, describeInspiration, imgToPng, imgToUrl, judgeName, listLocalImageModels, pageGenerate, pageJudge, puppetEngines, unloadLocal } from "../lib/puppet/pageIO";
import { finishOrder, orderPictures, removeFromShelf, shelfAvailable, shelvePuppet, type PuppetOrder } from "../lib/puppet/shelf";
import type { PuppetTemplate } from "../lib/batches";
import { downloadBlob } from "../lib/output";
import { IX } from "./ui";

// The Forge look (index.css, .forge-*): glass, Sora, round, two button kinds.
const field = "forge-field";
const label = "forge-label";
const tile = (on: boolean) => `forge-tile ${on ? "on" : ""}`;

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
  template,
  onSaveTemplate,
  onClose,
  pushToast,
  pushLog,
  onExhaust,
}: {
  settings: ForgeSettings;
  /** an order from Video Forge, if that is what opened this */
  order?: PuppetOrder | null;
  /** a saved puppet template to start from */
  template?: PuppetTemplate | null;
  onSaveTemplate?: (name: string, t: PuppetTemplate) => void;
  onClose: () => void;
  pushToast: (kind: Toast["kind"], msg: string) => void;
  pushLog: (msg: string, kind: "info" | "ok" | "err" | "run") => void;
  onExhaust: (pool: "geminiKeys" | "geminiPaidKeys" | "openaiKeys", id: string, until: number) => void;
}) {
  const [step, setStep] = useState<Step>("describe");
  const [name, setName] = useState(order?.name ?? "");
  const [description, setDescription] = useState(order?.description ?? template?.description ?? "");
  const [style, setStyle] = useState(order?.style ?? template?.style ?? "pixar");
  // Waist-up by default (13 Oct 2026): the hands are what made Ak say a
  // puppet had never moved them — head-only puppets have none.
  const [framing, setFraming] = useState<PuppetFraming>(order?.framing ?? template?.framing ?? "waist");
  // Lips or none, the same in every picture; guessed from the words until set by hand.
  const [lipsTouched, setLipsTouched] = useState<boolean | null>(null);
  const lips = lipsTouched ?? lipsFor(description, style);
  const look = useMemo(() => ({ key: keyColourFor(description), lips }), [description, lips]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [inspo, setInspo] = useState<Pic[]>([]);
  // Two engines (Ak, 12 Oct 2026): one draws the faces, one makes the parts.
  // The parts need one that works from a picture; the faces can come from any.
  const [localModels, setLocalModels] = useState<string[]>([]);
  const [faceId, setFaceId] = useState(template?.faceEngine ?? "");
  const [partId, setPartId] = useState(template?.partEngine ?? "");
  // Pick the face automatically — for orders and overnight runs.
  const [autoPick, setAutoPick] = useState(order?.auto ?? false);
  const [bases, setBases] = useState<Pic[]>([]);
  const [round, setRound] = useState(0);
  const [base, setBase] = useState<Pic | null>(null);
  const baseRef = useRef(base);
  baseRef.current = base;
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
  // Click any picture to see it large (Ak, 12 Oct 2026). "live" = the talking preview.
  const [zoom, setZoom] = useState<{ url: string; caption: string } | "live" | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setZoom(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => void shelfAvailable().then(setCanShelve), []);
  // An order's inspiration pictures arrive from the shelf.
  useEffect(() => {
    if (!order?.inspirations.length) return;
    void orderPictures(order).then(async (imgs) => setInspo(await Promise.all(imgs.map(async (img) => ({ img, url: await imgToUrl(img) })))));
  }, [order]);

  useEffect(() => {
    void listLocalImageModels(settings).then((ms) => {
      setLocalModels(ms);
      // Sensible first choice: Z-Image for faces and an editing model for parts
      // when this computer has them; otherwise the first free ones.
      const all = puppetEngines(ms);
      setFaceId((v) => v || (all.find((e) => /z-?image/i.test(e.id)) ?? all[0]).id);
      setPartId((v) => v || (all.find((e) => e.refs) ?? all[0]).id);
    });
  }, [settings]);
  const engines = useMemo(() => puppetEngines(localModels), [localModels]);
  const faceEng = engines.find((e) => e.id === faceId) ?? engines[0];
  const partEng = engines.find((e) => e.id === partId && e.refs) ?? engines.find((e) => e.refs)!;
  const budget = pictureBudget(framing);
  const nParts = partsFor(framing).length;
  const cost = { best: faceEng.price * 4 + partEng.price * nParts, worst: faceEng.price * 4 + partEng.price * nParts * 3 };
  const checker = judgeName(settings);
  const faceIO = useMemo(() => ({ generate: pageGenerate(settings, faceEng.id, onExhaust as never), judge: pageJudge(settings) }), [settings, faceEng.id, onExhaust]);
  const io = useMemo(() => ({ generate: pageGenerate(settings, partEng.id, onExhaust as never), judge: pageJudge(settings) }), [settings, partEng.id, onExhaust]);
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
    const drawn: Pic[] = [];
    try {
      // An engine that only draws from words cannot look at inspiration
      // pictures, so the checker describes them and the words go in instead.
      let words = description;
      let pics = inspo.map((p) => p.img);
      if (pics.length && !faceEng.refs) {
        setBusy("Reading the inspiration pictures…");
        const said = await describeInspiration(settings, pics);
        if (said) words = `${description.trim()}. Inspired by: ${said}`;
        pics = [];
        setBusy("Drawing four faces…");
      }
      await makeBaseOptions(
        { description: words, style, framing, inspirations: pics, count: 4, round, size: sizeFor(faceEng.id), look },
        faceIO,
        async (e) => {
          if (e.type === "picture") setPictures((n) => n + 1);
          if (e.type === "base") {
            const pic = { img: e.picture, url: await imgToUrl(e.picture), verdict: e.verdict };
            drawn.push(pic);
            setBases((p) => [...p, pic]);
          }
        },
        ctrl.signal
      );
      pushLog(`✓ puppet faces drawn for ${name || "a new character"}`, "ok");
      if (autoPick && drawn.length) {
        // The first face the checker liked; the first one if it liked none.
        const pick = drawn.find((d) => d.verdict?.ok) ?? drawn[0];
        setBase(pick);
        pushLog(`↪ picked face ${drawn.indexOf(pick) + 1} automatically`, "info");
        setTimeout(() => void buildRef.current?.(undefined, pick), 50);
      }
    } catch (e) {
      setProblem(fail(e));
    } finally {
      setBusy("");
      setRound((r) => r + 1);
    }
  }, [description, style, framing, inspo, round, faceIO, faceEng.refs, settings, autoPick, name, pushLog, look]);

  const useOwnPicture = useCallback(async (f: File) => {
    const img = resize(await blobToImg(f), sizeFor(partEng.id), sizeFor(partEng.id));
    const pic: Pic = { img, url: await imgToUrl(img), verdict: null };
    setBases((p) => [pic, ...p]);
    setBase(pic);
    // Your own picture gets the same look-over as a drawn one.
    if (io.judge) {
      const verdict = await io.judge(baseQuestion(framing, look), resize(img, 512, 512)).catch(() => null);
      setBases((p) => p.map((b) => (b.url === pic.url ? { ...b, verdict } : b)));
    }
  }, [io, framing, partEng.id, look]);

  /* ---------- step 3: the parts ---------- */
  const build = useCallback(
    async (only?: string[], picked?: Pic) => {
      const base = picked ?? baseRef.current;
      if (!base) return;
      setProblem("");
      setStep("build");
      setBusy("Making the parts…");
      const ctrl = new AbortController();
      stopRef.current = ctrl;
      const keep = only ? Object.fromEntries(Object.entries(parts).filter(([k]) => !only.includes(k))) : parts;
      try {
        // Two local models do not fit an 8 GB card together — let the face
        // model go before the parts model loads.
        if (faceEng.id.startsWith("local:") && partEng.id.startsWith("local:") && faceEng.id !== partEng.id) {
          await unloadLocal(settings, faceEng.id.slice(6));
        }
        const res = await makeParts(
          { base: base.img, framing, done: keep, only, look },
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
          madeBy: { name: name || slug, description, style, framing, engine: `faces: ${faceEng.label}; parts: ${partEng.label}`, app: "Image Forge", madeAt: new Date().toISOString() },
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
    [framing, io, parts, slug, name, description, style, faceEng, partEng, settings, pushLog, look]
  );
  const buildRef = useRef(build);
  buildRef.current = build;

  const stop = () => stopRef.current?.abort();

  // An order that says "nobody is here" starts by itself, once the engines are
  // known (and once only — the inspiration pictures need a moment to arrive).
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!order?.auto || autoStarted.current || !faceId || !partId || step !== "describe") return;
    if (order.inspirations.length && inspo.length < order.inspirations.length) return;
    autoStarted.current = true;
    void makeFaces();
  }, [order, faceId, partId, step, inspo.length, makeFaces]);

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

  /** Throw this puppet away: off the shelf too if it went there, and back to step 1. */
  const deletePuppet = useCallback(async () => {
    stop();
    if (shelved) await removeFromShelf(shelved);
    if (order) void finishOrder(order.id, { problem: "deleted in Image Forge" });
    setRig(null);
    setParts({});
    setReports([]);
    setPreviews({});
    setBase(null);
    setBases([]);
    setShelved("");
    setConfirmDelete(false);
    setStep("describe");
    pushToast("info", `${name || "The puppet"} is deleted.${shelved ? " It is off the Video Forge shelf too." : ""}`);
  }, [shelved, order, name, pushToast]);

  const close = () => {
    stop();
    if (order && !shelved && step !== "describe") void finishOrder(order.id, { problem: "closed before it was finished" });
    onClose();
  };

  const counts = reports.reduce((m, r) => ((m[r.status] = (m[r.status] ?? 0) + 1), m), {} as Record<string, number>);
  const redo = reports.filter((r) => r.status === "unsure" || r.status === "missing").map((r) => r.id);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-md">
      <div className="forge-pop my-6 w-full max-w-5xl">
        <div className="forge-head flex items-center justify-between px-6 py-4">
          <div>
            <h2>Make a puppet</h2>
            <p className="forge-sub">a character that talks, blinks and moves — for Video Forge</p>
          </div>
          <div className="flex items-center gap-3">
            <Steps step={step} />
            <button onClick={close} className="btn-press rounded-lg p-2 text-[#8f98ab] hover:bg-raise hover:text-[#eef1f8]" aria-label="Close">
              <IX size={16} />
            </button>
          </div>
        </div>

        {order && (
          <p className="forge-note mx-6 mt-4 border border-[color-mix(in_srgb,var(--color-ember)_45%,transparent)] bg-[color-mix(in_srgb,var(--color-ember)_10%,transparent)] text-[var(--color-ember)]">
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
                      <span className="t block">{s.label}</span>
                      <span className="d mt-0.5 block">{s.blurb}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className={label}>how much of them</label>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button onClick={() => setFraming("head")} className={tile(framing === "head")} title="Face and shoulders fill the frame. Talks, blinks, raises its brows.">
                    <span className="t block">Head and shoulders</span>
                    <span className="d mt-0.5 block">Talks, blinks, raises its brows · {partsFor("head").length} parts</span>
                  </button>
                  <button onClick={() => setFraming("waist")} className={tile(framing === "waist")} title="Waist up, with arms. Adds a wave, pointing, a shrug and explaining hands.">
                    <span className="t block">Waist up, with arms</span>
                    <span className="d mt-0.5 block">All that, plus wave · point · shrug · explain · {partsFor("waist").length} parts</span>
                  </button>
                </div>
              </div>

              <div>
                <label className={label} title="One or the other for the whole puppet, so its mouth always looks like the same mouth.">its mouth</label>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button onClick={() => setLipsTouched(true)} className={tile(lips)} title="A mouth with drawn lips — usual for people.">
                    <span className="t block">With lips</span>
                    <span className="d mt-0.5 block">Drawn lips in every mouth shape</span>
                  </button>
                  <button onClick={() => setLipsTouched(false)} className={tile(!lips)} title="A mouth that is just an opening — usual for animals, doodles and anime.">
                    <span className="t block">No lips</span>
                    <span className="d mt-0.5 block">Just an opening, like most cartoon animals</span>
                  </button>
                </div>
                <p className="mt-1.5 text-[11.5px] text-[#8f98ab]">
                  {lipsTouched === null ? "Guessed from the description — click to change. " : ""}
                  Drawn on a plain {look.key.name} background, which is cut away afterwards ({look.key.name === "magenta" ? "the usual one" : `not magenta, because of the colours in the description`}).
                </p>
              </div>

              <div>
                <label className={label} title="Pictures to borrow the look from — a photo, a drawing, a pet. They inspire; they are not copied.">inspiration pictures (optional, up to 3)</label>
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    void addInspo(e.dataTransfer.files);
                  }}
                  className="flex min-h-[92px] flex-wrap items-center gap-3 rounded-[20px] border border-dashed border-white/15 bg-black/30 p-3"
                >
                  {inspo.map((p, i) => (
                    <div key={p.url} className="relative">
                      <img src={p.url} alt="" className="zoomable h-20 w-20 rounded-[14px] object-cover" onClick={() => setZoom({ url: p.url, caption: "Inspiration picture" })} />
                      <button onClick={() => setInspo((x) => x.filter((_, j) => j !== i))} className="absolute -right-2 -top-2 rounded-full bg-panel p-1 text-[#8f98ab] hover:text-[#eef1f8]" aria-label="Remove">
                        <IX size={12} />
                      </button>
                    </div>
                  ))}
                  {inspo.length < 3 && (
                    <label className="cursor-pointer text-[12px] text-[#8f98ab]">
                      Drop pictures here, or <span className="text-[var(--color-ember)] underline">choose</span>
                      <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => e.target.files && void addInspo(e.target.files)} />
                    </label>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-3">
                <EnginePick
                  title="faces drawn by"
                  tip="The 4 faces you choose from. Any engine works here; one that cannot look at pictures gets your inspiration pictures described in words."
                  engines={engines}
                  value={faceEng.id}
                  onChange={setFaceId}
                />
                <EnginePick
                  title="parts made by"
                  tip="The mouths, eyelids, brows and arms. Each is an edit of the chosen face, so this engine must work FROM a picture."
                  engines={engines.filter((e) => e.refs)}
                  value={partEng.id}
                  onChange={setPartId}
                />
                <label className="flex cursor-pointer items-start gap-2 text-[12px] text-[#c3c9d6]" title="For orders and overnight runs: the first face the checker likes is used, and the parts start straight away.">
                  <input type="checkbox" checked={autoPick} onChange={(e) => setAutoPick(e.target.checked)} className="mt-0.5" />
                  <span>Pick the face for me and carry on <span className="text-[#8f98ab]">— nobody needs to be here</span></span>
                </label>
              </div>
              <div className="forge-tile text-[12px] leading-relaxed text-[#c3c9d6]">
                <p>
                  <b className="text-[#eef1f8]">{budget.best}–{budget.worst} pictures.</b> {budget.best} if every part works first time; each part gets at most 3 tries, then it is marked missing and the
                  puppet still works without it.
                </p>
                {cost.worst > 0 && (
                  <p className="mt-1 text-amber-300">
                    About {formatUsd(cost.best)}–{formatUsd(cost.worst)} in all.
                  </p>
                )}
                <p className="mt-1 text-[#8f98ab]">
                  {checker ? `Each part is checked by ${checker}.` : "No picture checker set up: parts are checked by their shape only. A Google key or a vision engine (Settings) adds a second look."}
                </p>
              </div>
              <button onClick={() => void makeFaces()} disabled={!description.trim()} className="forge-btn primary w-full">
                Draw 4 faces to choose from
              </button>
              {onSaveTemplate && (
                <button
                  className="forge-btn w-full"
                  disabled={!description.trim()}
                  onClick={() => {
                    onSaveTemplate(name.trim() || description.trim().split(/[,.]/)[0].slice(0, 40), { description, style, framing, faceEngine: faceEng.id, partEngine: partEng.id });
                    pushToast("ok", "Saved as a template (Gallery → Templates).");
                  }}
                  title="Keep this description, style, framing and the two engines to start the next puppet from"
                >
                  Save as template
                </button>
              )}
              <label className="block cursor-pointer text-center text-[12px] text-[#8f98ab]">
                …or <span className="text-[var(--color-ember)] underline">start from my own picture</span>
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
            <p className="text-[13px] text-[#c3c9d6]">
              Pick the face. <span className="text-[#8f98ab]">Everything else is made from it, so choose the one you would be happy to see in every video. Look for a closed mouth and eyes that point the same way.</span>
            </p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {bases.map((b, i) => (
                <button key={b.url} onClick={() => setBase(b)} className={`${tile(base?.url === b.url)} p-2`}>
                  <img src={b.url} alt={`option ${i + 1}`} className="aspect-square w-full rounded-[14px] object-cover" />
                  <span
                    role="button"
                    aria-label="See it large"
                    title="See it large"
                    onClick={(e) => {
                      e.stopPropagation();
                      setZoom({ url: b.url, caption: `Face ${i + 1}${b.verdict ? ` — ${b.verdict.ok ? "looks right" : b.verdict.why}` : ""}` });
                    }}
                    className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full bg-black/60 text-[15px] text-white/90 backdrop-blur hover:bg-black/80"
                  >
                    ⤢
                  </span>
                  <span className={`mt-1.5 block text-[11px] ${b.verdict == null ? "text-[#8f98ab]" : b.verdict.ok ? "text-emerald-300" : "text-amber-300"}`}>
                    {b.verdict == null ? "not checked" : b.verdict.ok ? "✓ looks right" : `⚠ ${b.verdict.why}`}
                  </span>
                </button>
              ))}
              {busy && Array.from({ length: Math.max(0, 4 - bases.length) }).map((_, i) => <div key={i} className="aspect-square animate-pulse rounded-xl border border-line bg-[var(--color-field)]" />)}
            </div>
            {problem && <p className="forge-note border border-red-400/40 bg-red-400/10 text-red-300">{problem}</p>}
            <div className="flex flex-wrap gap-2">
              <button className="forge-btn primary" disabled={!base || !!busy} onClick={() => void build()}>
                Make the puppet from this face
              </button>
              <button className="forge-btn" disabled={!!busy} onClick={() => void makeFaces()}>
                Draw 4 others
              </button>
              <button className="forge-btn" disabled={!!busy} onClick={() => setStep("describe")}>
                Change the description
              </button>
              {busy && <button className="forge-btn" onClick={stop}>Stop</button>}
            </div>
          </div>
        )}

        {(step === "build" || step === "done") && (
          <div className="grid gap-5 p-5 lg:grid-cols-[1fr_320px]">
            <div>
              <div className="mb-2 flex items-center justify-between text-[12px] text-[#8f98ab]">
                <span>
                  {counts.ok ?? 0} done · {counts.unsure ?? 0} unsure · {counts.missing ?? 0} missing · {pictures} pictures made
                </span>
                {busy && <span className="text-[var(--color-ember)]">{busy}</span>}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(reports.length ? reports : partsFor(framing).map((p) => ({ id: p.id, label: p.label, status: "waiting" as const, tries: 0, why: "" }))).map((r) => (
                  <div key={r.id} className="forge-tile !p-2" title={r.why}>
                    {previews[r.id] ? (
                      <img
                        src={previews[r.id]}
                        alt=""
                        className="zoomable mb-1.5 h-16 w-full rounded-[12px] object-cover"
                        onClick={() => setZoom({ url: previews[r.id], caption: `${r.label}: before and after${r.why && r.status !== "ok" ? ` — ${r.why}` : ""}` })}
                      />
                    ) : (
                      <div className="mb-1.5 h-16 rounded-[12px] bg-black/30" />
                    )}
                    <div className="flex items-center gap-1.5 text-[11.5px] text-[#eef1f8]">
                      <span className={`h-2 w-2 rounded-full ${STATUS_LOOK[r.status].dot}`} />
                      {r.label}
                      <span className="ml-auto font-mono text-[10px] text-[#8f98ab]">{STATUS_LOOK[r.status].word}{r.tries > 1 ? ` · try ${r.tries}` : ""}</span>
                    </div>
                    {(r.status === "unsure" || r.status === "missing") && r.why && <p className="mt-1 line-clamp-2 text-[10.5px] leading-snug text-[#8f98ab]">{r.why}</p>}
                  </div>
                ))}
              </div>
              {problem && <p className="mt-3 forge-note border border-red-400/40 bg-red-400/10 text-red-300">{problem}</p>}
            </div>

            <div className="space-y-3">
              {rig ? (
                <PuppetPreview rig={rig} onClick={() => setZoom("live")} />
              ) : (
                base && <img src={base.url} alt="" className="zoomable aspect-square w-full rounded-[20px] object-cover opacity-70" onClick={() => setZoom({ url: base.url, caption: "The chosen face" })} />
              )}
              <div className="flex flex-col gap-2">
                {busy ? (
                  <button className="forge-btn" onClick={stop}>Stop</button>
                ) : step === "build" ? (
                  <button className="forge-btn primary" onClick={() => void build()}>
                    Continue
                  </button>
                ) : (
                  <>
                    {canShelve && (
                      <button className="forge-btn primary" onClick={() => void sendToVideoForge()} disabled={!!shelved}>
                        {shelved ? "✓ In Video Forge" : "Send to Video Forge"}
                      </button>
                    )}
                    <button className="forge-btn" onClick={() => void saveZip()}>Save the puppet (zip)</button>
                    {redo.length > 0 && <button className="forge-btn" onClick={() => void build(redo)}>Try the {redo.length} unsure/missing again</button>}
                    {confirmDelete ? (
                      <div className="flex gap-2">
                        <button className="forge-btn danger flex-1" onClick={() => void deletePuppet()} title="Throw it away for good. If it went to Video Forge, it comes off the shelf too.">
                          Yes, delete it
                        </button>
                        <button className="forge-btn flex-1" onClick={() => setConfirmDelete(false)} title="Keep the puppet">
                          Keep it
                        </button>
                      </div>
                    ) : (
                      <button className="forge-btn" onClick={() => setConfirmDelete(true)} title="Not one to keep? Delete it — you will be asked once more.">
                        Delete this puppet
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      {zoom && (
        <div className="forge-zoom" onClick={() => setZoom(null)} role="dialog" aria-label="Picture, large">
          <div onClick={(e) => e.stopPropagation()} className="cursor-default">
            {zoom === "live" ? rig && <PuppetPreview rig={rig} size={720} /> : <img src={zoom.url} alt="" />}
            <p>{zoom === "live" ? "talking, blinking, nodding, shaking and laughing in turn" : zoom.caption} · Esc or click outside to close</p>
          </div>
        </div>
      )}
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
    <ol className="forge-steps hidden items-center gap-1 md:flex">
      {all.map(([s, t], i) => (
        <li key={s} className={i === at ? "at" : i < at ? "past" : ""}>
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
function PuppetPreview({ rig, size = 320, onClick }: { rig: ForgePuppet; size?: number; onClick?: () => void }) {
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
        const sky = g.createLinearGradient(0, 0, 0, S);
        sky.addColorStop(0, "#1a2a52");
        sky.addColorStop(1, "#0a1122");
        g.fillStyle = sky;
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
  return (
    <canvas
      ref={ref}
      width={size}
      height={size}
      onClick={onClick}
      title={onClick ? "Click to see it large" : undefined}
      className={`aspect-square rounded-[22px] border border-white/10 ${onClick ? "zoomable w-full" : "w-[min(88vw,720px)]"}`}
      aria-label="The puppet, talking and blinking"
    />
  );
}

function EnginePick({ title, tip, engines, value, onChange }: { title: string; tip: string; engines: PuppetEngine[]; value: string; onChange: (id: string) => void }) {
  const e = engines.find((x) => x.id === value) ?? engines[0];
  return (
    <div>
      <label className={label} title={tip}>
        {title}
      </label>
      <select value={e?.id} onChange={(ev) => onChange(ev.target.value)} className={field} title={tip}>
        {engines.map((x) => (
          <option key={x.id} value={x.id}>
            {x.label} — {x.free ? "free" : `paid, $${x.price}/picture`}
            {x.refs ? "" : " · faces only"}
          </option>
        ))}
      </select>
      {e && <p className="mt-1 text-[11.5px] leading-snug text-[#8f98ab]">{e.note}</p>}
    </div>
  );
}
