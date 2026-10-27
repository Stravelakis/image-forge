import { useCallback, useEffect, useRef, useState } from "react";
import type { ManifestRow, Toast } from "../types";
import type { ForgeSettings } from "../lib/providers";
import { MOTION_PRESETS, planMotion, sanitisePlan, type MotionPlan } from "../lib/motionPlan";
import { drawFrame, estimateGifKb, gifNameFor, makeGif } from "../lib/makeGif";
import { downloadBlob } from "../lib/output";
import { Btn, IX } from "./ui";

const field =
  "w-full rounded-lg border border-line bg-[var(--color-field)] px-3 py-2 text-[13px] text-cream placeholder:text-dust/60";

/**
 * Turn one finished picture into a looping GIF.
 *
 * You describe the movement in plain words; the text engine works out the
 * camera motion; the picture you already have is re-photographed frame by
 * frame. Nothing is regenerated, so the loop never wobbles.
 */
export default function GifMaker({
  row,
  blob,
  settings,
  onClose,
  onSaved,
  pushToast,
}: {
  row: ManifestRow;
  blob: Blob;
  settings: ForgeSettings;
  onClose: () => void;
  onSaved?: (name: string, gif: Blob) => void;
  pushToast: (kind: Toast["kind"], msg: string) => void;
}) {
  const [wish, setWish] = useState("");
  const [plan, setPlan] = useState<MotionPlan>(() => sanitisePlan({ ...MOTION_PRESETS[0].plan }));
  const [thinking, setThinking] = useState(false);
  const [building, setBuilding] = useState(false);
  const [progress, setProgress] = useState(0);
  const [note, setNote] = useState("");
  const [gifUrl, setGifUrl] = useState<string>("");
  const [gifSize, setGifSize] = useState(0);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);
  const gifBlobRef = useRef<Blob | null>(null);

  /* load the picture once */
  useEffect(() => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [blob]);

  /* live preview — the same drawing code the GIF uses */
  useEffect(() => {
    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      rafRef.current = requestAnimationFrame(tick);
      const img = imgRef.current;
      const canvas = canvasRef.current;
      if (!img || !canvas) return;
      if (now - last < plan.frameMs) return;
      last = now;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      if (canvas.width !== 360) {
        const ratio = img.naturalHeight / img.naturalWidth;
        canvas.width = 360;
        canvas.height = Math.round(360 * ratio);
      }
      drawFrame(ctx, img, img.naturalWidth, img.naturalHeight, plan, frame);
      frame = (frame + 1) % plan.frames;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [plan]);

  useEffect(() => () => { if (gifUrl) URL.revokeObjectURL(gifUrl); }, [gifUrl]);

  const askForPlan = useCallback(async () => {
    if (!wish.trim()) return;
    setThinking(true);
    setNote("");
    const res = await planMotion(wish, settings);
    setPlan(res.plan);
    if (res.problem) setNote(`Using a simple push in — ${res.problem}.`);
    else if (res.plan.beyondReach) setNote(res.plan.beyondReach);
    else setNote(res.plan.summary);
    setThinking(false);
  }, [settings, wish]);

  const build = useCallback(async () => {
    const img = imgRef.current;
    if (!img) return;
    setBuilding(true);
    setProgress(0);
    try {
      const gif = await makeGif(img, plan, {
        maxSize: 480,
        onProgress: (done, total) => setProgress(Math.round((done / total) * 100)),
      });
      gifBlobRef.current = gif;
      if (gifUrl) URL.revokeObjectURL(gifUrl);
      setGifUrl(URL.createObjectURL(gif));
      setGifSize(gif.size);
      pushToast("ok", `GIF ready — ${Math.round(gif.size / 1024)} KB.`);
    } catch (e) {
      pushToast("err", `Could not build the GIF — ${(e as { message?: string })?.message ?? "unknown"}`);
    } finally {
      setBuilding(false);
    }
  }, [gifUrl, plan, pushToast]);

  const save = useCallback(() => {
    const gif = gifBlobRef.current;
    if (!gif) return;
    const name = gifNameFor(row.filename);
    downloadBlob(name, gif);
    onSaved?.(name, gif);
    pushToast("ok", `Saved ${name}.`);
  }, [onSaved, pushToast, row.filename]);

  const est = estimateGifKb(480, 270, plan.frames);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm">
      <div className="my-8 w-full max-w-3xl rounded-2xl border border-line bg-panel shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div>
            <p data-tip="Turns this picture into a small moving picture (a GIF). It is free and happens on your computer." className="font-display text-[17px] tracking-wide text-cream">Turn into a GIF</p>
            <p data-tip="The name of the picture you are working on." className="font-mono text-[10.5px] text-dust">{row.filename}</p>
          </div>
          <button data-tip="Closes the GIF maker without saving." onClick={onClose} className="btn-press rounded-lg p-2 text-dust hover:bg-raise hover:text-cream">
            <IX size={16} />
          </button>
        </div>

        <div className="grid gap-5 p-5 md:grid-cols-[360px_1fr]">
          {/* preview */}
          <div>
            <p data-tip="A quick look at how the movement will play." className="mb-1.5 font-mono text-[10px] tracking-[0.2em] text-dust uppercase">live preview</p>
            <canvas ref={canvasRef} className="w-full rounded-lg border border-line bg-black" />
            <p className="mt-1.5 text-[11px] text-dust">
              This is exactly what the GIF will do — the same drawing code makes both.
            </p>

            {gifUrl && (
              <div className="mt-4">
                <p data-tip={`The finished moving picture. It is ${Math.round(gifSize / 1024)} KB big.`} className="mb-1.5 font-mono text-[10px] tracking-[0.2em] text-moss uppercase">
                  finished gif · {Math.round(gifSize / 1024)} KB
                </p>
                <img src={gifUrl} alt="the finished GIF" className="w-full rounded-lg border border-moss/40" />
              </div>
            )}
          </div>

          {/* controls */}
          <div className="space-y-4">
            <div>
              <label data-tip="Say in your own words how the picture should move." className="mb-1.5 block font-mono text-[10px] tracking-[0.2em] text-dust uppercase">
                what should it do?
              </label>
              <textarea data-tip="Say in plain words how the picture should move, for example the lantern flickers. The AI turns it into camera and light moves."
                value={wish}
                onChange={(e) => setWish(e.target.value)}
                rows={2}
                placeholder="the lantern flickers and the camera creeps closer"
                className={`${field} resize-y`}
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Btn data-tip="Asks your text AI to plan the movement from your sentence. You can still tweak the numbers after." variant="primary" onClick={askForPlan} disabled={thinking || !wish.trim()}>
                  {thinking ? "thinking…" : "Work out the movement"}
                </Btn>
                {!settings.scribe.key.trim() && (
                  <span className="text-[11px] text-dust">no text engine set — presets still work</span>
                )}
              </div>
              {note && (
                <p data-tip="A note from the helper about what it understood, or what it could not do."
                  className={`mt-2 rounded-lg border px-3 py-2 text-[11.5px] ${
                    plan.beyondReach
                      ? "border-ember/40 bg-ember/10 text-ember"
                      : "border-line bg-[var(--color-field)] text-parch"
                  }`}
                >
                  {note}
                </p>
              )}
            </div>

            <div>
              <p data-tip="Or skip the words and choose a ready-made movement." className="mb-1.5 font-mono text-[10px] tracking-[0.2em] text-dust uppercase">or pick a movement</p>
              <div className="flex flex-wrap gap-1.5">
                {MOTION_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    title={p.hint}
                    onClick={() => {
                      setPlan(sanitisePlan({ ...p.plan }));
                      setNote(p.hint);
                    }}
                    className="btn-press rounded-lg border border-line bg-[var(--color-field)] px-2.5 py-1.5 text-[11.5px] text-parch hover:border-ember/50 hover:text-cream"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label data-tip={`How many pictures the GIF is made of: ${plan.frames}. More is smoother but a bigger file.`} className="mb-1 block font-mono text-[9.5px] tracking-[0.18em] text-dust uppercase">
                  frames · {plan.frames}
                </label>
                <input data-tip="How many pictures the GIF is made of. More frames look smoother but make a bigger file."
                  type="range"
                  min={4}
                  max={48}
                  value={plan.frames}
                  onChange={(e) => setPlan({ ...plan, frames: Number(e.target.value) })}
                  className="h-1.5 w-full accent-[var(--color-ember)]"
                />
              </div>
              <div>
                <label data-tip={`How long each picture shows: ${plan.frameMs} thousandths of a second. Smaller is faster.`} className="mb-1 block font-mono text-[9.5px] tracking-[0.18em] text-dust uppercase">
                  speed · {plan.frameMs}ms
                </label>
                <input data-tip="How long each frame stays on screen. A smaller number plays faster."
                  type="range"
                  min={40}
                  max={300}
                  step={10}
                  value={plan.frameMs}
                  onChange={(e) => setPlan({ ...plan, frameMs: Number(e.target.value) })}
                  className="h-1.5 w-full accent-[var(--color-ember)]"
                />
              </div>
            </div>

            <label className="flex cursor-pointer items-center gap-2.5 text-[12px] text-parch">
              <input data-tip="Plays the movement forward and then back, so the GIF repeats without a jump."
                type="checkbox"
                checked={plan.pingPong}
                onChange={(e) => setPlan({ ...plan, pingPong: e.target.checked })}
                className="h-4 w-4 accent-[var(--color-ember)]"
              />
              Return to the start, so it loops without a jump
            </label>

            <div className="rounded-lg border border-line bg-[var(--color-field)] px-3 py-2">
              <p className="text-[11px] text-dust">
                About {est} KB at {plan.frames} frames. Fewer frames means a much smaller file.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Btn data-tip="Builds the GIF from your picture and the movement above. This takes a few seconds." variant="primary" onClick={build} disabled={building}>
                {building ? `building… ${progress}%` : gifUrl ? "Build again" : "Build the GIF"}
              </Btn>
              {gifUrl && <Btn data-tip="Saves the finished GIF to your computer." onClick={save}>Save it</Btn>}
            </div>

            <p className="text-[11px] leading-relaxed text-dust">
              This moves the camera and the light across the picture you already have. It cannot make the subject
              itself move — no waving, no walking, no talking. That needs a real video model.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
