/**
 * Real screenshots of the real app, and the 1200x630 share card.
 *
 *   npm run build
 *   npx electron scripts/capture/capture.mjs [--out site/public/screens] [--skip-make]
 *
 * Why this exists: the README and the docs site need screenshots (STANDARDS §1,
 * §7), and screenshots taken by hand go stale the first time the UI changes.
 * This drives the built app itself and photographs it, so re-running it after a
 * UI change refreshes every picture.
 *
 * It runs in a throwaway profile — a temporary userData folder — so it never
 * reads or changes anyone's real settings, keys or manifest. With nothing set
 * up, the app's default engine is OVHcloud (free, no key), so the Start-screen
 * shot shows pictures the app actually made, not mock-ups. --skip-make skips
 * that step when offline.
 */
import { app, BrowserWindow } from "electron";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const argv = process.argv.slice(2);
const flag = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : d;
};
const OUT = path.resolve(ROOT, flag("out", "site/public/screens"));
const DIST = path.join(ROOT, "dist");
const SKIP_MAKE = argv.includes("--skip-make");

// A clean, disposable profile. Must be set before the app is ready.
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), "forge-capture-"));
app.setPath("userData", PROFILE);

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".json": "application/json" };

function serveDist() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      // Pretend to be the desktop app so its desktop-only settings appear.
      if ((req.url || "").startsWith("/app/info")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ desktop: true, mode: "window", version: "capture" }));
        return;
      }
      if ((req.url || "").startsWith("/app/")) {
        res.writeHead(404);
        res.end();
        return;
      }
      let p = decodeURIComponent((req.url || "/").split("?")[0]);
      if (p === "/") p = "/index.html";
      let file = path.normalize(path.join(DIST, p));
      if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, "index.html");
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shoot(win, name) {
  await sleep(1400); // let the view change and its entrance animation settle
  win.webContents.invalidate();
  await sleep(300);
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(OUT, name), img.toPNG());
  console.log(`✓ ${name}`);
  return img;
}

/** Click the first button whose visible text matches. */
const click = (win, text) =>
  win.webContents.executeJavaScript(`(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim().startsWith(${JSON.stringify(text)}));
    if (!b) return false; b.click(); return true;
  })()`);

/** Type into a React-controlled field: native setter + the event React listens for. */
const typeInto = (win, selector, value) =>
  win.webContents.executeJavaScript(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`);

async function shareCard(startShot) {
  const card = new BrowserWindow({ width: 1200, height: 630, show: false, useContentSize: true, webPreferences: { offscreen: false } });
  const soraDir = path.join(ROOT, "site", "node_modules", "@fontsource-variable", "sora", "files");
  const sora = fs.existsSync(soraDir) ? fs.readdirSync(soraDir).find((f) => /latin-wght-normal\.woff2$/.test(f)) : null;
  const fontFace = sora
    ? `@font-face{font-family:Sora;src:url("data:font/woff2;base64,${fs.readFileSync(path.join(soraDir, sora)).toString("base64")}") format("woff2");font-weight:100 800;}`
    : "";
  const shot = startShot ? `data:image/png;base64,${startShot.resize({ width: 760 }).toPNG().toString("base64")}` : "";
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    ${fontFace}
    *{box-sizing:border-box;margin:0}
    body{width:1200px;height:630px;overflow:hidden;font-family:Sora,system-ui,sans-serif;color:#eaf6f2;
      background:radial-gradient(900px 500px at 85% 20%,rgba(66,169,164,.35),transparent 60%),
                 radial-gradient(700px 500px at 10% 100%,rgba(130,216,183,.18),transparent 60%),#11173a;}
    .dots{position:absolute;inset:0;background-image:radial-gradient(rgba(130,216,183,.22) 1.2px,transparent 1.2px);background-size:22px 22px;mask-image:linear-gradient(90deg,#000 0%,transparent 70%)}
    .left{position:absolute;left:72px;top:92px;width:520px}
    .tag{display:inline-block;padding:8px 14px;border-radius:999px;background:rgba(66,169,164,.18);border:1px solid rgba(130,216,183,.4);color:#82D8B7;font-size:20px;font-weight:600;letter-spacing:.02em}
    h1{margin-top:26px;font-size:78px;line-height:1.02;font-weight:800;letter-spacing:-.02em}
    p{margin-top:24px;font-size:28px;line-height:1.35;color:#c9e6de;font-weight:400}
    .foot{position:absolute;left:72px;bottom:60px;font-size:20px;color:#82D8B7;font-weight:600}
    .shot{position:absolute;right:-40px;top:96px;width:620px;border-radius:18px;border:1px solid rgba(130,216,183,.35);
      box-shadow:0 30px 80px rgba(0,0,0,.55);transform:perspective(1400px) rotateY(-12deg) rotateX(4deg)}
  </style></head><body><div class="dots"></div>
    <div class="left"><span class="tag">Free · open source · your own keys</span>
      <h1>Image Forge</h1>
      <p>Describe it once, say how many, get a folder of named pictures.</p></div>
    <div class="foot">docs.stravelakis.com/image-forge</div>
    ${shot ? `<img class="shot" src="${shot}">` : ""}
  </body></html>`;
  await card.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await sleep(600);
  const img = await card.webContents.capturePage();
  const target = path.join(path.dirname(OUT), "og-image.png");
  fs.writeFileSync(target, img.toPNG());
  console.log(`✓ ${path.relative(ROOT, target)} (${img.getSize().width}x${img.getSize().height})`);
  card.destroy();
}

