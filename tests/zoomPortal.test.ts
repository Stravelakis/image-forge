/**
 * The full-picture popup in the puppet review must be drawn on <body>, not
 * inside the blurred, scrolling review box (audit finding H6). Checked from
 * the source: there is no component-test library in this project.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/components/PuppetMaker.tsx", import.meta.url), "utf8");

describe("the puppet review's full-picture popup", () => {
  it("is rendered through createPortal onto document.body", () => {
    expect(src).toMatch(/import \{ createPortal \} from "react-dom"/);
    const at = src.indexOf('className="forge-zoom"');
    expect(at).toBeGreaterThan(0);
    // the portal call opens just before the popup and closes on document.body right after it
    expect(src.slice(Math.max(0, at - 120), at)).toMatch(/createPortal\(\s*<div $/);
    const after = src.slice(at, at + 900);
    expect(after).toMatch(/<\/div>,\s*document\.body\s*\)/);
  });
});
