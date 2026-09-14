import type { ManifestRow } from "../types";
import { CATEGORIES, CATEGORY_META } from "../types";
import type { ForgeSettings } from "../lib/providers";
import { MODELS } from "../lib/providers";
import { fsSupported, CATEGORY_FOLDER } from "../lib/output";
import { Btn, CodeBlock, CopyBtn, IDownload, IFolder, useRevealObserver } from "./ui";

const FULL_SCHEMA = `id,filename,prompt,negative_prompt,note,category,item_id,shop_id,event_id,style,aspect_ratio,width,height,seed,model,status,error,generated_at,imported_attachment_id
1,shop_blacksmith.png,"Claymation-style medieval blacksmith shop front","text, watermark",,shop,,12,,claymation,16:9,1024,576,41,imagen-4-ultra,pending,,,
2,item_longsword.png,"Claymation-style fantasy longsword item icon",,,item,543,,,claymation,1:1,768,768,3,flux,pending,,,`;

const MINIMAL_CSV = `filename,prompt,category,model
shop_tavern.png,"ramshackle tavern at dusk, foaming tankard sign",shop,imagen-4-ultra
item_rope.png,"coiled hempen rope item icon on parchment",item,flux`;

const COLUMNS: [string, string][] = [
  ["id", "numeric, optional — assigned automatically when missing"],
  ["filename", "required · must pass the seven filename rules (Settings → Filenames)"],
  ["prompt", "what gets sent to the painter"],
  ["negative_prompt", "what must NOT appear — sent to engines that understand it"],
  ["note", "your margin note · becomes part of the prompt when you redo the picture"],
  ["category", "shop · item · event · npc — decides the output subfolder"],
  ["item_id / shop_id / event_id", "optional keys back into your project's data"],
  ["style", "the visual language, e.g. claymation"],
  ["aspect_ratio", "16:9 · 1:1 · 9:16 · 4:3 — width/height derive from it"],
  ["seed", "reproducibility seed; 0 lets the engine choose"],
  ["model", "per-row painter: imagen-4-ultra, imagen-4, flux, turbo, dall-e-3, gpt-image-1 or any endpoint id. Empty = the default engine"],
  ["status", "pending → generating → done → imported (failed / skipped are side doors)"],
  ["error", "last failure, written by the forge"],
  ["generated_at", "ISO time of the successful strike"],
  ["imported_attachment_id", "WordPress attachment id, filled by the import"],
];

function wpCliScript(rows: ManifestRow[]): string {
  const finished = rows.filter((r) => r.status === "done" || r.status === "imported");
  const lines = finished.map(
    (r) =>
      `ATT=$(wp media import "${CATEGORY_FOLDER[r.category]}/${r.filename}" --porcelain) && \\
echo "${r.filename},$ATT" >> attachment-ids.csv && \\
wp post meta update "$ATT" _wp_attachment_image_alt "${r.prompt.slice(0, 100).replace(/"/g, "'")}"`
  );
  return `#!/usr/bin/env bash
# Run from the folder that contains shops/ items/ events/ npcs/
set -euo pipefail
echo "filename,attachment_id" > attachment-ids.csv

${lines.length ? lines.join("\n\n") : "# no finished rows yet — generate some plates first"}

echo "done — feed attachment-ids.csv into your custom SQL table"`;
}

