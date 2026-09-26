import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
// @ts-expect-error plain ESM without types
import { readMode, writeMode, writeHandover, takeHandover, isTrustedInstallerUrl } from "../electron/appctl.mjs";
import { applySnapshot, snapshotStorage } from "../src/lib/desktop";

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "forge-appctl-"));
});

describe("launch mode", () => {
  it("defaults to a window, remembers browser", () => {
    expect(readMode(dir)).toBe("window");
    writeMode(dir, "browser");
    expect(readMode(dir)).toBe("browser");
  });
  it("refuses anything else", () => {
    expect(() => writeMode(dir, "tab")).toThrow();
    fs.writeFileSync(path.join(dir, "launch-mode.json"), '{"mode":"evil"}');
    expect(readMode(dir)).toBe("window");
  });
});

describe("handover", () => {
  it("is read once, only by the side it is meant for, then removed", () => {
    writeHandover(dir, "browser", { a: "1" });
    expect(takeHandover(dir, "window")).toBeNull();
    expect(takeHandover(dir, "browser")).toEqual({ a: "1" });
    expect(takeHandover(dir, "browser")).toBeNull();
    expect(fs.existsSync(path.join(dir, "mode-handover.json"))).toBe(false);
  });
  it("accepts only text values", () => {
    expect(() => writeHandover(dir, "window", { a: 1 })).toThrow();
    expect(() => writeHandover(dir, "window", ["x"])).toThrow();
  });
});

describe("installer url", () => {
  const good = "https://github.com/Stravelakis/image-forge/releases/download/v1.0.3/Image.Forge.Setup.1.0.3.exe";
  it("accepts this project's release installer", () => {
    expect(isTrustedInstallerUrl(good)).toBe(true);
  });
  it.each([
    ["another repo", "https://github.com/evil/image-forge/releases/download/v1/Setup.exe"],
    ["http", good.replace("https", "http")],
    ["another host", good.replace("github.com", "github.com.evil.io")],
    ["not an installer", good.replace("Setup.1.0.3.exe", "portable.exe")],
    ["a script", good.replace(".exe", ".ps1")],
    ["credentials", good.replace("https://", "https://a:b@")],
    ["garbage", "not a url"],
  ])("refuses %s", (_, url) => {
    expect(isTrustedInstallerUrl(url)).toBe(false);
  });
});

describe("storage snapshot", () => {
  const fake = () => {
    const m = new Map<string, string>();
    return {
      get length() { return m.size; },
      key: (i: number) => [...m.keys()][i] ?? null,
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
      clear: () => m.clear(),
    } as Storage;
  };
  it("replaces rather than merges, so deletions carry over", () => {
    const a = fake();
    a.setItem("settings", "{}");
    const b = fake();
    b.setItem("stale-row", "x");
    expect(applySnapshot(snapshotStorage(a), b)).toBe(1);
    expect(b.getItem("stale-row")).toBeNull();
    expect(b.getItem("settings")).toBe("{}");
  });
});
