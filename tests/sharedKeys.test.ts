import { describe, it, expect } from "vitest";
import { DEFAULT_SETTINGS } from "../src/lib/providers";
import { keysFromSettings, fillFromShared } from "../src/lib/sharedKeys";
import { putShared, sharedValues } from "../electron/forgeKeys.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const base = () => structuredClone(DEFAULT_SETTINGS);

describe("keys shared with Video Forge", () => {
  it("fresh settings share nothing", () => {
    expect(keysFromSettings(base())).toEqual({});
  });

  it("fills empty boxes from the shared keys", () => {
    const s = fillFromShared(base(), { gemini: "g1", mistral: "m1", openrouter: "o1", "cloudflare-token": "c1" });
    expect(s.geminiKeys[0].key).toBe("g1");
    expect(s.cloudflare.token).toBe("c1");
    expect(keysFromSettings(s)).toMatchObject({ gemini: "g1", mistral: "m1", openrouter: "o1", "cloudflare-token": "c1" });
    // the text jobs that point at Mistral get the key too
    expect(s.coder.key).toBe("m1");
    expect(s.vision.key).toBe("m1");
  });

  it("never overwrites a key already typed here", () => {
    const mine = base();
    mine.geminiKeys = [{ ...mine.geminiKeys[0], key: "mine" }];
    const s = fillFromShared(mine, { gemini: "theirs" });
    expect(s.geminiKeys[0].key).toBe("mine");
  });

  it("returns the same object when nothing was missing", () => {
    const s = base();
    expect(fillFromShared(s, {})).toBe(s);
  });

  it("round trip through the shared file (stand-in lock)", async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "if-keys-")), "shared-keys.bin");
    const crypt = {
      available: true,
      lock: async (t: string) => Buffer.from(t, "utf8").reverse(),
      unlock: async (b: Buffer) => Buffer.from(b).reverse().toString("utf8"),
    };
    await putShared({ gemini: "from-video-forge" }, "video-forge", { file, crypt });
    const s = fillFromShared(base(), await sharedValues({ file, crypt }));
    expect(s.geminiKeys[0].key).toBe("from-video-forge");
  });
});
