/**
 * THE CURSOR PET (Ak, 13 Oct 2026: "by cursor chaser I meant a running pet, or
 * another sprite sheet that can do that").
 *
 * A little creature that runs after the mouse, sits when it catches up, and
 * naps if you stop for a while. The built-in one is drawn here in code — a
 * violet forge fox — and any walk cycle made in "Make a sheet" can take its
 * place ("Make it my cursor pet"), its background cut away.
 *
 * Never in the way: it ignores the mouse (clicks go through), sits under the
 * hover bubbles, and stays home for people whose computer asks for less motion.
 */
import { useEffect, useRef, useState } from "react";

export const PET_KEY = "image-forge-cursor-pet";
export const PET_EVENT = "image-forge-pet-changed";

export interface PetChoice {
  on: boolean;
  /** absent = the built-in fox */
  custom?: { name: string; frames: string[]; frameMs: number };
}

export function loadPet(): PetChoice {
  try {
    const v = JSON.parse(localStorage.getItem(PET_KEY) ?? "null");
    if (v && typeof v.on === "boolean") return v;
  } catch {
    /* default */
  }
  return { on: true };
}

export function savePet(p: PetChoice): void {
  try {
    localStorage.setItem(PET_KEY, JSON.stringify(p));
  } catch {
    /* too big: keep the built-in */
  }
  window.dispatchEvent(new Event(PET_EVENT));
}

/* ---------------- the built-in fox, drawn frame by frame ---------------- */

const W = 56;
const H = 44;

