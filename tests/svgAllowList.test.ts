/**
 * @vitest-environment jsdom
 *
 * The SVG cleaner is an allow-list: it writes out only shapes and painting
 * attributes it knows, whatever the input looked like. These are the attacks
 * the old block-list let through, plus the ones an allow-list should shrug off.
 * (Audit 25 Oct 2026, finding H4.)
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { sanitiseSvg } from "../src/lib/vectorAssets";

afterEach(() => vi.unstubAllGlobals());

/** Run the output through a real HTML parser, as the page would, and look for anything live. */
function liveContent(svg: string): { tags: string[]; handlers: string[] } {
  const host = document.createElement("div");
  host.innerHTML = svg;
  const tags: string[] = [];
  const handlers: string[] = [];
  host.querySelectorAll("*").forEach((el) => {
    tags.push(el.localName.toLowerCase());
    for (const a of Array.from(el.attributes)) if (a.name.toLowerCase().startsWith("on")) handlers.push(a.name);
  });
  return { tags, handlers };
}

describe("the attacks the old cleaner missed", () => {
  it("<svg><img/src=x/onerror=alert(1)></svg> leaves nothing that can run", () => {
    const r = sanitiseSvg("<svg><img/src=x/onerror=alert(1)></svg>");
    expect(r.ok).toBe(true);
    expect(r.svg).not.toMatch(/img/i);
    expect(r.svg).not.toMatch(/onerror/i);
    expect(r.svg).not.toContain("alert");
    expect(r.removed).toContain("<img>");
    const live = liveContent(r.svg);
    expect(live.tags).not.toContain("img");
    expect(live.handlers).toEqual([]);
  });

  it("<style>@import url(http://x)</style> is gone", () => {
    const r = sanitiseSvg("<svg viewBox='0 0 8 8'><style>@import url(http://x)</style><path d='M0 0'/></svg>");
    expect(r.svg).not.toMatch(/style/i);
    expect(r.svg).not.toContain("@import");
    expect(r.svg).not.toContain("http://x");
    expect(r.removed).toContain("<style>");
    expect(liveContent(r.svg).tags).toEqual(["svg", "path"]);
  });

  it("a slash instead of a space before the handler does not slip past", () => {
    const r = sanitiseSvg('<svg viewBox="0 0 8 8"><circle/onload=alert(1) r="2"/></svg>');
    expect(r.svg).not.toMatch(/onload/i);
    expect(liveContent(r.svg).handlers).toEqual([]);
  });

  it("an onload on the svg itself is dropped", () => {
    const r = sanitiseSvg('<svg viewBox="0 0 8 8" onload="alert(1)"><path d="M0 0"/></svg>');
    expect(r.svg).not.toMatch(/onload/i);
    expect(r.removed).toContain("event handlers");
  });

  it("capital letters in the tag or handler do not help", () => {
    const r = sanitiseSvg('<svg viewBox="0 0 8 8"><SCRIPT>alert(1)</SCRIPT><circle ONCLICK="x()" r="2"/></svg>');
    expect(r.svg).not.toMatch(/script|onclick|alert/i);
  });

  it("<svg><a xlink:href=javascript:…> keeps the shape and drops the link", () => {
    const r = sanitiseSvg('<svg viewBox="0 0 8 8" xmlns:xlink="http://www.w3.org/1999/xlink"><a xlink:href="javascript:alert(1)"><path d="M0 0 L8 8"/></a></svg>');
    expect(r.svg).not.toMatch(/javascript/i);
    expect(r.svg).not.toMatch(/<a[\s>]/);
    expect(r.svg).toContain("<path");
    expect(r.removed).toContain("links");
  });

  it("javascript: hidden with a line break inside it is still caught", () => {
    const r = sanitiseSvg('<svg viewBox="0 0 8 8"><use href="java\nscript:alert(1)"/></svg>');
    expect(r.svg.toLowerCase()).not.toContain("script");
  });
});

