/**
 * Image Forge desktop shell (Electron, ESM).
 *
 * The built site (dist/) is served by a tiny embedded HTTP server on
 * http://127.0.0.1:<fixed-port>. Two reasons we don't just open the html file:
 *   1. Vite emits absolute asset paths (/assets/...) which need a web root.
 *   2. 127.0.0.1 is a *secure context* — so the File System Access API
 *      (link output folder) keeps working inside the desktop app.
 */
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
// A real import, not require(): this file is ESM ("type": "module"), where
// require does not exist. It used to be `require("node:https")` inside the
// proxy, which threw on the first Cloudflare or NVIDIA request in the
// packaged app. The dev server never runs this file, so it never showed.
import https from "node:https";
import {
  linkPaths,
  writePresence,
  removePresence,
  pendingRequests,
  claimRequest,
  writeResult,
  finishRequest,
} from "./link.mjs";
import { autosaveRoot, readAutosave, writeAutosave } from "./autosave.mjs";
import { CONTENT_SECURITY_POLICY, hostAllowed, isAppCall, isOwnPage, safeDecodeUri, safeExternalUrl } from "./guards.mjs";
import { readMode, writeMode, writeHandover, takeHandover, isTrustedInstallerUrl, download, MODES } from "./appctl.mjs";
import { sharedValues, putShared } from "./forgeKeys.mjs";
import { openVault, HARVEST_PAGE } from "./vault.mjs";
import { recordMade } from "./forgeHub.mjs";
import { authLink, canvaClient, exchangeCode, tokenStore } from "./canva.mjs";
import { listWorkshop, readWorkshopFile, removeWorkshop, workshopRoot, writeWorkshopFile } from "./workshop.mjs";
import { shelfRoot, openOrders, orderPicture, finishOrder, savePuppetFile, listPuppets, puppetFile, removePuppet } from "./forgeShelf.mjs";
import os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, Menu, Tray, nativeImage, shell, dialog, screen } from "electron";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ---------------- static file server ---------------- */

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

function resolveDistDir() {
  // packaged: dist/ travels as an extraResource next to the exe
  // dev: dist/ sits at the project root
  const candidates = [
    path.join(process.resourcesPath || "", "dist"),
    path.join(__dirname, "..", "dist"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "index.html"))) return c;
  }
  return null;
}

/**
 * The providers that will not talk to a browser, and the prefix each one
 * answers to here.
 *
 * A CORS header is a server's permission for a web page to read its reply.
 * Both of these decline: Cloudflare sends no such header at all, and NVIDIA
 * answers a preflight 200 with no Access-Control-Allow-Origin, which the
 * browser reads as "no" and reports as the unhelpful "Failed to fetch".
 * Neither can be fixed from the page — checked against both, 4 September 2026.
 *
 * So those requests are forwarded from here, where the rule does not apply.
 * The list is closed on purpose: this proxy can reach these two hosts and
 * nothing else, so a bug in the page cannot turn it into an open relay.
 */
const PROXIED = {
  "/cf-api": { host: "api.cloudflare.com", name: "Cloudflare" },
  "/nv-api": { host: "integrate.api.nvidia.com", name: "NVIDIA" },
};

/**
 * Pass a proxied request straight through and pipe the answer back. Only the
 * Authorization and Content-Type headers travel, so nothing else about the
 * machine leaks.
 */
async function proxyUpstream(prefix, req, res) {
  const { host, name } = PROXIED[prefix];
  const target = req.url.slice(prefix.length) || "/";
  // The body is read whole and sent with its length. Piped, it went out in
  // chunks with no length, and NVIDIA waited for the end of a body that never
  // announced itself, then dropped the line (13 Oct 2026: "read ECONNRESET"
  // after 37 s — the Chat's fallback to NVIDIA never answered).
  let body = Buffer.alloc(0);
  try {
    body = req.method === "GET" || req.method === "HEAD" ? Buffer.alloc(0) : await readBody(req, 40 * 1024 * 1024);
  } catch (e) {
    res.writeHead(413, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `request too large for ${name}` }));
    return;
  }
  const upstream = https.request(
    {
      hostname: host,
      port: 443,
      // IPv4. On a network with half-working IPv6 the request sat on the IPv6
      // address until NVIDIA hung up — even "try both" lost the race on big
      // bodies (13 Oct 2026). Both hosts have IPv4 addresses.
      family: 4,
      path: target,
      method: req.method,
      headers: {
        ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}),
        ...(req.headers["content-type"] ? { "content-type": req.headers["content-type"] } : {}),
        ...(body.length ? { "content-length": String(body.length) } : {}),
        host,
      },
    },
    (up) => {
      res.writeHead(up.statusCode || 502, { "Content-Type": up.headers["content-type"] || "application/json" });
      up.pipe(res);
    }
  );
  upstream.on("error", (e) => {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `could not reach ${name}: ${e.message}` }));
  });
  upstream.end(body);
}

