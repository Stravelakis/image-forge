import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DIMS,
  MODELS,
  RETIRED_MODELS,
  RateLimitError,
  RetiredModelError,
  estimateCost,
  explainFailure,
  formatUsd,
  generateBytes,
  priceFor,
  readGeminiImage,
  resolveRoute,
} from "../src/lib/engines.mjs";
import { ASPECTS, ASPECT_KEYS } from "../src/types";

const key = (id: string, over: Partial<{ key: string; exhaustedUntil: number }> = {}) => ({
  id,
  label: id,
  key: `secret-${id}`,
  exhaustedUntil: 0,
  ...over,
});

const settings = (over: Record<string, unknown> = {}) => ({
  localBase: "http://localhost:8080/v1",
  localModel: "flux.2-klein-4b",
  localKey: "",
  provider: "pollinations",
  pollinationsModel: "flux",
  pollinationsToken: "",
  pollinationsReferrer: "",
  geminiKeys: [],
  geminiModel: "nano-banana-2",
  geminiImageSize: "1K",
  cloudflare: { accountId: "", token: "" },
  cloudflareSteps: 4,
  openaiKeys: [],
  openaiBase: "https://api.openai.com/v1",
  openaiModel: "gpt-image-1",
  ...over,
}) as Parameters<typeof generateBytes>[1];

const row = (over: Record<string, unknown> = {}) => ({
  prompt: "a warm bakery",
  aspect_ratio: "1:1",
  seed: 42,
  model: "",
  ...over,
}) as Parameters<typeof generateBytes>[0];

const png = () => new Uint8Array([137, 80, 78, 71]);
const b64png = () => Buffer.from(png()).toString("base64");

afterEach(() => vi.unstubAllGlobals());

describe("aspect dimensions", () => {
  it("match the app's ASPECTS table", () => {
    for (const k of ASPECT_KEYS) {
      expect(DIMS[k], `dimensions for ${k}`).toEqual({ w: ASPECTS[k].w, h: ASPECTS[k].h });
    }
    expect(Object.keys(DIMS).sort()).toEqual([...ASPECT_KEYS].sort());
  });
});

describe("the model catalogue", () => {
  it("gives every model a price and an allowance", () => {
    for (const m of MODELS) {
      expect(typeof m.priceUsd, `${m.id}.priceUsd`).toBe("number");
      expect(m.priceUsd).toBeGreaterThanOrEqual(0);
      expect(m.label.length, `${m.id}.label`).toBeGreaterThan(0);
      expect(m.allowance.length, `${m.id}.allowance`).toBeGreaterThan(0);
      if (m.batchPriceUsd !== null) expect(m.batchPriceUsd).toBeLessThan(m.priceUsd);
    }
  });

  it("carries no model Google has already switched off", () => {
    for (const id of Object.keys(RETIRED_MODELS)) {
      expect(MODELS.find((m) => m.id === id), `${id} should be gone`).toBeUndefined();
    }
  });

  it("points every retired model at a replacement that exists", () => {
    for (const [id, info] of Object.entries(RETIRED_MODELS)) {
      expect(MODELS.find((m) => m.id === info.replacedBy), `${id} → ${info.replacedBy}`).toBeDefined();
    }
  });

  it("prices batch jobs at half, as Google documents", () => {
    expect(priceFor("nano-banana-2")).toBeCloseTo(0.067, 4);
    expect(priceFor("nano-banana-2", { batch: true })).toBeCloseTo(0.034, 4);
    expect(priceFor("nano-banana-2-lite", { batch: true })).toBeCloseTo(0.0168, 4);
  });

  it("treats the free engines as free", () => {
    expect(priceFor("cloudflare-flux")).toBe(0);
    expect(priceFor("flux")).toBe(0);
  });

  it("returns null for a model it has never heard of", () => {
    expect(priceFor("wishful-thinking-v9")).toBeNull();
  });
});

describe("estimateCost", () => {
  it("adds up what a run will cost", () => {
    const rows = [row({ model: "nano-banana-2" }), row({ model: "nano-banana-2" }), row({ model: "cloudflare-flux" })];
    const { total, count, unknown } = estimateCost(rows, settings());
    expect(count).toBe(3);
    expect(unknown).toBe(0);
    expect(total).toBeCloseTo(0.134, 4);
  });

  it("halves the total for a batch job", () => {
    const rows = [row({ model: "nano-banana-2" }), row({ model: "nano-banana-2" })];
    expect(estimateCost(rows, settings(), { batch: true }).total).toBeCloseTo(0.068, 4);
  });

  it("counts rows it cannot price instead of guessing", () => {
    const { unknown, total } = estimateCost([row({ model: "mystery-model" })], settings({ provider: "openai" }));
    expect(unknown).toBe(1);
    expect(total).toBe(0);
  });

  it("says 'free' rather than $0.00", () => {
    expect(formatUsd(0)).toBe("free");
    expect(formatUsd(0.034)).toBe("$0.034");
    expect(formatUsd(12.5)).toBe("$12.50");
  });
});

