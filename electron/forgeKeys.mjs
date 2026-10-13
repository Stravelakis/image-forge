/**
 * Shared keys: Video Forge and Image Forge on the same computer share their
 * API keys, so a key typed into one works in the other (Ak, 12 Oct 2026).
 *
 * THE SAME FILE lives in both repos — Video Forge `tools/lib/forgeKeys.mjs`,
 * Image Forge `electron/forgeKeys.mjs`. Change one, copy it to the other.
 *
 * Where:  %APPDATA%\Forge\shared-keys.bin
 * How:    Windows' own per-user encryption (DPAPI, the same lock Windows uses
 *         for saved Wi-Fi passwords), through the PowerShell that ships with
 *         Windows. Only this Windows user can read it; nothing to install.
 *         Each app's own vault cannot be used: Electron locks it with a key
 *         that belongs to that one app.
 * Off Windows there is no sharing — every call reads as empty — and each app
 * keeps its own keys as before.
 *
 * Contents (once decrypted): { v: 1, keys: { gemini: { value, at, from } } }.
 * Newest write wins. A removed key is removed for both apps.
 *
 * Plain Node, no Electron import, so the tests run the real code.
 */
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Names both apps understand. Anything else is ignored, both ways. */
export const SHARED_NAMES = [
  "gemini", "openrouter", "nvidia", "mistral", "cloudflare-account", "cloudflare-token", "pollinations",
  // 13 Oct 2026: every key either app can use, and room for the forges to come.
  "openai", "groq", "elevenlabs", "fish",
];

const MAX_VALUE = 4096;

export function sharedKeysFile(env = process.env) {
  const base = env.APPDATA || path.join(os.homedir(), ".config");
  return path.join(base, "Forge", "shared-keys.bin");
}

/* ---------- the lock: DPAPI through PowerShell ---------- */

function powershell(script, input) {
  return new Promise((resolve, reject) => {
    const child = execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      { windowsHide: true, timeout: 15000, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout) => (err ? reject(err) : resolve(stdout.trim()))
    );
    // Through stdin, never the command line — other programs can read those.
    child.stdin.end(input);
  });
}

const PS = (verb) =>
  "Add-Type -AssemblyName System.Security; " +
  "$i=[Convert]::FromBase64String([Console]::In.ReadToEnd().Trim()); " +
  `$o=[Security.Cryptography.ProtectedData]::${verb}($i,$null,'CurrentUser'); ` +
  "[Convert]::ToBase64String($o)";

export const dpapi = {
  available: process.platform === "win32",
  async lock(text) {
    return Buffer.from(await powershell(PS("Protect"), Buffer.from(text, "utf8").toString("base64")), "base64");
  },
  async unlock(buf) {
    return Buffer.from(await powershell(PS("Unprotect"), buf.toString("base64")), "base64").toString("utf8");
  },
};

/* ---------- read and write ---------- */

/** Everything shared, as { name: { value, at, from } }. Empty when there is nothing or it cannot be read. */
export async function readShared({ file = sharedKeysFile(), crypt = dpapi } = {}) {
  if (!crypt.available) return {};
  let buf;
  try {
    buf = await fs.promises.readFile(file);
  } catch {
    return {};
  }
  try {
    const data = JSON.parse(await crypt.unlock(buf));
    const out = {};
    for (const [k, e] of Object.entries(data?.keys ?? {})) {
      if (SHARED_NAMES.includes(k) && e && typeof e.value === "string" && e.value) out[k] = e;
    }
    return out;
  } catch {
    return {};
  }
}

/** Just the values: { gemini: "…" }. */
export async function sharedValues(opts) {
  const all = await readShared(opts);
  return Object.fromEntries(Object.entries(all).map(([k, e]) => [k, e.value]));
}

/**
 * Save some keys for both apps. `changes` maps a name to its new value, or to
 * "" / null to remove it. Unknown names and over-long values are ignored.
 * Returns the names that actually changed.
 */
export async function putShared(changes, from, { file = sharedKeysFile(), crypt = dpapi, now = Date.now() } = {}) {
  if (!crypt.available) return [];
  const current = await readShared({ file, crypt });
  const changed = [];
  for (const [name, raw] of Object.entries(changes ?? {})) {
    if (!SHARED_NAMES.includes(name)) continue;
    const value = typeof raw === "string" ? raw.trim() : "";
    if (value.length > MAX_VALUE) continue;
    if (!value) {
      if (current[name]) {
        delete current[name];
        changed.push(name);
      }
      continue;
    }
    if (current[name]?.value === value) continue;
    current[name] = { value, at: now, from: String(from).slice(0, 40) };
    changed.push(name);
  }
  if (!changed.length) return [];
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  const locked = await crypt.lock(JSON.stringify({ v: 1, keys: current }));
  // Write beside, then swap — the other app may be reading at this moment.
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.promises.writeFile(tmp, locked, { mode: 0o600 });
  await fs.promises.rename(tmp, file);
  return changed;
}