/**
 * The ports the desktop app will use, in order.
 *
 * Stable on purpose — see the note in startServer. Chosen high and unusual to
 * avoid colliding with anything a developer is likely to be running.
 */
// A test copy names its own (IMAGEFORGE_PORTS=47901,47902) so it can never
// take the real app's port — which is what emptied Ak's settings on 13 Oct.
const PORTS = (process.env.IMAGEFORGE_PORTS || "47821,47822,47823,47824,47825")
  .split(",")
  .map((p) => Number(p.trim()))
  .filter((p) => Number.isInteger(p) && p > 1024 && p < 65536);

/* ---------------- the link (see link.mjs) ---------------- */

let LINK = null; // set once Electron knows where userData is

const json = (res, code, body) => {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/**
 * The page's side of the link. Only the forge's own page calls these.
 *
 * The X-Forge-Link header is the guard. Any web page in any browser on this
 * computer could send a request to 127.0.0.1; a custom header makes the
 * browser ask permission first, and this server never grants it. So only the
 * app's own window — same origin, no preflight — gets through.
 */
async function handleLink(req, res) {
  if (!LINK) return json(res, 503, { error: "link not ready" });
  if (req.headers["x-forge-link"] !== "1") return json(res, 403, { error: "forbidden" });
  const url = new URL(req.url, "http://127.0.0.1");
  const parts = url.pathname.split("/").filter(Boolean); // ["link", "requests", id?, action?, file?]
  try {
    if (req.method === "GET" && parts.length === 2 && parts[1] === "requests") {
      return json(res, 200, { requests: pendingRequests(LINK) });
    }
    const id = parts[2];
    if (req.method === "POST" && parts[3] === "claim") return json(res, 200, { ok: claimRequest(LINK, id) });
    if (req.method === "PUT" && parts[3] === "files" && parts[4]) {
      const body = await readBody(req, 60 * 1024 * 1024);
      const r = writeResult(LINK, id, decodeURIComponent(parts[4]), body);
      return json(res, r.ok ? 200 : 400, r);
    }
    if (req.method === "POST" && parts[3] === "done") {
      const body = await readBody(req, 512 * 1024);
      const r = finishRequest(LINK, id, JSON.parse(body.toString("utf8") || "{}"));
      return json(res, r.ok ? 200 : 400, r);
    }
    return json(res, 404, { error: "not found" });
  } catch (e) {
    return json(res, 500, { error: e && e.message ? e.message : String(e) });
  }
}

/* ---------------- window or browser, and updates (see appctl.mjs) ---------------- */

// Filled in by the app section below, once there is a port and a window.
const APP_CTL = { port: 0, switchTo: null };

/**
 * Same guard as the link: a custom header means only the app's own page,
 * same origin, can call these. That matters most for /app/update, which
 * runs a program.
 */
const videoForgeExe = () => path.join(process.env.LOCALAPPDATA ?? "", "Programs", "Video Forge", "Video Forge.exe");

async function handleApp(req, res) {
  if (req.headers["x-forge-app"] !== "1") return json(res, 403, { error: "forbidden" });
  const userData = app.getPath("userData");
  const route = `${req.method} ${new URL(req.url, "http://127.0.0.1").pathname}`;
  try {
    if (route === "GET /app/info") {
      return json(res, 200, { desktop: true, mode: readMode(userData), version: app.getVersion() });
    }
    // THE VAULT (electron/vault.mjs): the page's storage, kept in a file.
    if (route === "GET /app/vault") {
      const v = vault();
      return json(res, 200, { values: await v.read(), harvests: await v.harvests() });
    }
    if (route === "PUT /app/vault") {
      const body = JSON.parse((await readBody(req, 40 * 1024 * 1024)).toString("utf8") || "{}");
      return json(res, 200, { changed: await vault().write(body.changes ?? {}) });
    }
    if (route === "POST /app/vault/harvested") {
      await vault().clearHarvests();
      return json(res, 200, { ok: true });
    }
    if (route === "GET /app/handover") {
      const me = String(req.headers["x-forge-side"] || "");
      return json(res, 200, { snapshot: MODES.includes(me) ? takeHandover(userData, me) : null });
    }
    // The Forge shelf: puppet orders from Video Forge, finished puppets for it
    // (electron/forgeShelf.mjs). Names are checked there, not here.
    const shelf = shelfRoot();
    const seg = route.split(" ")[1].split("/").map(decodeURIComponent); // ["", "app", "orders", id, file]
    // THE SAFETY COPY (electron/autosave.mjs): every picture, the moment it arrives, so closing the app loses nothing.
    if (seg[2] === "autosave" && seg.length === 5) {
      const root = autosaveRoot(userData);
      if (req.method === "PUT") {
        const r = writeAutosave(root, seg[3], seg[4], await readBody(req, 41 * 1024 * 1024));
        return json(res, r.ok ? 200 : 400, r);
      }
      if (req.method === "GET") {
        const bytes = readAutosave(root, seg[3], seg[4]);
        if (!bytes) return json(res, 404, { error: "no such picture" });
        const ext = path.extname(seg[4]).toLowerCase();
        res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
        return res.end(bytes);
      }
    }
    if (route === "GET /app/orders") return json(res, 200, { orders: openOrders(shelf) });
    if (req.method === "GET" && seg[2] === "orders" && seg.length === 5) {
      const bytes = orderPicture(shelf, seg[3], seg[4]);
      if (!bytes) return json(res, 404, { error: "no such picture" });
      res.writeHead(200, { "Content-Type": "image/png" });
      return res.end(bytes);
    }
    if (req.method === "POST" && seg[2] === "orders" && seg[4] === "done") {
      const body = JSON.parse((await readBody(req, 16 * 1024)).toString("utf8") || "{}");
      return json(res, 200, finishOrder(shelf, seg[3], body));
    }
    if (route === "GET /app/puppets") return json(res, 200, { puppets: listPuppets(shelf).map(({ slug, name, framing, madeAt }) => ({ slug, name, framing, madeAt })) });
    if (req.method === "GET" && seg[2] === "puppets" && seg.length === 5) {
      const bytes = puppetFile(shelf, seg[3], seg[4]);
      if (!bytes) return json(res, 404, { error: "no such file" });
      res.writeHead(200, { "Content-Type": seg[4].endsWith(".json") ? "application/json" : "image/png" });
      return res.end(bytes);
    }
    if (req.method === "DELETE" && seg[2] === "puppets" && seg.length === 4) {
      const r = removePuppet(shelf, seg[3]);
      return json(res, r.ok ? 200 : 400, r);
    }
    if (req.method === "PUT" && seg[2] === "puppets" && seg.length === 5) {
      const r = savePuppetFile(shelf, seg[3], seg[4], await readBody(req, 12 * 1024 * 1024));
      // The rig file goes last: then the puppet is whole, and goes on the
      // Forge hub's list of everything made (forgeHub.mjs).
      if (r.ok && seg[4].endsWith(".rig.json")) {
        try {
          recordMade(shelf, { app: "image-forge", kind: "puppet", file: r.path, title: seg[3], madeWith: "Image Forge · puppet maker", aiMade: true });
        } catch {
          /* a convenience only */
        }
      }
      return json(res, r.ok ? 200 : 400, r.ok ? { ok: true } : r);
    }
    // THE PUPPET WORKSHOP (electron/workshop.mjs): every puppet, saved as made.
    if (seg[2] === "workshop") {
      const root = workshopRoot(userData);
      if (req.method === "GET" && seg.length === 3) return json(res, 200, { puppets: listWorkshop(root) });
      if (req.method === "GET" && seg.length === 5) {
        const bytes = readWorkshopFile(root, seg[3], seg[4]);
        if (!bytes) return json(res, 404, { error: "no such file" });
        res.writeHead(200, { "Content-Type": seg[4].endsWith(".json") ? "application/json" : "image/png" });
        return res.end(bytes);
      }
      if (req.method === "PUT" && seg.length === 5) {
        const r = writeWorkshopFile(root, seg[3], seg[4], await readBody(req, 20 * 1024 * 1024));
        return json(res, r.ok ? 200 : 400, r);
      }
      if (req.method === "DELETE" && seg.length === 4) {
        const r = removeWorkshop(root, seg[3]);
        return json(res, r.ok ? 200 : 400, r);
      }
      return json(res, 404, { error: "no such workshop call" });
    }
    // CANVA (electron/canva.mjs). The page sends your integration's ID and
    // secret with each call; the tokens stay here, locked.
    if (req.method === "POST" && seg[2] === "canva") {
      const body = JSON.parse((await readBody(req, 40 * 1024 * 1024)).toString("utf8") || "{}");
      const creds = { clientId: String(body.clientId || "").trim(), clientSecret: String(body.clientSecret || "").trim() };
      const store = tokenStore(app.getPath("userData"));
      const what = seg[3];
      if (what === "connect") {
        if (!creds.clientId || !creds.clientSecret) return json(res, 400, { error: "Paste the Client ID and the secret first." });
        const redirectUri = `http://127.0.0.1:${APP_CTL.port}/canva/callback`;
        const link = authLink({ clientId: creds.clientId, redirectUri });
        CANVA_PENDING = { ...link, creds, redirectUri, at: Date.now() };
        await shell.openExternal(link.url);
        return json(res, 200, { ok: true, redirectUri });
      }
      if (what === "disconnect") {
        await store.clear();
        return json(res, 200, { ok: true });
      }
      const c = canvaClient(creds, store);
      if (what === "status") {
        const t = await store.read();
        if (!t) return json(res, 200, { connected: false, redirectUri: `http://127.0.0.1:${APP_CTL.port}/canva/callback` });
        const me = await c.me().catch(() => null);
        return json(res, 200, { connected: !!me, name: me?.profile?.display_name ?? "", redirectUri: `http://127.0.0.1:${APP_CTL.port}/canva/callback` });
      }
      if (what === "upload") return json(res, 200, { assetId: await c.upload(String(body.name || "image-forge"), Buffer.from(String(body.b64 || ""), "base64")) });
      if (what === "templates") return json(res, 200, { items: await c.templates() });
      if (what === "dataset") return json(res, 200, { dataset: await c.dataset(String(body.id || "")) });
      if (what === "fill") {
        const r = await c.fillAndExport(String(body.templateId || ""), body.data || {}, body.title);
        return json(res, 200, { b64: r.bytes.toString("base64"), designUrl: r.designUrl });
      }
      return json(res, 404, { error: "no such Canva call" });
    }
    // Keys shared with Video Forge on this computer (electron/forgeKeys.mjs).
    if (route === "GET /app/keys") {
      return json(res, 200, { keys: await sharedValues() });
    }
    if (route === "POST /app/keys") {
      const body = JSON.parse((await readBody(req, 64 * 1024)).toString("utf8") || "{}");
      return json(res, 200, { changed: await putShared(body.keys ?? {}, "image-forge") });
    }
    // The twin switch: open Video Forge, if it is installed (per-user install).
    if (route === "GET /app/video-forge") {
      return json(res, 200, { installed: fs.existsSync(videoForgeExe()) });
    }
    if (route === "POST /app/video-forge") {
      const exe = videoForgeExe();
      if (!fs.existsSync(exe)) return json(res, 404, { error: "Video Forge is not installed on this computer." });
      const err = await shell.openPath(exe);
      return json(res, err ? 500 : 200, err ? { error: err } : { ok: true });
    }
    if (route === "POST /app/mode") {
      const body = JSON.parse((await readBody(req, 20 * 1024 * 1024)).toString("utf8") || "{}");
      if (!MODES.includes(body.mode)) return json(res, 400, { error: "mode must be window or browser" });
      writeHandover(userData, body.mode, body.snapshot);
      writeMode(userData, body.mode);
      json(res, 200, { ok: true });
      // After answering: the page asking is about to be closed or left.
      setTimeout(() => APP_CTL.switchTo?.(body.mode), 300);
      return;
    }
    if (route === "POST /app/update") {
      const body = JSON.parse((await readBody(req, 64 * 1024)).toString("utf8") || "{}");
      if (!isTrustedInstallerUrl(body.url)) {
        return json(res, 400, { error: "Only installers from the Image Forge release page are accepted." });
      }
      const dest = path.join(os.tmpdir(), `image-forge-update-${Date.now()}.exe`);
      await download(body.url, dest);
      json(res, 200, { ok: true });
      // /S installs without the wizard; --force-run reopens the app after.
      // Your data lives in %APPDATA% and is never touched by the installer.
      setTimeout(() => {
        spawn(dest, ["/S", "--updated", "--force-run"], { detached: true, stdio: "ignore" }).unref();
        app.quit();
      }, 500);
      return;
    }
    return json(res, 404, { error: "not found" });
  } catch (e) {
    return json(res, 500, { error: e && e.message ? e.message : String(e) });
  }
}

/**
 * Your own machine's picture server (LocalAI and friends), reached from the
 * page through here: /local-api/<port>/v1/... → http://127.0.0.1:<port>/v1/...
 *
 * LocalAI refuses picture requests that come from a web page ("missing csrf
 * token", 12 Oct 2026) — rightly, so a website you visit cannot use it behind
 * your back. Forwarded from here they carry no page origin. Two guards keep
 * this from becoming that same hole: it only ever reaches this computer
 * (127.0.0.1), and only the app's own page can call it (the X-Forge-App
 * header forces a browser preflight that this server never approves).
 */
function proxyLocal(req, res) {
  const m = /^\/local-api\/(\d{2,5})(\/.*)?$/.exec(req.url || "");
  if (!m || req.headers["x-forge-app"] !== "1") return json(res, 403, { error: "forbidden" });
  const upstream = http.request(
    {
      hostname: "127.0.0.1",
      port: Number(m[1]),
      path: m[2] || "/",
      method: req.method,
      headers: {
        ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}),
        ...(req.headers["content-type"] ? { "content-type": req.headers["content-type"] } : {}),
        ...(req.headers["content-length"] ? { "content-length": req.headers["content-length"] } : {}),
      },
    },
    (up) => {
      res.writeHead(up.statusCode || 502, { "Content-Type": up.headers["content-type"] || "application/json" });
      up.pipe(res);
    }
  );
  // A local picture can take many minutes; never give up on our side.
  upstream.setTimeout(0);
  upstream.on("error", (e) => json(res, 502, { error: `could not reach your local server on port ${m[1]}: ${e.message}` }));
  req.pipe(upstream);
}

