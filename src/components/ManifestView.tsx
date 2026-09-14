import { useEffect, useRef, useState } from "react";
import type { Category, LogEntry, ManifestRow, Status } from "../types";
import { ASPECT_KEYS, ASPECTS, CATEGORIES, STATUS_META } from "../types";
import { autoFixFilename, validateFilename } from "../lib/validate";
import { formatCountdown, modelOptions } from "../lib/providers";
import {
  Btn,
  CatChip,
  IAlert,
  ICheck,
  IDownload,
  IHammer,
  IPlus,
  IQuill,
  IRetry,
  ISearch,
  ITrash,
  IUpload,
  IX,
  Lightbox,
  Modal,
  StatusChip,
} from "./ui";

export interface ManifestViewProps {
  rows: ManifestRow[];
  allRows: ManifestRow[];
  filenameRules: Record<string, boolean>;
  total: number;
  search: string;
  setSearch: (s: string) => void;
  statusFilter: Status | "all";
  setStatusFilter: (s: Status | "all") => void;
  catFilter: Category | "all";
  setCatFilter: (c: Category | "all") => void;
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  openScribe: (id: number) => void;
  startWizard: () => void;
  addRow: () => void;
  updateRow: (id: number, patch: Partial<ManifestRow>) => void;
  deleteRow: (id: number) => void;
  duplicateRow: (id: number) => void;
  generateOne: (id: number) => void;
  forceRetry: (id: number) => void;
  setToPending: (id: number) => void;
  markSkipped: (id: number) => void;
  markImported: (id: number) => void;
  downloadRow: (id: number) => void;
  importCsv: (text: string, mode: "merge" | "replace", forgeAfter: boolean) => void;
  exportCsv: () => void;
  exportXlsx: () => void;
  compare: null | { rowId: number; variantSeed: number; variant: string };
  strikeVariant: (id: number) => void;
  keepVariant: (id: number) => void;
  discardVariant: () => void;
  log: LogEntry[];
  isRunning: boolean;
  styleLock: string;
  appendStyle: boolean;
  setAppendStyle: (b: boolean) => void;
}

