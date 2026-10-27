/**
 * Nothing lost (audit finding H5): every picture gets a copy in the app's own
 * folder the moment it arrives, and closing with an unsaved picture warns.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { autosaveRoot, readAutosave, writeAutosave } from "../electron/autosave.mjs";
import { autosaveImage, loadAutosaved, unsavedPictures } from "../src/lib/autosave";

afterEach(() => vi.unstubAllGlobals());

describe("the safety copy on disk", () => {
  const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "forge-autosave-"));

  it("writes into <userData>/images/<folder>/ and reads it back", () => {
    const ud = tmp();
    const root = autosaveRoot(ud);
    expect(root).toBe(path.join(ud, "images"));
    const bytes = Buffer.from([1, 2, 3, 4]);
    expect(writeAutosave(root, "images", "shop_bakery.png", bytes)).toEqual({ ok: true });
    expect(fs.readFileSync(path.join(root, "images", "shop_bakery.png"))).toEqual(bytes);
    expect(readAutosave(root, "images", "shop_bakery.png")).toEqual(bytes);
    expect(fs.readdirSync(path.join(root, "images")).filter((f) => f.endsWith(".tmp"))).toEqual([]);
    fs.rmSync(ud, { recursive: true, force: true });
  });

  it("writes again over the same name (a redo replaces it)", () => {
    const ud = tmp();
    const root = autosaveRoot(ud);
    writeAutosave(root, "gifs", "a.gif", Buffer.from([1]));
    writeAutosave(root, "gifs", "a.gif", Buffer.from([2, 2]));
    expect(readAutosave(root, "gifs", "a.gif")).toEqual(Buffer.from([2, 2]));
    fs.rmSync(ud, { recursive: true, force: true });
  });

  it.each([
    ["images", "../evil.png"],
    ["images", "..\\evil.png"],
    ["images", "sub/evil.png"],
    ["images", "C:\\evil.png"],
    ["images", "evil.exe"],
    ["images", "evil.png.exe"],
    ["images", ""],
    ["../images", "a.png"],
    ["secrets", "a.png"],
    ["images/..", "a.png"],
  ])("refuses %j / %j", (folder, file) => {
    const ud = tmp();
    const root = autosaveRoot(ud);
    expect(writeAutosave(root, folder, file, Buffer.from([1])).ok).toBe(false);
    expect(readAutosave(root, folder, file)).toBeNull();
    expect(fs.existsSync(root)).toBe(false);
    fs.rmSync(ud, { recursive: true, force: true });
  });

  it("answers null for a picture that is not there", () => {
    expect(readAutosave(autosaveRoot(tmp()), "images", "nope.png")).toBeNull();
  });
});

describe("the page's side", () => {
  const row = { category: "image", filename: "shop_a.png" } as never;

  it("sends the picture with the app's pass and says whether it landed", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response("{}", { status: 200 });
    });
    expect(await autosaveImage(row, new Blob(["x"]))).toBe(true);
    expect(calls[0].url).toBe("/app/autosave/images/shop_a.png");
    expect(calls[0].init.method).toBe("PUT");
    expect((calls[0].init.headers as Record<string, string>)["X-Forge-App"]).toBe("1");
  });

  it("says false when there is no desktop app behind it, or the write is refused", async () => {
    vi.stubGlobal("fetch", async () => new Response("nope", { status: 404 }));
    expect(await autosaveImage(row, new Blob(["x"]))).toBe(false);
    vi.stubGlobal("fetch", async () => {
      throw new Error("offline");
    });
    expect(await autosaveImage(row, new Blob(["x"]))).toBe(false);
  });

  it("reads a picture back, or null", async () => {
    vi.stubGlobal("fetch", async () => new Response(new Blob(["abc"]), { status: 200 }));
    expect(((await loadAutosaved(row)) as Blob).size).toBe(3);
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 404 }));
    expect(await loadAutosaved(row)).toBeNull();
  });

  it("lists only what exists nowhere but in memory", () => {
    const inMemory = ["a.png", "b.png", "c.png"];
    expect(unsavedPictures(inMemory, new Set(["a.png", "c.png"]))).toEqual(["b.png"]);
    expect(unsavedPictures(inMemory, new Set(inMemory))).toEqual([]);
    expect(unsavedPictures([], new Set())).toEqual([]);
  });
});
