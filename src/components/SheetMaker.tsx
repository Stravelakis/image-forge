import { useCallback, useMemo, useRef, useState } from "react";
import type { ManifestRow, Toast } from "../types";
import type { ForgeSettings } from "../lib/providers";
import { estimateCost, formatUsd, generateReal, resolveRoute } from "../lib/providers";
import {
  SHEET_DEFS,
  cellPosition,
  frameCount,
  frameFilename,
  framePrompt,
  layoutFor,
  oneShotPrompt,
  referencePrompt,
  seedForFrame,
  sheetFilename,
  stripFor,
  visemesForText,
  type SheetDef,
} from "../lib/sheets";
import { downloadBlob } from "../lib/output";
import { Btn, IX } from "./ui";

const field =
  "w-full rounded-lg border border-line bg-[var(--color-field)] px-3 py-2 text-[13px] text-cream placeholder:text-dust/60";
const label = "mb-1.5 block font-mono text-[10px] tracking-[0.2em] text-dust uppercase";

type Method = "from-reference" | "one-shot";

interface Frame {
  id: string;
  labelText: string;
  blob?: Blob;
  url?: string;
  error?: string;
}

/**
 * Many frames of the same character: a walk cycle, a turnaround, the mouth
 * shapes an avatar needs to look like it is speaking.
 */
