import { useCallback, useState } from "react";
import type { Toast } from "../types";
import type { ForgeSettings } from "../lib/providers";
import {
  codeEngineFor,
  makeVector,
  svgToDataUrl,
  vectorFilename,
  type VectorAsset,
  type VectorKind,
} from "../lib/vectorAssets";
import { downloadBlob } from "../lib/output";
import { Btn, IX } from "./ui";

const field =
  "w-full rounded-lg border border-line bg-[var(--color-field)] px-3 py-2 text-[13px] text-cream placeholder:text-dust/60";
const label = "mb-1.5 block font-mono text-[10px] tracking-[0.2em] text-dust uppercase";

const KINDS: { id: VectorKind; label: string; blurb: string; placeholder: string }[] = [
  {
    id: "svg-icon",
    label: "Icon",
    blurb: "A simple line icon, 24×24, that takes the colour around it. Reads clearly at any size.",
    placeholder: "an anvil with a hammer resting on it",
  },
  {
    id: "svg-illustration",
    label: "Illustration",
    blurb: "A flat vector picture with a small deliberate palette. Scales to a billboard.",
    placeholder: "a market stall with striped awning and baskets of bread",
  },
  {
    id: "lottie",
    label: "Animated icon",
    blurb: "A Lottie animation — JSON, the kind that plays in a web page. No video file needed.",
    placeholder: "a loading spinner made of three bouncing dots",
  },
];

/**
 * Vectors and animated icons, written as code rather than drawn as pixels.
 *
 * An image model cannot make an SVG. A code model can — real paths, a few
 * kilobytes, editable in any text editor, sharp at any size.
 */
