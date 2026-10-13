/**
 * Made — everything Image Forge has produced, with its status, and the
 * numbers (13 Oct 2026). Replaces the Forge tab as the place you land, and the
 * old picture gallery: Ak found the Forge tab "convoluted and partly duplicate"
 * and the gallery "ancient", missing puppets and sheets. The spreadsheet editor
 * is still one click away ("Edit as a table") for people who work in rows.
 *
 * Thumbnails come from lib/thumbStore, so the list is complete after a
 * restart; puppets come from the Forge shelf.
 */
import { useEffect, useMemo, useState } from "react";
import type { ManifestRow, Status } from "../types";
import type { Batch } from "../lib/batches";
import type { ForgeSettings } from "../lib/providers";
import { formatUsd } from "../lib/providers";
import { findModel } from "../lib/engines.mjs";

type Kind = "all" | "pictures" | "sheets" | "motion" | "vectors" | "puppets";

interface Puppet {
  slug: string;
  name: string;
  framing: string;
  madeAt: string;
}

const KIND_OF = (r: ManifestRow): Exclude<Kind, "all" | "puppets"> =>
  r.category === "sheet" ? "sheets" : r.category === "gif" ? "motion" : r.category === "svg" || r.category === "lottie" ? "vectors" : "pictures";

const STATUS_WORD: Partial<Record<Status, string>> = {
  done: "made",
  pending: "waiting",
  generating: "making…",
  failed: "failed",
  skipped: "skipped",
  imported: "uploaded",
};

/** 13 Oct 2026, 14:02 — an exact date, not "1d ago". */
const when = (iso: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};
const sameDay = (iso: string, d = new Date()) => {
  const x = new Date(iso);
  return x.getFullYear() === d.getFullYear() && x.getMonth() === d.getMonth() && x.getDate() === d.getDate();
};

