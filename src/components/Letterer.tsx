import { useCallback, useEffect, useRef, useState } from "react";
import type { ManifestRow, Toast } from "../types";
import type { ForgeSettings } from "../lib/providers";
import {
  FONT_CHOICES,
  boxQuad,
  compositeToBlob,
  drawLayers,
  letteredNameFor,
  newTextLayer,
  type TextLayer,
} from "../lib/textLayer";
import { findQuietQuad, findTextSpotWithVision } from "../lib/findTextSpot";
import { quadToPixels, type Point, type Quad } from "../lib/warp";
import { downloadBlob } from "../lib/output";
import { Btn, IX, ITrash } from "./ui";

const field =
  "w-full rounded-lg border border-line bg-[var(--color-field)] px-3 py-2 text-[13px] text-cream placeholder:text-dust/60";
const label = "mb-1 block font-mono text-[9.5px] tracking-[0.18em] text-dust uppercase";

const HANDLE = 9;

/**
 * Put real lettering on a finished picture.
 *
 * The words are real text, so they are always spelled correctly, in any font and
 * any language. Drag the four corners onto a signboard and the type takes on the
 * sign's perspective — the same distort you would do by hand.
 */
export default function Letterer({
  row,
  blob,
  settings,
  onClose,
  onSaved,
  pushToast,
  pushLog,
}: {
  row: ManifestRow;
  blob: Blob;
  settings: ForgeSettings;
  onClose: () => void;
  onSaved?: (name: string, png: Blob) => void;
  pushToast: (kind: Toast["kind"], msg: string) => void;
  pushLog?: (msg: string, kind: "info" | "ok" | "err" | "run") => void;
}) {
  const [layers, setLayers] = useState<TextLayer[]>(() => [newTextLayer("YOUR TEXT")]);
  const [activeId, setActiveId] = useState<string>("");
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [what, setWhat] = useState("");

  const imgRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<null | { id: string; corner: number | null; start: Point; quad: Quad }>(null);

  const active = layers.find((l) => l.id === activeId) ?? layers[0];

  useEffect(() => {
    if (!activeId && layers[0]) setActiveId(layers[0].id);
  }, [activeId, layers]);

  /* load the picture */
  useEffect(() => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      redraw();
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blob]);

  const patch = useCallback(
    (p: Partial<TextLayer>) => setLayers((ls) => ls.map((l) => (l.id === active?.id ? { ...l, ...p } : l))),
    [active?.id]
  );

  /* draw the picture, the lettering, and the handles */
  const redraw = useCallback(() => {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;
    const ratio = img.naturalHeight / img.naturalWidth;
    const w = 520;
    const h = Math.round(w * ratio);
    if (canvas.width !== w) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    drawLayers(ctx, layers, w, h);

    // handles for the layer being edited
    if (active) {
      const px = quadToPixels(active.quad, w, h);
      ctx.save();
      ctx.strokeStyle = "rgba(242,163,60,0.9)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      px.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
      px.forEach((p) => {
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--color-ember").trim() || "#f2a33c";
        ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--color-on-accent").trim() || "#241503";
        ctx.beginPath();
        ctx.rect(p.x - HANDLE / 2, p.y - HANDLE / 2, HANDLE, HANDLE);
        ctx.fill();
        ctx.stroke();
      });
      ctx.restore();
    }
  }, [active, layers]);

  useEffect(() => { redraw(); }, [redraw]);

  /* ---------- dragging ---------- */
  const canvasPoint = (e: React.PointerEvent): Point => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!active || !canvasRef.current) return;
    const c = canvasRef.current;
    const p = canvasPoint(e);
    const px = quadToPixels(active.quad, c.width, c.height);
    const corner = px.findIndex((q) => Math.hypot(q.x - p.x, q.y - p.y) <= HANDLE);
    const inside =
      corner < 0 &&
      (() => {
        let hit = false;
        for (let i = 0, j = 3; i < 4; j = i++) {
          if (
            px[i].y > p.y !== px[j].y > p.y &&
            p.x < ((px[j].x - px[i].x) * (p.y - px[i].y)) / (px[j].y - px[i].y) + px[i].x
          )
            hit = !hit;
        }
        return hit;
      })();
    if (corner < 0 && !inside) return;
    dragRef.current = { id: active.id, corner: corner >= 0 ? corner : null, start: p, quad: active.quad };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    const c = canvasRef.current;
    if (!d || !c) return;
    const p = canvasPoint(e);
    const dx = (p.x - d.start.x) / c.width;
    const dy = (p.y - d.start.y) / c.height;

    setLayers((ls) =>
      ls.map((l) => {
        if (l.id !== d.id) return l;
        if (d.corner === null) {
          return { ...l, quad: d.quad.map((q) => ({ x: q.x + dx, y: q.y + dy })) as Quad };
        }
        const q = d.quad.map((pt, i) => (i === d.corner ? { x: pt.x + dx, y: pt.y + dy } : pt)) as Quad;
        return { ...l, quad: q, freeform: true };
      })
    );
  };

  const onPointerUp = () => { dragRef.current = null; };

  /* ---------- placement helpers ---------- */

  const findQuiet = useCallback(() => {
    const img = imgRef.current;
    if (!img || !active) return;
    const c = document.createElement("canvas");
    c.width = 320;
    c.height = Math.round(320 * (img.naturalHeight / img.naturalWidth));
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const quad = findQuietQuad(ctx, c.width, c.height);
    patch({ quad, freeform: false });
    setNote("Put it in the calmest part of the picture. Drag it if you disagree.");
  }, [active, patch]);

  const askVision = useCallback(async () => {
    const img = imgRef.current;
    if (!img || !active) return;
    setBusy("vision");
    setNote("");

    // shrink before sending — the model does not need full resolution
    const c = document.createElement("canvas");
    const scale = Math.min(1, 768 / Math.max(img.naturalWidth, img.naturalHeight));
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
    const b64 = c.toDataURL("image/png").split(",")[1];

    // One engine, one call. This used to walk a ladder of Google models,
    // stepping down as each daily allowance ran out. The vision engine is now
    // whatever you chose in Settings, so there is no ladder to walk: if it
    // cannot answer, say why and let the free quiet-spot finder cover you.
    const r = await findTextSpotWithVision(b64, what || row.prompt.slice(0, 120), settings);
    if (r.problem) {
      setNote(`Could not ask the model — ${r.problem}. Place it by hand, or use “Find a quiet spot”.`);
      pushLog?.(`· lettering: ${r.problem}`, "info");
    } else {
      patch({ quad: r.quad, freeform: true });
      const named = r.model ? ` (${r.model})` : "";
      setNote(
        r.confident
          ? `Placed on ${r.surface || "the surface it found"}${named}. Nudge the corners if it is off.`
          : `No obvious surface, so it chose a clear area${named}. Drag it if you disagree.`
      );
    }
    setBusy("");
  }, [active, patch, pushLog, row.prompt, settings, what]);

  const save = useCallback(async () => {
    const img = imgRef.current;
    if (!img) return;
    setBusy("save");
    try {
      const png = await compositeToBlob(img, layers, {
        width: img.naturalWidth,
        height: img.naturalHeight,
      });
      const name = letteredNameFor(row.filename);
      downloadBlob(name, png);
      onSaved?.(name, png);
      pushToast("ok", `Saved ${name} — ${Math.round(png.size / 1024)} KB.`);
    } catch (e) {
      pushToast("err", `Could not save — ${(e as { message?: string })?.message ?? "unknown"}`);
    } finally {
      setBusy("");
    }
  }, [layers, onSaved, pushToast, row.filename]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm">
      <div className="my-6 w-full max-w-5xl rounded-2xl border border-line bg-panel shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div>
            <p className="font-display text-[17px] tracking-wide text-cream">Add lettering</p>
            <p className="font-mono text-[10.5px] text-dust">{row.filename}</p>
          </div>
          <button data-tip="Closes the lettering window without saving." onClick={onClose} className="btn-press rounded-lg p-2 text-dust hover:bg-raise hover:text-cream">
            <IX size={16} />
          </button>
        </div>

        <div className="grid gap-5 p-5 lg:grid-cols-[520px_1fr]">
          {/* canvas */}
          <div>
            <canvas
              ref={canvasRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              className="w-full cursor-move touch-none rounded-lg border border-line bg-black"
            />
            <p className="mt-1.5 text-[11px] text-dust">
              Drag inside the box to move it. Drag a corner to bend the letters onto a surface.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Btn data-tip="Moves the text box to the calmest part of the picture, where it will not cover anything busy." onClick={findQuiet}>Find a quiet spot</Btn>
              <Btn data-tip="Sends a small copy of the picture to a vision AI (one that can look at pictures) and asks where the text fits best." variant="primary" onClick={askVision} disabled={busy === "vision"}>
                {busy === "vision" ? "looking…" : "Ask a model where"}
              </Btn>
              <Btn
                onClick={() => active && patch({ quad: boxQuad(0.5, 0.5, 0.7, 0.18, 0), freeform: false })}
                title="put the box back to a plain rectangle"
              >
                Straighten
              </Btn>
            </div>
            {note && (
              <p className="mt-2 rounded-lg border border-line bg-[var(--color-field)] px-3 py-2 text-[11.5px] text-parch">{note}</p>
            )}
          </div>

          {/* controls */}
          <div className="space-y-3.5">
            <div className="flex items-center gap-2">
              <div className="flex flex-1 flex-wrap gap-1.5">
                {layers.map((l, i) => (
                  <button data-tip="Picks this line of text so you can change it. Each line of lettering is its own layer."
                    key={l.id}
                    onClick={() => setActiveId(l.id)}
                    className={`btn-press rounded-md px-2 py-1 font-mono text-[10.5px] ${
                      l.id === active?.id ? "bg-ember text-[var(--color-on-accent)]" : "border border-line text-parch"
                    }`}
                  >
                    {l.text.split("\n")[0].slice(0, 12) || `layer ${i + 1}`}
                  </button>
                ))}
              </div>
              <Btn data-tip="Adds another line of text on top of the picture."
                onClick={() => {
                  const l = newTextLayer("NEW LINE");
                  setLayers((ls) => [...ls, l]);
                  setActiveId(l.id);
                }}
              >
                + layer
              </Btn>
              {layers.length > 1 && (
                <button data-tip="Deletes the line of text you are editing."
                  onClick={() => {
                    setLayers((ls) => ls.filter((l) => l.id !== active?.id));
                    setActiveId("");
                  }}
                  className="btn-press rounded-md p-1.5 text-dust hover:bg-blood/15 hover:text-blood"
                >
                  <ITrash size={13} />
                </button>
              )}
            </div>

            {active && (
              <>
                <div>
                  <label className={label}>the words</label>
                  <textarea data-tip="The words that go on the picture."
                    value={active.text}
                    onChange={(e) => patch({ text: e.target.value })}
                    rows={2}
                    className={`${field} resize-y`}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={label}>font</label>
                    <select data-tip="The style of the letters." value={active.font} onChange={(e) => patch({ font: e.target.value })} className={field}>
                      {FONT_CHOICES.map((f) => (
                        <option key={f.id} value={f.stack}>{f.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={label}>alignment</label>
                    <select data-tip="Where lines of text sit inside the box: left, middle or right."
                      value={active.align}
                      onChange={(e) => patch({ align: e.target.value as TextLayer["align"] })}
                      className={field}
                    >
                      <option value="left">left</option>
                      <option value="center">centre</option>
                      <option value="right">right</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={label}>colour</label>
                    <input data-tip="The main colour of the letters."
                      type="color"
                      value={active.color}
                      onChange={(e) => patch({ color: e.target.value })}
                      className="h-9 w-full rounded-lg border border-line bg-[var(--color-field)]"
                    />
                  </div>
                  <div>
                    <label className={label}>outline</label>
                    <input data-tip="The colour of the thin line around each letter."
                      type="color"
                      value={active.strokeColor}
                      onChange={(e) => patch({ strokeColor: e.target.value })}
                      className="h-9 w-full rounded-lg border border-line bg-[var(--color-field)]"
                    />
                  </div>
                </div>

                {(
                  [
                    ["sizeRatio", "size", 0.2, 1.2, 0.02],
                    ["strokeRatio", "outline thickness", 0, 0.3, 0.01],
                    ["shadow", "shadow", 0, 1, 0.05],
                    ["letterSpacing", "letter spacing", -0.05, 0.4, 0.01],
                    ["opacity", "opacity", 0.1, 1, 0.05],
                  ] as const
                ).map(([key, name, min, max, step]) => (
                  <div key={key}>
                    <label className={label}>
                      {name} · {Number(active[key]).toFixed(2)}
                    </label>
                    <input data-tip={`Drag to change the ${name}. The number next to the name shows the current setting.`}
                      type="range"
                      min={min}
                      max={max}
                      step={step}
                      value={Number(active[key])}
                      onChange={(e) => patch({ [key]: Number(e.target.value) } as Partial<TextLayer>)}
                      className="h-1.5 w-full accent-[var(--color-ember)]"
                    />
                  </div>
                ))}

                <div className="flex flex-wrap gap-3 text-[12px] text-parch">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input data-tip="Turns every letter into a capital."
                      type="checkbox"
                      checked={active.uppercase}
                      onChange={(e) => patch({ uppercase: e.target.checked })}
                      className="h-4 w-4 accent-[var(--color-ember)]"
                    />
                    CAPITALS
                  </label>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input data-tip="Slants the letters."
                      type="checkbox"
                      checked={active.italic}
                      onChange={(e) => patch({ italic: e.target.checked })}
                      className="h-4 w-4 accent-[var(--color-ember)]"
                    />
                    italic
                  </label>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input data-tip="Makes the letters thick and heavy."
                      type="checkbox"
                      checked={active.weight >= 700}
                      onChange={(e) => patch({ weight: e.target.checked ? 700 : 400 })}
                      className="h-4 w-4 accent-[var(--color-ember)]"
                    />
                    bold
                  </label>
                </div>

                <div>
                  <label className={label}>what is this caption for? (helps the model place it)</label>
                  <input data-tip="Say what this text is, for example the shop name on the sign. It helps the AI choose where to put it."
                    value={what}
                    onChange={(e) => setWhat(e.target.value)}
                    placeholder="the shop name, on the hanging sign"
                    className={field}
                  />
                </div>
              </>
            )}

            <div className="flex items-center gap-2 border-t border-line pt-3">
              <Btn data-tip="Saves the picture with the lettering as a new file next to the original. The original is never changed." variant="primary" onClick={save} disabled={busy === "save"}>
                {busy === "save" ? "saving…" : "Save the lettered picture"}
              </Btn>
              <span className="text-[11px] text-dust">saved alongside the original, never over it</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
