/**
 * Two things the desktop app does for itself: open in a window or in your own
 * browser, and install its own updates. Plain Node, no Electron, so the rules
 * that matter can be tested.
 *
 * Why a "handover": the browser keys storage by origin AND by browser. The
 * Electron window and Chrome at the same http://127.0.0.1:47821 are two
 * different storage boxes. Switching without carrying the data across would
 * look exactly like the 1.0.0 bug — settings and keys apparently gone. So the
 * side being left writes everything it has to a file, and the side starting
 * reads it once and deletes it.
 */
import fs from "node:fs";
import path from "node:path";
import https from "node:https";

export const MODES = ["window", "browser"];

const modeFile = (userData) => path.join(userData, "launch-mode.json");
const handoverFile = (userData) => path.join(userData, "mode-handover.json");

export function readMode(userData) {
  try {
    const m = JSON.parse(fs.readFileSync(modeFile(userData), "utf8")).mode;
    return MODES.includes(m) ? m : "window";
  } catch {
    return "window";
  }
}

export function writeMode(userData, mode) {
  if (!MODES.includes(mode)) throw new Error(`unknown mode: ${mode}`);
  fs.writeFileSync(modeFile(userData), JSON.stringify({ mode }));
}

/** The whole localStorage of the side being left, meant for `to`. */
export function writeHandover(userData, to, snapshot) {
  if (!MODES.includes(to)) throw new Error(`unknown mode: ${to}`);
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) throw new Error("snapshot must be an object");
  for (const [k, v] of Object.entries(snapshot)) {
    if (typeof v !== "string") throw new Error(`snapshot value for ${k} is not text`);
  }
  fs.writeFileSync(handoverFile(userData), JSON.stringify({ to, at: Date.now(), snapshot }));
}

/**
 * Read once, for the side that is `me`. The file is removed after reading
 * because it holds API keys and there is no reason to keep a second copy.
 * A handover meant for the other side is left alone.
 */
export function takeHandover(userData, me) {
  const f = handoverFile(userData);
  let data;
  try {
    data = JSON.parse(fs.readFileSync(f, "utf8"));
  } catch {
    return null;
  }
  if (data?.to !== me) return null;
  try {
    fs.rmSync(f);
  } catch {
    /* read-only disk: importing twice is harmless */
  }
  return data.snapshot ?? null;
}

/**
 * Only installers from this project's own GitHub releases. The page asks for
 * the update, but the page is a web page: it must not be able to make this
 * process download and run an arbitrary program.
 */
export function isTrustedInstallerUrl(url, owner = "Stravelakis", repo = "image-forge") {
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  const prefix = `/${owner}/${repo}/releases/download/`.toLowerCase();
  return (
    u.protocol === "https:" &&
    u.hostname === "github.com" &&
    !u.username &&
    !u.password &&
    u.pathname.toLowerCase().startsWith(prefix) &&
    /\/[^/]*setup[^/]*\.exe$/i.test(u.pathname) &&
    !u.pathname.includes("..")
  );
}

/** Download, following GitHub's redirect to its file host. */
export function download(url, dest, { maxBytes = 400e6, redirects = 5 } = {}) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "image-forge-updater" } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          if (redirects <= 0) return reject(new Error("too many redirects"));
          const next = new URL(res.headers.location, url).toString();
          if (!next.startsWith("https://")) return reject(new Error("refused a non-https redirect"));
          return download(next, dest, { maxBytes, redirects: redirects - 1 }).then(resolve, reject);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`GitHub answered ${res.statusCode}`));
        }
        let got = 0;
        const out = fs.createWriteStream(dest);
        res.on("data", (c) => {
          got += c.length;
          if (got > maxBytes) {
            res.destroy(new Error("the download is far bigger than an installer should be"));
          }
        });
        res.on("error", (e) => {
          out.destroy();
          reject(e);
        });
        res.pipe(out);
        out.on("finish", () => resolve(got));
        out.on("error", reject);
      })
      .on("error", reject);
  });
}
