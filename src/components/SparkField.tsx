// ---------------------------------------------------------------------------
// The Forge ground: tiny orange-red sparks on pure black, and a small burst
// on every click. Look A, "Star sparks", picked by Ak on 11 Oct 2026, then
// tuned by him: the logos' orange-red, half the first density, and clicks
// that always fly north-east (up and to the right), never all around.
//
// (Copied from Video Forge, src/components/ui/SparkField.tsx — keep the two alike.)
// Two canvases: the field sits behind the app, the burst sits above it with
// pointer-events off, so sparks are visible over panels without ever eating a
// click. Both stop moving when motion is switched off in Settings or by the
// system's reduced-motion preference — the field then holds still.
// ---------------------------------------------------------------------------

import { useEffect, useRef } from "react";

type RGB = [number, number, number];
const EMBER: RGB = [255, 138, 48];
const HOT: RGB = [255, 196, 120];
const RED: RGB = [232, 64, 28];
const DEEP: RGB = [150, 30, 12];
const mix = (a: RGB, b: RGB, t: number): RGB => a.map((v, i) => Math.round(v + (b[i] - v) * t)) as RGB;

interface Speck { x: number; y: number; r: number; c: RGB; tw: number; ts: number; vx: number; vy: number; a: number }
interface Spark { x: number; y: number; px: number; py: number; vx: number; vy: number; t: number; life: number; hot: boolean }

/** One speck per this many square pixels. Ak halved the first density. */
const AREA_PER_SPECK = 5200;

/** `field` off: no specks on the ground, only the burst on a click — Image
 *  Forge's ground is pure black (Ak, 13 Oct 2026). */
export function SparkField({ moving, field = true }: { moving: boolean; field?: boolean }) {
  const skyRef = useRef<HTMLCanvasElement>(null);
  const fxRef = useRef<HTMLCanvasElement>(null);
  const movingRef = useRef(moving);
  const fieldOn = field;
  movingRef.current = moving;

  useEffect(() => {
    const sky = skyRef.current!, fx = fxRef.current!;
    const g = sky.getContext("2d")!, f = fx.getContext("2d")!;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let W = 0, H = 0, raf = 0, t = 0;
    let field: Speck[] = [];
    let sparks: Spark[] = [];

    const speck = (): Speck => {
      const k = Math.random();
      return {
        x: Math.random() * W, y: Math.random() * H,
        r: Math.random() < 0.93 ? 0.25 + Math.random() * 0.55 : 0.8 + Math.random() * 0.6,
        c: k < 0.45 ? EMBER : k < 0.75 ? RED : k < 0.92 ? HOT : DEEP,
        tw: Math.random() * 6.283, ts: 0.6 + Math.random() * 2.2,
        vx: (Math.random() - 0.5) * 0.04, vy: -0.01 - Math.random() * 0.03,
        a: 0.25 + Math.random() * 0.75,
      };
    };
    const size = () => {
      const dpr = Math.min(2, devicePixelRatio || 1);
      W = innerWidth; H = innerHeight;
      for (const c of [sky, fx]) { c.width = W * dpr; c.height = H * dpr; }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      f.setTransform(dpr, 0, 0, dpr, 0, 0);
      field = fieldOn ? Array.from({ length: Math.round((W * H) / AREA_PER_SPECK) }, speck) : [];
    };
    const burst = (e: PointerEvent) => {
      if (!movingRef.current || reduced.matches) return;
      const n = 3 + Math.round(Math.random()); // 3–4
      for (let i = 0; i < n; i++) {
        // North-east only: from straight up (-90°) to straight right (0°),
        // kept a little off both edges so it never reads as vertical or flat.
        const ang = (-Math.PI / 2) * (0.12 + Math.random() * 0.76);
        const sp = 1.5 + Math.random() * 1.7;
        sparks.push({ x: e.clientX, y: e.clientY, px: e.clientX, py: e.clientY,
          vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, t: 0, life: 30 + Math.random() * 20, hot: Math.random() < 0.5 });
      }
    };

    const frame = () => {
      const live = movingRef.current && !reduced.matches;
      t += 1 / 60;
      g.clearRect(0, 0, W, H);
      for (const p of field) {
        if (live) { p.x += p.vx; p.y += p.vy; if (p.y < -2) { p.y = H + 2; p.x = Math.random() * W; } }
        const a = live ? p.a * (0.55 + 0.45 * Math.sin(p.tw + t * p.ts)) : p.a * 0.7;
        g.fillStyle = `rgba(${p.c},${a})`;
        g.beginPath(); g.arc(p.x, p.y, p.r, 0, 6.283); g.fill();
      }
      f.clearRect(0, 0, W, H);
      sparks = sparks.filter((s) => s.t < s.life);
      for (const s of sparks) {
        s.px = s.x; s.py = s.y; s.x += s.vx; s.y += s.vy; s.vy += 0.025; s.vx *= 0.97; s.vy *= 0.97; s.t++;
        const k = 1 - s.t / s.life;
        const c = mix(RED, s.hot ? HOT : EMBER, k); // born hot, cooling to red
        f.strokeStyle = `rgba(${c},${k})`; f.lineWidth = 0.9; f.lineCap = "round";
        f.beginPath(); f.moveTo(s.px - s.vx * 2.2, s.py - s.vy * 2.2); f.lineTo(s.x, s.y); f.stroke();
        f.fillStyle = `rgba(${c},${k})`; f.beginPath(); f.arc(s.x, s.y, 0.9, 0, 6.283); f.fill();
      }
      raf = requestAnimationFrame(frame);
    };

    size();
    addEventListener("resize", size);
    addEventListener("pointerdown", burst, { passive: true });
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("resize", size);
      removeEventListener("pointerdown", burst);
    };
  }, []);

  return (
    <>
      <canvas ref={skyRef} aria-hidden className="fixed inset-0 w-full h-full pointer-events-none" style={{ zIndex: -1 }} />
      <canvas ref={fxRef} aria-hidden className="fixed inset-0 w-full h-full pointer-events-none" style={{ zIndex: 9999 }} />
    </>
  );
}
