/**
 * Review 16 Nov 2026: key stores must never wipe keys (B5, B6, B7), and a
 * Google batch already sent must never run again at full price (B1).
 * Every key here is a fake; no lock but a stand-in is used.
 */
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openVault, VaultUnreadable } from "../electron/vault.mjs";
import { KeyStoreUnreadable, putShared, readShared, sharedValues } from "../electron/forgeKeys.mjs";
import { filenamesInBatch, resumeRows, withoutBatchRows } from "../src/lib/batchHold";
import { onStoreProblem, reportStoreProblem, resetStoreProblems } from "../src/lib/storeProblems";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "keys-money-"));

/** A stand-in for the Windows lock, which can be told to fail like a timed-out PowerShell. */
function fakeLock() {
  const c = {
    available: true,
    failUnlock: false,
    failLock: false,
    lock: async (t: string) => {
      if (c.failLock) throw new Error("powershell timed out");
      return Buffer.from(t, "utf8").reverse();
    },
    unlock: async (b: Buffer) => {
      if (c.failUnlock) throw new Error("powershell timed out");
      return Buffer.from(b).reverse().toString("utf8");
    },
  };
  return c;
}
const writeLockedJson = (file: string, data: unknown) => fs.writeFileSync(file, Buffer.from(JSON.stringify(data), "utf8").reverse());
const readLockedJson = (file: string) => JSON.parse(Buffer.from(fs.readFileSync(file)).reverse().toString("utf8"));

describe("the vault never saves over a file it could not read (B5)", () => {
  it("refuses to write when unlocking fails, and the old file stays byte for byte", async () => {
    const dir = tmp();
    const crypt = fakeLock();
    const v = openVault(dir, { crypt });
    await v.write({ "image-forge-settings-v1": '{"key":"FAKE-KEY-1"}', list: "[1,2,3]" });
    const before = fs.readFileSync(v.file);

    crypt.failUnlock = true;
    await expect(v.write({ list: "[]" })).rejects.toBeInstanceOf(VaultUnreadable);
    await expect(v.read()).rejects.toThrow(/could not read its saved-data file/);
    expect(fs.readFileSync(v.file).equals(before)).toBe(true);

    crypt.failUnlock = false; // PowerShell answers again: everything is still there
    expect(await v.read()).toEqual({ "image-forge-settings-v1": '{"key":"FAKE-KEY-1"}', list: "[1,2,3]" });
  });

  it("refuses to write over a damaged file", async () => {
    const dir = tmp();
    const crypt = fakeLock();
    const v = openVault(dir, { crypt });
    fs.writeFileSync(v.file, "garbage");
    await expect(v.write({ a: "1" })).rejects.toBeInstanceOf(VaultUnreadable);
    expect(fs.readFileSync(v.file, "utf8")).toBe("garbage");
  });

  it("a later write still works after a refused one (the queue is not stuck)", async () => {
    const crypt = fakeLock();
    const v = openVault(tmp(), { crypt });
    await v.write({ a: "1" });
    crypt.failUnlock = true;
    await expect(v.write({ b: "2" })).rejects.toThrow();
    crypt.failUnlock = false;
    expect(await v.write({ b: "2" })).toBe(1);
    expect(await v.read()).toEqual({ a: "1", b: "2" });
  });

  it("no file yet is still fine: the first write creates it", async () => {
    const v = openVault(tmp(), { crypt: fakeLock() });
    expect(await v.read()).toBeNull();
    expect(await v.write({ a: "1" })).toBe(1);
  });
});

