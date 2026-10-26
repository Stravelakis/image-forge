import { factLabel } from "../lib/puppet/quality";
/**
 * THE PUPPET REVIEW WORKBENCH (#11, Ak, 26 Oct 2026) — a full page, not a
 * pop-up. Left: the pictures grouped by pose, with counts and filters. Middle:
 * the page's pictures, each with a ✓/✗ row per region and a note. Right: the
 * zoomed check of the picked picture (the same box from the base and from the
 * part, side by side), every try kept with its prompt and the checkers'
 * answers. "Submit changes" sends one page; "Accept" approves one group.
 *
 * The thinking is in lib/puppet/workbench.ts (tested). This file only draws it.
 * Every popup goes through createPortal onto <body> (the old review's popup
 * scrolled away inside a blurred box — audit H6). Every control and number has
 * a hover bubble (TipLayer: data-tip).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { TryRecord } from "../lib/puppet/maker";
import { loadTries, saveMeta, tryFile, workshopPic, type MarkRegion, type WorkshopMeta } from "../lib/puppet/workshop";
import {
  FILTERS, GROUPS, LEVEL_WORD, REGIONS, acceptBlockers, acceptGroup, badRegions, dirtyIds, draftOf, filterCounts, filterRows, groupInfos,
  isDirty, keyAction, levelKey, markedCount, moveFocus, paddedBox, rowsOf, submitPage, toggleMark, triesFor, typingTarget, unacceptGroup, unionBox,
  wantsRedo, type BoxLike, type Draft, type Filter, type Level, type Row,
} from "../lib/puppet/workbench";

/** Where the workbench gets its pictures and records. The real one is the workshop folder; a demo can bring its own. */
export interface WorkbenchIO {
  /** a picture as an <img> source; "" when there is none */
  pic(file: string): Promise<string>;
  tries(): Promise<TryRecord[]>;
  save(meta: WorkshopMeta): Promise<unknown>;
}
export const workshopIO = (slug: string): WorkbenchIO => ({ pic: (f) => workshopPic(slug, f), tries: () => loadTries(slug), save: (m) => saveMeta(m) });

/* ---------------- small pieces ---------------- */

const LEVEL_CLASS: Record<"yes" | "maybe" | "no" | "none", string> = {
  yes: "border-emerald-400/45 bg-emerald-400/15 text-emerald-300",
  maybe: "border-amber-400/45 bg-amber-400/15 text-amber-300",
  no: "border-red-400/45 bg-red-400/15 text-red-300",
  none: "border-white/15 bg-white/5 text-[#8f98ab]",
};
const LEVEL_TIP: Record<"yes" | "maybe" | "no" | "none", string> = {
  yes: "Every checker that looked found nothing wrong. It still needs your eyes.",
  maybe: "A checker was unsure, or they disagreed. Look at this one closely.",
  no: "A checker found a real fault, or no picture was made.",
  none: "No checker looked at this one. Grey means nobody has checked it, never that it is fine.",
};

function LevelBadge({ level, small }: { level: Level; small?: boolean }) {
  const k = levelKey(level);
  return (
    <span data-tip={LEVEL_TIP[k]} className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-medium ${small ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]"} ${LEVEL_CLASS[k]}`}>
      <i className={`h-1.5 w-1.5 rounded-full ${k === "yes" ? "bg-emerald-400" : k === "maybe" ? "bg-amber-400" : k === "no" ? "bg-red-400" : "bg-[#6b7385]"}`} />
      {LEVEL_WORD[k]}
    </span>
  );
}

const imgCache = new Map<string, Promise<HTMLImageElement | null>>();
function loadImage(url: string): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  let p = imgCache.get(url);
  if (!p) {
    p = new Promise((res) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => res(null);
      im.src = url;
    });
    imgCache.set(url, p);
  }
  return p;
}
function usePic(io: WorkbenchIO, file: string | null): string {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let live = true;
    setUrl("");
    if (file) void io.pic(file).then((u) => live && setUrl(u));
    return () => { live = false; };
  }, [io, file]);
  return url;
}

/**
 * The same box of a picture, enlarged. `box` is in the base picture's own
 * pixels; a picture of another size is scaled to match. `outline` draws the
 * part's real box inside the padded crop.
 */
