import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openVault } from "../electron/vault.mjs";
import { mergeStored, mergeValue } from "../src/lib/vault";

const plain = {
  available: true,
  lock: async (t: string) => Buffer.from(t, "utf8"),
  unlock: async (b: Buffer) => b.toString("utf8"),
};
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "vault-"));

describe("the vault file (settings survive any port, update or reinstall)", () => {
  it("is empty before anything is written", async () => {
    expect(await openVault(tmp(), { crypt: plain }).read()).toBeNull();
  });

  it("keeps values, changes them, and removes them", async () => {
    const dir = tmp();
    const v = openVault(dir, { crypt: plain });
    expect(await v.write({ a: "1", b: "2" })).toBe(2);
    expect(await v.write({ a: "1" })).toBe(0);
    await v.write({ b: null, c: "3" });
    // a second opening — what the next launch sees
    expect(await openVault(dir, { crypt: plain }).read()).toEqual({ a: "1", c: "3" });
  });

  it("queues writes so none is lost", async () => {
    const v = openVault(tmp(), { crypt: plain });
    await Promise.all(Array.from({ length: 20 }, (_, i) => v.write({ [`k${i}`]: String(i) })));
    expect(Object.keys((await v.read()) ?? {})).toHaveLength(20);
  });

  it("keeps other ports' boxes until the page has merged them", async () => {
    const v = openVault(tmp(), { crypt: plain });
    await v.putHarvest(47822, { "image-forge-settings-v1": "{}" });
    expect(await v.harvests()).toEqual([{ port: 47822, values: { "image-forge-settings-v1": "{}" } }]);
    await v.clearHarvests();
    expect(await v.harvests()).toEqual([]);
  });
});

describe("merging another port's box", () => {
  it("fills empty keys and never overwrites a filled one", () => {
    const mine = { cloudflare: { accountId: "", token: "mine" }, provider: "gemini" };
    const other = { cloudflare: { accountId: "acc", token: "theirs" }, provider: "ovh" };
    expect(mergeValue(mine, other)).toEqual({ cloudflare: { accountId: "acc", token: "mine" }, provider: "gemini" });
  });

  it("joins lists by id, mine first", () => {
    const m = { rows: [{ id: "1", status: "done" }] };
    const o = { rows: [{ id: "1", status: "failed" }, { id: "2", status: "done" }] };
    expect(mergeValue(m, o)).toEqual({ rows: [{ id: "1", status: "done" }, { id: "2", status: "done" }] });
  });

  it("fills a blank key inside a list of keys", () => {
    const m = { geminiKeys: [{ id: "free-1", label: "", key: "" }] };
    const o = { geminiKeys: [{ id: "free-1", label: "mine", key: "AIza" }] };
    expect(mergeValue(m, o)).toEqual({ geminiKeys: [{ id: "free-1", label: "mine", key: "AIza" }] });
  });

  it("takes the other value when mine is missing, keeps mine when it is not JSON", () => {
    expect(mergeStored(null, "x")).toBe("x");
    expect(mergeStored("plain text", "{}")).toBe("plain text");
  });
});
