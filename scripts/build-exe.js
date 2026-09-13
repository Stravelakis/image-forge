#!/usr/bin/env node
/**
 * One-command Windows packaging.
 *
 *   npm run build-exe        (or: node scripts/build-exe.js)
 *
 * 1. builds the site with vite             → dist/
 * 2. fetches the app icon (once, cached)   → build/icon.png
 * 3. packages it with electron-builder     → release/
 *       · "Image Forge Setup x.y.z.exe"  (installer, pick install folder)
 *       · "image-forge-portable.exe"     (portable, runs from anywhere)
 *
 * electron + electron-builder are committed devDependencies — if they are
 * missing, a plain `npm install` brings them in.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import https from "node:https";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

const step = (msg) => console.log(`\n\x1b[38;5;215m▸ ${msg}\x1b[0m`);
const ok = (msg) => console.log(`\x1b[38;5;114m✓ ${msg}\x1b[0m`);
const fail = (msg) => {
  console.error(`\x1b[38;5;203m✗ ${msg}\x1b[0m`);
  process.exit(1);
};

function resolvable(mod) {
  try {
    require.resolve(mod, { paths: [ROOT] });
    return true;
  } catch {
    return false;
  }
}

/**
 * Makes sure build/icon.png exists.
 * Priority: the Tauri emblem (src-tauri/icons/icon.png — the 1024×1024 anvil)
 * → download fallback → default electron icon.
 */
function ensureIcon() {
  return new Promise((resolve) => {
    const dest = path.join(ROOT, "build", "icon.png");
    if (fs.existsSync(dest)) {
      ok("icon already cached");
      return resolve();
    }
    const tauriIcon = path.join(ROOT, "src-tauri", "icons", "icon.png");
    if (fs.existsSync(tauriIcon)) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(tauriIcon, dest);
      ok("icon copied from src-tauri/icons/icon.png");
      return resolve();
    }
    const url =
      "https://image.qwenlm.ai/generated-images/1aee720a-7125-4ae0-9f83-4cdfeed8af7c/_result.png";
    console.log("  downloading icon…");
    const get = (u, redirects = 0) => {
      const mod = u.startsWith("https") ? https : http;
      mod
        .get(u, (res) => {
          if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location && redirects < 5) {
            return get(res.headers.location, redirects + 1);
          }
          if (res.statusCode !== 200) {
            console.log("  (icon download failed — packaging continues with the default icon)");
            return resolve();
          }
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          const out = fs.createWriteStream(dest);
          res.pipe(out);
          out.on("finish", () => {
            ok("icon saved to build/icon.png");
            resolve();
          });
          out.on("error", () => resolve());
        })
        .on("error", () => {
          console.log("  (no connection for the icon — packaging continues with the default icon)");
          resolve();
        });
    };
    get(url);
  });
}

async function main() {
  step("checking packaging tools");
  if (!resolvable("electron") || !resolvable("electron-builder")) {
    fail("electron / electron-builder not found — run `npm install` once, then try again");
  }
  ok("tools ready");

  step("building the site (vite → dist/)");
  // Vite 6 no longer exposes ./bin/vite.js through its exports map, so we run the
  // local .bin shim through a shell instead of require.resolve-ing the file.
  const viteBin =
    process.platform === "win32"
      ? path.join(ROOT, "node_modules", ".bin", "vite.cmd")
      : path.join(ROOT, "node_modules", ".bin", "vite");
  // shell:true means the command string is parsed by cmd/sh, so a path with a
  // space in it ("C:\Users\me\CLAUDE SPACE\…") splits unless we quote it.
  const quoted = (p) => (/[\s]/.test(p) ? `"${p}"` : p);
  const b = fs.existsSync(viteBin)
    ? spawnSync(quoted(viteBin), ["build"], { cwd: ROOT, stdio: "inherit", shell: true })
    : spawnSync("vite", ["build"], { cwd: ROOT, stdio: "inherit", shell: true });
  if (b.status !== 0) fail("vite build failed — scroll up for the real error");
  ok("site built");

  step("fetching the app icon (once)");
  await ensureIcon();

  step("packaging the exe (this is the slow part)");
  const { build } = await import("electron-builder");
  const iconFile = path.join(ROOT, "build", "icon.png");
  const hasIcon = fs.existsSync(iconFile);

  const artifacts = await build({
    // Build the files; do not upload them.
    //
    // electron-builder publishes to GitHub on its own the moment it sees a git
    // tag, and then fails asking for a token it was never given. The release
    // workflow attaches the artifacts itself, which is the part that should
    // own publishing — so this says "never" explicitly rather than relying on
    // a default that changes in electron-builder v27.
    publish: "never",
    config: {
      // Must equal APP_USER_MODEL_ID in electron/main.js, and must never
      // change: it is how Windows knows a new installer is an UPGRADE of the
      // app already there, and how taskbar pins find the running window.
      appId: "forge.imageforge.app",
      productName: "Image Forge",
      // Shown in the exe's Properties and in Settings → Apps. It said
      // "forged locally" and the author was a name from an old project.
      copyright: "Copyright © 2026 Stravelakis · Apache-2.0",
      asar: true,
      // FORGE_OUTPUT lets you package somewhere else — useful when a syncing or
      // aggressively scanned folder makes electron-builder trip over its own
      // temp directory ("EPERM: rename win-unpacked.tmp").
      directories: { output: process.env.FORGE_OUTPUT || "release", buildResources: "build" },
      files: ["electron/**/*", "build/icon.png", "package.json"],
      extraResources: [{ from: "dist", to: "dist" }],
      win: {
        ...(hasIcon ? { icon: "build/icon.png" } : {}),
        target: [
          { target: "nsis", arch: ["x64"] },
          { target: "portable", arch: ["x64"] },
        ],
      },
      nsis: {
        oneClick: false,
        allowToChangeInstallationDirectory: true,
        createDesktopShortcut: true,
        createStartMenuShortcut: true,
        shortcutName: "Image Forge",
        runAfterFinish: true,
        // data in %APPDATA%\Image Forge survives uninstall by default;
        // build/installer.nsh adds an explicit "also delete my data?" question
        deleteAppDataOnUninstall: false,
        uninstallDisplayName: "Image Forge",
        include: "installer.nsh",
      },
      extraMetadata: {
        description: "Image Forge — standalone, manifest-driven AI image pipeline",
        // An object, not a string: electron-builder takes the Publisher shown in
        // Settings > Apps and in the exe Properties from author.name. A plain
        // string left both blank — seen on a real install, 13 September 2026.
        author: { name: "Stravelakis" },
      },
      portable: { artifactName: "image-forge-portable.exe" },
    },
  });

  ok("done! your executables:");
  for (const a of artifacts) console.log(`  \x1b[38;5;229m${path.relative(ROOT, a)}\x1b[0m`);
  console.log(`
  · the "Setup" file is a normal Windows installer
  · the "portable" file runs straight from a USB stick
  · first launch may show a SmartScreen warning (unsigned app):
      More info → Run anyway
  · your data (manifest, recipes, keys, settings) lives in %APPDATA%\\image-forge`);
}

main().catch((e) => fail(e && e.message ? e.message : String(e)));
