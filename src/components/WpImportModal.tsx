import { SUBFOLDERS } from "../lib/output";
import { useMemo, useState } from "react";
import type { ManifestRow, Toast } from "../types";
import type { ForgeSettings } from "../lib/providers";
import { CATEGORY_FOLDER } from "../lib/output";
import type { Batch } from "../lib/batches";
import { Btn, ICheck, IUpload, Modal } from "./ui";

export default function WpImportModal({
  open,
  onClose,
  settings,
  patchSettings,
  rows,
  batches,
  getBlob,
  patchRow,
  pushToast,
}: {
  open: boolean;
  onClose: () => void;
  settings: ForgeSettings;
  patchSettings: (p: Partial<ForgeSettings>) => void;
  rows: ManifestRow[];
  batches: Batch[];
  getBlob: (r: ManifestRow) => Promise<Blob | null>;
  patchRow: (id: number, patch: Partial<ManifestRow>) => void;
  pushToast: (kind: Toast["kind"], msg: string) => void;
}) {
  const [batchId, setBatchId] = useState<string>("all");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; ok: number; failed: number; current: string }>({ done: 0, ok: 0, failed: 0, current: "" });

  const configured = settings.wp.url.trim() && settings.wp.user.trim() && settings.wp.appPassword.trim();
  const finished = useMemo(() => rows.filter((r) => r.status === "done"), [rows]);
  const targets = useMemo(
    () => (batchId === "all" ? finished : finished.filter((r) => batches.find((b) => b.id === batchId)?.rowIds.includes(r.id))),
    [finished, batches, batchId]
  );

  const run = async () => {
    setRunning(true);
    setProgress({ done: 0, ok: 0, failed: 0, current: "" });
    const base = settings.wp.url.replace(/\/+$/, "");
    const auth = `Basic ${btoa(`${settings.wp.user.trim()}:${settings.wp.appPassword.trim().replace(/\s+/g, "")}`)}`;
    let ok = 0;
    let failed = 0;
    for (let i = 0; i < targets.length; i++) {
      const r = targets[i];
      setProgress({ done: i, ok, failed, current: r.filename });
      try {
        const blob = await getBlob(r);
        if (!blob) throw new Error("no plate in this session");
        const alt = r.prompt.slice(0, 120);
        const res = await fetch(`${base}/wp-json/wp/v2/media`, {
          method: "POST",
          headers: {
            Authorization: auth,
            "Content-Disposition": `attachment; filename="${r.filename}"`,
            "Content-Type": "image/png",
            "X-WP-Image-Alt": alt,
          },
          body: blob,
        });
        if (!res.ok) throw new Error(`WP ${res.status}`);
        const json = (await res.json()) as { id: number };
        patchRow(r.id, { status: "imported", imported_attachment_id: String(json.id) });
        ok++;
      } catch (e) {
        failed++;
        patchRow(r.id, { error: `wp import failed — ${(e as { message?: string })?.message ?? "network"}` });
      }
    }
    setProgress({ done: targets.length, ok, failed, current: "" });
    setRunning(false);
    pushToast(failed > 0 ? "err" : "ok", `WordPress import: ${ok} uploaded${failed ? `, ${failed} failed. Check your site address and app password in Settings, then run it again for the failed ones` : ""}. Imagify picks the new media up automatically.`);
  };

  return (
    <Modal open={open} onClose={running ? () => undefined : onClose} title="Import to WordPress" width="max-w-xl">
      <div className="space-y-4">
        <p className="text-[13px] leading-relaxed text-parch">
          Uploads finished plates to <span className="font-mono text-cream">/wp-json/wp/v2/media</span> with a WordPress{" "}
          <span className="font-mono text-cream">application password</span>. Imagify optimizes whatever lands in the
          Media Library, and each attachment id is written back into the list.
        </p>

        {!configured && (
          <div className="space-y-2.5 rounded-xl border border-line bg-panel/50 p-4">
            <p className="font-mono text-[10px] tracking-[0.2em] text-dust uppercase">connection · saved for next time</p>
            <input value={settings.wp.url} onChange={(e) => patchSettings({ wp: { ...settings.wp, url: e.target.value } })} placeholder="https://yoursite.com" className="w-full rounded-lg border border-line bg-[var(--color-field)] px-3 py-2 text-[13px] text-cream" />
            <div className="grid grid-cols-2 gap-2.5">
              <input value={settings.wp.user} onChange={(e) => patchSettings({ wp: { ...settings.wp, user: e.target.value } })} placeholder="username" className="rounded-lg border border-line bg-[var(--color-field)] px-3 py-2 text-[13px] text-cream" />
              <input type="password" value={settings.wp.appPassword} onChange={(e) => patchSettings({ wp: { ...settings.wp, appPassword: e.target.value } })} placeholder="application password" className="rounded-lg border border-line bg-[var(--color-field)] px-3 py-2 text-[13px] text-cream" />
            </div>
            <p className="text-[11px] text-dust">WP admin → Users → Profile → Application Passwords. The password is shown once.</p>
          </div>
        )}

        {configured && (
          <div className="flex items-center gap-3">
            <select value={batchId} onChange={(e) => setBatchId(e.target.value)} className="rounded-lg border border-line bg-[var(--color-field)] px-3 py-2 font-mono text-[12px] text-parch">
              <option value="all">all batches</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            <span className="font-mono text-[11px] text-dust">{targets.length} ready to fly · {SUBFOLDERS.join("/ ")}/ paths kept as alt context</span>
          </div>
        )}

        {running || progress.done > 0 ? (
          <div className="rounded-xl border border-line bg-panel/50 p-4">
            <div className="mb-2 flex items-center justify-between font-mono text-[11px]">
              <span className="text-parch">{running ? `uploading ${progress.current}…` : "run finished"}</span>
              <span className="text-dust">{progress.done}/{targets.length}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-[var(--color-field)]">
              <div className={`h-full rounded-full transition-all duration-500 ${running ? "stripes-live" : "bg-moss"}`} style={{ width: `${(progress.done / Math.max(targets.length, 1)) * 100}%` }} />
            </div>
            <p className="mt-2 font-mono text-[10.5px]">
              <span className="text-moss">{progress.ok} uploaded</span> · <span className={progress.failed ? "text-blood" : "text-dust"}>{progress.failed} failed</span>
            </p>
          </div>
        ) : (
          <p className="text-center font-mono text-[10px] text-dust">plates fly one at a time so the site stays calm</p>
        )}

        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Btn onClick={onClose} disabled={running}>Close</Btn>
          <Btn variant="primary" disabled={!configured || targets.length === 0 || running} onClick={run}>
            <IUpload size={13} /> {running ? "Importing…" : `Import ${targets.length || ""} to WordPress`}
          </Btn>
        </div>
        {targets.length === 0 && configured && <p className="text-center text-[11.5px] text-dust">No finished (done) plates in this scope — generate some first.</p>}
        {configured && (
          <p className="flex items-center gap-2 text-center font-mono text-[10px] text-dust">
            <ICheck size={11} className="text-moss" /> status becomes “imported” and the attachment id is stored per row
          </p>
        )}
      </div>
    </Modal>
  );
}
