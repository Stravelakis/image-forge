/**
 * The vault: everything the page keeps, saved in a FILE the app owns
 * (13 Oct 2026).
 *
 * Why: the page's own storage belongs to its address, and the address
 * includes the port. When something else held port 47821, Image Forge opened
 * on 47822 and came up with no keys, no settings and an empty list — nothing
 * was lost, it was simply looking in a different box (Ak, 13 Oct). The page's
 * storage is now only a working copy; this file is the real one, so a port,
 * an update or a reinstall can never empty it again.
 *
 * Where:  <userData>/vault.bin  — the whole snapshot, locked with Windows'
 *         per-user encryption (DPAPI, see forgeKeys.mjs), because it holds
 *         API keys. Off Windows it is plain JSON in vault.json.
 * Plus:   <userData>/vault-harvest-<port>.bin — what other ports' boxes held,
 *         gathered once (see main.js harvestPorts) for the page to merge.
 *
 * Plain Node, no Electron import, so the tests run the real code.
 */
import fs from "node:fs";
import path from "node:path";
import { dpapi } from "./forgeKeys.mjs";

const plain = {
  available: true,
  async lock(text) {
    return Buffer.from(text, "utf8");
  },
  async unlock(buf) {
    return buf.toString("utf8");
  },
};

const pick = (crypt) => crypt ?? (dpapi.available ? dpapi : plain);
const fileFor = (dir, name, crypt) => path.join(dir, `${name}.${crypt === plain ? "json" : "bin"}`);

async function readLocked(file, crypt) {
  let buf;
  try {
    buf = await fs.promises.readFile(file);
  } catch {
    return null;
  }
  try {
    const data = JSON.parse(await crypt.unlock(buf));
    return data && typeof data === "object" && data.values && typeof data.values === "object" ? data : null;
  } catch {
    return null;
  }
}

async function writeLocked(file, data, crypt) {
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.promises.writeFile(tmp, await crypt.lock(JSON.stringify(data)), { mode: 0o600 });
  await fs.promises.rename(tmp, file);
}

/** One vault per app folder. Writes are queued so two never interleave. */
export function openVault(dir, { crypt } = {}) {
  const c = pick(crypt);
  const file = fileFor(dir, "vault", c);
  let queue = Promise.resolve();
  const serial = (job) => (queue = queue.then(job, job));

  return {
    file,
    /** { key: value } or null when there is no vault yet. */
    async read() {
      const d = await readLocked(file, c);
      return d ? d.values : null;
    },
    /** Apply { key: value | null } (null removes). Returns how many changed. */
    write(changes) {
      return serial(async () => {
        const values = (await readLocked(file, c))?.values ?? {};
        let n = 0;
        for (const [k, v] of Object.entries(changes ?? {})) {
          if (typeof k !== "string" || !k) continue;
          if (v === null || v === undefined) {
            if (k in values) {
              delete values[k];
              n++;
            }
          } else if (typeof v === "string" && values[k] !== v) {
            values[k] = v;
            n++;
          }
        }
        if (n) await writeLocked(file, { v: 1, at: Date.now(), values }, c);
        return n;
      });
    },
    /** What another port's box held, kept for the page to merge once. */
    async putHarvest(port, values) {
      await writeLocked(fileFor(dir, `vault-harvest-${port}`, c), { v: 1, at: Date.now(), port, values }, c);
    },
    async harvests() {
      const out = [];
      let names = [];
      try {
        names = await fs.promises.readdir(dir);
      } catch {
        return out;
      }
      for (const n of names.filter((x) => /^vault-harvest-\d+\.(bin|json)$/.test(x)).sort()) {
        const d = await readLocked(path.join(dir, n), c);
        if (d && Object.keys(d.values).length) out.push({ port: d.port, values: d.values });
      }
      return out;
    },
    async clearHarvests() {
      let names = [];
      try {
        names = await fs.promises.readdir(dir);
      } catch {
        return;
      }
      for (const n of names.filter((x) => /^vault-harvest-\d+\.(bin|json)$/.test(x))) {
        await fs.promises.rm(path.join(dir, n), { force: true });
      }
    },
  };
}

/** The page that reads one port's box and hands it back. Served by a short-lived server on that port. */
export const HARVEST_PAGE = `<!doctype html><meta charset="utf-8"><title>harvest</title><script>
const out = {};
for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k !== null) out[k] = localStorage.getItem(k) || ""; }
fetch("/harvest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(out) });
</script>`;