function startServer(distDir) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      // Only requests addressed to 127.0.0.1:<port> or localhost:<port> are ours. A web page that has
      // pointed its own name at this computer (DNS rebinding) sends its own Host, and gets nothing.
      if (!hostAllowed(req.headers.host, server.address()?.port)) {
        res.writeHead(403, { "Content-Type": "text/plain" });
        res.end("forbidden");
        return;
      }
      // Cloudflare and NVIDIA both refuse browser callers. Forward those
      // requests from here. Mirrors the proxies in vite.config.js used
      // during `npm run dev`.
      const proxied = Object.keys(PROXIED).find((p) => (req.url || "").startsWith(p + "/"));
      if (proxied) {
        // Like every other call that does something: only the app's own page, which always sends this header.
        if (!isAppCall(req)) return json(res, 403, { error: "forbidden" });
        proxyUpstream(proxied, req, res);
        return;
      }
      if ((req.url || "").startsWith("/local-api/")) {
        proxyLocal(req, res);
        return;
      }
      if ((req.url || "").startsWith("/link/")) {
        handleLink(req, res);
        return;
      }
      // Canva sends the browser back here after you sign in (canva.mjs).
      if ((req.url || "").startsWith("/canva/callback")) {
        void canvaCallback(req, res);
        return;
      }
      if ((req.url || "").startsWith("/app/")) {
        handleApp(req, res);
        return;
      }

      // A bad escape such as "/%" used to throw here and pop an error box in the main process.
      let urlPath = safeDecodeUri((req.url || "/").split("?")[0]);
      if (urlPath === null) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("bad request");
        return;
      }
      if (urlPath === "/") urlPath = "/index.html";
      let filePath = path.normalize(path.join(distDir, urlPath));
      // keep requests inside dist. The separator matters: without it a
      // request could climb out of "…/dist" and into a sibling "…/dist-evil".
      if (filePath !== distDir && !filePath.startsWith(distDir + path.sep)) {
        res.writeHead(403);
        res.end("forbidden");
        return;
      }
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(distDir, "index.html"); // SPA fallback
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        "Content-Type": MIME[ext] || "application/octet-stream",
        "Content-Security-Policy": CONTENT_SECURITY_POLICY,
        "X-Content-Type-Options": "nosniff",
      });
      fs.createReadStream(filePath).pipe(res);
    });
    /*
     * A FIXED port, not a random one.
     *
     * This used to be listen(0), meaning "any free port". That is the usual
     * advice and it was wrong here, badly: the browser keys localStorage by
     * ORIGIN, and the port is part of the origin. A new port every launch
     * meant a new origin every launch, so every restart came up with empty
     * storage — settings, engine keys and the manifest all apparently "reset
     * themselves". Nothing was failing to save; each launch was simply
     * looking in a different box.
     *
     * So the port must be stable across launches. If it is taken we step
     * through a short fixed list rather than asking for a random one, so the
     * origin stays predictable and data is still found on the next run.
     */
    const tryPorts = [...PORTS];
    const attempt = () => {
      const port = tryPorts.shift();
      if (port === undefined) {
        reject(
          new Error(
            "Every port Image Forge uses is busy. Close the other copy of Image Forge, or whatever is using ports " +
              `${PORTS[0]}–${PORTS[PORTS.length - 1]}, and try again.`
          )
        );
        return;
      }
      server.listen(port, "127.0.0.1");
    };

    server.on("error", (e) => {
      if (e && e.code === "EADDRINUSE") {
        // Another copy of the app, or something else on that port. Step on.
        attempt();
        return;
      }
      reject(e);
    });
    server.on("listening", () => resolve({ server, port: server.address().port }));
    attempt();
  });
}

