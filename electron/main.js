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
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, Menu, shell, dialog, screen } from "electron";

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
function proxyUpstream(prefix, req, res) {
  const { host, name } = PROXIED[prefix];
  const target = req.url.slice(prefix.length) || "/";
  const upstream = https.request(
    {
      hostname: host,
      port: 443,
      path: target,
      method: req.method,
      headers: {
        ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}),
        ...(req.headers["content-type"] ? { "content-type": req.headers["content-type"] } : {}),
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
  req.pipe(upstream);
}

/**
 * The ports the desktop app will use, in order.
 *
 * Stable on purpose — see the note in startServer. Chosen high and unusual to
 * avoid colliding with anything a developer is likely to be running.
 */
const PORTS = [47821, 47822, 47823, 47824, 47825];

function startServer(distDir) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      // Cloudflare and NVIDIA both refuse browser callers. Forward those
      // requests from here. Mirrors the proxies in vite.config.js used
      // during `npm run dev`.
      const proxied = Object.keys(PROXIED).find((p) => (req.url || "").startsWith(p + "/"));
      if (proxied) {
        proxyUpstream(proxied, req, res);
        return;
      }

      let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
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
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
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
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let mainWindow = null;

  app.on("second-instance", () => {
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

    const iconPath = path.join(__dirname, "..", "build", "icon.png");

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
    mainWindow.on("close", () => writeWindowState(mainWindow));

    // external links open in the real browser, Windows deep-links open in the OS
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith("http") || url.startsWith("ms-settings:")) shell.openExternal(url);
      return { action: "deny" };
    });
    mainWindow.webContents.on("will-navigate", (e, url) => {
      if (!url.startsWith(`http://127.0.0.1:${port}`)) {
        e.preventDefault();
        shell.openExternal(url);
      }
    });

    await mainWindow.loadURL(`http://127.0.0.1:${port}/`);
  });

  app.on("window-all-closed", () => app.quit()); // Windows convention
}
