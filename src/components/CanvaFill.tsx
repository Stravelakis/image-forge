/**
 * "Fill a Canva template" (13 Oct 2026): pick one of your Canva brand
 * templates, paste a list (straight from Google Sheets or Excel — the first
 * row is the column names), and get one finished design per row, back in Made
 * and in your folder. Picture fields take a file name of something in Made;
 * it is uploaded to Canva first.
 *
 * Canva's own Bulk Create, driven from here — which its kit does not offer
 * directly, so it is done one row at a time (Canva allows 60 a minute).
 */
import { useEffect, useMemo, useState } from "react";
import type { ManifestRow } from "../types";
import type { ForgeSettings } from "../lib/providers";
import { canvaDataset, canvaFill, canvaTemplates, canvaUpload } from "../lib/canva";

type Field = { name: string; type: "text" | "image" | "chart" };

/** A pasted table: tabs from a spreadsheet, or commas. First row = names. */
export function parsePasted(text: string): { head: string[]; rows: string[][] } {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  if (!lines.length) return { head: [], rows: [] };
  const sep = lines[0].includes("\t") ? "\t" : ",";
  const cells = lines.map((l) => l.split(sep).map((c) => c.trim().replace(/^"(.*)"$/, "$1")));
  return { head: cells[0], rows: cells.slice(1) };
}