function CropCanvas({ src, box, baseW, className, outline = true, pad = 0.3, label }: { src: string; box: BoxLike | null; baseW: number; className?: string; outline?: boolean; pad?: number; label?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [empty, setEmpty] = useState(false);
  useEffect(() => {
    let live = true;
    setEmpty(false);
    void loadImage(src).then((im) => {
      const c = ref.current;
      if (!live || !c) return;
      if (!im || !box) return setEmpty(true);
      const k = im.naturalWidth / (baseW || im.naturalWidth);
      const b = { x: box.x * k, y: box.y * k, w: box.w * k, h: box.h * k };
      const pb = paddedBox(b, im.naturalWidth, im.naturalHeight, pad);
      const s = Math.min(4, 640 / pb.w);
      c.width = Math.round(pb.w * s);
      c.height = Math.round(pb.h * s);
      const g = c.getContext("2d");
      if (!g) return;
      g.imageSmoothingQuality = "high";
      g.drawImage(im, pb.x, pb.y, pb.w, pb.h, 0, 0, c.width, c.height);
      if (outline) {
        g.strokeStyle = "rgba(255,190,90,.85)";
        g.lineWidth = 2;
        g.setLineDash([6, 5]);
        g.strokeRect((b.x - pb.x) * s, (b.y - pb.y) * s, b.w * s, b.h * s);
      }
    });
    return () => { live = false; };
  }, [src, box, baseW, outline, pad]);
  return empty || !src ? (
    <div className={`grid place-items-center bg-white/[.03] text-[11px] text-[#6b7385] ${className ?? ""}`}>{src ? "no picture" : "…"}</div>
  ) : (
    <canvas ref={ref} role="img" aria-label={label ?? "zoomed crop"} className={className} />
  );
}

/** A window drawn on <body>, so no scrolling or blurred box can trap it. */
function Portal({ children }: { children: React.ReactNode }) {
  return createPortal(children, document.body);
}

/* ---------------- the page ---------------- */

export default function PuppetWorkbench({ meta: metaIn, io, onSave, onClose }: { meta: WorkshopMeta; io: WorkbenchIO; onSave: (m: WorkshopMeta) => void; onClose: () => void }) {
  const [meta, setMeta] = useState(metaIn);
  const [tries, setTries] = useState<TryRecord[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [group, setGroup] = useState("mouths");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [regionAt, setRegionAt] = useState(0);
  const [tryKey, setTryKey] = useState<Record<string, string>>({});
  const [view, setView] = useState<"compare" | "whole">("compare");
  const [zoom, setZoom] = useState<{ url: string; caption: string } | null>(null);
  const [sheet, setSheet] = useState(false);
  const [ask, setAsk] = useState<null | { kind: "accept"; ids: string[] } | { kind: "leave"; n: number }>(null);
  const [flash, setFlash] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [baseW, setBaseW] = useState(0);

  useEffect(() => { void io.tries().then(setTries); }, [io]);
  useEffect(() => {
    let live = true;
    void io.pic("base.png").then(async (u) => {
      if (!live) return;
      setBaseUrl(u);
      const im = await loadImage(u);
      if (live && im) setBaseW(im.naturalWidth);
    });
    return () => { live = false; };
  }, [io]);

  const rows = useMemo(() => rowsOf(meta, tries), [meta, tries]);
  const counts = useMemo(() => filterCounts(rows), [rows]);
  const infos = useMemo(() => groupInfos(rows, filter), [rows, filter]);
  const dirtyAll = useMemo(() => dirtyIds(meta, drafts, Object.keys(drafts)), [meta, drafts]);
  // keep the chosen page real: the first page that has pictures
  useEffect(() => {
    if (infos.length && !infos.some((g) => g.id === group)) setGroup(infos[0].id);
  }, [infos, group]);
  const page = useMemo(() => filterRows(rows.filter((r) => r.group === group), filter), [rows, group, filter]);
  const pageAll = useMemo(() => rows.filter((r) => r.group === group), [rows, group]);
  const cur = rows.find((r) => r.id === selected) ?? page[0] ?? null;
  const draftFor = useCallback((id: string): Draft => drafts[id] ?? draftOf(meta, id), [drafts, meta]);
  const setDraft = (id: string, patch: Partial<Draft>) => setDrafts((d) => ({ ...d, [id]: { ...(d[id] ?? draftOf(meta, id)), ...patch } }));
  const pageDirty = dirtyIds(meta, drafts, pageAll.map((r) => r.id));
  const say = (t: string) => { setFlash(t); window.setTimeout(() => setFlash((f) => (f === t ? "" : f)), 3200); };

  const commit = (m: WorkshopMeta) => { setMeta(m); onSave(m); };
  const submit = () => {
    if (!pageDirty.length) return say("Nothing new on this page to send.");
    const sentBack = pageDirty.filter((id) => wantsRedo(draftFor(id))).length;
    commit(submitPage(meta, drafts, pageAll.map((r) => r.id), new Date().toISOString()));
    setDrafts((d) => Object.fromEntries(Object.entries(d).filter(([id]) => !pageDirty.includes(id))));
    say(`Sent ${pageDirty.length} picture${pageDirty.length === 1 ? "" : "s"}${sentBack ? ` — ${sentBack} marked to be made again` : ""}.`);
  };
  const doAccept = () => {
    commit(acceptGroup(meta, group));
    // an accepted group has no pending remake
    setDrafts((d) => Object.fromEntries(Object.entries(d).filter(([id]) => !pageAll.some((r) => r.id === id))));
    setAsk(null);
    say(`${GROUPS.find((g) => g.id === group)?.label ?? "Group"} accepted.`);
  };
  const tryAccept = () => {
    const blockers = acceptBlockers(rows, drafts, group);
    if (blockers.length) setAsk({ kind: "accept", ids: blockers.map((b) => b.id) });
    else doAccept();
  };
  const close = () => (dirtyAll.length ? setAsk({ kind: "leave", n: dirtyAll.length }) : onClose());

  /* ---- keyboard ---- */
  const kbd = useRef({ page, cur, regionAt, drafts });
  kbd.current = { page, cur, regionAt, drafts };
  const act = useRef({ submit, setDraft, close });
  act.current = { submit, setDraft, close };
  const modalOpen = !!(zoom || sheet || ask);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (zoom) return setZoom(null);
        if (sheet) return setSheet(false);
        if (ask) return setAsk(null);
        return act.current.close();
      }
      if (modalOpen) return;
      const t = e.target as HTMLElement | null;
      const typing = typingTarget(t);
      if (typing && !(e.key === "Enter" && (e.ctrlKey || e.metaKey))) return;
      if (!typing && e.key === "Enter" && t?.closest?.("[data-native-enter]")) return;
      const a = keyAction(e.key, { ctrl: e.ctrlKey && e.key !== "Enter", meta: e.metaKey && e.key !== "Enter", alt: e.altKey });
      if (a.type === "none") return;
      e.preventDefault();
      const k = kbd.current;
      if (a.type === "submit") return act.current.submit();
      if (a.type === "move") {
        const at = Math.max(0, k.page.findIndex((r) => r.id === k.cur?.id));
        const f = moveFocus({ part: at, region: k.regionAt }, a, k.page.length);
        setRegionAt(f.region);
        const next = k.page[f.part];
        if (next) {
          setSelected(next.id);
          document.getElementById(`wb-card-${next.id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
        return;
      }
      if (a.type === "mark" && k.cur) {
        const region = REGIONS[k.regionAt].id;
        const d = k.drafts[k.cur.id];
        const regions = { ...(d?.regions ?? draftOf(metaRef.current, k.cur.id).regions) };
        if (a.mark === "clear") delete regions[region];
        else if (regions[region] === a.mark) delete regions[region];
        else regions[region] = a.mark;
        act.current.setDraft(k.cur.id, { regions });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalOpen, zoom, sheet, ask]);
  const metaRef = useRef(meta);
  metaRef.current = meta;

  const acceptedPct = rows.length ? Math.round((rows.filter((r) => r.approved).length / rows.length) * 100) : 0;
  const groupDef = GROUPS.find((g) => g.id === group);
  const canSheet = ["mouths", "lids", "brows"].includes(group);

  return (
    <div className="wb fixed inset-0 z-[55] flex flex-col overflow-hidden text-[#eef1f8]" style={{ fontFamily: '"Sora", system-ui, sans-serif' }}>
      <div aria-hidden className="wb-bg" />
      {/* ---------- top bar ---------- */}
      <header className="relative z-10 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-white/[.07] bg-black/50 px-4 py-3 backdrop-blur-xl sm:px-6">
        <button data-native-enter className="forge-btn !px-4 !py-2 !text-[12px]" onClick={close} data-tip="Goes back to the puppet. Anything you have not sent yet will be asked about first.">← Back</button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[17px] font-semibold tracking-[-.01em]" data-tip="The puppet you are reviewing.">Review · {meta.name}</h1>
          <p className="text-[11px] font-light text-[#8f98ab]" data-tip="Look at every picture, mark what is right or wrong, send the page, then accept the group.">
            <span data-tip="How many pictures you have accepted, out of all of them.">{rows.filter((r) => r.approved).length} of {rows.length} accepted</span>
            <span className="mx-1.5 opacity-40">·</span>
            <span data-tip="Pictures marked to be made again. Use Remake in Made, or in the puppet, to make them.">{rows.filter((r) => r.redo).length} to remake</span>
          </p>
        </div>
        <div className="hidden h-1.5 w-40 overflow-hidden rounded-full bg-white/10 sm:block" data-tip="Your progress: the share of pictures you have accepted.">
          <div className="h-full rounded-full bg-[var(--color-ember)] transition-[width] duration-500" style={{ width: `${acceptedPct}%` }} />
        </div>
        <span aria-live="polite" className={`text-[12px] text-[var(--color-ember)] transition-opacity ${flash ? "opacity-100" : "opacity-0"}`} data-tip="What your last button did.">{flash || "·"}</span>
        <button data-native-enter className="forge-btn !px-3 !py-2 !text-[12px]" data-tip="Arrow left/right: next picture. Arrow up/down: next area. Y: tick the area. N: cross it. 0: clear it. Enter: send this page." onClick={() => say("← → picture · ↑ ↓ area · Y ✓ · N ✗ · 0 clear · Enter send page")}>⌨ Keys</button>
      </header>

      <div className="relative z-10 grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[250px_minmax(0,1fr)_minmax(380px,460px)] lg:overflow-hidden">
        {/* ---------- left: filters and groups ---------- */}
        <aside className="border-white/[.07] p-3 sm:p-4 lg:overflow-y-auto lg:border-r" aria-label="Pictures by group">
          <p className="forge-label" data-tip="Show only the pictures that match. The numbers count pictures in the whole puppet.">Show</p>
          <div className="mb-4 flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button key={f.id} data-native-enter onClick={() => setFilter(f.id)} data-tip={f.tip}
                className={`rounded-full border px-3 py-1.5 text-[11.5px] font-medium transition ${filter === f.id ? "border-[var(--color-ember)] bg-[color-mix(in_srgb,var(--color-ember)_20%,transparent)] text-white shadow-[0_0_18px_-6px_var(--color-ember)]" : "border-white/12 text-[#c3c9d6] hover:border-white/30"}`}>
                {f.label} <b className="ml-0.5 font-semibold opacity-80">{counts[f.id]}</b>
              </button>
            ))}
          </div>
          <p className="forge-label" data-tip="The pictures are sorted by what they are. Pick a group to see its page.">Groups</p>
          <nav className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
            {infos.map((g) => {
              const dirty = dirtyIds(meta, drafts, rows.filter((r) => r.group === g.id).map((r) => r.id)).length;
              return (
                <button key={g.id} data-native-enter onClick={() => { setGroup(g.id); setSelected(null); }} data-tip={g.tip}
                  className={`group flex shrink-0 items-center justify-between gap-3 rounded-2xl border px-3.5 py-2.5 text-left transition lg:w-full ${group === g.id ? "border-[var(--color-ember)]/70 bg-white/[.07] shadow-[0_0_26px_-12px_var(--color-ember)]" : "border-white/[.08] hover:border-white/25"}`}>
                  <span className="text-[13px] font-medium">{g.label}{dirty > 0 && <i className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-ember)] align-middle" data-tip="You have changes here you have not sent yet." />}</span>
                  <span className="flex items-center gap-2 text-[11px] text-[#8f98ab]">
                    <span data-tip={`${g.accepted} of ${g.total} accepted. ${g.shown} shown with this filter.`}>{g.done ? <b className="text-[var(--color-lagoon)]">✓ {g.total}</b> : <>{g.accepted}/{g.total}</>}</span>
                  </span>
                </button>
              );
            })}
            {!infos.length && <p className="text-[12px] text-[#8f98ab]">No pictures yet. Make the puppet first.</p>}
          </nav>
        </aside>

        {/* ---------- middle: this page ---------- */}
        <main className="min-w-0 p-3 sm:p-5 lg:overflow-y-auto" aria-label="This page">
          <div className="sticky top-0 z-20 -mx-3 -mt-3 mb-4 flex flex-wrap items-center gap-2 border-b border-white/[.07] bg-black/70 px-3 py-3 backdrop-blur-xl sm:-mx-5 sm:-mt-5 sm:px-5">
            <div className="mr-auto min-w-0">
              <h2 className="text-[16px] font-semibold" data-tip={groupDef?.tip}>{groupDef?.label}</h2>
              <p className="text-[11px] font-light text-[#8f98ab]" data-tip="How many pictures are on this page with the filter you chose, out of all in the group.">{page.length} shown of {pageAll.length}</p>
            </div>
            {canSheet && (
              <button data-native-enter className="forge-btn !px-4 !py-2 !text-[12px]" onClick={() => setSheet(true)} data-tip="Shows every one of these on the same face at the same size, side by side. The quickest way to see they do not match.">Contact sheet</button>
            )}
            {infos.find((g) => g.id === group)?.done ? (
              <button data-native-enter className="forge-btn !px-4 !py-2 !text-[12px]" onClick={() => { commit(unacceptGroup(meta, group)); say("Group opened again."); }} data-tip="Takes your acceptance back from every picture in this group.">✓ Accepted — undo</button>
            ) : (
              <button data-native-enter className="forge-btn !px-4 !py-2 !text-[12px]" onClick={tryAccept} data-tip="Says every picture in this group is right, all together. You will be asked first if any is red or marked wrong.">Accept {groupDef?.label.toLowerCase()}</button>
            )}
            <button data-native-enter className="forge-btn primary !px-5 !py-2 !text-[12px]" onClick={submit} disabled={!pageDirty.length} data-tip="Sends everything you changed on this page in one go: the ticks and crosses, the notes, and which pictures to make again.">
              Submit changes{pageDirty.length ? ` (${pageDirty.length})` : ""}
            </button>
          </div>

          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-3">
            {page.map((r) => (
              <Card key={r.id} row={r} meta={meta} io={io} tries={tries} baseUrl={baseUrl} baseW={baseW} draft={draftFor(r.id)} dirty={isDirty(meta, r.id, drafts[r.id])}
                selected={cur?.id === r.id} regionAt={cur?.id === r.id ? regionAt : -1}
                onPick={(region) => { setSelected(r.id); if (region !== undefined) setRegionAt(region); }}
                onChange={(patch) => setDraft(r.id, patch)} />
            ))}
          </ul>
          {!page.length && <p className="mt-10 text-center text-[13px] text-[#8f98ab]" data-tip="Nothing on this page matches the filter. Pick All to see everything.">Nothing here with this filter.</p>}
        </main>

        {/* ---------- right: the picked picture ---------- */}
        <aside id="wb-inspector" className="border-white/[.07] p-3 sm:p-5 lg:overflow-y-auto lg:border-l" aria-label="Picked picture">
          {cur ? (
            <Inspector key={cur.id} row={cur} meta={meta} io={io} tries={triesFor(tries, cur.id)} baseUrl={baseUrl} baseW={baseW} view={view} setView={setView}
              tryKey={tryKey[cur.id]} setTryKey={(k) => setTryKey((m) => ({ ...m, [cur.id]: k }))} onZoom={setZoom} />
          ) : (
            <p className="text-[13px] text-[#8f98ab]">Pick a picture to look at it closely.</p>
          )}
        </aside>
      </div>

      {/* ---------- popups, all on <body> ---------- */}
      {zoom && (
        <Portal>
          <div className="forge-zoom" style={{ zIndex: 70 }} onClick={() => setZoom(null)} role="dialog" aria-label="Picture, large" data-tip="Click outside the picture, or press Esc, to close.">
            <div onClick={(e) => e.stopPropagation()} className="cursor-default">
              <img src={zoom.url} alt="" />
              <p>{zoom.caption} · Esc or click outside to close</p>
            </div>
          </div>
        </Portal>
      )}
      {sheet && (
        <Portal>
          <ContactSheet group={group} label={groupDef?.label ?? ""} rows={pageAll} meta={meta} io={io} baseUrl={baseUrl} baseW={baseW} onClose={() => setSheet(false)} onPick={(id) => { setSelected(id); setSheet(false); }} />
        </Portal>
      )}
      {ask && (
        <Portal>
          <div className="fixed inset-0 z-[70] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onClick={() => setAsk(null)} role="dialog" aria-modal="true" data-tip="Click outside, or press Esc, to close this question.">
            <div className="forge-pop w-full max-w-md space-y-4 p-6" onClick={(e) => e.stopPropagation()} data-tip="Answer with one of the two buttons.">
              {ask.kind === "accept" ? (
                <>
                  <h2 data-tip="Some pictures in this group look wrong. Accepting says they are right anyway.">Accept with {ask.ids.length} that look wrong?</h2>
                  <ul className="max-h-40 space-y-1 overflow-y-auto text-[12.5px] text-[#c3c9d6]" data-tip="These pictures are red, marked wrong by you, or set to be made again.">
                    {ask.ids.map((id) => <li key={id}>• {rows.find((r) => r.id === id)?.label ?? id}</li>)}
                  </ul>
                  <div className="flex gap-2">
                    <button className="forge-btn primary flex-1" onClick={doAccept} data-tip="Accepts the whole group anyway. The remake requests on it are dropped.">Accept anyway</button>
                    <button className="forge-btn flex-1" onClick={() => setAsk(null)} data-tip="Goes back to the page without accepting.">Not yet</button>
                  </div>
                </>
              ) : (
                <>
                  <h2 data-tip="Marks you made but did not send with Submit changes.">{ask.n} picture{ask.n === 1 ? " has" : "s have"} changes not sent</h2>
                  <p className="text-[12.5px] text-[#c3c9d6]">Leave and lose them?</p>
                  <div className="flex gap-2">
                    <button className="forge-btn danger flex-1" onClick={onClose} data-tip="Leaves the page. The unsent marks are thrown away.">Leave</button>
                    <button className="forge-btn flex-1" onClick={() => setAsk(null)} data-tip="Stays here so you can send them.">Stay</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </Portal>
      )}
    </div>
  );
}

/* ---------------- one picture's card ---------------- */

function Card({ row, meta, io, tries, baseUrl, baseW, draft, dirty, selected, regionAt, onPick, onChange }: {
  row: Row; meta: WorkshopMeta; io: WorkbenchIO; tries: TryRecord[]; baseUrl: string; baseW: number; draft: Draft; dirty: boolean;
  selected: boolean; regionAt: number; onPick: (region?: number) => void; onChange: (p: Partial<Draft>) => void;
}) {
  const own = triesFor(tries, row.id);
  const last = own[own.length - 1];
  const partUrl = usePic(io, last ? tryFile(last) : `${row.id}.pair.png`);
  const box = meta.boxes?.[row.id] ?? null;
  const bad = badRegions(draft.regions);
  return (
    <li id={`wb-card-${row.id}`} onMouseDown={() => onPick()}
      className={`wb-card rounded-3xl border p-3.5 transition duration-200 ${selected ? "border-[var(--color-ember)]/70 bg-white/[.07] shadow-[0_0_34px_-14px_var(--color-ember)]" : "border-white/[.09] bg-white/[.03] hover:border-white/20"} ${row.approved ? "ring-1 ring-[var(--color-lagoon)]/50" : row.redo ? "ring-1 ring-[var(--color-ember)]/60" : ""}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-semibold" data-tip={`The name of this picture: ${row.id}.`}>{row.label}</p>
          <p className="text-[10.5px] text-[#8f98ab]" data-tip="How many tries were made for this picture. All of them are kept, see the strip on the right.">{row.tries} {row.tries === 1 ? "try" : "tries"}{dirty ? " · not sent" : ""}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <LevelBadge level={row.level} small />
          {row.approved && <span className="text-[10px] font-medium text-[var(--color-lagoon)]" data-tip="You accepted this picture.">✓ accepted</span>}
          {!row.approved && (row.redo || wantsRedo(draft)) && <span className="text-[10px] font-medium text-[var(--color-ember)]" data-tip="This picture will be made again, with your note.">↻ to remake</span>}
        </div>
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <div data-tip="The same box cut out of the original face, enlarged. This is what should be there.">
          <CropCanvas src={baseUrl} box={box} baseW={baseW} className="aspect-[4/3] w-full rounded-xl bg-black/40 object-contain" label="from the base" />
        </div>
        <div data-tip="The same box cut out of the newest try, enlarged. This is what is there now.">
          <CropCanvas src={partUrl} box={last ? box : null} baseW={baseW} className="aspect-[4/3] w-full rounded-xl bg-black/40 object-contain" label="from the part" />
        </div>
      </div>
      <RegionRow marks={draft.regions} regionAt={regionAt} onMark={(region, mark) => { onChange({ regions: toggleMark(draft.regions, REGIONS[region].id, mark) }); onPick(region); }} />
      <textarea
        rows={2} value={draft.note} onChange={(e) => onChange({ note: e.target.value })} onFocus={() => onPick()}
        placeholder="Note for the next try: “less tongue”, “keep the beard”…"
        data-tip="Your words for this picture. If it is made again, the note goes to the picture maker."
        className="forge-field mt-2.5 !rounded-xl !px-3 !py-2 !text-[12px]" />
      <div className="mt-2 flex items-center gap-2">
        <button data-native-enter onClick={() => onChange({ remake: !draft.remake })}
          data-tip={bad.length ? "A cross anywhere already sends this picture back. Tick to send it back even without a cross." : "Ticks this picture to be made again. It happens when you press Submit changes, and the remake comes later, together with the others."}
          className={`rounded-full border px-3 py-1.5 text-[11.5px] font-medium transition ${draft.remake || bad.length ? "border-[var(--color-ember)] bg-[color-mix(in_srgb,var(--color-ember)_20%,transparent)] text-white" : "border-white/14 text-[#c3c9d6] hover:border-white/30"}`}>
          {draft.remake || bad.length ? "↻ Make again" : "Make again?"}
        </button>
        <button data-native-enter onClick={() => { onPick(); window.setTimeout(() => document.getElementById("wb-inspector")?.scrollIntoView({ behavior: "smooth" }), 60); }}
          data-tip="Jumps to the close-up of this picture: the same box from the original and from the try, enlarged, with every try and its words."
          className="rounded-full border border-white/14 px-3 py-1.5 text-[11.5px] font-medium text-[#c3c9d6] transition hover:border-white/30 lg:hidden">Close-up ↓</button>
        <span className="text-[10.5px] text-[#8f98ab]" data-tip="How many areas you ticked and how many you crossed.">{markedCount(draft.regions) ? `${Object.values(draft.regions).filter((m) => m === "ok").length} ✓ · ${bad.length} ✗` : "no marks"}</span>
      </div>
    </li>
  );
}

/** Eight areas, each with a tick and a cross. Three states: unmarked, ✓, ✗. */
function RegionRow({ marks, regionAt, onMark }: { marks: Draft["regions"]; regionAt: number; onMark: (region: number, mark: "ok" | "bad") => void }) {
  return (
    <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Areas to mark">
      {REGIONS.map((r, i) => {
        const m = marks[r.id as MarkRegion];
        return (
          <div key={r.id} data-tip={r.tip}
            className={`flex items-center justify-between rounded-xl border pl-2.5 text-[11.5px] transition ${regionAt === i ? "border-[var(--color-ember)]/80 bg-white/[.07]" : "border-white/[.09]"} ${m === "ok" ? "bg-emerald-400/[.07]" : m === "bad" ? "bg-red-400/[.09]" : ""}`}>
            <span className={m ? "font-medium text-white" : "text-[#a7aec0]"}>{r.label}</span>
            <span className="flex">
              <button data-native-enter aria-pressed={m === "ok"} aria-label={`${r.label} is right`} onClick={() => onMark(i, "ok")} data-tip={`Tick: the ${r.label} is right. Click again to clear.`}
                className={`h-7 w-7 rounded-l-lg text-[13px] transition ${m === "ok" ? "bg-emerald-500 font-bold text-black" : "text-emerald-300/70 hover:bg-emerald-400/20"}`}>✓</button>
              <button data-native-enter aria-pressed={m === "bad"} aria-label={`${r.label} is wrong`} onClick={() => onMark(i, "bad")} data-tip={`Cross: the ${r.label} is wrong. Click again to clear.`}
                className={`h-7 w-7 rounded-r-xl text-[13px] transition ${m === "bad" ? "bg-red-500 font-bold text-black" : "text-red-300/70 hover:bg-red-400/20"}`}>✗</button>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- the picked picture, close up ---------------- */

interface TryView {
  key: string;
  label: string;
  file: string;
  rec?: TryRecord;
}

function Inspector({ row, meta, io, tries, baseUrl, baseW, view, setView, tryKey, setTryKey, onZoom }: {
  row: Row; meta: WorkshopMeta; io: WorkbenchIO; tries: TryRecord[]; baseUrl: string; baseW: number; view: "compare" | "whole"; setView: (v: "compare" | "whole") => void;
  tryKey: string | undefined; setTryKey: (k: string) => void; onZoom: (z: { url: string; caption: string }) => void;
}) {
  // Every try on record, oldest first; an older puppet with no tries.json shows what it has.
  const views: TryView[] = useMemo(() => {
    if (tries.length) return tries.map((t) => ({ key: `${t.try}-${t.at}`, label: `try ${t.try}`, file: tryFile(t), rec: t }));
    const v: TryView[] = [{ key: "pair", label: "now", file: `${row.id}.pair.png` }];
    (meta.versions?.[row.id] ?? []).forEach((_, n) => v.unshift({ key: `v${n}`, label: `earlier ${n + 1}`, file: `${row.id}.v${n}.pair.png` }));
    (meta.options?.[row.id] ?? []).forEach((_, n) => v.push({ key: `o${n}`, label: `option ${n + 1}`, file: `${row.id}.opt${n}.pair.png` }));
    return v;
  }, [tries, meta, row.id]);
  const sel = views.find((v) => v.key === tryKey) ?? views[views.length - 1] ?? null;
  const url = usePic(io, sel?.file ?? null);
  const box = meta.boxes?.[row.id] ?? null;
  const rec = sel?.rec;
  const isPair = !!sel && !sel.rec;
  const copy = (text: string) => void navigator.clipboard?.writeText(text);
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[16px] font-semibold" data-tip={`The picture you are looking at: ${row.id}.`}>{row.label}</h3>
          <p className="text-[11px] text-[#8f98ab]" data-tip="Which group this picture belongs to.">{GROUPS.find((g) => g.id === row.group)?.label}</p>
        </div>
        <LevelBadge level={row.level} />
      </div>

      {/* the stage: one fixed-size frame, so switching tries never moves the page */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <div className="inline-flex rounded-full border border-white/12 p-0.5 text-[11.5px]" data-tip="Close-up: the same box from the original and from this try, side by side. Whole: the entire try picture.">
            {(["compare", "whole"] as const).map((v) => (
              <button key={v} data-native-enter onClick={() => setView(v)} data-tip={v === "compare" ? "Shows the same box from the original and from this try, enlarged side by side." : "Shows the whole picture this try made."}
                className={`rounded-full px-3 py-1 font-medium transition ${view === v ? "bg-[var(--color-ember)] text-[var(--color-on-accent)]" : "text-[#c3c9d6]"}`}>{v === "compare" ? "Close-up" : "Whole picture"}</button>
            ))}
          </div>
          {url && <button data-native-enter className="text-[11.5px] text-[#c3c9d6] underline underline-offset-2 hover:text-white" onClick={() => onZoom({ url, caption: `${row.label} · ${sel?.label ?? ""}` })} data-tip="Opens this picture as large as the window allows.">Enlarge ⤢</button>}
        </div>
        <div className="grid h-[300px] place-items-center overflow-hidden rounded-3xl border border-white/10 bg-black/50 p-2 sm:h-[340px]" data-tip="The big view stays in this frame while you click through the tries.">
          {view === "compare" && !isPair ? (
            <div className="grid h-full w-full grid-cols-2 gap-2">
              <figure className="flex min-h-0 flex-col" data-tip="The original face: what should be here.">
                <CropCanvas src={baseUrl} box={box} baseW={baseW} className="min-h-0 w-full flex-1 rounded-2xl bg-black/40 object-contain" label="the original" />
                <figcaption className="pt-1.5 text-center text-[10.5px] uppercase tracking-[.14em] text-[#8f98ab]">original</figcaption>
              </figure>
              <figure className="flex min-h-0 flex-col" data-tip="This try: what is here.">
                <CropCanvas src={url} box={box} baseW={baseW} className="min-h-0 w-full flex-1 rounded-2xl bg-black/40 object-contain" label="this try" />
                <figcaption className="pt-1.5 text-center text-[10.5px] uppercase tracking-[.14em] text-[#8f98ab]">{sel?.label ?? "part"}</figcaption>
              </figure>
            </div>
          ) : url ? (
            <img src={url} alt="" className="max-h-full max-w-full rounded-2xl object-contain" />
          ) : (
            <span className="text-[12px] text-[#6b7385]">no picture saved</span>
          )}
        </div>
      </div>

      {/* every try */}
      <div>
        <p className="forge-label" data-tip="Every try the maker made for this picture, kept. Click one to see it in the frame above.">Every try · {views.length}</p>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {views.map((v) => (
            <TryTile key={v.key} tip={`${v.label}${v.rec ? ` — checkers: ${LEVEL_WORD[levelKey(v.rec.level)]}` : ""}. Click to see it in the big frame.`} v={v} io={io} box={box} baseW={baseW} on={sel?.key === v.key} onClick={() => setTryKey(v.key)} />
          ))}
        </div>
      </div>

      {/* what was asked, what was said */}
      {rec ? (
        <div className="space-y-3 text-[12px]">
          <dl className="grid grid-cols-3 gap-2 text-center">
            <Fact k="engine" v={rec.engine ?? "—"} tip="Which picture maker drew this try." />
            <Fact k="seed" v={String(rec.seed)} tip="The number that starts the drawing. The same seed with the same words gives nearly the same picture." />
            <Fact k="when" v={new Date(rec.at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} tip="When this try was made." />
          </dl>
          <div className="flex items-center gap-2">
            <LevelBadge level={rec.level} />
            <span className="text-[11.5px] text-[#c3c9d6]" data-tip="Each checker's vote. A tick means it found nothing wrong, a question mark unsure, a cross a fault, a dash it could not look.">{rec.votes ?? (rec.level === null ? "no checker looked" : "")}</span>
          </div>
          {rec.cut !== "ok" && <p className="rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2 text-red-200" data-tip="The cut-out was refused before any checker looked, for this reason.">Cut refused: {rec.cut}</p>}
          {rec.why && <p className="text-[#c3c9d6]" data-tip="The checkers' reasons in plain words.">{rec.why}</p>}
          {!!rec.checkers?.length && (
            <div className="space-y-1.5">
              {rec.checkers.map((c) => (
                <div key={c.name} className="rounded-xl border border-white/[.08] bg-white/[.03] px-3 py-2" data-tip="What this one checker found, and the questions it could not answer.">
                  <p className="font-medium">{c.name} <span className="font-light text-[#8f98ab]">{c.facts ? "" : "· could not look"}</span></p>
                  {c.faults.length > 0 && <ul className="mt-1 list-inside list-disc text-red-300/90">{c.faults.map((f, i) => <li key={i}>{f.replace(/^[~?]\s*/, "")}</li>)}</ul>}
                  {c.unanswered.length > 0 && <p className="mt-1 text-amber-300/90" data-tip="Questions it gave no usable answer to. Unanswered is never counted as a yes.">Could not answer: {c.unanswered.map(factLabel).join(" · ")}</p>}
                  {c.facts && !c.faults.length && !c.unanswered.length && <p className="text-emerald-300/80">found nothing wrong</p>}
                </div>
              ))}
            </div>
          )}
          {!!rec.pixels?.length && (
            <div data-tip="Free automatic checks on the pixels: what changed outside the box, specks, holes, leftover background.">
              <p className="forge-label !mb-1">Pixel findings</p>
              <ul className="list-inside list-disc text-[#c3c9d6]">{rec.pixels.map((p, i) => <li key={i}>{p}</li>)}</ul>
            </div>
          )}
          <PromptBox title="What was asked" text={rec.prompt} onCopy={copy} tip="The words sent to the picture maker for this try." />
          <PromptBox title="What was ruled out" text={rec.negative} onCopy={copy} tip="The things the picture maker was told not to draw." />
        </div>
      ) : (
        <p className="rounded-xl border border-white/[.08] bg-white/[.03] px-3 py-2 text-[12px] text-[#a7aec0]" data-tip="Tries made before the workbench existed were not recorded with their words.">This puppet was made before every try was recorded, so the words, seed and checker answers are not on file. The picture is.</p>
      )}
    </div>
  );
}

function Fact({ k, v, tip }: { k: string; v: string; tip: string }) {
  return (
    <div className="rounded-xl border border-white/[.08] bg-white/[.03] px-2 py-1.5" data-tip={tip}>
      <dt className="text-[9.5px] uppercase tracking-[.16em] text-[#8f98ab]">{k}</dt>
      <dd className="truncate text-[12px] font-medium">{v}</dd>
    </div>
  );
}

function PromptBox({ title, text, onCopy, tip }: { title: string; text: string; onCopy: (t: string) => void; tip: string }) {
  return (
    <div data-tip={tip}>
      <div className="mb-1 flex items-center justify-between">
        <p className="forge-label !mb-0">{title}</p>
        <button data-native-enter className="text-[11px] text-[#c3c9d6] underline underline-offset-2 hover:text-white" onClick={() => onCopy(text)} data-tip="Copies these words so you can use them elsewhere.">Copy</button>
      </div>
      <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-white/[.08] bg-black/40 p-2.5 font-[inherit] text-[11.5px] leading-relaxed text-[#c3c9d6]">{text || "—"}</pre>
    </div>
  );
}

function TryTile({ v, io, box, baseW, on, onClick, tip }: { tip: string; v: TryView; io: WorkbenchIO; box: BoxLike | null; baseW: number; on: boolean; onClick: () => void }) {
  const url = usePic(io, v.file);
  const lvl = v.rec ? v.rec.level : null;
  const k = levelKey(lvl);
  return (
    <button data-native-enter onClick={onClick} data-tip={tip}
      className={`relative shrink-0 overflow-hidden rounded-2xl border transition ${on ? "border-[var(--color-ember)] shadow-[0_0_22px_-8px_var(--color-ember)]" : "border-white/12 hover:border-white/35"}`}>
      {v.rec ? <CropCanvas src={url} box={box} baseW={baseW} outline={false} pad={0.15} className="h-[64px] w-[88px] bg-black/50 object-contain" label={v.label} /> : url ? <img src={url} alt="" className="h-[64px] w-[88px] bg-black/50 object-contain" /> : <div className="h-[64px] w-[88px] bg-black/50" />}
      <span className={`absolute left-1 top-1 rounded-full border px-1.5 text-[9.5px] font-semibold ${LEVEL_CLASS[k]} ${v.rec ? "" : "!border-white/20 !bg-black/60 !text-[#c3c9d6]"}`}>{v.label}</span>
    </button>
  );
}

/* ---------------- contact sheet ---------------- */

function ContactSheet({ group, label, rows, meta, io, baseUrl, baseW, onClose, onPick }: {
  group: string; label: string; rows: Row[]; meta: WorkshopMeta; io: WorkbenchIO; baseUrl: string; baseW: number; onClose: () => void; onPick: (id: string) => void;
}) {
  const boxes = rows.map((r) => meta.boxes?.[r.id]).filter(Boolean) as BoxLike[];
  const union = unionBox(boxes);
  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black/90 backdrop-blur-md" role="dialog" aria-modal="true" aria-label={`Contact sheet: ${label}`} data-group={group}>
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
        <div>
          <h2 className="text-[16px] font-semibold" data-tip="Every picture of this group drawn on the same face, cut by the same box, at the same size.">Contact sheet · {label}</h2>
          <p className="text-[11px] text-[#8f98ab]" data-tip="Click a tile to go to that picture.">Same face, same box, same size. Click one to pick it.</p>
        </div>
        <button className="forge-btn !px-4 !py-2 !text-[12px]" onClick={onClose} data-tip="Closes the contact sheet.">Close</button>
      </div>
      <div className="grid flex-1 grid-cols-2 content-start gap-3 overflow-y-auto p-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        <SheetTile label="original" level={undefined} compose={null} baseUrl={baseUrl} baseW={baseW} union={union} io={io} tip="The face without any change, for comparing." />
        {rows.map((r) => (
          <SheetTile key={r.id} label={r.label} level={r.level} compose={r.id} baseUrl={baseUrl} baseW={baseW} union={union} io={io} box={meta.boxes?.[r.id]} onPick={() => onPick(r.id)} tip={`${r.label}: ${LEVEL_WORD[levelKey(r.level)]}. Click to pick it.`} />
        ))}
      </div>
    </div>
  );
}

function SheetTile({ label, level, compose, baseUrl, baseW, union, io, box, onPick, tip }: {
  label: string; level: Level | undefined; compose: string | null; baseUrl: string; baseW: number; union: BoxLike | null; io: WorkbenchIO; box?: BoxLike; onPick?: () => void; tip: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let live = true;
    void (async () => {
      const base = await loadImage(baseUrl);
      const c = ref.current;
      if (!live || !c || !base || !union) return;
      const k = base.naturalWidth / (baseW || base.naturalWidth);
      const pb = paddedBox({ x: union.x * k, y: union.y * k, w: union.w * k, h: union.h * k }, base.naturalWidth, base.naturalHeight, 0.12);
      const s = Math.min(3, 520 / pb.w);
      c.width = Math.round(pb.w * s);
      c.height = Math.round(pb.h * s);
      const g = c.getContext("2d");
      if (!g) return;
      g.imageSmoothingQuality = "high";
      g.drawImage(base, pb.x, pb.y, pb.w, pb.h, 0, 0, c.width, c.height);
      if (compose && box) {
        const part = (await loadImage(await io.pic(`${compose}.keyed.png`))) ?? (await loadImage(await io.pic(`${compose}.layer.png`)));
        if (!live || !part) return;
        g.drawImage(part, 0, 0, part.naturalWidth, part.naturalHeight, (box.x * k - pb.x) * s, (box.y * k - pb.y) * s, box.w * k * s, box.h * k * s);
      }
    })();
    return () => { live = false; };
  }, [baseUrl, baseW, union, compose, box, io]);
  const k = levelKey(level ?? null);
  return (
    <button data-native-enter onClick={onPick} disabled={!onPick} data-tip={tip}
      className={`overflow-hidden rounded-2xl border bg-black/40 text-left transition ${onPick ? "border-white/12 hover:border-[var(--color-ember)]" : "border-white/20"}`}>
      <canvas ref={ref} className="w-full" role="img" aria-label={label} />
      <div className="flex items-center justify-between px-3 py-2 text-[12px]">
        <span className="font-medium">{label}</span>
        {level !== undefined && <span className={`h-2 w-2 rounded-full ${k === "yes" ? "bg-emerald-400" : k === "maybe" ? "bg-amber-400" : k === "no" ? "bg-red-400" : "bg-[#6b7385]"}`} />}
      </div>
    </button>
  );
}