/* ---------------- Canva sign-in ---------------- */

let CANVA_PENDING = null;
async function canvaCallback(req, res) {
  const u = new URL(req.url, "http://127.0.0.1");
  const page = (raw) => {
    const msg = String(raw).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><meta charset="utf-8"><body style="background:#000;color:#ece8ff;font:16px Sora,system-ui;display:grid;place-items:center;height:100vh"><div style="max-width:480px;text-align:center"><h2>${msg}</h2><p>You can close this tab and go back to Image Forge.</p></div>`);
  };
  const p = CANVA_PENDING;
  if (!p || u.searchParams.get("state") !== p.state || Date.now() - p.at > 15 * 60 * 1000) return page("That sign-in link is old — press Connect in Image Forge again.");
  if (u.searchParams.get("error")) return page(`Canva said no: ${u.searchParams.get("error")}`);
  try {
    const t = await exchangeCode(p.creds, { code: u.searchParams.get("code") || "", verifier: p.verifier, redirectUri: p.redirectUri });
    await tokenStore(app.getPath("userData")).write(t);
    CANVA_PENDING = null;
    page("Connected to Canva ✓");
  } catch (e) {
    page(String(e && e.message ? e.message : e));
  }
}

/* ---------------- the vault ---------------- */

let VAULT = null;
const vault = () => (VAULT ??= openVault(app.getPath("userData")));

/**
 * ONCE: gather what the OTHER ports' boxes hold, so the page can merge them.
 *
 * Each port has its own box (see startServer). Before the vault existed, a
 * launch on the "wrong" port wrote its settings and list into that port's box,
 * where the next launch could not see them. For each other port we serve a
 * tiny page on it for a moment, in a hidden window, that reads its box and
 * hands it back. A port something else is using is skipped.
 */
let HARVESTING = false;
async function harvestPorts(myPort) {
  HARVESTING = true;
  try {
    await harvestEach(myPort);
  } finally {
    HARVESTING = false;
  }
}
async function harvestEach(myPort) {
  const marker = path.join(app.getPath("userData"), "vault-harvest-done");
  if (fs.existsSync(marker)) return;
  for (const port of PORTS.filter((p) => p !== myPort)) {
    await new Promise((done) => {
      let win = null;
      let finished = false;
      const server = http.createServer(async (req, res) => {
        if (req.method === "POST" && req.url === "/harvest") {
          try {
            const values = JSON.parse((await readBody(req, 40 * 1024 * 1024)).toString("utf8") || "{}");
            if (values && Object.keys(values).length) await vault().putHarvest(port, values);
          } catch {
            /* an unreadable box is left alone */
          }
          res.end("ok");
          finish();
          return;
        }
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(HARVEST_PAGE);
      });
      const finish = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        try {
          win?.destroy();
        } catch {
          /* already gone */
        }
        server.close(() => done());
      };
      const timer = setTimeout(finish, 8000);
      server.on("error", () => {
        finished = true;
        clearTimeout(timer);
        done();
      });
      server.listen(port, "127.0.0.1", () => {
        win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, nodeIntegration: false } });
        win.loadURL(`http://127.0.0.1:${port}/`).catch(finish);
      });
    });
  }
  try {
    fs.writeFileSync(marker, new Date().toISOString());
  } catch {
    /* it will simply look again next time */
  }
}