describe("resolveRoute", () => {
  it("honours the row's model column over the default engine", () => {
    expect(resolveRoute(row({ model: "nano-banana-2" }), settings())).toMatchObject({
      engine: "gemini",
      apiModel: "gemini-3.1-flash-image",
    });
    expect(resolveRoute(row({ model: "cloudflare-flux" }), settings())).toMatchObject({ engine: "cloudflare" });
    expect(resolveRoute(row({ model: "dall-e-3" }), settings())).toMatchObject({ engine: "openai", apiModel: "dall-e-3" });
  });

  it("flags a row still pointing at a model Google switched off", () => {
    expect(resolveRoute(row({ model: "imagen-4" }), settings()).engine).toBe("retired");
  });

  it("passes an unknown model straight through to the configured engine", () => {
    expect(resolveRoute(row({ model: "sdxl-turbo" }), settings({ provider: "openai" }))).toEqual({
      engine: "openai",
      apiModel: "sdxl-turbo",
    });
  });

  it("falls back to the engine default when no model is set", () => {
    expect(resolveRoute(row(), settings({ provider: "gemini" })).apiModel).toBe("gemini-3.1-flash-image");
    expect(resolveRoute(row(), settings({ provider: "gemini", geminiModel: "nano-banana-2-lite" })).apiModel).toBe(
      "gemini-3.1-flash-lite-image"
    );
    expect(resolveRoute(row(), settings({ provider: "cloudflare" })).apiModel).toBe("@cf/black-forest-labs/flux-1-schnell");
    expect(resolveRoute(row(), settings({ provider: "pollinations", pollinationsModel: "turbo" })).apiModel).toBe("turbo");
    expect(resolveRoute(row(), settings({ provider: "simulated" })).engine).toBe("simulated");
  });

  it("knows every registered model", () => {
    for (const m of MODELS) expect(resolveRoute(row({ model: m.id }), settings()).apiModel).toBe(m.apiId);
  });
});

describe("readGeminiImage", () => {
  it("reads the Interactions shape", () => {
    expect(readGeminiImage({ output_image: { data: "abc" } })).toBe("abc");
  });

  it("reads the step-by-step shape", () => {
    expect(
      readGeminiImage({ steps: [{ type: "model_output", content: [{ type: "text" }, { type: "image", data: "xyz" }] }] })
    ).toBe("xyz");
  });

  it("reads the generateContent shape batch jobs come back in", () => {
    expect(readGeminiImage({ candidates: [{ content: { parts: [{ inlineData: { data: "qqq" } }] } }] })).toBe("qqq");
  });

  it("returns null when there is no image at all", () => {
    expect(readGeminiImage({ candidates: [{ content: { parts: [{ text: "refused" }] } }] })).toBeNull();
  });
});

describe("explainFailure", () => {
  it("turns the Pollinations bot check into an instruction", () => {
    expect(explainFailure(403, '{"error":"Missing Turnstile token"}', "pollinations")).toMatch(/token/i);
  });

  it("says what a 429 actually means", () => {
    expect(explainFailure(429, "", "gemini")).toMatch(/limit/i);
  });

  it("does not blame the user for the provider's outage", () => {
    expect(explainFailure(503, "", "gemini")).toMatch(/provider/i);
  });
});