const timeAgo = (iso: string) => {
  if (!iso) return "—";
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.floor(d / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

/**
 * A row's picture.
 *
 * `width` exists because this is used in two places that want very different
 * sizes: the table, where 64px tells one row from another, and the detail
 * panel, where you have opened the row precisely to LOOK at it. Both were
 * pinned at 64px, which made the panel preview a thumbnail of a thumbnail.
 *
 * `onOpen` turns it into a button. `object-contain` rather than `object-cover`
 * at panel size: cropping the edges off a sprite to fill a box hides the very
 * framing you are checking.
 */
const Thumb = ({
  row,
  width = 64,
  onOpen,
}: {
  row: ManifestRow;
  width?: number;
  onOpen?: () => void;
}) => {
  const dims = ASPECTS[row.aspect_ratio];
  const ratio = dims.w / dims.h;
  const height = Math.round(width / ratio);
  if (!row.preview) {
    return (
      <div
        className={`flex items-center justify-center overflow-hidden rounded-lg border border-dashed border-line2 bg-[var(--color-field)] ${
          row.status === "generating" ? "shimmer" : ""
        }`}
        style={{ width, height }}
      >
        {row.status === "generating" ? <IHammer size={16} className="hammer-swing text-ember" /> : <span className="font-mono text-[9px] text-dust">{row.aspect_ratio}</span>}
      </div>
    );
  }
  // Only a bare <svg …> string can be dropped into the page as markup. A
  // data: URL is a URL: put one in innerHTML and you get an empty box, so
  // every URL — svg or not — goes to <img> instead.
  const isSvg = row.preview.trimStart().startsWith("<svg");
  const big = width > 120;
  const inner = isSvg ? (
    <div className="develop h-full w-full" dangerouslySetInnerHTML={{ __html: row.preview }} />
  ) : (
    <img src={row.preview} alt={row.filename} className={`develop h-full w-full ${big ? "object-contain" : "object-cover"}`} />
  );
  const box = (
    <div
      className={`overflow-hidden rounded-lg border border-line shadow-[0_4px_14px_rgba(0,0,0,0.35)] ${onOpen ? "" : "thumb-zoom"}`}
      style={{ width, height }}
    >
      {inner}
    </div>
  );
  if (!onOpen) return box;
  return (
    <button
      onClick={onOpen}
      title="Open it full size"
      className="btn-press cursor-zoom-in rounded-lg transition hover:brightness-110"
    >
      {box}
    </button>
  );
};

export default function ManifestView(p: ManifestViewProps) {
  const [importOpen, setImportOpen] = useState(false);
  const selected = p.allRows.find((r) => r.id === p.selectedId) ?? null;
  const logRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [p.log]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-coal/50 px-4 py-2.5">
        <div className="flex items-center gap-2 rounded-lg border border-line bg-[var(--color-field)] px-2.5 py-1.5">
          <ISearch size={13} className="text-dust" />
          <input
            value={p.search}
            onChange={(e) => p.setSearch(e.target.value)}
            placeholder="search manifest…"
            className="w-40 bg-transparent text-[12.5px] text-cream placeholder:text-dust/70"
          />
        </div>
        <select
          value={p.statusFilter}
          onChange={(e) => p.setStatusFilter(e.target.value as Status | "all")}
          className="rounded-lg border border-line bg-[var(--color-field)] px-2 py-1.5 font-mono text-[11.5px] text-parch"
        >
          <option value="all">all statuses</option>
          {Object.keys(STATUS_META).map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={p.catFilter}
          onChange={(e) => p.setCatFilter(e.target.value as Category | "all")}
          className="rounded-lg border border-line bg-[var(--color-field)] px-2 py-1.5 font-mono text-[11.5px] text-parch"
        >
          <option value="all">all categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <span className="font-mono text-[10.5px] text-dust">
          {p.rows.length}/{p.total} rows
        </span>
        <div className="ml-auto flex items-center gap-2">
          {/* Import stays here, beside the table it fills. The three ways to
              download moved into one "Download" menu in the top bar — they
              were three buttons wearing the same arrow across two rows. */}
          <Btn onClick={() => setImportOpen(true)} title="Read a CSV file into the manifest. Missing columns are forgiven.">
            <IUpload size={13} /> Import CSV
          </Btn>
          <Btn variant="primary" onClick={p.addRow} title="Add one empty row to fill in yourself">
            <IPlus size={13} /> Add a picture
          </Btn>
        </div>
      </div>

      {/* table */}
      <div className="min-h-0 flex-1 overflow-auto">
        {p.rows.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
            <p className="font-display text-2xl text-cream">The workbench is empty.</p>
            <p className="max-w-sm text-[13.5px] leading-relaxed text-parch">
              Start with the wizard — it walks you through one easy choice at a time and lays out a whole batch of pictures for you.
            </p>
            <div className="flex gap-2">
              <Btn variant="primary" onClick={p.startWizard}>
                <IHammer size={13} /> Start the wizard
              </Btn>
              <Btn onClick={p.addRow}>
                <IPlus size={13} /> Add a row
              </Btn>
              <Btn onClick={() => setImportOpen(true)}>
                <IUpload size={13} /> Import CSV
              </Btn>
            </div>
          </div>
        ) : (
          <table className="w-full border-collapse text-left">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-line bg-[#1c1510] font-mono text-[9.5px] tracking-[0.18em] text-dust uppercase">
                {["preview / filename", "category", "model", "aspect", "status", "generated", ""].map((h, i) => (
                  <th key={i} className="px-3 py-2.5 font-medium first:pl-4">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {p.rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => p.onSelect(row.id)}
                  className={`cursor-pointer border-b border-line/50 transition-colors ${
                    p.selectedId === row.id ? "bg-ember/8" : "hover:bg-raise/40"
                  }`}
                >
                  <td className="px-3 py-2.5 first:pl-4">
                    <div className="flex items-center gap-3">
                      <Thumb row={row} />
                      <div className="min-w-0">
                        <p className="truncate font-mono text-[12px] text-cream">{row.filename}</p>
                        <p className="mt-0.5 max-w-[300px] truncate text-[11px] text-dust">
                          {row.note ? <span className="text-ember">✎ {row.note}</span> : row.prompt || "— no prompt yet"}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <CatChip category={row.category} />
                  </td>
                  <td className="px-3 py-2.5">
                    {row.model ? (
                      <span className="rounded-md border border-potion/35 bg-potion/8 px-1.5 py-0.5 font-mono text-[10.5px] text-potion">{row.model}</span>
                    ) : (
                      <span className="font-mono text-[10.5px] text-dust/60">default</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[12px] text-parch">{row.aspect_ratio}</td>
                  <td className="px-3 py-2.5">
                    <StatusChip status={row.status} pulse={row.status === "generating"} />
                    {row.retry_at && Date.parse(row.retry_at) > Date.now() && (
                      <span className="mt-1 block font-mono text-[9.5px] text-ember">retry {formatCountdown(Date.parse(row.retry_at))}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-dust">{timeAgo(row.generated_at)}</td>
                  <td className="px-3 py-2.5">
                    {(row.status === "pending" || row.status === "failed" || row.status === "skipped") && !p.isRunning && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          p.generateOne(row.id);
                        }}
                        title="Generate this row"
                        className="btn-press rounded-lg border border-ember/40 bg-ember/10 p-1.5 text-ember hover:bg-ember/25"
                      >
                        <IHammer size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* console strip */}
      <div className="shrink-0 border-t border-line bg-[#161009]">
        <div className="flex items-center gap-2 px-4 pt-2">
          <span className={`h-1.5 w-1.5 rounded-full ${p.isRunning ? "pulse-dot bg-ember" : "bg-dust/50"}`} />
          <span className="font-mono text-[9.5px] tracking-[0.22em] text-dust uppercase">forge console</span>
        </div>
        <div ref={logRef} className="h-[92px] overflow-y-auto px-4 py-2 font-mono text-[11px] leading-[1.55]">
          {p.log.length === 0 && <p className="text-dust/60">— quiet so far. Light the forge with Run queue.</p>}
          {p.log.map((l, i) => (
            <p key={i} className={l.kind === "ok" ? "text-moss" : l.kind === "err" ? "text-blood" : l.kind === "run" ? "text-ember" : "text-parch/80"}>
              <span className="text-dust/60">[{l.t}]</span> {l.msg}
            </p>
          ))}
        </div>
      </div>

      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={(text, mode, forge) => {
          p.importCsv(text, mode, forge);
          setImportOpen(false);
        }}
      />

      {selected && <RowDrawer row={selected} {...p} />}
    </div>
  );
}

/* ---------------- row drawer ---------------- */

const field = "w-full rounded-lg border border-line bg-[var(--color-field)] px-3 py-2 text-[13px] text-cream placeholder:text-dust/60";

function RowDrawer(p: ManifestViewProps & { row: ManifestRow }) {
  const { row, updateRow, deleteRow, duplicateRow, generateOne, forceRetry, setToPending, markSkipped, markImported, downloadRow, openScribe, onSelect, compare, strikeVariant, keepVariant, discardVariant } = p;
  const checks = validateFilename(row.filename, row.category, p.allRows.map((x) => ({ id: x.id, filename: x.filename })), row.id, p.filenameRules);
  const bad = checks.filter((c) => !c.pass);
  /** The picture being shown full size, if any: the row's own, or a variant. */
  const [zoom, setZoom] = useState<{ src: string; label: string } | null>(null);

  return (
    <aside className="slide-in-right flex h-full w-[400px] shrink-0 flex-col overflow-y-auto border-l border-line bg-coal/80 p-4 backdrop-blur">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-[15px] tracking-wide text-cream">Row #{row.id}</h3>
        <div className="flex items-center gap-2">
          <StatusChip status={row.status} pulse={row.status === "generating"} />
          <button onClick={() => onSelect(null)} className="btn-press rounded-lg p-1.5 text-dust hover:bg-raise hover:text-cream">
            <IX size={14} />
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {/* preview */}
        <div className="flex flex-col items-center gap-2 rounded-xl border border-line bg-[var(--color-field)] p-3">
          <Thumb row={row} width={272} onOpen={row.preview ? () => setZoom({ src: row.preview!, label: row.filename }) : undefined} />
          {row.preview && (
            <button
              onClick={() => setZoom({ src: row.preview!, label: row.filename })}
              className="btn-press font-mono text-[10px] text-ember underline decoration-ember/40 underline-offset-2"
            >
              open full size
            </button>
          )}
        </div>

        {/* filename */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="font-mono text-[10px] tracking-[0.2em] text-dust uppercase">filename</label>
            <button
              onClick={() => updateRow(row.id, { filename: autoFixFilename(row.filename, row.category) })}
              className="btn-press font-mono text-[10px] text-ember underline decoration-ember/40 underline-offset-2"
            >
              auto-fix
            </button>
          </div>
          <input value={row.filename} onChange={(e) => updateRow(row.id, { filename: e.target.value })} className={field} />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {checks.map((c) => (
              <span
                key={c.id}
                title={c.detail}
                className={`flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[9.5px] ${
                  c.pass ? "border-moss/35 bg-moss/8 text-moss" : "border-blood/40 bg-blood/8 text-blood"
                }`}
              >
                {c.pass ? <ICheck size={9} /> : <IX size={9} />} {c.label}
              </span>
            ))}
          </div>
        </div>

        {/* category + aspect */}
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="mb-1.5 block font-mono text-[10px] tracking-[0.2em] text-dust uppercase">category</label>
            <select value={row.category} onChange={(e) => updateRow(row.id, { category: e.target.value as Category })} className={field}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block font-mono text-[10px] tracking-[0.2em] text-dust uppercase">aspect</label>
            <select value={row.aspect_ratio} onChange={(e) => updateRow(row.id, { aspect_ratio: e.target.value as (typeof ASPECT_KEYS)[number] })} className={field}>
              {ASPECT_KEYS.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
        </div>

        {/* prompt */}
        <div>
          <label className="mb-1.5 block font-mono text-[10px] tracking-[0.2em] text-dust uppercase">prompt</label>
          <textarea value={row.prompt} onChange={(e) => updateRow(row.id, { prompt: e.target.value })} rows={4} className={`${field} resize-y`} />
          <label className="mt-2 flex cursor-pointer items-center gap-2 text-[11px] text-dust">
            <input type="checkbox" checked={p.appendStyle} onChange={(e) => p.setAppendStyle(e.target.checked)} className="accent-[var(--color-ember)]" />
            append the “{p.styleLock}” style block when generating
          </label>
        </div>

        {/* negative prompt */}
        <div>
          <label className="mb-1.5 block font-mono text-[10px] tracking-[0.2em] text-dust uppercase">negative prompt · what to avoid</label>
          <textarea
            value={row.negative_prompt ?? ""}
            onChange={(e) => updateRow(row.id, { negative_prompt: e.target.value || undefined })}
            rows={2}
            placeholder="text, watermark, extra fingers…"
            className={`${field} resize-y`}
          />
        </div>

        {/* model + seed */}
        <div className="grid grid-cols-[1fr_92px] gap-2.5">
          <div>
            <label className="mb-1.5 block font-mono text-[10px] tracking-[0.2em] text-dust uppercase">model · blank = default engine</label>
            <input value={row.model} onChange={(e) => updateRow(row.id, { model: e.target.value })} list="forge-models" placeholder="imagen-4-ultra, flux…" className={field} />
            <datalist id="forge-models">
              {modelOptions.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="mb-1.5 block font-mono text-[10px] tracking-[0.2em] text-dust uppercase">seed</label>
            <input type="number" value={row.seed} onChange={(e) => updateRow(row.id, { seed: parseInt(e.target.value, 10) || 0 })} className={field} />
          </div>
        </div>

        {/* note */}
        <div>
          <label className="mb-1.5 block font-mono text-[10px] tracking-[0.2em] text-dust uppercase">note · becomes an instruction on redo</label>
          <input
            value={row.note ?? ""}
            onChange={(e) => updateRow(row.id, { note: e.target.value || undefined })}
            placeholder="e.g. warmer light, bigger goat"
            className={field}
          />
        </div>

        {/* errors + cooldown */}
        {row.error && (
          <div className="rounded-lg border border-blood/30 bg-blood/8 px-3 py-2">
            <p className="font-mono text-[10px] tracking-[0.2em] text-blood uppercase">last error</p>
            <p className="mt-1 font-mono text-[11.5px] text-blood/90">{row.error}</p>
          </div>
        )}
        {row.retry_at && Date.parse(row.retry_at) > Date.now() && (
          <div className="rounded-lg border border-ember/35 bg-ember/8 px-3 py-2.5">
            <p className="font-mono text-[10px] tracking-[0.2em] text-ember uppercase">rate-limit cooldown</p>
            <p className="mt-1 text-[12px] text-parch">
              the queue retries in <span className="font-mono text-ember">{formatCountdown(Date.parse(row.retry_at))}</span>
            </p>
            <button
              onClick={() => forceRetry(row.id)}
              className="btn-press mt-2 rounded-md border border-ember/50 bg-ember/12 px-2.5 py-1 font-mono text-[10.5px] tracking-wide text-ember uppercase hover:bg-ember/25"
            >
              ⚡ force retry now
            </button>
          </div>
        )}

        {/* variant compare */}
        {compare && compare.rowId === row.id && (
          <div className="rounded-xl border border-potion/40 bg-potion/6 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="font-mono text-[10px] tracking-[0.2em] text-potion uppercase">variant · seed {compare.variantSeed}</p>
              <button onClick={discardVariant} className="btn-press font-mono text-[10px] text-dust hover:text-cream">✕ dismiss</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <figure>
                <Thumb
                  row={row}
                  width={168}
                  onOpen={row.preview ? () => setZoom({ src: row.preview!, label: `${row.filename} · original` }) : undefined}
                />
                <figcaption className="mt-1 text-center font-mono text-[9.5px] text-dust">original · seed {row.seed}</figcaption>
              </figure>
              <figure className="pop-in">
                <button
                  onClick={() => setZoom({ src: compare.variant, label: `${row.filename} · variant seed ${compare.variantSeed}` })}
                  title="Open it full size"
                  className="btn-press block w-[168px] cursor-zoom-in overflow-hidden rounded-lg border border-potion/50 transition hover:brightness-110">
                  {compare.variant.trimStart().startsWith("<svg") ? (
                    <div className="h-full w-full [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: compare.variant }} />
                  ) : (
                    <img src={compare.variant} alt="variant" className="h-full w-full object-contain" />
                  )}
                </button>
                <figcaption className="mt-1 text-center font-mono text-[9.5px] text-potion">variant · seed {compare.variantSeed}</figcaption>
              </figure>
            </div>
            <div className="mt-2.5 flex gap-2">
              <Btn variant="moss" className="flex-1 justify-center" onClick={() => keepVariant(row.id)}>
                <ICheck size={13} /> Keep variant
              </Btn>
              <Btn className="flex-1 justify-center" onClick={discardVariant}>
                <IX size={13} /> Keep original
              </Btn>
            </div>
          </div>
        )}

        {/* actions */}
        <div className="grid grid-cols-2 gap-2">
          <Btn variant="primary" className="justify-center" disabled={p.isRunning} onClick={() => generateOne(row.id)}>
            <IHammer size={13} /> Generate
          </Btn>
          <Btn className="justify-center" disabled={!row.preview} onClick={() => strikeVariant(row.id)}>
            <IRetry size={13} /> Variant
          </Btn>
          <Btn className="justify-center" disabled={!row.preview} onClick={() => downloadRow(row.id)}>
            <IDownload size={13} /> Save picture
          </Btn>
          <Btn className="justify-center" onClick={() => openScribe(row.id)} title="Open the chat with this row, to rewrite its prompt, rename it or change its look">
            <IQuill size={13} /> Ask the chat
          </Btn>
          <Btn className="justify-center" onClick={() => duplicateRow(row.id)}>
            <IPlus size={13} /> Duplicate
          </Btn>
          {(row.status === "failed" || row.status === "skipped" || row.status === "done") && (
            <Btn className="justify-center" onClick={() => setToPending(row.id)}>
              <IRetry size={13} /> To pending
            </Btn>
          )}
          {row.status !== "skipped" && row.status !== "imported" && (
            <Btn className="justify-center" onClick={() => markSkipped(row.id)}>
              <IX size={13} /> Skip
            </Btn>
          )}
          {row.status === "done" && (
            <Btn variant="moss" className="justify-center" onClick={() => markImported(row.id)}>
              <ICheck size={13} /> Mark imported
            </Btn>
          )}
          <Btn variant="danger" className="justify-center" onClick={() => deleteRow(row.id)}>
            <ITrash size={13} /> Delete
          </Btn>
        </div>
        {bad.length > 0 && (
          <p className="flex items-start gap-2 text-[11px] text-dust">
            <IAlert size={12} className="mt-0.5 shrink-0 text-ember" />
            The queue still runs rows with filename warnings — fix them before you hand files to another project.
          </p>
        )}
      </div>
    </aside>
  );
}

/* ---------------- import modal ---------------- */

function ImportModal({
  open,
  onClose,
  onImport,
}: {
  open: boolean;
  onClose: () => void;
  onImport: (text: string, mode: "merge" | "replace", forgeAfter: boolean) => void;
}) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [forgeAfter, setForgeAfter] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  return (
    <Modal open={open} onClose={onClose} title="Import a CSV manifest">
      <div className="space-y-4">
        <p className="text-[13px] leading-relaxed text-parch">
          Anything with a header row works — the forge reads <span className="font-mono text-cream">filename, prompt, negative_prompt, category, style, aspect_ratio, model, status</span> and fills the rest with defaults. Only <span className="font-mono text-cream">filename</span> is required.
        </p>
        <div className="flex gap-2">
          <Btn onClick={() => fileRef.current?.click()}>
            <IUpload size={13} /> Choose .csv file
          </Btn>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) setText(await f.text());
              e.target.value = "";
            }}
          />
          <span className="self-center font-mono text-[10.5px] text-dust">or paste below</span>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={7}
          placeholder={"filename,prompt,category,model\nshop_tavern.png,\"ramshackle tavern at dusk\",shop,imagen-4-ultra"}
          className={`${field} resize-y font-mono text-[11.5px]`}
        />
        <div className="flex items-center gap-4">
          <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-parch">
            <input type="radio" checked={mode === "merge"} onChange={() => setMode("merge")} className="accent-[var(--color-ember)]" />
            merge into the manifest
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-parch">
            <input type="radio" checked={mode === "replace"} onChange={() => setMode("replace")} className="accent-[var(--color-ember)]" />
            replace everything
          </label>
        </div>
        <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-ember/30 bg-ember/6 px-3.5 py-2.5">
          <input type="checkbox" checked={forgeAfter} onChange={(e) => setForgeAfter(e.target.checked)} className="mt-0.5 accent-[var(--color-ember)]" />
          <span className="text-[12.5px] leading-snug text-parch">
            <span className="font-semibold text-ember">forge immediately after import</span>
            <span className="block text-[11px] text-dust">every pending row in the CSV goes straight into the queue — CSV in, images out</span>
          </span>
        </label>
        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" disabled={!text.trim()} onClick={() => onImport(text, mode, forgeAfter)}>
            <ICheck size={13} /> {forgeAfter ? "Import & forge" : "Import rows"}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