function drawFox(g: CanvasRenderingContext2D, phase: number, mode: "run" | "sit" | "sleep", blink = false) {
  g.clearRect(0, 0, W, H);
  const body = "#a897ff";
  const dark = "#6f5ce0";
  const light = "#e6e0ff";
  g.lineCap = "round";
  if (mode === "run") {
    const bob = Math.sin(phase * Math.PI * 2) * 1.6;
    // legs: two pairs swinging opposite
    g.strokeStyle = dark;
    g.lineWidth = 3.4;
    const legs: [number, number][] = [[20, 0], [24, Math.PI], [34, Math.PI], [38, 0]];
    for (const [x, off] of legs) {
      const a = Math.sin(phase * Math.PI * 2 + off) * 0.75;
      g.beginPath();
      g.moveTo(x, 28 + bob);
      g.lineTo(x + Math.sin(a) * 8, 28 + bob + Math.cos(a) * 9);
      g.stroke();
    }
    // tail, streaming behind
    g.fillStyle = body;
    g.beginPath();
    g.ellipse(10, 20 + bob - Math.sin(phase * Math.PI * 2) * 2, 10, 4.5, -0.35, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = light;
    g.beginPath();
    g.ellipse(3, 22 + bob, 3.5, 2.5, -0.35, 0, Math.PI * 2);
    g.fill();
    // body
    g.fillStyle = body;
    g.beginPath();
    g.ellipse(29, 24 + bob, 13, 7.5, 0, 0, Math.PI * 2);
    g.fill();
    head(g, 42, 16 + bob, false);
  } else {
    // sitting (or curled asleep): haunches, tail wrapped round
    const sleep = mode === "sleep";
    g.fillStyle = body;
    g.beginPath();
    g.ellipse(28, sleep ? 33 : 28, sleep ? 15 : 10, sleep ? 8 : 12, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.ellipse(sleep ? 18 : 16, 37, 11, 4, 0.1, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = light;
    g.beginPath();
    g.ellipse(sleep ? 9 : 8, 37, 4, 3, 0, 0, Math.PI * 2);
    g.fill();
    head(g, sleep ? 38 : 31, sleep ? 28 : 13, sleep || blink);
    if (sleep) {
      g.fillStyle = "#c9bdff";
      g.font = "600 9px Sora, sans-serif";
      g.fillText("z", 46, 14 + Math.sin(phase * Math.PI * 2) * 2);
      g.font = "600 7px Sora, sans-serif";
      g.fillText("z", 51, 8 + Math.sin(phase * Math.PI * 2 + 1) * 2);
    }
  }

  function head(c: CanvasRenderingContext2D, x: number, y: number, closed: boolean) {
    c.fillStyle = body;
    c.beginPath(); // ears
    c.moveTo(x - 7, y - 3); c.lineTo(x - 5, y - 12); c.lineTo(x - 1, y - 5);
    c.moveTo(x + 1, y - 5); c.lineTo(x + 5, y - 12); c.lineTo(x + 7, y - 3);
    c.fill();
    c.beginPath();
    c.ellipse(x, y, 8, 7, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = light; // snout
    c.beginPath();
    c.ellipse(x + 4, y + 3, 4.5, 3, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#1b1438"; // nose and eyes
    c.beginPath();
    c.arc(x + 8, y + 2, 1.3, 0, Math.PI * 2);
    c.fill();
    if (closed) {
      c.strokeStyle = "#1b1438";
      c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(x - 2, y - 1); c.lineTo(x + 2, y - 1);
      c.stroke();
    } else {
      c.beginPath();
      c.arc(x + 1, y - 1, 1.5, 0, Math.PI * 2);
      c.fill();
    }
  }
}

/* ---------------- the chase ---------------- */

export function CursorPet() {
  const [pet, setPet] = useState<PetChoice>(loadPet);
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const on = () => setPet(loadPet());
    window.addEventListener(PET_EVENT, on);
    return () => window.removeEventListener(PET_EVENT, on);
  }, []);

  useEffect(() => {
    if (!pet.on || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const c = ref.current;
    if (!c) return;
    const g = c.getContext("2d")!;
    const custom = pet.custom;
    const imgs = custom?.frames.map((src) => Object.assign(new Image(), { src })) ?? [];
    // Drawn at twice the pixels and shown 1.7× — big enough to enjoy, sharp.
    const SHOW = 1.7;
    const size = custom ? 72 : W;
    c.width = (custom ? size : W) * 2;
    c.height = (custom ? size : H) * 2;
    c.style.width = `${(custom ? size : W) * (custom ? 1 : SHOW)}px`;
    c.style.height = `${(custom ? size : H) * (custom ? 1 : SHOW)}px`;
    g.setTransform(2, 0, 0, 2, 0, 0);
    const half = { w: ((custom ? size : W) * (custom ? 1 : SHOW)) / 2, h: ((custom ? size : H) * (custom ? 1 : SHOW)) / 2 };

    let mx = -100;
    let my = -100;
    let x = window.innerWidth - 120;
    let y = window.innerHeight - 80;
    let facing = 1;
    let phase = 0;
    let still = 0;
    let last = performance.now();
    let raf = 0;
    let frame = 0;
    let frameAt = 0;
    const move = (e: PointerEvent) => {
      mx = e.clientX;
      my = e.clientY;
    };
    window.addEventListener("pointermove", move);

    const loop = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      // It sits a little behind and below the pointer, not on it.
      const tx = mx - facing * 34;
      const ty = my + 26;
      const dx = tx - x;
      const dy = ty - y;
      const dist = Math.hypot(dx, dy);
      const running = mx > -50 && dist > 26;
      if (running) {
        const speed = Math.min(dist, (0.28 + Math.min(dist, 600) / 900) * dt);
        x += (dx / dist) * speed;
        y += (dy / dist) * speed;
        if (Math.abs(dx) > 6) facing = dx > 0 ? 1 : -1;
        still = 0;
        phase = (phase + dt / 260) % 1;
      } else {
        still += dt;
        phase = (phase + dt / 1600) % 1;
      }
      const mode: "run" | "sit" | "sleep" = running ? "run" : still > 9000 ? "sleep" : "sit";
      if (custom && imgs.length) {
        // A sheet pet: its walk cycle while running, its first frame sitting.
        if (running && now - frameAt > custom.frameMs) {
          frame = (frame + 1) % imgs.length;
          frameAt = now;
        }
        g.clearRect(0, 0, size * 2, size * 2);
        const im = running ? imgs[frame] : imgs[0];
        if (im.complete) g.drawImage(im, 0, 0, size, size);
      } else {
        drawFox(g, phase, mode, !running && Math.floor(now / 3200) % 9 === 0 && now % 3200 < 160);
      }
      c.style.transform = `translate(${x - half.w}px, ${y - half.h}px) scaleX(${facing})`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", move);
    };
  }, [pet]);

  if (!pet.on) return null;
  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      style={{ position: "fixed", left: 0, top: 0, zIndex: 2147483000, pointerEvents: "none", filter: "drop-shadow(0 4px 10px rgba(168,151,255,.45))" }}
    />
  );
}
