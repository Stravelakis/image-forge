/**
 * "It does not remember my keys."
 *
 * It always remembered them. The desktop build served itself on `listen(0)` —
 * a random port every launch — and the browser keys storage by ORIGIN, port
 * included. So each launch opened a different, empty box while yesterday's
 * keys sat safely under a port nothing would ever visit again. The fixed port
 * list in electron/main.js is the actual fix.
 *
 * What was missing either way was any way to TELL. These pin the three things
 * that make it tellable: a save that is read back, a count that never quotes a
 * key, and a backup file that survives the browser entirely.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BACKUP_KIND,
  backupFilename,
  buildBackup,
  censusOf,
  describeCensus,
  readBackup,
  saveSettingsVerified,
} from "../src/lib/settingsBackup";
import type { ForgeSettings } from "../src/lib/providers";

const key = (id: string, value: string) => ({ id, label: id, key: value, exhaustedUntil: 0 });

const settings = (over: Record<string, unknown> = {}) =>
  ({
    geminiKeys: [key("a", "AIza-free-1")],
    geminiPaidKeys: [key("b", "AIza-paid-1")],
    openaiKeys: [],
    textProviders: [{ id: "p1", label: "mistral", base: "https://api.mistral.ai/v1", key: "mk-1" }],
    cloudflare: { accountId: "acct", token: "tok" },
    pollinationsToken: "",
    ambient: { accent: "glacier", background: "dots" },
    ...over,
  }) as unknown as ForgeSettings;

/** A localStorage that behaves, and can be told to misbehave. */
function fakeStorage(mode: "ok" | "silent-drop" | "throw-quota" | "unreadable" = "ok") {
  const box = new Map<string, string>();
  return {
    box,
    impl: {
      get length() {
        return box.size;
      },
      key: (i: number) => [...box.keys()][i] ?? null,
      getItem: (k: string) => {
        if (mode === "unreadable") throw new Error("blocked");
        return box.has(k) ? box.get(k)! : null;
      },
      setItem: (k: string, v: string) => {
        if (mode === "throw-quota") {
          const e = new Error("exceeded the quota");
          e.name = "QuotaExceededError";
          throw e;
        }
        // The nasty one: accepts the write and keeps nothing.
        if (mode === "silent-drop") return;
        box.set(k, v);
      },
      removeItem: (k: string) => void box.delete(k),
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("a save you can check", () => {
  it("saves, reads it back, and says so", () => {
    const fake = fakeStorage("ok");
    vi.stubGlobal("localStorage", fake.impl);
    const proof = saveSettingsVerified("k", settings());
    expect(proof.ok).toBe(true);
    expect(proof.bytes).toBeGreaterThan(0);
    expect(JSON.parse(fake.box.get("k")!).geminiKeys[0].key).toBe("AIza-free-1");
  });

  it("catches a write that was accepted and then quietly thrown away", () => {
    // The failure a bare setItem cannot see, and the reason reading back is
    // worth the microseconds.
    vi.stubGlobal("localStorage", fakeStorage("silent-drop").impl);
    const proof = saveSettingsVerified("k", settings());
    expect(proof.ok).toBe(false);
    expect(proof.problem).toMatch(/does not match|did not stick/i);
  });

  it("reports a full box in words, not an exception", () => {
    vi.stubGlobal("localStorage", fakeStorage("throw-quota").impl);
    const proof = saveSettingsVerified("k", settings());
    expect(proof.ok).toBe(false);
    expect(proof.problem).toMatch(/full/i);
  });

  it("reports storage that cannot be read back at all", () => {
    vi.stubGlobal("localStorage", fakeStorage("unreadable").impl);
    const proof = saveSettingsVerified("k", settings());
    expect(proof.ok).toBe(false);
    expect(proof.problem).toMatch(/read it back|refused/i);
  });
});

describe("counting what is stored without showing it", () => {
  it("counts every kind of key", () => {
    const c = censusOf(settings());
    expect(c.geminiFree).toBe(1);
    expect(c.geminiPaid).toBe(1);
    expect(c.textProviders).toBe(1);
    expect(c.cloudflare).toBe(true);
    expect(c.pollinations).toBe(false);
    expect(c.totalKeys).toBe(4);
  });

  it("ignores an empty key box, so a blank row is not counted as a key", () => {
    const c = censusOf(settings({ geminiKeys: [key("a", "   ")] }));
    expect(c.geminiFree).toBe(0);
  });

  it("never puts a key value in the summary line", () => {
    const line = describeCensus(censusOf(settings()));
    expect(line).toBe("4 keys stored");
    expect(line).not.toMatch(/AIza|mk-1|tok/);
  });

  it("says plainly when there is nothing stored", () => {
    const empty = settings({
      geminiKeys: [],
      geminiPaidKeys: [],
      textProviders: [],
      cloudflare: { accountId: "", token: "" },
    });
    expect(describeCensus(censusOf(empty))).toMatch(/no keys/);
  });
});

describe("the backup file", () => {
  it("round-trips the keys and the appearance", () => {
    // Appearance was lost by exactly the same bug, so it is worth pinning that
    // the backup carries it too.
    const parsed = readBackup(buildBackup(settings()));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.settings.geminiKeys?.[0].key).toBe("AIza-free-1");
    expect(parsed.settings.ambient?.accent).toBe("glacier");
  });

  it("labels itself, so a future version knows what it is holding", () => {
    const b = JSON.parse(buildBackup(settings()));
    expect(b.kind).toBe(BACKUP_KIND);
    expect(b.version).toBe(1);
    expect(b.savedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("refuses a file that is not a backup, rather than half-loading it", () => {
    expect(readBackup("not json at all")).toMatchObject({ ok: false });
    expect(readBackup('{"hello":"world"}')).toMatchObject({ ok: false });
    expect(readBackup(JSON.stringify({ kind: BACKUP_KIND, version: 1 }))).toMatchObject({ ok: false });
  });

  it("accepts a backup missing newer fields, because that is when it is needed", () => {
    // A backup taken before a field existed must still restore. Refusing it
    // would make the backup useless at exactly the moment it matters.
    const old = JSON.stringify({ kind: BACKUP_KIND, version: 1, savedAt: "2026-01-01", settings: { geminiKeys: [] } });
    expect(readBackup(old)).toMatchObject({ ok: true });
  });

  it("names the file by date so backups sort themselves", () => {
    expect(backupFilename(new Date("2026-09-12T10:00:00Z"))).toBe("image-forge-settings-2026-09-12.json");
  });
});