export default function MadeView({
  rows,
  batches,
  settings,
  isRunning,
  onRun,
  onStop,
  onRedo,
  updateRow,
  onOpenTable,
  onBackfill,
  onMakeGif,
}: {
  rows: ManifestRow[];
  batches: Batch[];
  settings: ForgeSettings;
  isRunning: boolean;
  onRun: () => void;
  onStop: () => void;
  onRedo: (ids: number[]) => void;
  updateRow: (id: number, patch: Partial<ManifestRow>) => void;
  onOpenTable: () => void;
  /** read pictures back from the linked folder, for rows made before thumbnails were kept */
  onBackfill?: () => Promise<number>;
  onMakeGif?: (row: ManifestRow) => void;
}) {
  const [kind, setKind] = useState<Kind>("all");
  const [status, setStatus] = useState<Status | "all">("all");
  const [batch, setBatch] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [zoom, setZoom] = useState<{ url: string; caption: string } | null>(null);
  const [puppets, setPuppets] = useState<Puppet[]>([]);
  const [puppetThumbs, setPuppetThumbs] = useState<Record<string, string>>({});
  const [filling, setFilling] = useState("");

  // Puppets from the Forge shelf (desktop app only), with their faces.
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const r = await fetch("/app/puppets", { headers: { "X-Forge-App": "1" } });
        if (!r.ok) return;
        const list = ((await r.json())?.puppets ?? []) as Puppet[];
        if (!alive) return;
        setPuppets(list);
        for (const p of list) {
          const b = await fetch(`/app/puppets/${encodeURIComponent(p.slug)}/base.png`, { headers: { "X-Forge-App": "1" } });
          if (b.ok && alive) {
            const url = URL.createObjectURL(await b.blob());
            setPuppetThumbs((t) => ({ ...t, [p.slug]: url }));
          }
        }
      } catch {
        /* not the desktop app */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setZoom(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ---------- the numbers ---------- */
  const stats = useMemo(() => {
    const done = rows.filter((r) => r.status === "done" || r.status === "imported");
    const byEngine = new Map<string, number>();
    let spent = 0;
    for (const r of done) {
      const id = r.made_with || "";
      const def = id ? findModel(id) : undefined;
      const name = def?.label ?? (id.startsWith("local:") ? `${id.slice(6)} (this computer)` : id || "earlier — engine not recorded");
      byEngine.set(name, (byEngine.get(name) ?? 0) + 1);
      spent += def?.priceUsd ?? 0;
    }
    return {
      made: done.length,
      today: done.filter((r) => r.generated_at && sameDay(r.generated_at)).length,
      waiting: rows.filter((r) => r.status === "pending" || r.status === "generating").length,
      failed: rows.filter((r) => r.status === "failed").length,
      spent,
      engines: [...byEngine.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [rows]);

  /* ---------- the list ---------- */
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const inBatch = batch === "all" ? null : new Set(batches.find((b) => b.id === batch)?.rowIds ?? []);
    return rows
      .filter((r) => (kind === "all" || kind === KIND_OF(r)) && (status === "all" || r.status === status))
      .filter((r) => !inBatch || inBatch.has(r.id))
      .filter((r) => !q || r.filename.toLowerCase().includes(q) || r.prompt.toLowerCase().includes(q))
      .sort((a, b) => (b.generated_at || "").localeCompare(a.generated_at || "") || b.id - a.id);
  }, [rows, kind, status, batch, batches, search]);
  const showPuppets = (kind === "all" || kind === "puppets") && status === "all" && batch === "all";
  const puppetsShown = puppets.filter((p) => !search.trim() || p.name.toLowerCase().includes(search.trim().toLowerCase()));
  const missingThumbs = rows.filter((r) => r.status === "done" && !r.preview).length;
  const marked = rows.filter((r) => r.status === "failed" || r.rating === "dislike").map((r) => r.id);

  const chip = (on: boolean) =>
    `rounded-full px-3 py-1.5 text-[12px] transition ${on ? "bg-[var(--color-ember)] text-[var(--color-on-accent)] font-semibold" : "border border-white/12 text-parch hover:border-[var(--color-ember)]"}`;
  const count = (k: Kind) => (k === "puppets" ? puppets.length : k === "all" ? rows.length + puppets.length : rows.filter((r) => KIND_OF(r) === k).length);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] text-cream">Made</h1>
          <p className="text-[13px] text-dust">Everything Image Forge has produced, newest first.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {stats.waiting > 0 &&
            (isRunning ? (
              <button className="forge-ghost px-4 py-2 text-[13px] text-cream" onClick={onStop} title="Stop now — pictures being made are put back in the queue">
                Stop
              </button>
            ) : (
              <button className="forge-primary px-4 py-2 text-[13px] text-[var(--color-on-accent)]" onClick={onRun} title="Make everything that is waiting">
                Make the {stats.waiting} waiting
              </button>
            ))}
          {marked.length > 0 && (
            <button
              className="forge-ghost px-4 py-2 text-[13px] text-parch"
              onClick={() => onRedo(marked)}
              title="Make again every picture marked ✕ or that failed. A note on a picture becomes an extra instruction."
            >
              Redo {marked.length} marked or failed
            </button>
          )}
          <button className="forge-ghost px-4 py-2 text-[13px] text-parch" onClick={onOpenTable} title="The spreadsheet view: every row, every column, editable — and CSV in and out">
            Edit as a table
          </button>
        </div>
      </div>

      {/* the numbers */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          ["made", stats.made, "pictures, sheets and GIFs that came out"],
          ["today", stats.today, "made since midnight"],
          ["waiting", stats.waiting, "in the queue"],
          ["failed", stats.failed, "need another try"],
          ["spent", stats.spent ? formatUsd(stats.spent) : "free", "on paid engines, by the price list"],
        ].map(([k, v, tip]) => (
          <div key={k as string} className="rounded-[20px] border border-white/10 bg-panel p-4" title={tip as string}>
            <p className="text-[10.5px] tracking-[0.18em] text-dust uppercase">{k}</p>
            <p className="mt-1 text-[24px] font-semibold text-cream">{v}</p>
          </div>
        ))}
      </div>
      {stats.engines.length > 0 && (
        <div className="rounded-[20px] border border-white/10 bg-panel p-4">
          <p className="mb-2 text-[10.5px] tracking-[0.18em] text-dust uppercase">by engine</p>
          <div className="space-y-1.5">
            {stats.engines.slice(0, 6).map(([name, n]) => (
              <div key={name} className="flex items-center gap-3 text-[12.5px]">
                <span className="w-56 shrink-0 truncate text-parch" title={name}>
                  {name}
                </span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
                  <i className="block h-full rounded-full bg-[var(--color-ember)]" style={{ width: `${(n / stats.made) * 100}%` }} />
                </span>
                <span className="w-10 text-right text-dust">{n}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* filters */}
      <div className="flex flex-wrap items-center gap-2">
        {(["all", "pictures", "sheets", "motion", "vectors", "puppets"] as Kind[]).map((k) => (
          <button key={k} className={chip(kind === k)} onClick={() => setKind(k)}>
            {k === "all" ? "Everything" : k === "motion" ? "GIFs" : k[0].toUpperCase() + k.slice(1)} · {count(k)}
          </button>
        ))}
        <select value={status} onChange={(e) => setStatus(e.target.value as Status | "all")} className="rounded-full border border-white/12 bg-[var(--color-field)] px-3 py-1.5 text-[12px] text-cream">
          <option value="all">any status</option>
          {(["done", "pending", "failed", "skipped", "imported"] as Status[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_WORD[s]}
            </option>
          ))}
        </select>
        {batches.length > 0 && (
          <select value={batch} onChange={(e) => setBatch(e.target.value)} className="rounded-full border border-white/12 bg-[var(--color-field)] px-3 py-1.5 text-[12px] text-cream" title="Pictures made together, in one go">
            <option value="all">every batch</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} · {new Date(b.createdAt).toLocaleDateString("en-GB")}
              </option>
            ))}
          </select>
        )}
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="search names and prompts" className="ml-auto w-56 rounded-full border border-white/12 bg-[var(--color-field)] px-3 py-1.5 text-[12px] text-cream placeholder:text-dust" />
      </div>

      {missingThumbs > 0 && onBackfill && (
        <p className="text-[12px] text-dust">
          {missingThumbs} made before pictures were kept here have no picture.{" "}
          <button
            className="text-[var(--color-ember)] underline"
            onClick={async () => {
              setFilling("looking in your folder…");
              const n = await onBackfill();
              setFilling(n ? `found ${n}` : "none found in the linked folder");
            }}
          >
            Find them in my folder
          </button>{" "}
          {filling}
        </p>
      )}

      {/* the list */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {showPuppets &&
          puppetsShown.map((p) => (
            <div key={`p-${p.slug}`} className="overflow-hidden rounded-[20px] border border-white/10 bg-panel">
              <button
                className="block aspect-square w-full bg-[radial-gradient(circle_at_50%_35%,#1a2a52,#0a1122_70%)] cursor-zoom-in"
                onClick={() => puppetThumbs[p.slug] && setZoom({ url: puppetThumbs[p.slug], caption: `${p.name} — a puppet for Video Forge` })}
              >
                {puppetThumbs[p.slug] && <img src={puppetThumbs[p.slug]} alt="" className="h-full w-full object-contain" />}
              </button>
              <div className="space-y-0.5 p-3">
                <p className="truncate text-[13px] font-medium text-cream">{p.name}</p>
                <p className="text-[11px] text-dust">puppet · {p.framing === "waist" ? "waist up" : "head"} · {when(p.madeAt)}</p>
                <p className="text-[11px] text-emerald-300">in Video Forge</p>
              </div>
            </div>
          ))}
        {shown.map((r) => (
          <div key={r.id} className="overflow-hidden rounded-[20px] border border-white/10 bg-panel">
            <button
              className="block aspect-square w-full bg-black/40 cursor-zoom-in"
              onClick={() => r.preview && !r.preview.trimStart().startsWith("<svg") && setZoom({ url: r.preview, caption: `${r.filename} — ${r.prompt.slice(0, 140)}` })}
              title={r.prompt}
            >
              {r.preview ? (
                r.preview.trimStart().startsWith("<svg") ? (
                  <span className="block h-full w-full [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: r.preview }} />
                ) : (
                  <img src={r.preview} alt="" className="h-full w-full object-cover" />
                )
              ) : (
                <span className="grid h-full place-items-center text-[11px] text-dust">{r.status === "done" ? "no picture kept" : STATUS_WORD[r.status]}</span>
              )}
            </button>
            <div className="space-y-1 p-3">
              <p className="truncate text-[12.5px] font-medium text-cream" title={r.filename}>
                {r.filename}
              </p>
              <p className="text-[11px] text-dust">
                <span className={r.status === "failed" ? "text-blood" : r.status === "done" ? "text-moss" : ""}>{STATUS_WORD[r.status] ?? r.status}</span>
                {r.generated_at && ` · ${when(r.generated_at)}`}
              </p>
              {r.status === "failed" && r.error && (
                <p className="line-clamp-2 text-[10.5px] text-dust" title={r.error}>
                  {r.error}
                </p>
              )}
              <div className="flex flex-wrap gap-1.5 pt-1">
                <button className="forge-ghost px-2.5 py-1 text-[11px] text-parch" onClick={() => onRedo([r.id])} title="Make it again, the same way">
                  Redo
                </button>
                <button
                  className={`forge-ghost px-2.5 py-1 text-[11px] ${r.rating === "like" ? "text-moss" : "text-parch"}`}
                  onClick={() => updateRow(r.id, { rating: r.rating === "like" ? undefined : "like" })}
                  title="Keep this one"
                >
                  ♥
                </button>
                <button
                  className={`forge-ghost px-2.5 py-1 text-[11px] ${r.rating === "dislike" ? "text-blood" : "text-parch"}`}
                  onClick={() => updateRow(r.id, { rating: r.rating === "dislike" ? undefined : "dislike" })}
                  title="Not this one — mark it to redo"
                >
                  ✕
                </button>
                {onMakeGif && r.status === "done" && r.category !== "gif" && (
                  <button className="forge-ghost px-2.5 py-1 text-[11px] text-parch" onClick={() => onMakeGif(r)} title="Turn it into a short moving GIF">
                    GIF
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      {!shown.length && !(showPuppets && puppetsShown.length) && <p className="py-10 text-center text-[13px] text-dust">Nothing here yet.</p>}

      {zoom && (
        <div className="forge-zoom" onClick={() => setZoom(null)} role="dialog" aria-label="Picture, large">
          <div onClick={(e) => e.stopPropagation()} className="cursor-default">
            <img src={zoom.url} alt="" />
            <p>{zoom.caption} · Esc or click outside to close</p>
          </div>
        </div>
      )}
    </div>
  );
}
