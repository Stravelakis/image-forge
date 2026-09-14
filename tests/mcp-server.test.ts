import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { SCHEMAS, TOOLS, folderFor, pickProvider, safeFilename, unwrapSettingsFile } from "../scripts/mcp-server.js";

describe("safeFilename", () => {
  it("accepts the app's own naming convention", () => {
    expect(safeFilename("shop_bakery.png")).toBe("shop_bakery.png");
    expect(safeFilename("item_lantern_2.png")).toBe("item_lantern_2.png");
  });

  it.each([
    "../../etc/passwd.png",
    "..\\..\\windows\\system32\\evil.png",
    "/absolute/path.png",
    "C:\\Users\\me\\thing.png",
    "sub/dir/shop.png",
  ])("refuses to escape the output folder with %j", (name) => {
    expect(() => safeFilename(name)).toThrow(/unsafe filename/);
  });

  it.each(["Shop_Bakery.png", "shop bakery.png", "shop-bakery.png", "shop_bakery.txt", "shop_bakery", "", "  "])(
    "refuses malformed name %j",
    (name) => {
      expect(() => safeFilename(name)).toThrow(/unsafe filename/);
    }
  );
});

describe("tool declarations", () => {
  it("advertises a valid JSON Schema for every tool", () => {
    for (const tool of TOOLS) {
      expect(tool.name, "tool name").toMatch(/^forge_/);
      expect(tool.description.length).toBeGreaterThan(10);
      const s = tool.inputSchema as Record<string, unknown>;
      expect(s.type, `${tool.name}.inputSchema.type`).toBe("object");
      expect(s.properties, `${tool.name}.inputSchema.properties`).toBeTypeOf("object");
      expect(Array.isArray(s.required)).toBe(true);
      // every declared property must itself be a typed JSON Schema node
      for (const [prop, def] of Object.entries(s.properties as Record<string, { type?: string }>) ) {
        expect(def.type, `${tool.name}.${prop}.type`).toBeTypeOf("string");
      }
      // and everything required must actually be declared
      for (const req of s.required as string[]) expect(Object.keys(s.properties as object)).toContain(req);
      expect(JSON.parse(JSON.stringify(s))).toEqual(s);
    }
  });

  it("validates arguments before doing any work", () => {
    expect(SCHEMAS.forge_add_row.safeParse({ filename: "shop_a.png", prompt: "a shop" }).success).toBe(true);
    expect(SCHEMAS.forge_add_row.safeParse({ filename: "shop_a.png" }).success).toBe(false);
    expect(SCHEMAS.forge_add_row.safeParse({ filename: "shop_a.png", prompt: "a", seed: 0 }).success).toBe(false);
    expect(SCHEMAS.forge_add_row.safeParse({ filename: "shop_a.png", prompt: "a", category: "dragon" }).success).toBe(false);
    expect(SCHEMAS.forge_add_row.safeParse({ filename: "shop_a.png", prompt: "a", model: "not-a-model" }).success).toBe(false);
    expect(SCHEMAS.forge_generate_pending.safeParse({ limit: "10" }).success).toBe(false);
    expect(SCHEMAS.forge_generate_one.safeParse({}).success).toBe(false);
  });

  it("applies the documented defaults", () => {
    const parsed = SCHEMAS.forge_add_row.parse({ filename: "shop_a.png", prompt: "a shop" });
    expect(parsed.category).toBe("image");
    expect(parsed.aspect_ratio).toBe("1:1");
  });

  it("keeps a seed space wide enough to avoid collisions in big batches", () => {
    const seed = SCHEMAS.forge_add_row.shape.seed;
    expect(seed.safeParse(1_000_000).success).toBe(true);
    expect(seed.safeParse(2_147_483_648).success).toBe(false);
  });

  it("declares a schema for every advertised tool and nothing more", () => {
    expect(TOOLS.map((t) => t.name).sort()).toEqual(Object.keys(SCHEMAS).sort());
  });
});