describe("generateBytes", () => {
  it("refuses to hit the network for the practice forge", async () => {
    await expect(generateBytes(row(), settings({ provider: "simulated" }), undefined, () => {}, 0)).rejects.toThrow(
      /never goes online/
    );
  });

  it("refuses a retired model loudly instead of failing at the provider", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      generateBytes(row({ model: "imagen-4-ultra" }), settings(), undefined, () => {}, 0)
    ).rejects.toBeInstanceOf(RetiredModelError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks pollinations for the routed model and aspect size", async () => {
    const fetchMock = vi.fn(async () => new Response(png(), { status: 200, headers: { "content-type": "image/png" } }));
    vi.stubGlobal("fetch", fetchMock);

    const { bytes, mime } = await generateBytes(
      row({ aspect_ratio: "16:9", model: "turbo" }),
      settings(),
      undefined,
      () => {},
      0
    );

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("width=1024");
    expect(url).toContain("height=576");
    expect(url).toContain("model=turbo");
    expect(mime).toBe("image/png");
    expect(bytes).toEqual(png());
  });

  it("sends the Pollinations token when there is one", async () => {
    const fetchMock = vi.fn(async () => new Response(png(), { status: 200, headers: { "content-type": "image/png" } }));
    vi.stubGlobal("fetch", fetchMock);
    await generateBytes(row({ model: "flux" }), settings({ pollinationsToken: "tok_123" }), undefined, () => {}, 0);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok_123");
  });

  it("rejects a non-image payload from pollinations", async () => {
    vi.stubGlobal("fetch", async () => new Response("nope", { status: 200, headers: { "content-type": "text/html" } }));
    await expect(generateBytes(row(), settings(), undefined, () => {}, 0)).rejects.toThrow(/not an image/);
  });

  it("calls Google's Interactions endpoint with the key in a header", async () => {
    const fetchMock = vi.fn(async () => Response.json({ output_image: { data: b64png() } }, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { bytes } = await generateBytes(
      row({ model: "nano-banana-2", aspect_ratio: "16:9" }),
      settings({ geminiKeys: [key("k1")] }),
      undefined,
      () => {},
      0
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/interactions");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("secret-k1");
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe("gemini-3.1-flash-image");
    // JPEG only — the Interactions API rejects image/png outright
    expect(body.response_format).toMatchObject({
      type: "image",
      mime_type: "image/jpeg",
      aspect_ratio: "16:9",
      image_size: "1K",
    });
    expect(bytes).toEqual(png());
  });

  it("never calls the endpoint Google switched off", async () => {
    const fetchMock = vi.fn(async () => Response.json({ output_image: { data: b64png() } }, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await generateBytes(row({ model: "nano-banana-2" }), settings({ geminiKeys: [key("k1")] }), undefined, () => {}, 0);
    expect(String(fetchMock.mock.calls[0][0])).not.toContain(":predict");
  });

  it("folds a negative prompt into the wording Google understands", async () => {
    const fetchMock = vi.fn(async () => Response.json({ output_image: { data: b64png() } }, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await generateBytes(
      row({ model: "nano-banana-2", negative_prompt: "text, watermark" }),
      settings({ geminiKeys: [key("k1")] }),
      undefined,
      () => {},
      0
    );
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.input[0].text).toContain("Avoid: text, watermark");
  });

  it("rotates to the next key on a 429 and rests the exhausted one", async () => {
    const seen: RequestInit[] = [];
    const benched: string[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      seen.push(init);
      if (seen.length === 1) return new Response("slow down", { status: 429 });
      return Response.json({ output_image: { data: b64png() } }, { status: 200 });
    });

    const { bytes } = await generateBytes(
      row({ model: "nano-banana-2" }),
      settings({ geminiKeys: [key("k1"), key("k2")] }),
      undefined,
      (_pool, id) => benched.push(id),
      60_000
    );

    expect(seen).toHaveLength(2);
    expect((seen[0].headers as Record<string, string>)["x-goog-api-key"]).toBe("secret-k1");
    expect((seen[1].headers as Record<string, string>)["x-goog-api-key"]).toBe("secret-k2");
    expect(benched).toEqual(["k1"]);
    expect(bytes).toEqual(png());
  });

  it("raises RateLimitError when every key is already resting", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      generateBytes(
        row({ model: "nano-banana-2" }),
        settings({ geminiKeys: [key("k1", { exhaustedUntil: Date.now() + 60_000 })] }),
        undefined,
        () => {},
        60_000
      )
    ).rejects.toBeInstanceOf(RateLimitError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("tells you plainly when there is no key at all", async () => {
    vi.stubGlobal("fetch", vi.fn());
    await expect(
      generateBytes(row({ model: "nano-banana-2" }), settings({ geminiKeys: [key("k1", { key: "  " })] }), undefined, () => {}, 0)
    ).rejects.toThrow(/add one in Settings/);
  });

  it("draws from Cloudflare's free allowance", async () => {
    const fetchMock = vi.fn(async () => Response.json({ result: { image: b64png() }, success: true }, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { bytes } = await generateBytes(
      row({ model: "cloudflare-flux" }),
      settings({ cloudflare: { accountId: "acct1", token: "cftok" } }),
      undefined,
      () => {},
      0
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.cloudflare.com/client/v4/accounts/acct1/ai/run/@cf/black-forest-labs/flux-1-schnell");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer cftok");
    const sent = JSON.parse(String(init.body));
    expect(sent).toMatchObject({ prompt: "a warm bakery", steps: 4 });
    // Cloudflare rejects the whole request if a seed is present, despite its
    // own docs listing one. Verified against a live account 2026-09-02.
    expect(sent).not.toHaveProperty("seed");
    expect(bytes).toEqual(png());
  });

  it("keeps Cloudflare's steps inside the 1–8 the model accepts", async () => {
    const fetchMock = vi.fn(async () => Response.json({ result: { image: b64png() } }, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await generateBytes(
      row({ model: "cloudflare-flux" }),
      settings({ cloudflare: { accountId: "a", token: "t" }, cloudflareSteps: 99 }),
      undefined,
      () => {},
      0
    );
    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body)).steps).toBe(8);
  });

  it("says when Cloudflare's daily allowance is spent", async () => {
    vi.stubGlobal("fetch", async () => new Response("", { status: 429 }));
    await expect(
      generateBytes(
        row({ model: "cloudflare-flux" }),
        settings({ cloudflare: { accountId: "a", token: "t" } }),
        undefined,
        () => {},
        1000
      )
    ).rejects.toThrow(/resets at midnight UTC/);
  });

  it("asks for the Cloudflare details when they are missing", async () => {
    vi.stubGlobal("fetch", vi.fn());
    await expect(
      generateBytes(row({ model: "cloudflare-flux" }), settings(), undefined, () => {}, 0)
    ).rejects.toThrow(/account id and a token/);
  });

  it("talks to a model on your own machine, with no key", async () => {
    const fetchMock = vi.fn(async () => Response.json({ data: [{ b64_json: b64png() }] }, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { bytes } = await generateBytes(
      row({ aspect_ratio: "1:1" }),
      settings({ provider: "local" }),
      undefined,
      () => {},
      0
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/v1/images/generations");
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(JSON.parse(String(init.body))).toMatchObject({ model: "flux.2-klein-4b", size: "768x768" });
    expect(bytes).toEqual(png());
  });

  it("lets a row name any model your local server knows", async () => {
    const fetchMock = vi.fn(async () => Response.json({ data: [{ b64_json: b64png() }] }, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await generateBytes(row({ model: "Z-Image-Turbo" }), settings({ provider: "local" }), undefined, () => {}, 0);
    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body)).model).toBe("Z-Image-Turbo");
  });

  it("says the server is not running rather than a raw network error", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("fetch failed");
    });
    await expect(
      generateBytes(row(), settings({ provider: "local" }), undefined, () => {}, 0)
    ).rejects.toThrow(/Could not reach your local server/);
  });

  it("charges nothing for pictures made on your own machine", () => {
    const rows = [row(), row(), row()];
    expect(estimateCost(rows, settings({ provider: "local" }))).toMatchObject({ total: 0, unknown: 0, count: 3 });
  });

  it("follows a relative image URL back to the local server", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      String(url).includes("images/generations")
        ? Response.json({ data: [{ url: "/generated-images/abc.png" }] }, { status: 200 })
        : new Response(png(), { status: 200, headers: { "content-type": "image/png" } })
    );
    vi.stubGlobal("fetch", fetchMock);
    const { bytes } = await generateBytes(row(), settings({ provider: "local" }), undefined, () => {}, 0);
    expect(String(fetchMock.mock.calls[1][0])).toBe("http://localhost:8080/generated-images/abc.png");
    expect(bytes).toEqual(png());
  });

  it("posts an OpenAI-compatible request and reads b64_json", async () => {
    const fetchMock = vi.fn(async () => Response.json({ data: [{ b64_json: b64png() }] }, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { bytes } = await generateBytes(
      row({ model: "dall-e-3", aspect_ratio: "9:16" }),
      settings({ openaiKeys: [key("k1")], openaiBase: "https://example.test/v1/" }),
      undefined,
      () => {},
      0
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://example.test/v1/images/generations");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret-k1");
    expect(JSON.parse(String(init.body))).toMatchObject({ model: "dall-e-3", size: "1024x1536" });
    expect(bytes).toEqual(png());
  });

  it("follows a URL response when the endpoint returns no base64", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      String(url).includes("images/generations")
        ? Response.json({ data: [{ url: "https://cdn.test/a.png" }] }, { status: 200 })
        : new Response(png(), { status: 200, headers: { "content-type": "image/png" } })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { bytes } = await generateBytes(
      row({ model: "gpt-image-1" }),
      settings({ openaiKeys: [key("k1")] }),
      undefined,
      () => {},
      0
    );
    expect(bytes).toEqual(png());
  });

  it("explains a refusal instead of dumping a status code", async () => {
    vi.stubGlobal("fetch", async () => new Response("model not found", { status: 404 }));
    await expect(
      generateBytes(row({ model: "gpt-image-1" }), settings({ openaiKeys: [key("k1")] }), undefined, () => {}, 0)
    ).rejects.toThrow(/no longer exists/);
  });
});

describe("things only a live account revealed", () => {
  it("says a Google key has no credit, rather than 'wait and retry'", () => {
    const body = '{"error":{"message":"Your prepayment credits are depleted. Please go to AI Studio..."}}';
    const msg = explainFailure(429, body, "gemini");
    expect(msg).toMatch(/no image credit/i);
    expect(msg).toMatch(/not free/i);
    expect(msg).toMatch(/Cloudflare|your own machine/);
  });

  it("still treats an ordinary Google 429 as something to wait out", () => {
    expect(explainFailure(429, "quota exceeded for requests per minute", "gemini")).toMatch(/limit/i);
    expect(explainFailure(429, "quota exceeded for requests per minute", "gemini")).not.toMatch(/no image credit/i);
  });

  it("asks Google for jpeg, the only format the Interactions API accepts", async () => {
    const fetchMock = vi.fn(async () => Response.json({ output_image: { data: b64png() } }, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await generateBytes(
      row({ model: "nano-banana-2" }),
      settings({ geminiKeys: [key("k1")] }),
      undefined,
      () => {},
      0
    );
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.response_format.mime_type).toBe("image/jpeg");
    expect(JSON.stringify(body)).not.toContain("image/png");
  });
});

/**
 * OVHcloud SDXL: free, no key, two pictures a minute.
 *
 * The engine keeps its own pace rather than handing a 429 to the normal
 * rate-limit path, which would park the row for hours as though a daily quota
 * had run out. These pin the pace, the retry, and the request shape.
 */
describe("OVHcloud SDXL", () => {
  const png = () => new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), { status: 200, headers: { "content-type": "image/png" } });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("is free and needs no key", () => {
    const def = MODELS.find((m) => m.id === "ovh-sdxl")!;
    expect(def.priceUsd).toBe(0);
    expect(def.needsKey).toBe(false);
    expect(estimateCost([row({ model: "ovh-sdxl" })], settings()).total).toBe(0);
  });

  it("routes by model column and by chosen engine", () => {
    expect(resolveRoute(row({ model: "ovh-sdxl" }), settings()).engine).toBe("ovh");
    expect(resolveRoute(row({ model: "" }), settings({ provider: "ovh" })).engine).toBe("ovh");
  });

  it("sends the prompt and the negative prompt, with no key at all", async () => {
    const fetchMock = vi.fn().mockResolvedValue(png());
    vi.stubGlobal("fetch", fetchMock);
    const out = await generateBytes(
      row({ model: "ovh-sdxl", prompt: "a clay fox", negative_prompt: "text" }),
      settings(),
      undefined,
      () => {},
      0
    );
    expect(out.mime).toBe("image/png");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/text2image");
    expect(init.headers.Authorization).toBeUndefined();
    const body = JSON.parse(init.body);
    expect(body.prompt).toContain("a clay fox");
    expect(body.negative_prompt).toContain("text");
  });

  it("waits out a 429 for as long as the provider says, then tries again", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("slow down", { status: 429, headers: { "RateLimit-Reset": "5" } }))
      .mockResolvedValueOnce(png());
    vi.stubGlobal("fetch", fetchMock);
    const pending = generateBytes(row({ model: "ovh-sdxl" }), settings(), undefined, () => {}, 0);
    await vi.advanceTimersByTimeAsync(120_000);
    const out = await pending;
    expect(out.mime).toBe("image/png");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("paces parallel calls so they cannot bunch into a 429", async () => {
    vi.useFakeTimers();
    const times: number[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        times.push(Date.now());
        return png();
      })
    );
    const all = Promise.all(
      [1, 2, 3].map((i) => generateBytes(row({ id: i, model: "ovh-sdxl" }), settings(), undefined, () => {}, 0))
    );
    await vi.advanceTimersByTimeAsync(200_000);
    await all;
    expect(times).toHaveLength(3);
    // two a minute means at least thirty seconds between calls
    expect(times[1] - times[0]).toBeGreaterThanOrEqual(30_000);
    expect(times[2] - times[1]).toBeGreaterThanOrEqual(30_000);
  });

  it("refuses a reference picture, rather than quietly ignoring it", async () => {
    await expect(
      generateBytes(row({ model: "ovh-sdxl" }), settings(), undefined, () => {}, 0, { refImages: ["abc"] })
    ).rejects.toThrow(/reference picture/);
  });
});
