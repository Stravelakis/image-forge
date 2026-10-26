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
import type { ManifestRow, Toast } from "../types";
import type { ForgeSettings } from "../lib/providers";
import { checkPaidRun } from "../lib/paidGuard";
import { ensureAffordable } from "../lib/paidGate";
import { capLeftUsd, fixPictures, newPuppetSpend, partPictures, viewBasePictures, wholePuppetPictures } from "../lib/puppet/spend";
import { formatUsd } from "../lib/providers";
import { PUPPET_STYLES, VIEW_PARTS, asksForFaceMarks, hardAnimalWhy, faceMarksNote, furNote, isAnimal, keyColourFor, teethFor, lipsFor, partsFor, type PuppetFraming, type PuppetViewId } from "../lib/puppet/recipe";
import { baseQuestion, makeBaseOptions, makeParts, makeViewBase, pictureBudget, recheckParts, PUPPET_SIZE, type MakerEvent, type PartReport, type Verdict } from "../lib/puppet/maker";
import { resize, type Img } from "../lib/puppet/pixels";
import { buildRig, embedView, puppetSlug, type CutPart, type ForgePuppet } from "../lib/puppet/rig";
import { loadImg, loadWorkshop, removeWorkshop, saveImg, saveMeta, savePart, workshopPic, type PartReview, type WorkshopMeta } from "../lib/puppet/workshop";
import { type PuppetEngine, sizeFor, blobToImg, describeInspiration, imgToPng, imgToUrl, judgeName, listLocalImageModels, pageGenerate, pageInspect, pageJudge, puppetEngines, unloadLocal } from "../lib/puppet/pageIO";
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
  open,
  autoRemake,
  onRemade,
}: {
  /** opened to remake the marked parts and close again (Made → Remake all marked) */
  autoRemake?: boolean;
  /** the marked parts are remade (or could not be) */
  onRemade?: (ok: boolean) => void;
  /** a puppet from the workshop to open again (Made → a puppet) */
  open?: WorkshopMeta | null;
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
  const look = useMemo(() => ({ key: keyColourFor(description), lips, animal: isAnimal(description), teeth: teethFor(description) }), [description, lips]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // The other views (recipe.ts VIEW_EDITS): side-facing for dialogue, sitting for full body.
  const [wantSide, setWantSide] = useState(true);
  const [wantSit, setWantSit] = useState(true);
  const views: PuppetViewId[] = [...(framing !== "head" && wantSide ? (["side"] as const) : []), ...(framing === "full" && wantSit ? (["sit"] as const) : [])];
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
  const [reports, setReports] = useState<PartReview[]>([]);
  // Your notes per part, while you type them (sent with "Redo with my note").
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  // The puppet's workshop record (lib/puppet/workshop.ts): saved as it is made.
  const metaRef = useRef<WorkshopMeta | null>(open ?? null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  // The options of parts that did not get to green: their before/after pictures.
  const [optionPics, setOptionPics] = useState<Record<string, string[]>>({});
  // Earlier pictures of each part: their before/after pictures, oldest first.
  const [versionPics, setVersionPics] = useState<Record<string, string[]>>({});
  const [parts, setParts] = useState<Record<string, CutPart>>({});
  const partsRef = useRef(parts);
  partsRef.current = parts;
  // The other views' pictures and parts (side, sit), so a redo of one part
  // rebuilds the whole puppet with every view still on it (Ak, 15 Oct 2026).
  const viewsRef = useRef<Partial<Record<PuppetViewId, { base: Img; parts: Record<string, CutPart> }>>>({});
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
  // The most this puppet could cost, priced from the model catalogue (pageIO.puppetEngines):
  // best = every part first time; worst = three tries on every part of every view
  // AND two "Check and fix" rounds with everything still not green.
  const viewPartCounts = useMemo(() => views.map((v) => VIEW_PARTS[v].length), [views.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const extraViewPictures = viewPartCounts.reduce((n, c) => n + 1 + c, 0);
  const worstPartPictures = wholePuppetPictures({ faces: 0, frontParts: nParts, views: viewPartCounts });
  const cost = {
    best: faceEng.price * 4 + partEng.price * (nParts + extraViewPictures),
    worst: faceEng.price * 4 + partEng.price * worstPartPictures,
  };
  const checker = judgeName(settings);
  // Money approved for this puppet and used so far (lib/puppet/spend.ts). pageGenerate
  // refuses any paid picture that does not fit inside it.
  const spendRef = useRef(newPuppetSpend());
  const faceIO = useMemo(() => ({ generate: pageGenerate(settings, faceEng.id, onExhaust as never, spendRef.current), judge: pageJudge(settings) }), [settings, faceEng.id, onExhaust]);
  const io = useMemo(() => ({ generate: pageGenerate(settings, partEng.id, onExhaust as never, spendRef.current), judge: pageJudge(settings), inspect: pageInspect(settings) }), [settings, partEng.id, onExhaust]);
  const slug = puppetSlug(name || description.split(/[,.]/)[0] || "puppet");

  /**
   * Ask before paid pictures, for the worst case of what is about to run.
   * Free and own-machine engines pass untouched. A paid engine needs the
   * per-puppet limit in Settings above $0, a price from the catalogue, and a
   * yes in the same window as every other paid run. What is said yes to is
   * then the most this puppet may spend; pageGenerate stops at it.
   */
  const approveSpend = useCallback(
    async (items: { engineId: string; pictures: number }[], note: string): Promise<boolean> => {
      const rows: ManifestRow[] = [];
      for (const it of items) {
        if (it.engineId === "local" || it.engineId.startsWith("local:")) continue; // your own machine: free
        for (let i = 0; i < it.pictures; i++) rows.push({ id: i, prompt: "", aspect_ratio: "1:1", seed: i + 1, model: it.engineId } as ManifestRow);
      }
      if (!rows.length) return true;
      const sp = spendRef.current;
      const check = checkPaidRun(rows, settings);
      if (!check.costs) return true;
      // Already approved earlier for this puppet, and it still fits.
      if (!check.blocked && check.unknownPriceRows === 0 && sp.spentUsd + check.totalUsd <= sp.approvedUsd + 1e-6) return true;
      const cap = settings.puppetSpendCapUsd ?? 0;
      const gate = await ensureAffordable(rows, settings, {
        capUsd: capLeftUsd(cap, sp),
        capFor: "this puppet",
        approveLabel: "Spend it — up to this much",
        note: `${note} It stops by itself when this amount is used up. Your limit for one puppet: ${cap > 0 ? formatUsd(cap) : "$0 (free engines only)"}.`,
      });
      if (!gate.ok) {
        setProblem(gate.useFree ? "Pick a free engine in the lists above, then try again." : gate.reason);
        return false;
      }
      sp.approvedUsd = sp.spentUsd + gate.check.totalUsd;
      return true;
    },
    [settings]
  );

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

  /* ---------- the workshop: saved as it is made ---------- */
  // One write at a time, in order — a part's files and the meta naming it.
  const saveChain = useRef<Promise<unknown>>(Promise.resolve());
  const persist = useCallback((job: () => Promise<unknown>) => {
    saveChain.current = saveChain.current.then(job, job).catch(() => {});
    return saveChain.current;
  }, []);
  const writeMeta = useCallback(
    (patch: Partial<WorkshopMeta>) => {
      if (!metaRef.current) return;
      metaRef.current = { ...metaRef.current, ...patch };
      const m = metaRef.current;
      void persist(() => saveMeta(m));
    },
    [persist]
  );
  /** The record for this puppet, made the first time its parts start. */
  const ensureMeta = useCallback(
    async (baseImg: Img) => {
      if (metaRef.current) return;
      const now = new Date().toISOString();
      metaRef.current = {
        v: 1, slug, name: name || slug, description, style, framing, look,
        faceEngine: faceEng.id, partEngine: partEng.id, createdAt: now, updatedAt: now,
        status: "making", reports: [], boxes: {},
      };
      const m = metaRef.current;
      await persist(async () => {
        await saveImg(slug, "base.png", baseImg);
        await saveMeta(m);
      });
    },
    [slug, name, description, style, framing, look, faceEng.id, partEng.id, persist]
  );

  // OPENED FROM MADE: the saved face and parts back, the rig rebuilt, the review.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    void (async () => {
      setName(open.name);
      setDescription(open.description);
      setStyle(open.style);
      setFraming(open.framing);
      setLipsTouched(open.look?.lips ?? null);
      setFaceId(open.faceEngine);
      setPartId(open.partEngine);
      setBusy("Opening the puppet…");
      const { base: b, parts: p } = await loadWorkshop(open);
      if (!alive || !b) {
        setBusy("");
        setProblem("This puppet's face could not be read back.");
        return;
      }
      const pic = { img: b, url: await imgToUrl(b), verdict: null };
      setBase(pic);
      setBases([pic]);
      const front = Object.fromEntries(Object.entries(p).filter(([k]) => !/^(side|sit)_/.test(k)));
      setParts(front);
      setReports(open.reports ?? []);
      setPreviews(Object.fromEntries(await Promise.all((open.reports ?? []).map(async (r) => [r.id, await workshopPic(open.slug, `${r.id}.pair.png`)] as const))));
      setOptionPics(Object.fromEntries(await Promise.all(Object.entries(open.options ?? {}).map(async ([id, os]) => [id, await Promise.all(os.map((_, n) => workshopPic(open.slug, `${id}.opt${n}.pair.png`)))] as const))));
      setVersionPics(Object.fromEntries(await Promise.all(Object.entries(open.versions ?? {}).map(async ([id, vs]) => [id, await Promise.all(vs.map((_, n) => workshopPic(open.slug, `${id}.v${n}.pair.png`)))] as const))));
      setShelved(open.shelved ? open.slug : "");
      let made = buildRig({ name: open.slug, framing: open.framing, base: b, parts: front });
      for (const v of (open.views ?? []) as ("side" | "sit")[]) {
        const vb = await loadImg(open.slug, `${v}_base.png`);
        if (!vb) continue;
        const vp = Object.fromEntries(Object.entries(p).filter(([k]) => k.startsWith(`${v}_`)).map(([k, x]) => [k.slice(v.length + 1), x]));
        viewsRef.current[v] = { base: vb, parts: vp };
        made = embedView(made, v, buildRig({ name: open.slug, framing: v === "sit" ? "full" : open.framing, base: vb, parts: vp }));
      }
      if (!alive) return;
      setRig(made);
      setStep("done");
      setBusy("");
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open?.slug]);

  // Opened by "Remake all marked": remake, then hand back to Made for the next.
  const remakeMarkedRef = useRef<() => Promise<boolean>>(async () => true);
  const autoDone = useRef(false);
  useEffect(() => {
    if (!autoRemake || autoDone.current || step !== "done" || !rig || busy) return;
    autoDone.current = true;
    void remakeMarkedRef.current().then((ok) => onRemade?.(ok));
  }, [autoRemake, step, rig, busy, onRemade]);

  /* ---------- step 1 → 2: four faces ---------- */
  const makeFaces = useCallback(async () => {
    setProblem("");
    // "Pick the face automatically" carries straight on into the parts, so the question covers both.
    const toBuild = partPictures(nParts) + viewPartCounts.reduce((n, c) => n + viewBasePictures() + partPictures(c), 0);
    if (!(await approveSpend(
      [{ engineId: faceEng.id, pictures: 4 }, ...(autoPick ? [{ engineId: partEng.id, pictures: toBuild }] : [])],
      `Worst case: 4 faces${autoPick ? ` and then the whole puppet (${toBuild} pictures: three tries on every part of every view)` : ""}.`
    ))) return;
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
  }, [description, style, framing, inspo, round, faceIO, faceEng.refs, faceEng.id, partEng.id, settings, autoPick, name, pushLog, look, approveSpend, nParts, viewPartCounts]);

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
    async (only?: string[], picked?: Pic, notes?: Record<string, string>) => {
      const base = picked ?? baseRef.current;
      if (!base) return;
      setProblem("");
      // Worst case of what is about to run: parts still to make with three tries each,
      // and (on a full build) every extra view — its own picture and its parts.
      const missing = only ? only.length : Math.max(0, nParts - Object.keys(parts).length);
      const pictures = partPictures(missing) + (only ? 0 : viewPartCounts.reduce((n, c) => n + viewBasePictures() + partPictures(c), 0));
      if (!(await approveSpend([{ engineId: partEng.id, pictures }], `Worst case: ${pictures} pictures, three tries on every part${only ? "" : " of every view"}.`))) return;
      await ensureMeta(base.img);
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
          { base: base.img, framing, done: keep, only, look, notes },
          io,
          async (e) => {
            if (e.type === "picture") setPictures((n) => n + 1);
            if (e.type === "kept") {
              const { id, part } = e;
              void persist(() => savePart(slug, id, part));
              writeMeta({ boxes: { ...(metaRef.current?.boxes ?? {}), [id]: part.box } });
            }
            if (e.type === "part") {
              // A redo starts a fresh look: your earlier "looks good" no longer applies.
              const rev: PartReview = { ...e.report, approved: false, note: notes?.[e.report.id] ?? metaRef.current?.reports.find((r) => r.id === e.report.id)?.note };
              const list = metaRef.current?.reports ?? [];
              writeMeta({ reports: list.some((r) => r.id === rev.id) ? list.map((r) => (r.id === rev.id ? rev : r)) : [...list, rev] });
              if (e.preview) {
                const pv = e.preview;
                void persist(() => saveImg(slug, `${e.report.id}.pair.png`, pv));
              }
              setReports((prev) => {
                const next: PartReview[] = prev.length ? [...prev] : partsFor(framing).map((p) => ({ id: p.id, label: p.label, status: "waiting" as const, tries: 0, why: "" }));
                const i = next.findIndex((r) => r.id === e.report.id);
                if (i >= 0) next[i] = { ...e.report, approved: false, note: notes?.[e.report.id] ?? next[i].note };
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
        let made = buildRig({
          name: slug,
          framing,
          base: base.img,
          parts: all,
          madeBy: { name: name || slug, description, style, framing, engine: `faces: ${faceEng.label}; parts: ${partEng.label}`, app: "Image Forge", madeAt: new Date().toISOString() },
        });
        setRig(made);
        // THE OTHER VIEWS, each from an edit of the finished front picture.
        // A view that does not come out is simply left off — the front puppet
        // is complete without it.
        if (!only) {
          for (const v of views) {
            setBusy(v === "side" ? "Turning them to the side, for dialogue…" : "Sitting them down…");
            const vb = await makeViewBase({ base: base.img, view: v, framing, look }, io, ctrl.signal);
            if (!vb) {
              pushLog(`${v} view: no clean picture after 3 tries — left out`, "info");
              continue;
            }
            const vf: PuppetFraming = v === "sit" ? "full" : framing;
            void persist(() => saveImg(slug, `${v}_base.png`, vb));
            const vr = await makeParts({ base: vb, framing: vf, only: VIEW_PARTS[v], look }, io, (e) => {
              if (e.type === "picture") setPictures((n) => n + 1);
              if (e.type === "kept") {
                const { id, part } = e;
                void persist(() => savePart(slug, `${v}_${id}`, part));
                writeMeta({ boxes: { ...(metaRef.current?.boxes ?? {}), [`${v}_${id}`]: part.box } });
              }
            }, ctrl.signal);
            viewsRef.current[v] = { base: vb, parts: vr.parts };
            made = embedView(made, v, buildRig({ name: slug, framing: vf, base: vb, parts: vr.parts }));
            writeMeta({ views: [...new Set([...(metaRef.current?.views ?? []), v])] });
            setRig(made);
            pushLog(`✓ ${v} view: ${Object.keys(vr.parts).length} parts`, "ok");
          }
        }
        setStep("done");
        writeMeta({ status: "review" });
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
    [framing, io, parts, slug, name, description, style, faceEng, partEng, settings, pushLog, look, views, ensureMeta, persist, writeMeta, approveSpend, nParts, viewPartCounts]
  );
  const buildRef = useRef(build);
  buildRef.current = build;

  // Stop also ends a run of fixing rounds, not just the round under way.
  const haltRef = useRef(false);
  const stop = () => {
    haltRef.current = true;
    stopRef.current?.abort();
  };

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
    writeMeta({ shelved: true });
    pushToast("ok", `${name || slug} is ready in Video Forge (Cast → Face).`);
  }, [rig, slug, order, name, pushToast, writeMeta]);

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
    if (metaRef.current) await removeWorkshop(metaRef.current.slug);
    metaRef.current = null;
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

  /** "Looks good": you agree with this part as it is. */
  const approve = (id: string, yes: boolean) => {
    setReports((prev) => {
      const next = prev.map((r) => (r.id === id ? { ...r, approved: yes } : r));
      writeMeta({ reports: next, status: next.every((r) => r.approved || r.status === "ok") ? "approved" : "review" });
      return next;
    });
  };
  /** "Redo with my note": that one part again, with your words added. */
  /**
   * MARK FOR REMAKE (Ak, 15 Oct 2026): a remake never makes you wait. Write a
   * note, mark the part, go on to the next — on this puppet or any other —
   * and remake everything marked in one go at the end.
   */
  const patchReview = (id: string, patch: Partial<PartReview>) => {
    setReports((prev) => {
      const next = prev.map((r) => (r.id === id ? { ...r, ...patch } : r));
      writeMeta({ reports: next });
      return next;
    });
  };
  const saveNote = (id: string) => {
    const note = (drafts[id] ?? "").trim();
    if (note !== (reports.find((r) => r.id === id)?.note ?? "")) patchReview(id, { note: note || undefined });
  };
  const toggleMark = (id: string) => {
    const r = reports.find((x) => x.id === id);
    const note = (drafts[id] ?? r?.note ?? "").trim();
    patchReview(id, { redo: !r?.redo, approved: false, note: note || undefined });
  };
  const marked = reports.filter((r) => r.redo && !r.approved);

  /** The part as it is now, kept as its next earlier version before it is replaced. */
  const currentPart = (id: string): CutPart | undefined => {
    const m = id.match(/^(side|sit)_(.+)$/);
    return m ? viewsRef.current[m[1] as PuppetViewId]?.parts[m[2]] : partsRef.current[id];
  };
  const archiveCurrent = (id: string) => {
    const old = currentPart(id);
    const meta = metaRef.current;
    if (!old || !meta) return;
    const s = meta.slug;
    const n = meta.versions?.[id]?.length ?? 0;
    const why = meta.reports.find((r) => r.id === id)?.why ?? "";
    void persist(() => savePart(s, `${id}.v${n}`, old));
    void persist(async () => {
      const pv = await loadImg(s, `${id}.pair.png`);
      if (!pv) return;
      await saveImg(s, `${id}.v${n}.pair.png`, pv);
      const url = await imgToUrl(pv);
      setVersionPics((p) => ({ ...p, [id]: [...(p[id] ?? []), url] }));
    });
    writeMeta({ versions: { ...(meta.versions ?? {}), [id]: [...(meta.versions?.[id] ?? []), { why, box: old.box, at: new Date().toISOString() }] } });
  };

  /** You picked one of a part's options, or an earlier version: it becomes the part, approved by you. */
  const pickOption = async (id: string, n: number, kind: "opt" | "v" = "opt") => {
    const opt = kind === "opt" ? metaRef.current?.options?.[id]?.[n] : metaRef.current?.versions?.[id]?.[n];
    if (!opt || !metaRef.current) return;
    const s = metaRef.current.slug;
    // the part as it is now is not lost either: it becomes an earlier version
    if (kind === "v") archiveCurrent(id);
    await saveChain.current;
    const layer = await loadImg(s, `${id}.${kind}${n}.layer.png`);
    if (!layer) return setProblem("That option's picture could not be read back.");
    const keyed = (await loadImg(s, `${id}.${kind}${n}.keyed.png`)) ?? undefined;
    const full = (await loadImg(s, `${id}.${kind}${n}.full.png`)) ?? undefined;
    const part: CutPart = { layer, keyed, box: opt.box, ...(full ? { full } : {}) };
    const m = id.match(/^(side|sit)_(.+)$/);
    if (m) {
      const v = viewsRef.current[m[1] as PuppetViewId];
      if (v) viewsRef.current[m[1] as PuppetViewId] = { ...v, parts: { ...v.parts, [m[2]]: part } };
    } else {
      partsRef.current = { ...partsRef.current, [id]: part };
      setParts(partsRef.current);
    }
    void persist(() => savePart(s, id, part));
    const pic = (kind === "opt" ? optionPics : versionPics)[id]?.[n];
    const pv = await loadImg(s, `${id}.${kind}${n}.pair.png`);
    if (pv) void persist(() => saveImg(s, `${id}.pair.png`, pv));
    if (pic) setPreviews((p) => ({ ...p, [id]: pic }));
    const rest = { ...(metaRef.current.options ?? {}) };
    delete rest[id];
    const reportsNext = (metaRef.current.reports ?? []).map((r) => (r.id === id ? { ...r, approved: true, redo: false, status: "ok" as const, why: kind === "opt" ? `you chose option ${n + 1}` : `you chose earlier version ${n + 1}` } : r));
    writeMeta({ options: rest, boxes: { ...metaRef.current.boxes, [id]: opt.box }, reports: reportsNext });
    setReports(reportsNext);
    setOptionPics((p) => {
      const { [id]: _gone, ...others } = p;
      return others;
    });
    if (baseRef.current) setRig(rigFrom(partsRef.current, baseRef.current.img));
    setShelved("");
  };

  /** The whole puppet, every view on it, from the parts as they are now. */
  const rigFrom = useCallback(
    (front: Record<string, CutPart>, b: Img) => {
      let made = buildRig({
        name: slug,
        framing,
        base: b,
        parts: front,
        madeBy: { name: name || slug, description, style, framing, engine: `faces: ${faceEng.label}; parts: ${partEng.label}`, app: "Image Forge", madeAt: new Date().toISOString() },
      });
      for (const [v, x] of Object.entries(viewsRef.current) as [PuppetViewId, { base: Img; parts: Record<string, CutPart> }][])
        made = embedView(made, v, buildRig({ name: slug, framing: v === "sit" ? "full" : framing, base: x.base, parts: x.parts }));
      return made;
    },
    [slug, framing, name, description, style, faceEng.label, partEng.label]
  );

  /** One part's news, front or a view ("side_" before the id): saved, and on its card. */
  const onPartEvent = useCallback(
    async (e: MakerEvent, pre: string, notes?: Record<string, string>, recheck = false) => {
      if (e.type === "picture") setPictures((n) => n + 1);
      if (e.type === "kept") {
        const { id, part } = e;
        archiveCurrent(pre + id);
        void persist(() => savePart(slug, pre + id, part));
        writeMeta({ boxes: { ...(metaRef.current?.boxes ?? {}), [pre + id]: part.box } });
      }
      if (e.type === "options") {
        const id = pre + e.id;
        e.options.forEach((o, n) => {
          void persist(() => savePart(slug, `${id}.opt${n}`, o.part));
          void persist(() => saveImg(slug, `${id}.opt${n}.pair.png`, o.preview));
        });
        writeMeta({ options: { ...(metaRef.current?.options ?? {}), [id]: e.options.map((o) => ({ why: o.why, box: o.part.box })) } });
        const urls = await Promise.all(e.options.map((o) => imgToUrl(o.preview)));
        setOptionPics((p) => ({ ...p, [id]: urls }));
        return;
      }
      if (e.type !== "part") return;
      const id = pre + e.report.id;
      const label = pre ? `${pre === "side_" ? "side" : "sitting"} · ${e.report.label}` : e.report.label;
      const old = metaRef.current?.reports.find((r) => r.id === id);
      // A new picture needs a new look from you; a re-check of the same picture does not.
      const rev: PartReview = { ...e.report, id, label, approved: recheck ? !!old?.approved : false, redo: recheck ? old?.redo : undefined, note: notes?.[id] ?? old?.note };
      const list = metaRef.current?.reports ?? [];
      writeMeta({ reports: list.some((r) => r.id === id) ? list.map((r) => (r.id === id ? rev : r)) : [...list, rev] });
      setReports((prev) => (prev.some((r) => r.id === id) ? prev.map((r) => (r.id === id ? rev : r)) : [...prev, rev]));
      if (e.preview) {
        const pv = e.preview;
        void persist(() => saveImg(slug, `${id}.pair.png`, pv));
        const url = await imgToUrl(pv);
        setPreviews((p) => ({ ...p, [id]: url }));
      }
    },
    [slug, persist, writeMeta]
  );

  /**
   * Make some parts again — front, side or sitting — and put the new ones on
   * the puppet. The redo, "redo all with my notes" and the fixing rounds all
   * come here.
   */
  const fixParts = useCallback(
    async (ids: string[], notes?: Record<string, string>, reseed = false) => {
      const b = baseRef.current;
      if (!b || !ids.length) return;
      setProblem("");
      const pictures = partPictures(ids.length);
      if (!(await approveSpend([{ engineId: partEng.id, pictures }], `Worst case: ${pictures} pictures, three tries on each of ${ids.length} part${ids.length === 1 ? "" : "s"}.`))) return;
      setBusy(`Making ${ids.length} part${ids.length === 1 ? "" : "s"} again…`);
      const ctrl = new AbortController();
      stopRef.current = ctrl;
      let front = partsRef.current;
      try {
        const groups: Record<string, string[]> = {};
        for (const id of ids) {
          const m = id.match(/^(side|sit)_(.+)$/);
          (groups[m ? m[1] : ""] ??= []).push(m ? m[2] : id);
        }
        for (const [v, only] of Object.entries(groups)) {
          const view = v ? viewsRef.current[v as PuppetViewId] : undefined;
          if (v && !view) continue;
          const pre = v ? `${v}_` : "";
          const have = view ? view.parts : front;
          const own = notes ? Object.fromEntries(only.filter((id) => notes[pre + id]).map((id) => [id, notes[pre + id]])) : undefined;
          const res = await makeParts(
            { base: view ? view.base : b.img, framing: v === "sit" ? "full" : framing, done: Object.fromEntries(Object.entries(have).filter(([k]) => !only.includes(k))), only, look, notes: own, reseed },
            io,
            (e) => void onPartEvent(e, pre, notes),
            ctrl.signal
          );
          if (view) viewsRef.current[v as PuppetViewId] = { base: view.base, parts: { ...have, ...res.parts } };
          else {
            front = { ...front, ...res.parts };
            partsRef.current = front;
            setParts(front);
          }
        }
        setRig(rigFrom(front, b.img));
        // The shelf has the old puppet — send it again to use the new parts.
        setShelved("");
        writeMeta({ shelved: false });
      } catch (e) {
        setProblem(fail(e));
        setReports((prev) => prev.map((r) => (r.status === "working" ? { ...r, status: "waiting" } : r)));
      } finally {
        setBusy("");
      }
    },
    [framing, look, io, onPartEvent, rigFrom, writeMeta, approveSpend, partEng.id]
  );

  /**
   * CHECK AND FIX (Ak, 15 Oct 2026: "all green by at least 2 models"): every
   * part of every view is looked at by the picture panel; what is not green
   * is made again — the panel's findings go with it — and looked at again.
   */
  const [fixing, setFixing] = useState("");
  const checkAndFix = useCallback(
    async (rounds = 2) => {
      const inspect = io.inspect;
      const b = baseRef.current;
      if (!inspect || !b) return;
      // The worst case for the WHOLE job, fix rounds included: every part of every view
      // not green in every round. Asked once here, so the rounds do not ask again.
      const allParts = nParts + viewPartCounts.reduce((n, c) => n + c, 0);
      const pictures = fixPictures(allParts, rounds);
      if (!(await approveSpend([{ engineId: partEng.id, pictures }], `Worst case: ${pictures} pictures — if every one of ${allParts} parts needed fixing, ${rounds} rounds of three tries each.`))) return;
      const ctrl = new AbortController();
      stopRef.current = ctrl;
      haltRef.current = false;
      try {
        setFixing("checking every part with two checkers…");
        setBusy("Checking every part with two checkers…");
        // What YOU said looks good is yours: never checked over, never redrawn.
        const yours = new Set((metaRef.current?.reports ?? []).filter((r) => r.approved).map((r) => r.id));
        const notYours = (pre: string, ids: string[]) => ids.filter((id) => !yours.has(pre + id));
        const groups: [string, Img, Record<string, CutPart>, PuppetFraming, string[]][] = [["", b.img, partsRef.current, framing, notYours("", partsFor(framing).map((p) => p.id))]];
        for (const [v, x] of Object.entries(viewsRef.current) as [PuppetViewId, { base: Img; parts: Record<string, CutPart> }][])
          groups.push([`${v}_`, x.base, x.parts, v === "sit" ? "full" : framing, notYours(`${v}_`, VIEW_PARTS[v])]);
        let bad: string[] = [];
        for (const [pre, vb, have, vf, only] of groups) {
          const reps = await recheckParts({ base: vb, framing: vf, parts: have, look, only }, { inspect }, (r, pic) => void onPartEvent({ type: "part", report: r, preview: pic }, pre, undefined, true), ctrl.signal);
          bad.push(...reps.filter((r) => r.status !== "ok").map((r) => pre + r.id));
        }
        // What YOU marked to remake is remade, whatever the checkers think of it.
        const markedNow = (metaRef.current?.reports ?? []).filter((r) => r.redo && !r.approved).map((r) => r.id);
        bad = [...new Set([...bad, ...markedNow])];
        for (let i = 1; i <= rounds && bad.length; i++) {
          if (haltRef.current) break;
          setFixing(`round ${i} of ${rounds}: making ${bad.length} part${bad.length === 1 ? "" : "s"} again…`);
          // Your own notes on those parts go along too.
          const yourNotes = Object.fromEntries((metaRef.current?.reports ?? []).filter((r) => bad.includes(r.id) && r.note?.trim()).map((r) => [r.id, r.note!.trim()]));
          await fixParts(bad, Object.keys(yourNotes).length ? yourNotes : undefined, true);
          bad = (metaRef.current?.reports ?? []).filter((r) => r.status !== "ok" && !yours.has(r.id)).map((r) => r.id);
        }
        if (haltRef.current) {
          setFixing("stopped — press Check and fix every part to carry on");
          return;
        }
        setFixing(bad.length ? `${bad.length} still not green after ${rounds} rounds — see their cards` : "every part green by two checkers");
        writeMeta({ status: "review" });
        pushLog(`✓ check and fix ${name || slug}: ${bad.length ? `${bad.length} not green` : "all green"}`, bad.length ? "info" : "ok");
      } catch (e) {
        setProblem(fail(e));
        setFixing("");
      } finally {
        setBusy("");
      }
    },
    [io.inspect, framing, look, onPartEvent, fixParts, pushLog, name, slug, writeMeta, approveSpend, partEng.id, nParts, viewPartCounts]
  );
  const remakeMarked = useCallback(async () => {
    const list = (metaRef.current?.reports ?? []).filter((r) => r.redo && !r.approved);
    if (!list.length) return true;
    const notes = Object.fromEntries(list.filter((r) => r.note?.trim()).map((r) => [r.id, r.note!.trim()]));
    await fixParts(
      list.map((r) => r.id),
      Object.keys(notes).length ? notes : undefined,
      true
    );
    return !(metaRef.current?.reports ?? []).some((r) => r.redo && !r.approved);
  }, [fixParts]);
  remakeMarkedRef.current = remakeMarked;

  /** A side-facing view for a puppet that does not have one yet. */
  const addSideView = async () => {
    if (!base || !rig) return;
    const pictures = viewBasePictures() + partPictures(VIEW_PARTS.side.length);
    if (!(await approveSpend([{ engineId: partEng.id, pictures }], `Worst case: ${pictures} pictures, three tries on the side picture and on each of its ${VIEW_PARTS.side.length} parts.`))) return;
    setBusy("Turning them to the side, for dialogue…");
    const ctrl = new AbortController();
    stopRef.current = ctrl;
    try {
      const vb = await makeViewBase({ base: base.img, view: "side", framing, look }, io, ctrl.signal);
      if (!vb) throw new Error("no clean side-facing picture after 3 tries — try again, or change engines");
      void persist(() => saveImg(slug, "side_base.png", vb));
      const vr = await makeParts({ base: vb, framing, only: VIEW_PARTS.side, look }, io, (e) => {
        if (e.type === "picture") setPictures((n) => n + 1);
        if (e.type === "kept") {
          const { id, part } = e;
          void persist(() => savePart(slug, `side_${id}`, part));
          writeMeta({ boxes: { ...(metaRef.current?.boxes ?? {}), [`side_${id}`]: part.box } });
        }
      }, ctrl.signal);
      viewsRef.current.side = { base: vb, parts: vr.parts };
      setRig((r) => (r ? embedView(r, "side", buildRig({ name: slug, framing, base: vb, parts: vr.parts })) : r));
      writeMeta({ views: [...new Set([...(metaRef.current?.views ?? []), "side"])] });
      pushToast("ok", "Side view added — send it to Video Forge again to use it there.");
      setShelved("");
    } catch (e) {
      setProblem(fail(e));
    } finally {
      setBusy("");
    }
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
            <button data-tip="Closes the puppet maker." onClick={close} className="btn-press rounded-lg p-2 text-[#8f98ab] hover:bg-raise hover:text-[#eef1f8]" aria-label="Close">
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
                  <input data-tip="What your puppet is called. It also becomes the file name." value={name} onChange={(e) => setName(e.target.value)} placeholder="Hoolio" className={field} />
                </div>
                <div>
                  <label className={label} title="Who the character is: what they are, what they wear, their colours. One or two sentences.">describe the character</label>
                  <textarea data-tip="Say who the character is: what they are, what they wear, their colours. One or two sentences is enough."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    placeholder="a friendly grey owl librarian with round glasses and a green knitted cardigan"
                    className={`${field} resize-y`}
                  />
                  {asksForFaceMarks(description) && <p className="mt-1 text-[11.5px] text-[var(--color-ember)]">Experimental: {faceMarksNote}</p>}
                  {hardAnimalWhy(description) && (
                    <p className="mt-1 text-[11.5px] text-[var(--color-ember)]" data-tip="These characters can still be made — expect more parts to need a redo or your pick from the options.">
                      Experimental: {hardAnimalWhy(description)}.
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label className={label}>style</label>
                <div className="grid gap-2 sm:grid-cols-3">
                  {PUPPET_STYLES.map((s) => (
                    <button key={s.id} onClick={() => setStyle(s.id)} className={tile(style === s.id)} title={s.prompt}>
                      <span className="t block">{s.label}</span>
                      <span className="d mt-0.5 block">{s.blurb}</span>
                      {(s.experimental || (s.smoothFur && isAnimal(description))) && (
                        <span className="mt-1 block text-[10.5px] uppercase tracking-[0.12em] text-[var(--color-ember)]" title={s.experimental ?? furNote}>
                          experimental{s.experimental ? "" : " · fur"}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className={label}>how much of them</label>
                <div className="grid gap-2 sm:grid-cols-3">
                  <button onClick={() => setFraming("head")} className={tile(framing === "head")} title="Face and shoulders fill the frame. Talks, blinks, raises its brows.">
                    <span className="t block">Head and shoulders</span>
                    <span className="d mt-0.5 block">Talks, blinks, raises its brows · {partsFor("head").length} parts</span>
                  </button>
                  <button onClick={() => setFraming("waist")} className={tile(framing === "waist")} title="Waist up, with arms. Adds a wave, pointing, a shrug and explaining hands.">
                    <span className="t block">Waist up, with arms</span>
                    <span className="d mt-0.5 block">All that, plus wave · point · shrug · explain · {partsFor("waist").length} parts</span>
                  </button>
                  <button onClick={() => setFraming("full")} className={tile(framing === "full")} data-tip="Head to feet, standing — and, if you like, a sitting version too. The legs stay still; everything else moves.">
                    <span className="t block">Full body</span>
                    <span className="d mt-0.5 block">Standing (and sitting) · {partsFor("full").length} parts</span>
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-4 text-[12.5px] text-[#c4cbe0]">
                  {framing !== "head" && (
                    <label className="flex items-center gap-2" data-tip={`Also a set turned three-quarters, so two characters can talk to each other. About ${VIEW_PARTS.side.length + 1} more pictures.`}>
                      <input type="checkbox" checked={wantSide} onChange={(e) => setWantSide(e.target.checked)} />
                      Also side-facing, for dialogue
                    </label>
                  )}
                  {framing === "full" && (
                    <label className="flex items-center gap-2" data-tip={`Also the same character sitting on a stool. About ${VIEW_PARTS.sit.length + 1} more pictures.`}>
                      <input type="checkbox" checked={wantSit} onChange={(e) => setWantSit(e.target.checked)} />
                      Also sitting
                    </label>
                  )}
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
                      <img data-tip="Click to see this inspiration picture larger." src={p.url} alt="" className="zoomable h-20 w-20 rounded-[14px] object-cover" onClick={() => setZoom({ url: p.url, caption: "Inspiration picture" })} />
                      <button data-tip="Takes this picture out of the inspiration pictures." onClick={() => setInspo((x) => x.filter((_, j) => j !== i))} className="absolute -right-2 -top-2 rounded-full bg-panel p-1 text-[#8f98ab] hover:text-[#eef1f8]" aria-label="Remove">
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
                    Paid engine: about {formatUsd(cost.best)} if every part works first time, up to {formatUsd(cost.worst)} at worst — that counts three tries on every part of every view and two rounds of Check and fix. You are asked before anything is spent, and the limit for one puppet is set in Settings (now {settings.puppetSpendCapUsd > 0 ? formatUsd(settings.puppetSpendCapUsd) : "$0, free engines only"}).
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
                <button key={b.url} onClick={() => setBase(b)} className={`${tile(base?.url === b.url)} p-2`} data-tip="Choose this face. Every part of the puppet is made from it.">
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
              <button className="forge-btn primary" disabled={!base || !!busy} onClick={() => void build()} data-tip="Makes every mouth, blink, eyebrow and pose from the chosen face. Each part is checked as it is made.">
                Make the puppet from this face
              </button>
              <button className="forge-btn" disabled={!!busy} onClick={() => void makeFaces()} data-tip="Draws four new faces from the same description.">
                Draw 4 others
              </button>
              <button className="forge-btn" disabled={!!busy} onClick={() => setStep("describe")} data-tip="Back to the description, to change who the character is.">
                Change the description
              </button>
              {busy && <button className="forge-btn" onClick={stop} data-tip="Stops after the picture being made now. Everything made so far is kept.">Stop</button>}
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
              {/* THE REVIEW (Ak, 14 Oct 2026): every part with its before/after,
                  what the checker said, your note, and your verdict. A redo
                  takes your note along. */}
              {step === "done" && (
                <p className="mb-2 text-[12.5px] text-[#c4cbe0]">
                  Look at each part. <b>Looks good</b> when you agree; otherwise write what is wrong (“less tongue”, “no smile”) and press{" "}
                  <b>Redo with my note</b>. {reports.filter((r) => r.approved).length} of {reports.length} looked at.
                </p>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {(reports.length ? reports : partsFor(framing).map((p) => ({ id: p.id, label: p.label, status: "waiting" as const, tries: 0, why: "" }) as PartReview)).map((r) => (
                  <div key={r.id} className={`forge-tile !p-3 ${r.approved ? "ring-1 ring-emerald-400/60" : r.redo ? "ring-1 ring-[var(--color-ember)]" : ""}`}>
                    {previews[r.id] ? (
                      <img
                        src={previews[r.id]}
                        alt=""
                        className="zoomable mb-2 h-32 w-full rounded-[12px] bg-black/30 object-contain"
                        onClick={() => setZoom({ url: previews[r.id], caption: `${r.label}: before and after${r.why ? ` — checker: ${r.why}` : ""}` })}
                        data-tip="Before (left) and after (right). Click to see it big."
                      />
                    ) : (
                      <div className="mb-2 h-32 rounded-[12px] bg-black/30" />
                    )}
                    <div className="flex items-center gap-1.5 text-[12.5px] text-[#eef1f8]">
                      <span className={`h-2 w-2 rounded-full ${STATUS_LOOK[r.status].dot}`} />
                      {r.label}
                      <span className="ml-auto font-mono text-[10px] text-[#8f98ab]">
                        {r.approved ? "✓ you agreed" : STATUS_LOOK[r.status].word}
                        {r.tries > 1 ? ` · try ${r.tries}` : ""}
                      </span>
                    </div>
                    {r.why && r.why !== "checked" && (
                      <p className="mt-1 text-[11.5px] leading-snug text-[#c4cbe0]">
                        <span className="text-[#8f98ab]">Checker:</span> {r.why}
                      </p>
                    )}
                    {r.note && <p className="mt-1 text-[11.5px] leading-snug text-[var(--color-ember)]">Your last note: {r.note}</p>}
                    {optionPics[r.id]?.length ? (
                      <div className="mt-2" data-tip="None of the tries got to green. These are the best ones — click the one you like and it becomes this part.">
                        <p className="text-[11px] uppercase tracking-[0.12em] text-[#8f98ab]">options — pick one</p>
                        <div className="mt-1 flex gap-1.5">
                          {optionPics[r.id].map((u, n) => (
                            <button
                              key={n}
                              className="flex-1 overflow-hidden rounded-[8px] border border-white/10 hover:border-[var(--color-ember)]"
                              onClick={() => void pickOption(r.id, n)}
                              data-tip={`Use option ${n + 1}. The checkers said: ${metaRef.current?.options?.[r.id]?.[n]?.why ?? ""}`}
                            >
                              <img src={u} alt="" className="block h-14 w-full object-contain bg-black/30" />
                              <span className="block py-0.5 text-[10.5px] text-[#c4cbe0]">option {n + 1}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {versionPics[r.id]?.length ? (
                      <div className="mt-2" data-tip="Earlier pictures of this part, oldest first. Click one to use it instead — the current one is kept as an earlier version too.">
                        <p className="text-[11px] uppercase tracking-[0.12em] text-[#8f98ab]">earlier versions — {versionPics[r.id].length}</p>
                        <div className="mt-1 flex gap-1.5 overflow-x-auto">
                          {versionPics[r.id].map((u, n) => (
                            <button
                              key={n}
                              className="w-16 shrink-0 overflow-hidden rounded-[8px] border border-white/10 hover:border-[var(--color-ember)]"
                              onClick={() => void pickOption(r.id, n, "v")}
                              data-tip={`Use earlier version ${n + 1}. The checkers had said: ${metaRef.current?.versions?.[r.id]?.[n]?.why ?? ""}`}
                            >
                              <img src={u} alt="" className="block h-12 w-full object-contain bg-black/30" />
                              <span className="block py-0.5 text-[10px] text-[#c4cbe0]">v{n + 1}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {step === "done" && !busy && (
                      <>
                        <textarea
                          rows={2}
                          value={drafts[r.id] ?? r.note ?? ""}
                          onChange={(e) => setDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
                          onBlur={() => saveNote(r.id)}
                          placeholder="Your note, e.g. less tongue, mouth smaller"
                          className="mt-2 w-full rounded-[10px] border border-white/10 bg-black/40 px-2 py-1.5 text-[12px] text-[#eef1f8]"
                          data-tip="What should change in this part. It is added to the request when you press Redo."
                        />
                        <div className="mt-1.5 flex gap-1.5">
                          <button
                            className={`forge-btn flex-1 !px-2 !py-1.5 !text-[12px] ${r.approved ? "primary" : ""}`}
                            onClick={() => approve(r.id, !r.approved)}
                            data-tip={r.approved ? "Take back your OK." : "You agree this part is right."}
                          >
                            {r.approved ? "✓ Looks good" : "Looks good"}
                          </button>
                          <button
                            className="forge-btn flex-1 !px-2 !py-1.5 !text-[12px]"
                            onClick={() => toggleMark(r.id)}
                            data-tip={r.redo ? "Take the mark off." : "Marks this part to be made again, with your note — later, together with every other part you mark. Nothing waits now."}
                          >
                            {r.redo ? "✓ Marked to remake" : "Mark to remake"}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
              {problem && <p className="mt-3 forge-note border border-red-400/40 bg-red-400/10 text-red-300">{problem}</p>}
            </div>

            <div className="space-y-3">
              {rig ? (
                <div data-tip="The puppet, alive: talking, blinking, nodding. Click to see it big."><PuppetPreview rig={rig} onClick={() => setZoom("live")} /></div>
              ) : (
                base && <img src={base.url} alt="" className="zoomable aspect-square w-full rounded-[20px] object-cover opacity-70" onClick={() => setZoom({ url: base.url, caption: "The chosen face" })} data-tip="The chosen face. Click to see it big." />
              )}
              <div className="flex flex-col gap-2">
                {busy ? (
                  <button className="forge-btn" onClick={stop} data-tip="Stops after the picture being made now. Everything made so far is kept.">Stop</button>
                ) : step === "build" ? (
                  <button className="forge-btn primary" onClick={() => void build()} data-tip="Carries on making the parts that are still missing.">
                    Continue
                  </button>
                ) : (
                  <>
                    {canShelve && (
                      <button className="forge-btn primary" onClick={() => void sendToVideoForge()} disabled={!!shelved} data-tip="Puts the puppet on the shelf Video Forge reads: it appears in Cast → +.">
                        {shelved ? "✓ In Video Forge" : "Send to Video Forge"}
                      </button>
                    )}
                    {framing !== "head" && !rig?.json.views?.side && (
                      <button className="forge-btn" onClick={() => void addSideView()} data-tip="Makes a second set turned three-quarters, so two characters can talk to each other in Video Forge. About 17 more pictures.">
                        Add a side-facing view
                      </button>
                    )}
                    <button className="forge-btn" onClick={() => void saveZip()} data-tip="Saves every picture of the puppet and its rig file in one zip.">Save the puppet (zip)</button>
                    {marked.length > 0 && (
                      <button className="forge-btn primary" onClick={() => void remakeMarked()} data-tip="Makes every part you marked on this puppet again, each with your note, checked by the two checkers. To do all puppets at once, use Remake all marked in Made.">
                        Remake the {marked.length} marked now
                      </button>
                    )}
                    {io.inspect && (
                      <button className="forge-btn" onClick={() => void checkAndFix()} data-tip="Two picture checkers look at every part, side view too. What is not green by two is made again with what they found, and checked again — up to three rounds.">
                        Check and fix every part
                      </button>
                    )}
                    {fixing && <p className="text-[12px] text-[#c4cbe0]">{fixing}</p>}
                    {redo.length > 0 && <button className="forge-btn" onClick={() => void fixParts(redo, undefined, true)} data-tip="Makes every unsure or missing part again.">Try the {redo.length} unsure/missing again</button>}
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
        <div className="forge-zoom" onClick={() => setZoom(null)} role="dialog" aria-label="Picture, large" data-tip="Click outside the picture, or press Esc, to close.">
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
        // A whole-body pose replaces the body (rig.ts poseBody), exactly as
        // Video Forge draws it; an old overlay pose goes over the body.
        const poseLayer = pose ? rig.json.poses?.[pose] : undefined;
        const swap = !!(poseLayer && rig.json.posesReplaceBody && neck);
        if (neck && !swap) {
          // Body: everything below the neck line, still.
          g.save();
          g.beginPath();
          g.rect(0, neck.y * S, S, S);
          g.clip();
          g.drawImage(baseBmp, 0, 0, S, S);
          g.restore();
        }
        if (swap && poseLayer && bitmaps[poseLayer.file]) g.drawImage(bitmaps[poseLayer.file], 0, 0, S, S);
        else draw(poseLayer);
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