export default function CanvaFill({
  settings,
  rows,
  getPicture,
  onMade,
  onClose,
  onOpenSettings,
}: {
  settings: ForgeSettings;
  rows: ManifestRow[];
  getPicture: (row: ManifestRow) => Promise<Blob | null>;
  onMade: (name: string, blob: Blob, note: string) => Promise<void>;
  onClose: () => void;
  onOpenSettings: () => void;
}) {
  const [templates, setTemplates] = useState<{ id: string; title: string; thumbnail?: { url: string } }[] | null>(null);
  const [problem, setProblem] = useState("");
  const [pick, setPick] = useState<string>("");
  const [fields, setFields] = useState<Field[]>([]);
  const [pasted, setPasted] = useState("");
  const [map, setMap] = useState<Record<string, number>>({});
  const [progress, setProgress] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    canvaTemplates(settings)
      .then(setTemplates)
      .catch((e) => setProblem(String((e as Error).message)));
  }, [settings]);

  useEffect(() => {
    if (!pick) return;
    setFields([]);
    canvaDataset(settings, pick)
      .then((d) => setFields(Object.entries(d).map(([name, v]) => ({ name, type: v.type }))))
      .catch((e) => setProblem(String((e as Error).message)));
  }, [pick, settings]);

  const table = useMemo(() => parsePasted(pasted), [pasted]);
  // Columns named like a field are matched to it by themselves.
  useEffect(() => {
    const m: Record<string, number> = {};
    for (const f of fields) {
      const i = table.head.findIndex((h) => h.toLowerCase() === f.name.toLowerCase());
      if (i >= 0) m[f.name] = i;
    }
    setMap(m);
  }, [fields, table.head]);

  const run = async () => {
    setBusy(true);
    setProblem("");
    const uploaded = new Map<string, string>();
    const log = (s: string) => setProgress((p) => [...p, s]);
    const title = templates?.find((t) => t.id === pick)?.title ?? "canva";
    for (const [n, row] of table.rows.entries()) {
      try {
        const data: Record<string, { type: "text"; text: string } | { type: "image"; asset_id: string }> = {};
        for (const f of fields) {
          const col = map[f.name];
          if (col === undefined) continue;
          const v = row[col] ?? "";
          if (!v) continue;
          if (f.type === "text") data[f.name] = { type: "text", text: v };
          else if (f.type === "image") {
            const made = rows.find((r) => r.filename === v || r.filename.replace(/\.[a-z]+$/i, "") === v);
            if (!made) throw new Error(`no picture called "${v}" in Made`);
            if (!uploaded.has(made.filename)) {
              const blob = await getPicture(made);
              if (!blob) throw new Error(`"${v}" is not on this computer any more`);
              uploaded.set(made.filename, await canvaUpload(settings, made.filename, blob));
            }
            data[f.name] = { type: "image", asset_id: uploaded.get(made.filename)! };
          }
        }
        const r = await canvaFill(settings, pick, data, `${title} · ${n + 1}`);
        await onMade(`canva_${title.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 30)}_${n + 1}.png`, r.blob, r.designUrl);
        log(`✓ row ${n + 1}`);
      } catch (e) {
        log(`✗ row ${n + 1}: ${(e as Error).message}`);
      }
    }
    setBusy(false);
  };

  const box = "rounded-[18px] border border-line bg-black/30 p-4";
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm" onClick={onClose} data-tip="Click outside to close.">
      <div className="my-6 w-full max-w-4xl space-y-4 rounded-2xl border border-line bg-panel p-6" onClick={(e) => e.stopPropagation()} data-tip="Fill one of your Canva templates from a list.">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-display text-[20px] text-cream">Fill a Canva template</p>
            <p className="text-[12.5px] text-dust">One finished design per row of your list — back here in Made.</p>
          </div>
          <button className="forge-ghost px-4 py-2 text-[13px] text-parch" onClick={onClose} data-tip="Close without making anything.">
            Close
          </button>
        </div>

        {problem && (
          <div className="rounded-lg border border-ember/40 bg-ember/10 p-3 text-[13px] text-cream">
            {problem}{" "}
            <button className="underline" onClick={onOpenSettings} data-tip="Settings → Canva: connect your Canva account.">
              Settings → Canva
            </button>
          </div>
        )}

        <div className={box}>
          <p className="mb-2 text-[12px] uppercase tracking-[0.14em] text-dust">1 · your template</p>
          {!templates ? (
            <p className="text-[13px] text-parch">Asking Canva…</p>
          ) : templates.length === 0 ? (
            <p className="text-[13px] text-parch">No brand templates in your Canva yet. In Canva, make a design, add fields with the “Data autofill” app, and publish it as a brand template.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setPick(t.id)}
                  className={`rounded-[14px] border p-2 text-left text-[12px] ${pick === t.id ? "border-ember/70 bg-ember/10 text-cream" : "border-line text-parch"}`}
                  data-tip={`Use “${t.title}”.`}
                >
                  {t.thumbnail?.url && <img src={t.thumbnail.url} alt="" className="mb-1 aspect-video w-full rounded-lg object-cover" />}
                  {t.title}
                </button>
              ))}
            </div>
          )}
        </div>

        {pick && (
          <div className={box}>
            <p className="mb-2 text-[12px] uppercase tracking-[0.14em] text-dust">2 · your list</p>
            <p className="mb-2 text-[12.5px] text-parch">
              Copy the rows from Google Sheets or Excel (with the column names on top) and paste here. This template’s fields:{" "}
              {fields.map((f) => `${f.name} (${f.type === "image" ? "a picture's file name from Made" : f.type})`).join(", ") || "…"}
            </p>
            <textarea
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              rows={6}
              className="w-full rounded-lg border border-line bg-[var(--color-field)] p-3 font-mono text-[12px] text-cream"
              placeholder={fields.length ? fields.map((f) => f.name).join("\t") : "column names on the first line"}
              data-tip="Paste your table here: first line the column names, one design per line after it."
            />
            {table.head.length > 0 && (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {fields.map((f) => (
                  <label key={f.name} className="flex items-center gap-2 text-[12.5px] text-parch">
                    <span className="w-40 truncate text-cream">{f.name}</span>
                    <select
                      value={map[f.name] ?? ""}
                      onChange={(e) => setMap((m) => ({ ...m, [f.name]: e.target.value === "" ? (undefined as unknown as number) : Number(e.target.value) }))}
                      className="flex-1 rounded-lg border border-line bg-[var(--color-field)] px-2 py-1.5 text-cream"
                      data-tip={`Which column fills “${f.name}”.`}
                    >
                      <option value="">— leave as it is —</option>
                      {table.head.map((h, i) => (
                        <option key={i} value={i}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {pick && table.rows.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <button className="forge-primary px-6 py-2.5 text-[14px] text-[var(--color-on-accent)]" disabled={busy} onClick={() => void run()} data-tip="Makes one design per row in Canva and brings each one back here as a picture.">
              {busy ? "Making…" : `Make ${table.rows.length} design${table.rows.length === 1 ? "" : "s"}`}
            </button>
            <span className="text-[12.5px] text-dust">About 10–20 seconds each.</span>
          </div>
        )}
        {progress.length > 0 && <pre className="max-h-48 overflow-auto rounded-lg bg-black/40 p-3 text-[12px] text-parch">{progress.join("\n")}</pre>}
      </div>
    </div>
  );
}