export default function VectorMaker({
  settings,
  onClose,
  pushToast,
  pushLog,
}: {
  settings: ForgeSettings;
  onClose: () => void;
  pushToast: (kind: Toast["kind"], msg: string) => void;
  pushLog: (msg: string, kind: "info" | "ok" | "err" | "run") => void;
}) {
  const [kind, setKind] = useState<VectorKind>("svg-icon");
  const [description, setDescription] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [asset, setAsset] = useState<VectorAsset | null>(null);
  const [showCode, setShowCode] = useState(false);

  const { engine, usingFallback } = codeEngineFor(settings);
  const active = KINDS.find((k) => k.id === kind)!;

  const make = useCallback(async () => {
    if (!description.trim()) return;
    setBusy(true);
    setAsset(null);
    setShowCode(false);
    const a = await makeVector(kind, description, settings);
    setAsset(a);
    if (a.code) {
      pushLog(`✓ ${active.label.toLowerCase()} written — ${description.trim().slice(0, 40)}`, "ok");
      if (a.problem) pushToast("info", a.problem);
      else pushToast("ok", `${active.label} ready.`);
    } else {
      pushLog(`✗ ${active.label.toLowerCase()} failed — ${a.problem ?? "unknown"}`, "err");
      pushToast("err", a.problem ?? "It did not come back with anything usable.");
    }
    setBusy(false);
  }, [active.label, description, kind, pushLog, pushToast, settings]);

  const save = useCallback(() => {
    if (!asset?.code) return;
    const base = name.trim() || description.trim().split(/\s+/).slice(0, 3).join("_") || "asset";
    const file = vectorFilename(base.toLowerCase().replace(/[^a-z0-9_]+/g, "_"), kind);
    const type = kind === "lottie" ? "application/json" : "image/svg+xml";
    downloadBlob(file, new Blob([asset.code], { type }));
    pushToast("ok", `Saved ${file}.`);
  }, [asset, description, kind, name, pushToast]);

  const copy = useCallback(async () => {
    if (!asset?.code) return;
    try {
      await navigator.clipboard.writeText(asset.code);
      pushToast("ok", "Copied.");
    } catch {
      pushToast("err", "The browser would not let me copy. Select the code and copy it by hand.");
    }
  }, [asset, pushToast]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm">
      <div className="my-6 w-full max-w-4xl rounded-2xl border border-line bg-panel shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div>
            <p className="font-display text-[17px] tracking-wide text-cream">Make a vector</p>
            <p className="font-mono text-[10.5px] text-dust">drawn as code · sharp at any size</p>
          </div>
          <button data-tip="Closes the vector maker." onClick={onClose} className="btn-press rounded-lg p-2 text-dust hover:bg-raise hover:text-cream">
            <IX size={16} />
          </button>
        </div>

        <div className="grid gap-5 p-5 md:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <div>
              <label className={label}>what to make</label>
              <div className="grid gap-2 sm:grid-cols-3">
                {KINDS.map((k) => (
                  <button data-tip={`${k.label}: ${k.blurb}`}
                    key={k.id}
                    onClick={() => setKind(k.id)}
                    className={`btn-press rounded-lg border p-3 text-left ${
                      k.id === kind ? "border-ember/60 bg-ember/10" : "border-line bg-[var(--color-field)]"
                    }`}
                  >
                    <span className="block text-[13px] font-semibold text-cream">{k.label}</span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-dust">{k.blurb}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className={label}>describe it</label>
              <textarea data-tip="Say what the drawing should show, in plain words."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder={active.placeholder}
                className={`${field} resize-y`}
              />
            </div>

            <div>
              <label className={label}>file name (optional)</label>
              <input data-tip="What to call the saved file. Leave it empty and a name is made from your description." value={name} onChange={(e) => setName(e.target.value)} placeholder="icon_anvil" className={field} />
            </div>

            <div className="rounded-lg border border-line bg-[var(--color-field)] px-3 py-2.5">
              <p className="font-mono text-[10.5px] text-dust">
                written by {engine.model || "your text model"}
              </p>
              {usingFallback && (
                <p className="mt-1 text-[11.5px] text-ember">
                  Using your writing model, because no code engine is set. It works, but a code model does this
                  noticeably better — Settings → Text engines.
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Btn data-tip="Your text AI writes the drawing as code. It takes a few seconds." variant="primary" onClick={make} disabled={busy || !description.trim()}>
                {busy ? "writing…" : "Make it"}
              </Btn>
              {asset?.code && <Btn data-tip="Writes a fresh version from the same description." onClick={make}>Try again</Btn>}
            </div>

            {asset?.problem && (
              <p
                className={`rounded-lg border px-3 py-2 text-[11.5px] ${
                  asset.code ? "border-ember/40 bg-ember/10 text-ember" : "border-blood/40 bg-blood/10 text-blood"
                }`}
              >
                {asset.problem}
              </p>
            )}
          </div>

          <div className="space-y-3">
            <p className={label}>preview</p>
            <div className="flex min-h-[220px] items-center justify-center rounded-lg border border-line bg-[#f4f0e6] p-6">
              {asset?.code && kind !== "lottie" ? (
                /* rendered as an image, never injected into the page, so nothing
                   in the model's answer can run here */
                <img
                  src={svgToDataUrl(asset.code)}
                  alt={asset.title}
                  className="max-h-56 w-full object-contain"
                  style={{ color: "var(--color-on-accent)" }}
                />
              ) : asset?.code ? (
                <p className="text-center font-mono text-[11px] text-[var(--color-on-accent)]">
                  Lottie animations need a player to move.
                  <br />
                  Save it and drop it into your page.
                </p>
              ) : (
                <p className="text-center text-[12px] text-[#8a7f6b]">nothing yet</p>
              )}
            </div>

            {asset?.code && (
              <>
                <div className="flex flex-wrap gap-2">
                  <Btn data-tip={`Saves the drawing to your computer as a ${kind === "lottie" ? "JSON" : "SVG"} file.`} variant="primary" onClick={save}>
                    Save
                  </Btn>
                  <Btn data-tip="Copies the code of the drawing so you can paste it somewhere else." onClick={copy}>Copy</Btn>
                  <Btn data-tip="Shows or hides the code the drawing is made of." onClick={() => setShowCode((s) => !s)}>{showCode ? "Hide code" : "Show code"}</Btn>
                </div>
                <p className="font-mono text-[10px] text-dust">
                  {(asset.code.length / 1024).toFixed(1)} KB · {kind === "lottie" ? "JSON" : "SVG"}
                </p>
                {showCode && (
                  <textarea data-tip="The code of the drawing. Click to select all of it, then copy."
                    readOnly
                    value={asset.code}
                    rows={12}
                    className={`${field} resize-y font-mono !text-[10.5px]`}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