describe("shared keys never wipe keys (B6, B7)", () => {
  const setup = () => {
    const file = path.join(tmp(), "shared-keys.bin");
    return { file, crypt: fakeLock() };
  };

  it("refuses to save when the file cannot be unlocked, and keeps it as it was", async () => {
    const { file, crypt } = setup();
    await putShared({ gemini: "FAKE-G", mistral: "FAKE-M", openrouter: "FAKE-O" }, "video-forge", { file, crypt });
    const before = fs.readFileSync(file);

    crypt.failUnlock = true;
    await expect(putShared({ gemini: "FAKE-NEW" }, "image-forge", { file, crypt })).rejects.toBeInstanceOf(KeyStoreUnreadable);
    await expect(putShared({ gemini: "FAKE-NEW" }, "image-forge", { file, crypt })).rejects.toThrow(/nothing was saved/);
    expect(fs.readFileSync(file).equals(before)).toBe(true);
    expect(await readShared({ file, crypt })).toEqual({}); // showing keys may still come up empty...

    crypt.failUnlock = false; // ...but nothing was lost
    expect(await sharedValues({ file, crypt })).toEqual({ gemini: "FAKE-G", mistral: "FAKE-M", openrouter: "FAKE-O" });
  });

  it("refuses to save over a damaged file", async () => {
    const { file, crypt } = setup();
    fs.writeFileSync(file, "garbage");
    await expect(putShared({ gemini: "FAKE-NEW" }, "image-forge", { file, crypt })).rejects.toBeInstanceOf(KeyStoreUnreadable);
    expect(fs.readFileSync(file, "utf8")).toBe("garbage");
  });

  it("keeps keys written by another app that this app does not know", async () => {
    const { file, crypt } = setup();
    writeLockedJson(file, {
      v: 1,
      keys: {
        gemini: { value: "FAKE-G", at: 1, from: "video-forge" },
        "gemini-extra": { value: "FAKE-GX", at: 1, from: "video-forge" },
        "future-forge-key": { value: "FAKE-FUTURE", at: 1, from: "sound-forge" },
      },
    });
    await putShared({ mistral: "FAKE-M" }, "image-forge", { file, crypt });
    const keys = readLockedJson(file).keys;
    expect(keys["gemini-extra"].value).toBe("FAKE-GX");
    expect(keys["future-forge-key"]).toEqual({ value: "FAKE-FUTURE", at: 1, from: "sound-forge" });
    expect(keys.gemini.value).toBe("FAKE-G");
    expect(keys.mistral.value).toBe("FAKE-M");
  });

  it("understands Video Forge's gemini-extra key, like Video Forge's copy of this file", async () => {
    const { file, crypt } = setup();
    await putShared({ "gemini-extra": "FAKE-GX" }, "image-forge", { file, crypt });
    expect(await sharedValues({ file, crypt })).toEqual({ "gemini-extra": "FAKE-GX" });
  });

  it("still ignores unknown names sent in a change, and an empty value still removes a key", async () => {
    const { file, crypt } = setup();
    await putShared({ gemini: "FAKE-G", "made-up": "x" }, "image-forge", { file, crypt });
    expect(Object.keys(readLockedJson(file).keys)).toEqual(["gemini"]);
    expect(await putShared({ gemini: "" }, "image-forge", { file, crypt })).toEqual(["gemini"]);
    expect(readLockedJson(file).keys).toEqual({});
  });
});

describe("a Google batch already sent is never run again (B1)", () => {
  const jobs = [{ filenames: ["a.png", "b.png"] }];
  const rows = [
    { id: 1, filename: "a.png", status: "generating" },
    { id: 2, filename: "b.png", status: "generating" },
    { id: 3, filename: "c.png", status: "generating" },
    { id: 4, filename: "d.png", status: "pending" },
  ];

  it("on start, batch rows stay 'generating'; other stuck rows go back to pending", () => {
    expect(resumeRows(rows, jobs).map((r) => r.status)).toEqual(["generating", "generating", "pending", "pending"]);
  });

  it("with no batch waiting, every stuck row goes back to pending, as before", () => {
    expect(resumeRows(rows, []).every((r) => r.status === "pending")).toBe(true);
    expect(resumeRows(rows, undefined).every((r) => r.status === "pending")).toBe(true);
  });

  it("rows in a waiting batch are left out of a run or a second batch, even if marked pending", () => {
    const pending = rows.map((r) => ({ ...r, status: "pending" }));
    expect(withoutBatchRows(pending, jobs).map((r) => r.filename)).toEqual(["c.png", "d.png"]);
    expect(filenamesInBatch(jobs)).toEqual(new Set(["a.png", "b.png"]));
  });
});

describe("the plain error reaches the screen once", () => {
  afterEach(() => resetStoreProblems());

  it("a problem found before the app listens is delivered when it does, and repeats are dropped", () => {
    reportStoreProblem("Could not read the file.");
    reportStoreProblem("Could not read the file.");
    const seen: string[] = [];
    const stop = onStoreProblem((m) => seen.push(m));
    reportStoreProblem("Could not read the file.");
    reportStoreProblem("Another problem.");
    stop();
    expect(seen).toEqual(["Could not read the file.", "Another problem."]);
  });
});
