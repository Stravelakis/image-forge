/**
 * CURSOR CHASERS, made by Image Forge (Ak, 14 Oct 2026: "I want the app to be
 * able to create cursor chasers"). A little creature that runs after the
 * mouse on a website, sits when it catches up, and naps when the mouse rests.
 *
 * Made with "Make a sheet" → Cursor chaser: four running frames, one sitting,
 * one asleep, all facing right. Downloaded as a folder anyone can drop into a
 * website: the sprite strip, one small script with no dependencies, a demo page
 * and a read-me.
 *
 * The behaviour lives in ONE place — CHASER_CORE below — used both by the
 * "Try it here" preview in the app and by the downloaded script, so what you
 * try is exactly what you ship.
 *
 * The two-headed fox (Ak): with the mouse still, the first version aimed a bit
 * BEHIND the pointer, and "behind" moved to the other side every time it
 * turned round — so it turned round again, every frame. Now it aims at the
 * pointer itself, stops a short distance away, and only turns while running
 * and clearly heading the other way.
 */

/** Frame order in the strip: run 0–3, sit, sleep. */
export const CHASER_FRAMES = ["run_1", "run_2", "run_3", "run_4", "sit", "sleep"] as const;

/** The chase itself, as plain JavaScript text (no imports, no build step). */
export const CHASER_CORE = String.raw`
function startChaser(opts) {
  var strip = opts.strip, frames = opts.frames || 6, size = opts.size || 64, speed = opts.speed || 1;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) return function () {};
  var el = document.createElement("div");
  el.setAttribute("aria-hidden", "true");
  el.style.cssText = "position:fixed;left:0;top:0;width:" + size + "px;height:" + size + "px;pointer-events:none;z-index:2147483000;" +
    "background-image:url(" + strip + ");background-size:" + (size * frames) + "px " + size + "px;background-repeat:no-repeat;image-rendering:auto;will-change:transform";
  document.body.appendChild(el);
  var mx = -1, my = -1, x = innerWidth - size * 2, y = innerHeight - size * 1.5;
  var facing = 1, frame = 0, frameAt = 0, still = 0, last = performance.now(), raf = 0;
  function move(e) { mx = e.clientX; my = e.clientY; }
  addEventListener("pointermove", move);
  function loop(now) {
    var dt = Math.min(64, now - last); last = now;
    var dx = mx - x, dy = (my + size * 0.35) - y, d = Math.hypot(dx, dy);
    var running = mx >= 0 && d > size * 0.6;
    var pick;
    if (running) {
      var step = Math.min(d, (0.22 + Math.min(d, 600) / 1000) * dt * speed);
      x += dx / d * step; y += dy / d * step;
      // Turn only when clearly heading the other way — never back and forth.
      if (dx > size * 0.4) facing = 1; else if (dx < -size * 0.4) facing = -1;
      if (now - frameAt > 90) { frame = (frame + 1) % 4; frameAt = now; }
      pick = frame; still = 0;
    } else {
      still += dt;
      pick = still > 8000 ? 5 : 4;
    }
    el.style.backgroundPosition = (-pick * size) + "px 0";
    el.style.transform = "translate(" + (x - size / 2) + "px," + (y - size / 2) + "px) scaleX(" + facing + ")";
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);
  return function stop() { cancelAnimationFrame(raf); removeEventListener("pointermove", move); el.remove(); };
}
`;

/** Start the chaser in this page (the app's "Try it here"). Returns stop(). */
export function tryChaser(strip: string, size = 64): () => void {
  const start = new Function(`${CHASER_CORE}; return startChaser;`)() as (o: { strip: string; size: number }) => () => void;
  return start({ strip, size });
}

/** The downloadable script: the core plus a few lines that start it from its own <script> tag. */
export function chaserScript(): string {
  return `/* Cursor chaser — made with Image Forge. No dependencies.
   Use: <script src="chaser.js" data-strip="chaser.png" data-size="64" defer></script> */
(function () {
${CHASER_CORE}
var me = document.currentScript;
function go() {
  startChaser({ strip: me.getAttribute("data-strip") || "chaser.png", size: Number(me.getAttribute("data-size")) || 64, speed: Number(me.getAttribute("data-speed")) || 1 });
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go();
})();
`;
}

export function chaserDemo(name: string): string {
  return `<!doctype html><meta charset="utf-8"><title>${name} — cursor chaser</title>
<style>body{margin:0;height:100vh;display:grid;place-items:center;background:#0b0b12;color:#ece8ff;font:16px system-ui}</style>
<p>Move your mouse — ${name} follows. Leave it still and they sit, then nap.</p>
<script src="chaser.js" data-strip="chaser.png" data-size="72" defer></script>`;
}

export function chaserReadme(name: string): string {
  return `${name} — a cursor chaser made with Image Forge

What it is: a little character that runs after the mouse on a web page, sits when it
catches up, and naps when the mouse stays still.

To add it to your website:
1. Put chaser.png and chaser.js next to your page (or anywhere on your site).
2. Add this line just before </body>:
   <script src="chaser.js" data-strip="chaser.png" data-size="64" defer></script>
   data-size  how big it is, in pixels (64 is a good start)
   data-speed how fast it runs (1 = normal, 1.5 = quicker)
3. Open demo.html to see it first.

It stays out of the way: clicks go through it, and it does not appear for people
whose computer asks for less motion.

WordPress: upload both files to Media, then add the line above with a "Custom HTML"
block or your theme's footer setting, with the two file addresses from Media.
`;
}
