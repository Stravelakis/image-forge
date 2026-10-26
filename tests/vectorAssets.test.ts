/**
 * @vitest-environment jsdom
 *
 * Model-written SVG ends up inside the page, so the sanitiser is the most
 * safety-critical code in this project. These tests try to get past it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkLottie,
  checkSvg,
  codeEngineFor,
  makeVector,
  sanitiseSvg,
  svgToDataUrl,
  vectorFilename,
} from "../src/lib/vectorAssets";

afterEach(() => vi.unstubAllGlobals());

const settings = (over: Record<string, unknown> = {}) =>
  ({
    scribe: { base: "https://api.openai.com/v1", key: "sk-prose", model: "gpt-4o-mini" },
    coder: { base: "https://api.mistral.ai/v1", key: "sk-code", model: "codestral-latest" },
    ...over,
  }) as never;

const reply = (text: string) => Response.json({ choices: [{ message: { content: text } }] }, { status: 200 });

const GOOD_ICON = '<svg viewBox="0 0 24 24"><path d="M4 4 L20 20" stroke="currentColor"/></svg>';

describe("sanitiseSvg — things that must never survive", () => {
  it("removes a script tag", () => {
    const r = sanitiseSvg('<svg viewBox="0 0 24 24"><script>alert(1)</script><path d="M0 0"/></svg>');
    expect(r.svg).not.toMatch(/script/i);
    expect(r.svg).not.toContain("alert");
    expect(r.removed).toContain("<script>");
  });

  it("removes a self-closing script tag", () => {
    const r = sanitiseSvg('<svg viewBox="0 0 24 24"><script src="evil.js"/><path d="M0 0"/></svg>');
    expect(r.svg).not.toMatch(/script/i);
  });

  it("removes event handlers", () => {
    const r = sanitiseSvg(`<svg viewBox="0 0 24 24"><circle onclick="steal()" onload='go()' r="5"/></svg>`);
    expect(r.svg).not.toMatch(/onclick/i);
    expect(r.svg).not.toMatch(/onload/i);
    expect(r.svg).not.toContain("steal");
    expect(r.removed).toContain("event handlers");
  });

  it("removes foreignObject, which can smuggle in HTML", () => {
    const r = sanitiseSvg('<svg viewBox="0 0 24 24"><foreignObject><body onload="x()"/></foreignObject></svg>');
    expect(r.svg).not.toMatch(/foreignobject/i);
  });

  it("removes anything that reaches outside the file", () => {
    const r = sanitiseSvg('<svg viewBox="0 0 24 24"><image href="https://tracker.test/pixel.png"/></svg>');
    expect(r.svg).not.toContain("tracker.test");
    expect(r.removed).toContain("external references");
  });

  it("keeps harmless in-document references like #gradient", () => {
    const r = sanitiseSvg('<svg viewBox="0 0 24 24"><use href="#star"/><path fill="url(#g)"/></svg>');
    expect(r.svg).toContain('href="#star"');
  });

  it("strips javascript: urls", () => {
    const r = sanitiseSvg(`<svg viewBox="0 0 24 24"><a href="javascript:alert(1)"><path d="M0 0"/></a></svg>`);
    expect(r.svg.toLowerCase()).not.toContain("javascript:");
  });

  it("throws away anything outside the svg element", () => {
    const r = sanitiseSvg(`Here you go!\n<svg viewBox="0 0 24 24"><path d="M0 0"/></svg>\nHope that helps.`);
    expect(r.svg.startsWith("<svg")).toBe(true);
    expect(r.svg.endsWith("</svg>")).toBe(true);
    expect(r.svg).not.toContain("Hope that helps");
  });

  it("copes with markdown fences the model was told not to use", () => {
    const r = sanitiseSvg("```svg\n" + GOOD_ICON + "\n```");
    expect(r.ok).toBe(true);
    expect(r.svg.startsWith("<svg")).toBe(true);
  });

  it("refuses text with no svg at all", () => {
    const r = sanitiseSvg("I am afraid I cannot draw that.");
    expect(r.ok).toBe(false);
    expect(r.svg).toBe("");
  });

  it("leaves a clean icon alone", () => {
    const r = sanitiseSvg(GOOD_ICON);
    expect(r.ok).toBe(true);
    expect(r.removed).toEqual([]);
    expect(r.svg).toContain("currentColor");
  });
});

describe("checkSvg", () => {
  it("accepts a proper icon", () => {
    expect(checkSvg(GOOD_ICON).ok).toBe(true);
  });

  it("complains when there is no viewBox, so it would not scale", () => {
    const r = checkSvg('<svg><path d="M0 0"/></svg>');
    expect(r.ok).toBe(false);
    expect(r.problems.join()).toMatch(/viewBox/);
  });

  it("complains about an empty drawing", () => {
    const r = checkSvg('<svg viewBox="0 0 24 24"></svg>');
    expect(r.ok).toBe(false);
    expect(r.problems.join()).toMatch(/empty/);
  });
});

describe("checkLottie", () => {
  const good = JSON.stringify({
    v: "5.7.0",
    fr: 60,
    ip: 0,
    op: 60,
    w: 200,
    h: 200,
    layers: [{ ty: 4, nm: "shape" }],
  });

  it("accepts a well-formed animation", () => {
    const r = checkLottie(good);
    expect(r.ok).toBe(true);
    expect(r.data?.fr).toBe(60);
  });

  it("rejects text that is not JSON", () => {
    expect(checkLottie("here is your animation!").ok).toBe(false);
  });

  it("names the fields that are missing", () => {
    const r = checkLottie(JSON.stringify({ v: "5.7.0", layers: [] }));
    expect(r.problems.join()).toMatch(/fr/);
    expect(r.problems.join()).toMatch(/no layers/);
  });

  it("rejects an image layer, which would not be self-contained", () => {
    const r = checkLottie(JSON.stringify({ v: "5", fr: 60, ip: 0, op: 60, w: 1, h: 1, layers: [{ ty: 2 }] }));
    expect(r.problems.join()).toMatch(/image layer/);
  });

  it("copes with markdown fences", () => {
    expect(checkLottie("```json\n" + good + "\n```").ok).toBe(true);
  });
});

describe("which engine writes the code", () => {
  it("prefers the code model when one is set", () => {
    const r = codeEngineFor(settings());
    expect(r.engine.model).toBe("codestral-latest");
    expect(r.usingFallback).toBe(false);
  });

  it("falls back to the prose model, and says so", () => {
    const r = codeEngineFor(settings({ coder: { base: "x", key: "  ", model: "codestral-latest" } }));
    expect(r.engine.model).toBe("gpt-4o-mini");
    expect(r.usingFallback).toBe(true);
  });
});

describe("makeVector", () => {
  it("asks the code model and returns a clean icon", async () => {
    const fetchMock = vi.fn(async () => reply(GOOD_ICON));
    vi.stubGlobal("fetch", fetchMock);

    const a = await makeVector("svg-icon", "an anvil", settings());
    expect(a.problem).toBeUndefined();
    expect(a.code).toContain("<svg");
    expect(a.title).toBe("an anvil");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.mistral.ai/v1/chat/completions");
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe("codestral-latest");
    expect(body.messages[0].content).toMatch(/viewBox/);
  });

  it("cleans a dangerous answer rather than passing it on", async () => {
    vi.stubGlobal("fetch", async () =>
      reply('<svg viewBox="0 0 24 24"><script>fetch("//evil")</script><path d="M1 1"/></svg>')
    );
    const a = await makeVector("svg-icon", "a trap", settings());
    expect(a.code).not.toMatch(/script/i);
    expect(a.problem).toMatch(/removed for safety/);
  });

  it("says plainly when there is no key", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const a = await makeVector(
      "svg-icon",
      "x",
      settings({ coder: { base: "x", key: "", model: "m" }, scribe: { base: "y", key: "", model: "n" } })
    );
    expect(a.problem).toMatch(/no code-engine key/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("mentions that Codestral would do better when falling back", async () => {
    vi.stubGlobal("fetch", async () => reply(GOOD_ICON));
    const a = await makeVector("svg-icon", "an anvil", settings({ coder: { base: "x", key: "", model: "m" } }));
    expect(a.problem).toMatch(/Codestral/);
    expect(a.code).toContain("<svg");
  });

  it("reports a broken Lottie instead of returning it", async () => {
    vi.stubGlobal("fetch", async () => reply('{"nope": true}'));
    const a = await makeVector("lottie", "a spinner", settings());
    expect(a.code).toBe("");
    expect(a.problem).toMatch(/missing/);
  });

  it("pretty-prints a good Lottie", async () => {
    const good = { v: "5.7.0", fr: 60, ip: 0, op: 60, w: 100, h: 100, layers: [{ ty: 4 }] };
    vi.stubGlobal("fetch", async () => reply(JSON.stringify(good)));
    const a = await makeVector("lottie", "a spinner", settings());
    expect(a.problem).toBeUndefined();
    expect(a.code).toContain("\n  ");
    expect(JSON.parse(a.code).fr).toBe(60);
  });

  it("survives the code engine dying", async () => {
    vi.stubGlobal("fetch", async () => new Response("upstream down", { status: 500 }));
    const a = await makeVector("svg-icon", "x", settings());
    expect(a.code).toBe("");
    expect(a.problem).toBeTruthy();
  });
});

describe("naming and previewing", () => {
  it.each([
    ["icon_anvil", "svg-icon", "icon_anvil.svg"],
    ["icon_anvil.png", "svg-illustration", "icon_anvil.svg"],
    ["spinner", "lottie", "spinner.json"],
  ] as const)("names %s as %s", (base, kind, expected) => {
    expect(vectorFilename(base, kind)).toBe(expected);
  });

  it("makes a data url that does not need the DOM", () => {
    const url = svgToDataUrl(GOOD_ICON);
    expect(url.startsWith("data:image/svg+xml")).toBe(true);
    expect(decodeURIComponent(url.split(",")[1])).toBe(GOOD_ICON);
  });
});

describe("the namespace, which models leave out and browsers demand", () => {
  it("adds xmlns when the model forgot it", () => {
    // Verified against Codestral on 2026-09-02: valid markup, no xmlns, and it
    // renders as a broken-image icon in an <img> and in any saved .svg file.
    const r = sanitiseSvg('<svg viewBox="0 0 24 24"><path d="M12 2v4"/></svg>');
    expect(r.svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(r.ok).toBe(true);
  });

  it("does not add a second one when it is already there", () => {
    const r = sanitiseSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0"/></svg>');
    expect(r.svg.match(/xmlns=/g)).toHaveLength(1);
  });

  it("keeps the namespace through a full makeVector call", async () => {
    vi.stubGlobal("fetch", async () =>
      Response.json(
        { choices: [{ message: { content: '<svg viewBox="0 0 24 24"><path d="M1 1"/></svg>' } }] },
        { status: 200 }
      )
    );
    const a = await makeVector("svg-icon", "an anvil", settings());
    expect(a.code).toContain("xmlns");
  });
});