/* ---------------- app ---------------- */

/**
 * Must equal `appId` in scripts/build-exe.js.
 *
 * Windows groups taskbar buttons, pins and notifications by this id. Left
 * unset, a pinned shortcut and the running window can show as two separate
 * icons. Changing it later breaks existing pins, so it is pinned by a test.
 */
const APP_USER_MODEL_ID = "forge.imageforge.app";
app.setAppUserModelId(APP_USER_MODEL_ID);

/* A normal desktop app reopens where you left it. */
const stateFile = () => path.join(app.getPath("userData"), "window-state.json");

function readWindowState() {
  try {
    const s = JSON.parse(fs.readFileSync(stateFile(), "utf8"));
    if (!Number.isFinite(s.width) || !Number.isFinite(s.height)) return null;
    // A window saved on a monitor that is no longer plugged in would open
    // off-screen and look like the app failed to start. Keep the size, drop
    // the position, unless the saved spot is still on a real display.
    const onScreen =
      Number.isFinite(s.x) &&
      Number.isFinite(s.y) &&
      screen.getAllDisplays().some(({ workArea: a }) =>
        s.x >= a.x - 50 && s.y >= a.y - 50 && s.x < a.x + a.width - 100 && s.y < a.y + a.height - 100
      );
    return onScreen ? s : { width: s.width, height: s.height, maximized: s.maximized };
  } catch {
    return null;
  }
}

