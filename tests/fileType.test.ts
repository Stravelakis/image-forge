/**
 * A file's name tells the truth about its bytes — everywhere a picture is saved.
 *
 * The first fix only covered a normal strike. Every other path still wrote
 * ".png" by assumption: the local engine labelled every base64 reply PNG,
 * Google's half-price batch collector labelled every result PNG (Google only
 * returns JPEG), kept variants were never renamed, duplicates and de-dupes only
 * understood ".png" ("a.jpg" became "a.jpg_2.png"), and the MCP server refused
 * any other extension. These pin the single shared rule.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  generateBytes,
  mimeFromBytes,
  nameForMime,
  uniqueName,
  withSuffix,
} from "../src/lib/engines.mjs";
import { collectBatch } from "../src/lib/geminiBatch.mjs";
import { dataUrlToBlob } from "../src/lib/output";
import { safeFilename } from "../scripts/mcp-server.js";

// The first 12 bytes of each format, from the formats' own specifications.
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d];
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01];
const WEBP = [0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];
const GIF = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0, 0];
const b64 = (bytes: number[]) => Buffer.from(bytes).toString("base64");

afterEach(() => vi.unstubAllGlobals());

describe("reading the type from the bytes", () => {
  it.each([
    ["PNG", PNG, "image/png"],
    ["JPEG", JPEG, "image/jpeg"],
    ["WebP", WEBP, "image/webp"],
    ["GIF", GIF, "image/gif"],
  ])("recognises %s", (_label, bytes, mime) => {
    expect(mimeFromBytes(new Uint8Array(bytes as number[]))).toBe(mime);
  });

  it("says nothing rather than guessing for anything else", () => {
    expect(mimeFromBytes(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]))).toBe("");
    expect(mimeFromBytes(new Uint8Array([0xff, 0xd8]))).toBe("");
    expect(mimeFromBytes(null)).toBe("");
  });
});

describe("the engine's answer is corrected from the bytes", () => {
  it("renames nothing itself, but reports JPEG when a server claims PNG", async () => {
    // The local engine used to label every base64 reply image/png.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ b64_json: b64(JPEG) }] }), { status: 200 }))
    );
    const out = await generateBytes(
      { prompt: "x", aspect_ratio: "1:1", seed: 1, model: "" } as never,
      { provider: "local", localBase: "http://localhost:8080/v1", localModel: "m", localKey: "" } as never,
      undefined,
      () => {},
      0
    );
    expect(out.mime).toBe("image/jpeg");
  });
});

describe("Google's half-price batch results", () => {
  it("are labelled by their bytes, not assumed to be PNG", () => {
    const job = { response: { inlinedResponses: [{ metadata: { key: "image_a.png" }, response: { output_image: { data: b64(JPEG) } } }] } };
    const { images } = collectBatch(job, ["image_a.png"]);
    expect(images[0].mime).toBe("image/jpeg");
    expect(nameForMime(images[0].filename, images[0].mime)).toBe("image_a.jpg");
  });
});

describe("a kept variant", () => {
  it("keeps its real type when turned back into a file", () => {
    // The type used to come out as "data:image/jpeg", which matched nothing.
    expect(dataUrlToBlob(`data:image/jpeg;base64,${b64(JPEG)}`).type).toBe("image/jpeg");
    expect(nameForMime("image_a.png", dataUrlToBlob(`data:image/jpeg;base64,${b64(JPEG)}`).type)).toBe("image_a.jpg");
  });
});

describe("copies and duplicates keep the real extension", () => {
  it("puts a suffix before the extension, whatever it is", () => {
    expect(withSuffix("image_a.jpg", "_copy")).toBe("image_a_copy.jpg");
    expect(withSuffix("image_a.png", "_copy")).toBe("image_a_copy.png");
    expect(withSuffix("image_a", "_copy")).toBe("image_a_copy");
  });

  it("never produces two extensions", () => {
    // What the old .png-only code did to a JPEG.
    const next = uniqueName("image_a.jpg", new Set(["image_a.jpg"]));
    expect(next).toBe("image_a_2.jpg");
    expect(next).not.toMatch(/\.jpg_/);
  });

  it("counts on until the name is free", () => {
    expect(uniqueName("a.webp", new Set(["a.webp", "a_2.webp", "a_3.webp"]))).toBe("a_4.webp");
  });

  it("leaves a free name alone", () => {
    expect(uniqueName("a.jpg", new Set(["b.jpg"]))).toBe("a.jpg");
  });
});

describe("an agent's filenames", () => {
  it("may end in the extension the engine actually returned", () => {
    for (const name of ["image_a.png", "image_a.jpg", "image_a.jpeg", "image_a.webp", "image_a.gif"]) {
      expect(safeFilename(name)).toBe(name);
    }
  });

  it("still refuses anything that is not a picture", () => {
    expect(() => safeFilename("image_a.exe")).toThrow(/unsafe filename/);
  });
});