describe("what an agent inherits by default", () => {
  it("tells models that cannot spell not to try, exactly as the app does", async () => {
    // Otherwise an agent quietly produces pictures covered in gibberish
    // lettering, while the same prompt through the app comes out clean.
    const src = await readFile(new URL("../scripts/mcp-server.js", import.meta.url), "utf8");
    expect(src).toContain("suppressTextOnWeakModels: file.suppressTextOnWeakModels !== false");
    expect(src).toContain("localTextQuality");
  });

  it("reads the local engine from a settings file or the environment", async () => {
    const src = await readFile(new URL("../scripts/mcp-server.js", import.meta.url), "utf8");
    for (const v of ["FORGE_LOCAL_BASE", "FORGE_LOCAL_MODEL", "CLOUDFLARE_ACCOUNT_ID", "POLLINATIONS_TOKEN"]) {
      expect(src, `should honour ${v}`).toContain(v);
    }
  });

  it("never calls a picture on your own machine 'price unknown'", async () => {
    const src = await readFile(new URL("../scripts/mcp-server.js", import.meta.url), "utf8");
    expect(src).toMatch(/engine === "local" \|\| engine === "simulated"/);
  });
});

/**
 * An agent with nothing configured must still be able to make a picture.
 *
 * The fallback used to be Pollinations, which now refuses anonymous requests,
 * so a keyless agent got an engine that failed every time. OVHcloud needs no
 * key. STANDARDS #4.
 */
describe("the engine an agent gets", () => {
  const none = { cloudflare: { accountId: "", token: "" }, pollinationsToken: "", geminiKeys: [], openaiKeys: [] };

  it("is OVHcloud when nothing at all is set up", () => {
    expect(pickProvider(none)).toBe("ovh");
  });

  it("never falls back to Pollinations without a token", () => {
    expect(pickProvider(none)).not.toBe("pollinations");
  });

  it("prefers a free engine that is set up, cheapest first", () => {
    expect(pickProvider({ ...none, cloudflare: { accountId: "a", token: "t" }, geminiKeys: [{}] })).toBe("cloudflare");
    expect(pickProvider({ ...none, pollinationsToken: "t", geminiKeys: [{}] })).toBe("pollinations");
  });

  it("uses paid keys only when no free engine is set up", () => {
    expect(pickProvider({ ...none, geminiKeys: [{}] })).toBe("gemini");
    expect(pickProvider({ ...none, openaiKeys: [{}] })).toBe("openai");
  });

  it("lets FORGE_PROVIDER and the backup's own choice win", () => {
    expect(pickProvider({ ...none, forced: "cloudflare" })).toBe("cloudflare");
    expect(pickProvider({ ...none, saved: "gemini" })).toBe("gemini");
  });

  it("ignores a backup that had the practice forge selected", () => {
    // An agent writing real files must not quietly produce practice drawings.
    expect(pickProvider({ ...none, saved: "simulated" })).toBe("ovh");
  });
});

describe("where an agent's files land", () => {
  it("uses the same folders as the app", () => {
    expect(folderFor("image")).toBe("images");
    expect(folderFor("svg")).toBe("vectors");
    expect(folderFor("lottie")).toBe("lottie");
    expect(folderFor("sheet")).toBe("sheets");
    expect(folderFor("gif")).toBe("gifs");
  });

  it("reads old category names as pictures, as the app does", () => {
    for (const old of ["shop", "item", "event", "npc"]) expect(folderFor(old)).toBe("images");
  });

  it("puts anything unrecognised with the pictures, never in a stray folder", () => {
    expect(folderFor("")).toBe("images");
    expect(folderFor(undefined)).toBe("images");
    expect(folderFor("dragon")).toBe("images");
  });

  it("accepts the new categories from an agent", () => {
    for (const c of ["image", "svg", "lottie", "sheet", "gif"]) {
      expect(SCHEMAS.forge_add_row.safeParse({ filename: "image_a.png", prompt: "a", category: c }).success, c).toBe(true);
    }
  });
});

describe("reading a settings file from the app", () => {
  const keys = { geminiKeys: [{ id: "a", key: "k" }] };

  it("reads Settings → Back up to a file", () => {
    expect(unwrapSettingsFile({ kind: "image-forge-settings", version: 1, settings: keys })).toEqual(keys);
  });

  it("reads Settings → Advanced → Backup", () => {
    expect(unwrapSettingsFile({ exportedAt: "x", "image-forge-settings-v1": keys })).toEqual(keys);
  });

  it("reads a bare settings object", () => {
    expect(unwrapSettingsFile(keys)).toEqual(keys);
  });

  it("gives an empty object for nothing usable, rather than crashing", () => {
    expect(unwrapSettingsFile(null)).toEqual({});
    expect(unwrapSettingsFile("nope")).toEqual({});
  });
});