app.whenReady().then(async () => {
  if (!fs.existsSync(path.join(DIST, "index.html"))) {
    console.error("✗ no dist/ — run npm run build first");
    app.exit(1);
    return;
  }
  fs.mkdirSync(OUT, { recursive: true });
  const { server, port } = await serveDist();
  // Shown, but parked off-screen, with throttling off. A hidden window only
  // repaints when it feels like it, so every capture came back one step
  // behind — the "Forge" shot showed the Start screen.
  const win = new BrowserWindow({
    width: 1440, height: 900, x: -3000, y: 0, show: true, useContentSize: true, backgroundColor: "#17120e",
    webPreferences: { backgroundThrottling: false },
  });
  await win.loadURL(`http://127.0.0.1:${port}/`);
  await sleep(2500);

  // 1. The front door, filled in. Retried: the first attempt can land before
  // React has put the box on the page, and the shot then shows it empty.
  for (let i = 0; i < 40; i++) {
    if (await typeInto(win, 'textarea[aria-label="What do you need?"]', "4 cosy fantasy potion shop fronts, warm lantern light")) break;
    await sleep(250);
  }
  await shoot(win, "start.png");

  // 2. The same screen with the pictures it actually made.
  let startShot = null;
  // Reuse the last real results shot for the share card when not re-making.
  const lastResults = path.join(OUT, "start-results.png");
  if (SKIP_MAKE && fs.existsSync(lastResults)) {
    const { nativeImage } = await import("electron");
    startShot = nativeImage.createFromPath(lastResults);
  }
  if (!SKIP_MAKE) {
    await click(win, "Make");
    const until = Date.now() + 6 * 60 * 1000;
    for (;;) {
      const n = await win.webContents.executeJavaScript(
        `[...document.querySelectorAll("main img")].filter((i) => i.complete && i.naturalWidth > 0).length`
      );
      if (n >= 4 || Date.now() > until) break;
      await sleep(4000);
    }
    startShot = await shoot(win, "start-results.png");
  }

  // 3. The spreadsheet.
  await click(win, "Forge");
  await shoot(win, "forge.png");

  // 4. Chat.
  await click(win, "Chat");
  await shoot(win, "chat.png");

  // 5. Settings → Image engines.
  await click(win, "Settings");
  await sleep(400);
  await click(win, "Image engines");
  await shoot(win, "settings.png");

  // 6. Settings → Advanced: window or browser, and updates.
  await click(win, "Advanced");
  await sleep(400);
  await win.webContents.executeJavaScript(`[...document.querySelectorAll("p")].find((p) => p.textContent === "Where Image Forge opens")?.scrollIntoView({ block: "center" })`);
  await shoot(win, "settings-advanced.png");

  await shareCard(startShot);
  server.close();
  // Electron still holds files in the profile until it exits; a failed
  // cleanup here used to leave the script hanging. Temp is cleaned by Windows.
  try {
    fs.rmSync(PROFILE, { recursive: true, force: true });
  } catch {
    /* left for Windows to clean */
  }
  app.exit(0);
});