export default function SheetMaker({
  settings,
  onClose,
  pushToast,
  pushLog,
  onExhaust,
}: {
  settings: ForgeSettings;
  onClose: () => void;
  pushToast: (kind: Toast["kind"], msg: string) => void;
  pushLog: (msg: string, kind: "info" | "ok" | "err" | "run") => void;
  onExhaust: (pool: "geminiKeys" | "geminiPaidKeys" | "openaiKeys", id: string, until: number) => void;
}) {
  const [def, setDef] = useState<SheetDef>(SHEET_DEFS[0]);
  const [method, setMethod] = useState<Method>("from-reference");
  const [character, setCharacter] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [frames, setFrames] = useState<Frame[]>([]);
  const [refUrl, setRefUrl] = useState("");
  const [sheetUrl, setSheetUrl] = useState("");
  const [say, setSay] = useState("");
  const [playing, setPlaying] = useState(false);

  const stopRef = useRef(false);
  const refBlobRef = useRef<Blob | null>(null);
  const playRef = useRef(0);
  const [playFrame, setPlayFrame] = useState<string>("");

  const shots = frameCount(def, method);
  const cost = useMemo(() => {
    const fake = Array.from({ length: shots }, () => ({
      prompt: "",
      aspect_ratio: "1:1",
      seed: 1,
      model: "",
    }));
    return estimateCost(fake as never, settings);
  }, [settings, shots]);

  const route = resolveRoute({ prompt: "", aspect_ratio: "1:1", seed: 1, model: "" } as never, settings);
  // Cloudflare's own default (FLUX schnell) cannot work from a picture, but its
  // FLUX.2 klein can — so "from a reference" uses that on Cloudflare (12 Oct 2026).
  const refModel = route.engine === "cloudflare" ? "cloudflare-flux2-klein" : "";
  const canReference = route.engine === "local" || route.engine === "gemini" || route.engine === "cloudflare";

  const blobToB64 = (b: Blob): Promise<string> =>
    new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(",")[1]);
      r.onerror = () => rej(new Error("could not read the picture"));
      r.readAsDataURL(b);
    });

  const makeRow = (prompt: string, seed: number): ManifestRow =>
    ({
      id: 0,
      filename: "sheet.png",
      prompt,
      negative_prompt: def.negative,
      category: "sheet",
      item_id: "",
      shop_id: "",
      event_id: "",
      style: "",
      aspect_ratio: "1:1",
      seed,
      model: method === "from-reference" ? refModel : "",
      status: "pending",
      error: "",
      generated_at: "",
      imported_attachment_id: "",
    }) as ManifestRow;

  const run = useCallback(async () => {
    stopRef.current = false;
    setBusy(true);
    setFrames([]);
    setSheetUrl("");
    setRefUrl("");
    refBlobRef.current = null;

    const cool = 3600e3;
    try {
      if (method === "one-shot") {
        setProgress("drawing the whole sheet in one picture…");
        const { blob } = await generateReal(makeRow(oneShotPrompt(def, character), 1), settings, undefined, onExhaust, cool);
        setSheetUrl(URL.createObjectURL(blob));
        pushLog(`✓ ${def.label} drawn as one sheet`, "ok");
        pushToast("ok", "Sheet made. The model chose the layout, so frames may not line up exactly.");
        return;
      }

      // 1. the reference picture, which every frame is then based on
      setProgress("drawing the character once, to keep every frame the same…");
      const ref = await generateReal(makeRow(referencePrompt(def, character), 1), settings, undefined, onExhaust, cool);
      refBlobRef.current = ref.blob;
      setRefUrl(URL.createObjectURL(ref.blob));
      const refB64 = await blobToB64(ref.blob);

      const first = def.frames[0];
      setFrames([{ id: first.id, labelText: first.label, blob: ref.blob, url: URL.createObjectURL(ref.blob) }]);

      // 2. every other frame, edited from that same picture
      for (let i = 1; i < def.frames.length; i++) {
        if (stopRef.current) break;
        const f = def.frames[i];
        setProgress(`${f.label} — ${i} of ${def.frames.length - 1}`);
        try {
          const { blob } = await generateReal(
            makeRow(framePrompt(def, f, character), seedForFrame(1, i)),
            settings,
            undefined,
            onExhaust,
            cool,
            { refImages: [refB64] }
          );
          setFrames((p) => [...p, { id: f.id, labelText: f.label, blob, url: URL.createObjectURL(blob) }]);
        } catch (e) {
          const why = (e as { message?: string })?.message ?? "unknown";
          setFrames((p) => [...p, { id: f.id, labelText: f.label, error: why }]);
          pushLog(`✗ ${def.label} · ${f.label} — ${why}`, "err");
        }
      }
      pushLog(`✓ ${def.label} finished`, "ok");
      pushToast("ok", "Sheet finished.");
    } catch (e) {
      const why = (e as { message?: string })?.message ?? "unknown";
      pushLog(`✗ ${def.label} — ${why}`, "err");
      pushToast("err", why);
    } finally {
      setBusy(false);
      setProgress("");
    }
  }, [character, def, method, onExhaust, pushLog, pushToast, settings]);

  /** Lay every finished frame onto one picture. */
  const assemble = useCallback(async () => {
    const good = frames.filter((f) => f.blob);
    if (!good.length) return;
    const imgs = await Promise.all(
      good.map(
        (f) =>
          new Promise<HTMLImageElement>((res) => {
            const i = new Image();
            i.onload = () => res(i);
            i.src = f.url!;
          })
      )
    );
    const cell = Math.min(512, imgs[0].naturalWidth);
    const layout = layoutFor(imgs.length, def.columns, cell, cell);
    const canvas = document.createElement("canvas");
    canvas.width = layout.width;
    canvas.height = layout.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    imgs.forEach((im, i) => {
      const { x, y } = cellPosition(i, layout);
      ctx.drawImage(im, x, y, cell, cell);
    });
    canvas.toBlob((b) => {
      if (!b) return;
      setSheetUrl(URL.createObjectURL(b));
      downloadBlob(sheetFilename(character.split(/\s+/)[0] || "character", def.kind), b);
      pushToast("ok", "Sheet assembled and saved.");
    }, "image/png");
  }, [character, def, frames, pushToast]);

  const saveFrames = useCallback(() => {
    const base = character.split(/\s+/)[0] || "character";
    let n = 0;
    for (const f of frames) {
      if (!f.blob) continue;
      downloadBlob(frameFilename(base, def.kind, f.id), f.blob);
      n++;
    }
    pushToast("ok", `Saved ${n} frame${n === 1 ? "" : "s"}.`);
  }, [character, def.kind, frames, pushToast]);

  /** Play the frames back, which is what the mouth shapes are for. */
  const play = useCallback(
    (order: string[], frameMs: number, pingPong: boolean) => {
      window.clearInterval(playRef.current);
      const have = order.filter((id) => frames.some((f) => f.id === id && f.blob));
      if (!have.length) {
        pushToast("info", "No finished frames to play yet.");
        return;
      }
      const seq = pingPong ? [...have, ...have.slice(1, -1).reverse()] : have;
      let i = 0;
      setPlaying(true);
      playRef.current = window.setInterval(() => {
        setPlayFrame(seq[i % seq.length]);
        i++;
      }, frameMs);
    },
    [frames, pushToast]
  );

  const stopPlaying = () => {
    window.clearInterval(playRef.current);
    setPlaying(false);
    setPlayFrame("");
  };

  const shown = playFrame ? frames.find((f) => f.id === playFrame) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm">
      <div className="my-6 w-full max-w-5xl rounded-2xl border border-line bg-panel shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div>
            <p className="font-display text-[17px] tracking-wide text-cream">Make a sheet</p>
            <p className="font-mono text-[10.5px] text-dust">many frames of the same character</p>
          </div>
          <button data-tip="Closes the sheet maker." onClick={onClose} className="btn-press rounded-lg p-2 text-dust hover:bg-raise hover:text-cream">
            <IX size={16} />
          </button>
        </div>

        <div className="grid gap-5 p-5 lg:grid-cols-[1fr_360px]">
          {/* left: what to make */}
          <div className="space-y-4">
            <div>
              <label className={label}>what kind of sheet</label>
              <div className="grid gap-2 sm:grid-cols-2">
                {SHEET_DEFS.map((d) => (
                  <button data-tip={`${d.label}: ${d.blurb} (${d.frames.length} frames)`}
                    key={d.kind}
                    onClick={() => setDef(d)}
                    className={`btn-press rounded-lg border p-3 text-left ${
                      d.kind === def.kind ? "border-ember/60 bg-ember/10" : "border-line bg-[var(--color-field)]"
                    }`}
                  >
                    <span className="block text-[13px] font-semibold text-cream">{d.label}</span>
                    <span className="mt-0.5 block text-[11.5px] leading-snug text-dust">{d.blurb}</span>
                    <span className="mt-1 block font-mono text-[9.5px] text-dust">{d.frames.length} frames</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className={label}>describe the character</label>
              <textarea data-tip="Say who the character is and how it should look, for example a stout dwarf blacksmith in claymation style."
                value={character}
                onChange={(e) => setCharacter(e.target.value)}
                rows={2}
                placeholder="a stout dwarf blacksmith with a red beard and a leather apron, claymation style"
                className={`${field} resize-y`}
              />
            </div>

            <div>
              <label className={label}>how to make it</label>
              <div className="grid gap-2 sm:grid-cols-2">
                <button data-tip="Draws the character once, then changes that same picture into every pose. Slower, but the character stays the same in every frame."
                  onClick={() => setMethod("from-reference")}
                  disabled={!canReference}
                  className={`btn-press rounded-lg border p-3 text-left disabled:opacity-40 ${
                    method === "from-reference" ? "border-ember/60 bg-ember/10" : "border-line bg-[var(--color-field)]"
                  }`}
                >
                  <span className="block text-[13px] font-semibold text-cream">From a reference</span>
                  <span className="mt-0.5 block text-[11.5px] leading-snug text-dust">
                    Draw the character once, then edit that same picture into every pose. Slower, but the character
                    genuinely stays the same and each frame is usable on its own.
                  </span>
                </button>
                <button data-tip="Draws the whole grid in one go. Quick and cheap, but the frames may drift and not match."
                  onClick={() => setMethod("one-shot")}
                  className={`btn-press rounded-lg border p-3 text-left ${
                    method === "one-shot" ? "border-ember/60 bg-ember/10" : "border-line bg-[var(--color-field)]"
                  }`}
                >
                  <span className="block text-[13px] font-semibold text-cream">All in one picture</span>
                  <span className="mt-0.5 block text-[11.5px] leading-snug text-dust">
                    One generation for the whole grid. Fast and cheap, but the model decides the layout and the frames
                    drift.
                  </span>
                </button>
              </div>
              {!canReference && (
                <p className="mt-2 rounded-lg border border-ember/40 bg-ember/10 px-3 py-2 text-[11.5px] text-ember">
                  “From a reference” needs your own machine, Cloudflare (FLUX.2) or a Google model — the engine you have chosen cannot work
                  from a picture. Switch engine, or use “all in one picture”.
                </p>
              )}
            </div>

            <div className="rounded-lg border border-line bg-[var(--color-field)] px-3 py-2.5">
              <p className="text-[12px] text-parch">
                {shots} generation{shots === 1 ? "" : "s"} ·{" "}
                <span className={cost.total > 0 ? "text-ember" : "text-moss"}>
                  {cost.total > 0 ? `about ${formatUsd(cost.total)}` : "free"}
                </span>
                {cost.unknown > 0 && <span className="text-dust"> ({cost.unknown} at an unknown price)</span>}
              </p>
              <p className="mt-0.5 font-mono text-[10.5px] text-dust">
                using {route.engine} · {route.apiModel}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Btn data-tip="Makes the sheet: the engine draws every frame of the animation. This can take a few minutes." variant="primary" onClick={run} disabled={busy}>
                {busy ? "drawing…" : "Make the sheet"}
              </Btn>
              {busy && (
                <Btn data-tip="Stops drawing. The frames already finished are kept." variant="danger" onClick={() => (stopRef.current = true)}>
                  Stop
                </Btn>
              )}
              {progress && <span className="text-[11.5px] text-dust">{progress}</span>}
            </div>
          </div>

          {/* right: what came back */}
          <div className="space-y-3">
            {shown?.url && (
              <div>
                <p className={label}>playing · {shown.labelText}</p>
                <img src={shown.url} alt={shown.labelText} className="w-full rounded-lg border border-ember/50" />
              </div>
            )}

            {sheetUrl && !shown && (
              <div>
                <p className={label}>the sheet</p>
                <img src={sheetUrl} alt="the finished sheet" className="w-full rounded-lg border border-moss/40" />
              </div>
            )}

            {refUrl && !sheetUrl && !shown && (
              <div>
                <p className={label}>the character everything is based on</p>
                <img src={refUrl} alt="reference" className="w-full rounded-lg border border-line" />
              </div>
            )}

            {frames.length > 0 && (
              <>
                <div className="grid grid-cols-3 gap-1.5">
                  {frames.map((f) => (
                    <div key={f.id} className="text-center">
                      {f.url ? (
                        <img
                          src={f.url}
                          alt={f.labelText}
                          className={`w-full rounded border ${
                            playFrame === f.id ? "border-ember" : "border-line"
                          }`}
                        />
                      ) : (
                        <div className="flex aspect-square items-center justify-center rounded border border-blood/40 bg-blood/10 p-1 text-center font-mono text-[8px] text-blood">
                          failed
                        </div>
                      )}
                      <p className="mt-0.5 truncate font-mono text-[8.5px] text-dust">{f.labelText}</p>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Btn data-tip="Joins all the finished frames into one picture file and saves it." onClick={assemble}>Save as one sheet</Btn>
                  <Btn data-tip="Saves every finished frame as its own separate picture." onClick={saveFrames}>Save each frame</Btn>
                </div>

                <div className="rounded-lg border border-line bg-[var(--color-field)] p-3">
                  <p className={label}>play it</p>
                  <div className="flex flex-wrap gap-2">
                    {!playing ? (
                      <Btn data-tip={`Plays the frames here as a small animation: ${stripFor(def).label}.`}
                        onClick={() => {
                          const s = stripFor(def);
                          play(s.order, s.frameMs, s.pingPong);
                        }}
                      >
                        ▶ {stripFor(def).label}
                      </Btn>
                    ) : (
                      <Btn data-tip="Stops the preview." variant="danger" onClick={stopPlaying}>
                        ■ stop
                      </Btn>
                    )}
                  </div>

                  {def.kind === "visemes" && (
                    <div className="mt-3">
                      <label className={label}>make it say something</label>
                      <div className="flex gap-2">
                        <input data-tip="Type a few words and the mouth shapes will play along with them."
                          value={say}
                          onChange={(e) => setSay(e.target.value)}
                          placeholder="hello there"
                          className={field}
                        />
                        <Btn data-tip="Plays the mouth shapes for the words you typed, like the character is talking."
                          onClick={() => {
                            const s = visemesForText(say || "hello");
                            play(s.order, s.frameMs, false);
                          }}
                        >
                          Say it
                        </Btn>
                      </div>
                      <p className="mt-1.5 text-[11px] leading-snug text-dust">
                        Rough and ready — it matches letters to mouth shapes rather than listening to real speech. Enough
                        to look like talking; not enough to match a recording.
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}

            {!frames.length && !sheetUrl && (
              <p className="rounded-lg border border-line bg-[var(--color-field)] px-3 py-6 text-center text-[12px] text-dust">
                Nothing yet. Describe a character and press “Make the sheet”.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