export default function DocsView({
  rows,
  settings,
  folderLinked,
  folderName,
  onLinkFolder,
  onZip,
  onOpenSettings,
}: {
  rows: ManifestRow[];
  settings: ForgeSettings;
  folderLinked: boolean;
  folderName: string;
  onLinkFolder: () => void;
  onZip: () => void;
  onOpenSettings: () => void;
}) {
  const ref = useRevealObserver<HTMLDivElement>();
  const script = wpCliScript(rows);

  return (
    <div ref={ref} className="mx-auto w-full max-w-4xl px-6 py-10">
      <header className="reveal mb-10">
        <p className="font-mono text-[11px] tracking-[0.28em] text-ember uppercase">the manual</p>
        <h2 className="mt-2 font-display text-3xl text-cream">Image Forge, documented</h2>
        <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-parch">
          A standalone, manifest-driven image pipeline. Feed it a CSV, pick painters per row, get organized images out —
          ready for WordPress, a D&amp;D marketplace, or anything with a media library.
        </p>
      </header>

      <ol className="space-y-12">
        <li className="reveal">
          <h3 className="font-display text-lg text-cream">01 · Two-minute quickstart</h3>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[13.5px] leading-relaxed text-parch marker:font-mono marker:text-ember">
            <li>
              Open <button onClick={onOpenSettings} className="font-mono text-ember underline decoration-ember/40 underline-offset-2">Settings → Image engines</button> and pick a painter.{" "}
              <span className="font-mono text-moss">flux</span> works instantly with no key;{" "}
              <span className="font-mono text-lagoon">imagen-4-ultra</span> wants a free Gemini key (add several — rotation is automatic).
            </li>
            <li>Press <span className="font-display text-cream">Run queue</span> — pending and failed rows are struck one at a time.</li>
            <li>Get the files: link an output folder (auto-save), download the ZIP, or save rows one by one.</li>
            <li>Hand the set to your project — the WP recipe at the bottom does the Media Library step.</li>
          </ol>
        </li>

        <li className="reveal">
          <h3 className="font-display text-lg text-cream">02 · Feed it your own CSV</h3>
          <p className="mt-2 text-[13.5px] text-parch">
            Workbench → <span className="font-mono text-cream">Import CSV</span>, or the wizard's prompt factory, or the{" "}
            <span className="font-mono text-cream">Wizards → Prompt factory</span> AI list writer. Only{" "}
            <span className="font-mono text-cream">filename</span> is mandatory; everything else gets defaults. Tick{" "}
            <span className="text-ember">forge immediately after import</span> and your CSV becomes images on arrival.
          </p>
          <div className="mt-3"><CodeBlock code={MINIMAL_CSV} /></div>
          <p className="mt-4 text-[13.5px] text-parch">Full schema, as exported by the forge:</p>
          <div className="mt-3"><CodeBlock code={FULL_SCHEMA} /></div>
          <div className="mt-4 overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[560px] border-collapse text-left">
              <tbody>
                {COLUMNS.map(([col, desc]) => (
                  <tr key={col} className="border-b border-line/60 text-[12.5px] last:border-0">
                    <td className="w-[210px] px-3.5 py-2 align-top font-mono text-[11px] whitespace-nowrap text-ember">{col}</td>
                    <td className="px-3.5 py-2 text-parch">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </li>

        <li className="reveal">
          <h3 className="font-display text-lg text-cream">03 · Painters, key rotation &amp; cooldowns</h3>
          <p className="mt-2 text-[13.5px] text-parch">
            The <span className="font-mono text-cream">model</span> column routes each row to its own painter. When a key
            hits a 429 it rests and the next key retries the same row instantly. Only when the whole pool rests does the
            row park — on the cooldown <em>you</em> set (Settings → Image engines).
          </p>
          <div className="mt-4 overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[560px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line bg-[var(--color-field)] font-mono text-[9.5px] tracking-[0.18em] text-dust uppercase">
                  <th className="px-3.5 py-2.5 font-medium">model id</th>
                  <th className="px-3.5 py-2.5 font-medium">engine</th>
                  <th className="px-3.5 py-2.5 font-medium">allowance</th>
                  <th className="px-3.5 py-2.5 font-medium">cooldown</th>
                </tr>
              </thead>
              <tbody>
                {MODELS.map((m) => (
                  <tr key={m.id} className="border-b border-line/60 text-[12px] last:border-0 hover:bg-raise/40">
                    <td className="px-3.5 py-2 font-mono text-[11.5px] text-cream">{m.id}</td>
                    <td className="px-3.5 py-2 font-mono text-[11px] text-parch">{m.engine}</td>
                    <td className="px-3.5 py-2 text-moss">{m.free}</td>
                    <td className="px-3.5 py-2 font-mono text-[11px] text-parch">{settings.cooldowns[m.id] ?? m.defaultCooldownH}h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </li>

        <li className="reveal">
          <h3 className="font-display text-lg text-cream">04 · Getting the files out</h3>
          <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
            <div className="plaque rounded-xl p-4">
              <p className="flex items-center gap-2 font-mono text-[10px] tracking-[0.2em] text-moss uppercase"><IFolder size={12} /> linked folder</p>
              <p className="mt-2 text-[12px] leading-relaxed text-parch">
                Chrome/Edge. Auto-writes into {CATEGORIES.map((c) => CATEGORY_META[c].folder + "/").join(" ")} — your pre-made folders are used as-is. {folderLinked ? `Currently: ${folderName}.` : "Not linked yet."}
              </p>
              {fsSupported() && !folderLinked && (
                <button onClick={onLinkFolder} className="btn-press mt-2.5 font-mono text-[11px] text-ember underline decoration-ember/40 underline-offset-2">link one now →</button>
              )}
            </div>
            <div className="plaque rounded-xl p-4">
              <p className="flex items-center gap-2 font-mono text-[10px] tracking-[0.2em] text-lagoon uppercase"><IDownload size={12} /> zip</p>
              <p className="mt-2 text-[12px] leading-relaxed text-parch">Works everywhere. Full folder structure + CSV. Point it at a Google Drive sync folder for free cloud backup.</p>
              <div className="mt-3"><Btn onClick={onZip}><IDownload size={12} /> download zip</Btn></div>
            </div>
            <div className="plaque rounded-xl p-4">
              <p className="font-mono text-[10px] tracking-[0.2em] text-ember uppercase">row by row</p>
              <p className="mt-2 text-[12px] leading-relaxed text-parch">Every row drawer has <span className="text-cream">Save picture</span> for reviewing single plates.</p>
            </div>
          </div>
        </li>

        <li className="reveal">
          <h3 className="font-display text-lg text-cream">05 · The WordPress hand-off</h3>
          <p className="mt-2 text-[13.5px] text-parch">
            Two ways: <span className="text-cream">Wizards → Import to WordPress</span> uploads for real with an
            application password (attachment ids come straight back into the manifest), or this script — generated live
            from your current manifest — does it with WP-CLI so Imagify optimizes everything:
          </p>
          <div className="mt-3"><CodeBlock code={script} /></div>
          <div className="mt-2 flex justify-end"><CopyBtn text={script} label="copy script" /></div>
        </li>

        <li className="reveal">
          <h3 className="font-display text-lg text-cream">06 · Troubleshooting</h3>
          <div className="mt-3 space-y-2.5">
            {[
              ["“Link folder” does nothing", "Folder access needs Chrome or Edge, a secure context (https/localhost) and a normal browser tab — sandboxed previews block it. The exact reason shows in Settings → Folders, and the ZIP always works."],
              ["Every Imagen row parks for 24h", "You used today's free quota on that key. Add another Gemini key — rotation is automatic and each key brings its own ≈25/day per model."],
              ["Pollinations is slow", "Normal — free plates take 5–40s. Use turbo, or start the queue and make tea."],
              ["Images vanish after a reload", "Plates live in session memory; the manifest text persists. Sync to a folder or ZIP before closing a big session."],
              ["My endpoint gives CORS errors", "Your server must allow the forge's origin — or run the same recipe as a local script; the CSV contract is identical."],
            ].map(([q, a]) => (
              <details key={q} className="group rounded-xl border border-line bg-panel/40 px-4 py-3 open:border-line2">
                <summary className="cursor-pointer list-none font-display text-[13px] tracking-wide text-cream">
                  <span className="mr-2 text-ember transition-transform group-open:inline-block group-open:rotate-90">▸</span>
                  {q}
                </summary>
                <p className="mt-2 pl-5 text-[12.5px] leading-relaxed text-parch">{a}</p>
              </details>
            ))}
          </div>
        </li>
      </ol>

      <p className="reveal mt-10 border-t border-line pt-5 text-[12px] leading-relaxed text-dust">
        Quotas and model ids drift — verify on each provider's pricing page before building on a free tier. Agents want
        in? See <span className="font-mono text-parch">Docs → Agents &amp; API</span>.
      </p>
    </div>
  );
}