describe("what is dropped", () => {
  it.each([
    ["foreignObject", '<foreignObject><div onclick="x()">hi</div></foreignObject>'],
    ["image", '<image href="https://tracker.test/p.png"/>'],
    ["script", "<script>alert(1)</script>"],
    ["iframe", '<iframe src="https://evil.test"></iframe>'],
    ["animate", '<animate attributeName="href" values="javascript:alert(1)"/>'],
    ["set", '<set attributeName="onmouseover" to="alert(1)"/>'],
    ["feImage", '<filter id="f"><feImage href="https://tracker.test/p.png"/></filter>'],
    ["metadata", "<metadata>stuff</metadata>"],
  ])("%s", (tag, markup) => {
    const r = sanitiseSvg(`<svg viewBox="0 0 8 8">${markup}<path d="M0 0"/></svg>`);
    expect(r.svg.toLowerCase()).not.toContain(tag.toLowerCase());
    expect(r.svg).not.toContain("tracker.test");
    expect(r.svg).not.toContain("alert");
    expect(r.svg).toContain("<path");
  });

  it("a use pointing outside the file is dropped, one pointing inside stays", () => {
    const bad = sanitiseSvg('<svg viewBox="0 0 8 8"><use href="https://evil.test/x.svg#a"/></svg>');
    expect(bad.svg).not.toContain("evil.test");
    expect(bad.svg).not.toContain("<use");
    expect(bad.removed).toContain("external references");
    const good = sanitiseSvg('<svg viewBox="0 0 8 8"><defs><path id="s" d="M0 0"/></defs><use href="#s"/></svg>');
    expect(good.svg).toContain('<use href="#s"/>');
  });

  it("an href on a shape is not kept", () => {
    const r = sanitiseSvg('<svg viewBox="0 0 8 8"><path href="https://evil.test" d="M0 0"/></svg>');
    expect(r.svg).not.toContain("evil.test");
  });

  it("a paint that fetches from outside is dropped; one that points inside is kept", () => {
    const bad = sanitiseSvg('<svg viewBox="0 0 8 8"><rect width="4" height="4" fill="url(https://evil.test/x.svg#g)"/></svg>');
    expect(bad.svg).not.toContain("evil.test");
    const good = sanitiseSvg('<svg viewBox="0 0 8 8"><defs><linearGradient id="g"><stop offset="0" stop-color="red"/></linearGradient></defs><rect width="4" height="4" fill="url(#g)"/></svg>');
    expect(good.svg).toContain('fill="url(#g)"');
    expect(good.svg).toContain("<linearGradient");
    expect(good.removed).toEqual([]);
  });

  it("a data: url in any value is dropped", () => {
    const r = sanitiseSvg('<svg viewBox="0 0 8 8"><rect width="4" height="4" fill="url(data:image/svg+xml;base64,AAAA)"/></svg>');
    expect(r.svg).not.toContain("data:");
  });

  it("style attributes keep plain painting and lose everything else", () => {
    const r = sanitiseSvg(`<svg viewBox="0 0 8 8"><rect width="4" height="4" style="fill:red;background:url(http://evil.test/a.png);stroke:blue;behavior:url(x.htc)"/></svg>`);
    expect(r.svg).toContain('style="fill:red;stroke:blue"');
    expect(r.svg).not.toContain("evil.test");
    expect(r.svg).not.toContain("behavior");
  });

  it("animateTransform stays when it moves the picture and goes when it aims elsewhere", () => {
    const ok = sanitiseSvg('<svg viewBox="0 0 8 8"><g><animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="2s" repeatCount="indefinite"/><path d="M0 0"/></g></svg>');
    expect(ok.svg).toContain("<animateTransform");
    const bad = sanitiseSvg('<svg viewBox="0 0 8 8"><path d="M0 0"><animateTransform attributeName="href" to="javascript:alert(1)"/></path></svg>');
    expect(bad.svg).not.toMatch(/animateTransform|javascript/);
  });

  it("class and unknown attributes are dropped, so nothing can borrow the app's styles", () => {
    const r = sanitiseSvg('<svg viewBox="0 0 8 8" class="fixed inset-0 z-50" data-x="1" tabindex="0"><path d="M0 0"/></svg>');
    expect(r.svg).not.toMatch(/class|data-x|tabindex|fixed/);
  });

  it("text is kept inside text, escaped, and dropped everywhere else", () => {
    const r = sanitiseSvg('<svg viewBox="0 0 8 8"><text x="1" y="1">a &lt;b&gt; &amp; c</text><g>stray words</g></svg>');
    expect(r.svg).toContain("a &lt;b&gt; &amp; c");
    expect(r.svg).not.toContain("stray words");
    expect(liveContent(r.svg).tags).toEqual(["svg", "text", "g"]);
  });
});

describe("what is kept", () => {
  it("a normal icon comes out as it went in, with the namespace added", () => {
    const r = sanitiseSvg('<svg viewBox="0 0 24 24" fill="none"><path d="M4 4 L20 20" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3"/></svg>');
    expect(r.ok).toBe(true);
    expect(r.removed).toEqual([]);
    expect(r.svg).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><path d="M4 4 L20 20" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3"/></svg>');
  });

  it("camel-case names survive (viewBox, linearGradient, clipPath)", () => {
    const r = sanitiseSvg('<svg viewBox="0 0 8 8"><defs><clipPath id="c"><rect width="4" height="4"/></clipPath><radialGradient id="r" gradientUnits="userSpaceOnUse"><stop offset="1"/></radialGradient></defs><g clip-path="url(#c)"/></svg>');
    expect(r.svg).toContain("viewBox=");
    expect(r.svg).toContain("<clipPath");
    expect(r.svg).toContain("<radialGradient");
    expect(r.svg).toContain("gradientUnits=");
  });

  it("broken markup a model might write still gives a usable picture", () => {
    const r = sanitiseSvg('<svg viewBox="0 0 8 8"><title>Fish & chips</title><path d="M0 0 L8 8"></svg>');
    expect(r.ok).toBe(true);
    expect(r.svg).toContain("<path");
  });

  it("an attribute value with quotes and angle brackets cannot break out", () => {
    const r = sanitiseSvg(`<svg viewBox="0 0 8 8"><text x="1" y="1" fill='red" onmouseover="alert(1)'>t</text></svg>`);
    const live = liveContent(r.svg);
    expect(live.handlers).toEqual([]);
  });
});

describe("failing safe", () => {
  it("with no DOM parser available it keeps nothing", () => {
    vi.stubGlobal("DOMParser", undefined);
    const r = sanitiseSvg('<svg viewBox="0 0 8 8"><path d="M0 0"/></svg>');
    expect(r.ok).toBe(false);
    expect(r.svg).toBe("");
  });

  it("text with no svg in it is refused", () => {
    expect(sanitiseSvg("sorry, I cannot").ok).toBe(false);
  });
});
