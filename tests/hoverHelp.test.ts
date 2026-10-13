// "No click is naked" (Ak, 13 Oct 2026): every button, field, link and
// clickable thing has hover help — the bubble in components/TipLayer.tsx.
import { describe, it, expect } from "vitest";
import { nakedControls, scanSource } from "../scripts/hoverHelp.mjs";

describe("hover help everywhere", () => {
  it("the scanner sees a bare button and a helped one", () => {
    const found = scanSource(`<div><button onClick={go}>Go</button><button title="Starts it." onClick={go}>Go</button></div>`);
    expect(found.map((c: { covered: boolean }) => c.covered)).toEqual([false, true]);
  });
  it("every control in Image Forge has hover help", () => {
    const naked = nakedControls("src", { custom: ["Btn", "CopyBtn", "TestButton"] });
    expect(naked.map((c: { file: string; line: number; tag: string; text: string }) => `${c.file}:${c.line} <${c.tag}> ${c.text}`)).toEqual([]);
  });
});