function writeWindowState(win) {
  try {
    const maximized = win.isMaximized();
    const b = maximized ? win.getNormalBounds() : win.getBounds();
    fs.writeFileSync(stateFile(), JSON.stringify({ ...b, maximized }));
  } catch {
    /* a lost window size is not worth an error box */
  }
}

// one instance only
// A test copy can run on its own profile, leaving the real one alone.
if (process.env.IMAGEFORGE_USER_DATA) app.setPath("userData", process.env.IMAGEFORGE_USER_DATA);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let mainWindow = null;
  let tray = null;
  const iconPath = path.join(__dirname, "..", "build", "icon.png");

  app.on("second-instance", () => {
    // Started again from the shortcut while running in browser mode: open
    // another tab rather than doing nothing visible.
    if (!mainWindow && APP_CTL.port) {
      shell.openExternal(`http://127.0.0.1:${APP_CTL.port}/`);
      return;
    }
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  const menu = Menu.buildFromTemplate([
    {
      label: "File",
      submenu: [{ role: "quit", label: "Quit Image Forge" }],
    },
    {
      label: "Edit",
      submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }],
    },
    {
      label: "View",
      submenu: [
        { role: "zoomIn" },
        { role: "zoomOut" },
        { role: "resetZoom" },
        { type: "separator" },
        ...(!app.isPackaged ? [{ role: "toggleDevTools", label: "Developer tools" }] : []),
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "Where is my data?",
          click: () => {
            shell.openPath(app.getPath("userData"));
            dialog.showMessageBox({
              type: "info",
              title: "Your data",
              message: "Your settings, API keys and manifest live in:",
              // Asked of Electron, not typed in. The folder is named after the
              // package ("image-forge"), and the hard-coded "Image Forge" that
              // used to be here pointed at a folder that never existed.
              detail: app.getPath("userData"),
              buttons: ["OK"],
            });
          },
        },
      ],
    },
  ]);

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(menu);

    const distDir = resolveDistDir();
    if (!distDir) {
      dialog.showErrorBox(
        "Build not found",
        "The dist/ folder is missing.\nRun  npm run build  first, then start the app again."
      );
      app.quit();
      return;
    }

    // Where other apps find us. userData is %APPDATA%image-forge on Windows.
    LINK = linkPaths(app.getPath("userData"));

    let port;
    try {
      ({ port } = await startServer(distDir));
    } catch (e) {
      // Without this the promise rejected into nothing: no window, no message,
      // just a process in Task Manager. Say what happened instead.
      dialog.showErrorBox("Image Forge could not start", e && e.message ? e.message : String(e));
      app.quit();
      return;
    }

    try {
      writePresence(LINK, { version: app.getVersion(), port });
    } catch {
      /* no presence note means the other app simply does not see us */
    }
    app.on("will-quit", () => removePresence(LINK));

    APP_CTL.port = port;
    await harvestPorts(port).catch(() => {});
    if (readMode(app.getPath("userData")) === "browser") openBrowser(port);
    else openWindow(port);
  });


  function openWindow(port) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
      return;
    }
    const saved = readWindowState();
    mainWindow = new BrowserWindow({
      width: saved?.width ?? 1320,
      height: saved?.height ?? 840,
      ...(Number.isFinite(saved?.x) ? { x: saved.x, y: saved.y } : {}),
      minWidth: 980,
      minHeight: 640,
      backgroundColor: "#17120e",
      title: "Image Forge",
      show: false,
      icon: fs.existsSync(iconPath) ? iconPath : undefined,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        spellcheck: false,
      },
    });

    mainWindow.once("ready-to-show", () => {
      if (saved?.maximized) mainWindow.maximize();
      mainWindow.show();
    });
    // Before the window goes: copy the last changes into the vault file.
    let vaultFlushed = false;
    mainWindow.on("close", (e) => {
      writeWindowState(mainWindow);
      if (vaultFlushed) return;
      e.preventDefault();
      const win = mainWindow;
      Promise.race([
        win.webContents.executeJavaScript("window.__flushVault ? window.__flushVault() : null"),
        new Promise((r) => setTimeout(r, 2500)),
      ])
        .catch(() => {})
        .finally(() => {
          vaultFlushed = true;
          if (!win.isDestroyed()) win.close();
        });
    });

    // external links open in the real browser, Windows deep-links open in the OS
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      const ok = safeExternalUrl(url);
      if (ok) shell.openExternal(ok);
      return { action: "deny" };
    });
    mainWindow.webContents.on("will-navigate", (e, url) => {
      if (!isOwnPage(url, port)) {
        e.preventDefault();
        const ok = safeExternalUrl(url);
        if (ok) shell.openExternal(ok);
      }
    });

    // The page asks to stay when pictures exist that were saved nowhere (App.tsx, beforeunload).
    // Electron shows nothing by itself and would simply refuse to close, so ask here.
    mainWindow.webContents.on("will-prevent-unload", (e) => {
      const choice = dialog.showMessageBoxSync(mainWindow, {
        type: "warning",
        buttons: ["Stay and keep working", "Close anyway"],
        defaultId: 0,
        cancelId: 0,
        title: "Pictures not saved",
        message: "Some pictures were not saved anywhere yet.",
        detail: "Link an output folder (or use Save all) first, or they will be lost.",
      });
      if (choice === 1) e.preventDefault(); // preventDefault here means: go ahead and leave
      else vaultFlushed = false; // staying: the next close must flush the vault again
    });

    mainWindow.on("closed", () => {
      mainWindow = null;
    });
    mainWindow.loadURL(`http://127.0.0.1:${port}/`);
  }

  /*
   * Browser mode: the same app, served from the same port, opened in the
   * browser you already use. With no window, a tray icon is how you get back
   * to it or quit — otherwise the app would be an invisible process.
   */
  function openBrowser(port) {
    shell.openExternal(`http://127.0.0.1:${port}/`);
    if (tray) return;
    const img = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 }) : nativeImage.createEmpty();
    tray = new Tray(img);
    tray.setToolTip("Image Forge (open in your browser)");
    tray.on("click", () => shell.openExternal(`http://127.0.0.1:${port}/`));
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "Open Image Forge in my browser", click: () => shell.openExternal(`http://127.0.0.1:${port}/`) },
        { type: "separator" },
        { label: "Quit Image Forge", click: () => app.quit() },
      ])
    );
  }

  APP_CTL.switchTo = (mode) => {
    const port = APP_CTL.port;
    if (mode === "browser") {
      openBrowser(port);
      if (mainWindow && !mainWindow.isDestroyed()) {
        writeWindowState(mainWindow);
        mainWindow.destroy();
      }
    } else {
      if (tray) {
        tray.destroy();
        tray = null;
      }
      openWindow(port);
    }
  };

  // Windows convention: closing the window quits. Not in browser mode, where
  // the window was closed on purpose and the tray keeps the app alive.
  app.on("window-all-closed", () => {
    // The vault's hidden harvest windows closing is not you closing the app.
    if (HARVESTING) return;
    if (readMode(app.getPath("userData")) !== "browser") app.quit();
  });
}
