// "No click is naked" (Ak, 13 Oct 2026) and "plain words + ELI5 on everything"
// (plan item 17): every button, field, label, status, badge and number in the
// app has an ELI5 hover help — the bubble in components/TipLayer.tsx — and the
// help is short and in plain words. See scripts/hoverHelp.mjs.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { nakedControls, scanSource, sentenceCount, visibleStrings } from "../scripts/hoverHelp.mjs";
import { messageOf, needsSettings, plainError, settingsSectionFor } from "../src/lib/plainError";

type Hit = { file: string; line: number; tag: string; text: string };
const show = (found: Hit[]) => found.map((c) => `${c.file}:${c.line} <${c.tag}> ${c.text}`);

const CUSTOM = ["Btn", "CopyBtn", "TestButton"];
// Components whose own definition carries a help for everything inside them.
const TIP_TAGS = ["Explain"];

// THE ALLOW-LIST. Nothing else is skipped. Add to it only for a file whose text
// is pure decoration, never for a screen a person reads or clicks.
//  - motion.tsx: the number counter, the staggered list and the word-by-word
//    text reveal. They only animate text their caller already explains (every
//    caller sits inside, or carries, a help bubble).
const DECORATIVE_FILES = ["motion.tsx"];

describe("hover help everywhere", () => {
  it("the scanner sees a bare button and a helped one", () => {
    const found = scanSource(`<div><button onClick={go}>Go</button><button title="Starts it." onClick={go}>Go</button><div data-tip="All of it."><input /></div></div>`);
    expect(found.map((c: { covered: boolean }) => c.covered)).toEqual([false, true, true]);
  });

  it("the text check sees a bare label, a helped one, and lets a full sentence explain itself", () => {
    const src = `<div><span>Volume</span><span data-tip="How loud it is.">Volume</span><p>This sentence has plenty of words so it explains itself.</p><span>{count}</span><label className="sr-only">Hidden</label></div>`;
    const found = scanSource(src, { texts: true }).filter((c: { kind?: string }) => c.kind === "text");
    expect(found.map((c: { text: string; covered: boolean }) => [c.text, c.covered])).toEqual([
      ["Volume", false],
      ["Volume", true],
      ["{count}", false],
    ]);
  });

  it("a component that carries its own help covers what is written inside it", () => {
    const found = scanSource(`<Explain><span>Plain English:</span></Explain>`, { texts: true, tipTags: TIP_TAGS });
    expect(found.map((c: { covered: boolean }) => c.covered)).toEqual([true]);
  });

  it("every control in Image Forge has hover help", () => {
    expect(show(nakedControls("src", { custom: CUSTOM, tipTags: TIP_TAGS }))).toEqual([]);
  });

  it("every label, heading, status, badge and number in Image Forge has hover help", () => {
    expect(show(nakedControls("src", { custom: CUSTOM, tipTags: TIP_TAGS, texts: true, skipFiles: DECORATIVE_FILES }))).toEqual([]);
  });

  it("every hover help is at most two short sentences", () => {
    const long = visibleStrings("src")
      .filter((s: { kind: string }) => s.kind === "tip")
      // The keyboard cheat-sheet is a list of keys, not a sentence.
      .filter((s: { text: string }) => !/^Arrow left\/right:/.test(s.text))
      .filter((s: { text: string }) => sentenceCount(s.text) > 2 || s.text.length > 230)
      .map((s: { file: string; text: string }) => `${s.file}: ${s.text}`);
    expect(long).toEqual([]);
  });

  it("screen words use plain words, not forge slang", () => {
    // 'manifest' is the old word for 'your list'; docs/manifest.md is a file name.
    const BAD = /\b(payload|endpoints?|inference|IPC|latent|pipeline|CORS|regex|daemon|backend|frontend|base64|LoRA|tokeni[sz]er|webhook|OAuth|visemes?|429)\b|manifest(?!\.md)/;
    const slang = visibleStrings("src")
      .filter((s: { kind: string; text: string }) => s.kind === "tip" || !/[,:]/.test(s.text))
      .filter((s: { text: string }) => BAD.test(s.text))
      .map((s: { file: string; text: string }) => `${s.file}: ${s.text.slice(0, 90)}`);
    expect(slang).toEqual([]);
  });

  it("the allow-list only names files that exist and are decorative", () => {
    for (const f of DECORATIVE_FILES) expect(fs.existsSync(`src/components/${f}`)).toBe(true);
    expect(DECORATIVE_FILES).toEqual(["motion.tsx"]);
  });
});

describe("the hover bubble", () => {
  const src = fs.readFileSync("src/components/TipLayer.tsx", "utf8");
  it("shows on keyboard focus as well as the mouse, and Escape closes it", () => {
    expect(src).toMatch(/addEventListener\("focusin"/);
    expect(src).toMatch(/addEventListener\("focusout"/);
    expect(src).toMatch(/e\.key === "Escape"/);
  });
  it("is announced to screen readers while it shows", () => {
    expect(src).toMatch(/aria-describedby/);
    expect(src).toMatch(/role="tooltip"/);
  });
  it("is drawn in the page body and kept inside the window", () => {
    expect(src).toMatch(/createPortal\([\s\S]*document\.body/);
    expect(src).toMatch(/window\.innerWidth - WIDTH - 8/);
    expect(src).toMatch(/window\.innerHeight/);
  });
  it("waits a moment before showing", () => {
    expect(src).toMatch(/SHOW_AFTER_MS = \d+/);
  });
});

describe("errors say what to do next", () => {
  it("strips Electron's wrapper words", () => {
    expect(messageOf(new Error("Error invoking remote method 'x:y': Error: The key was refused."))).toBe("The key was refused.");
  });
  it("adds a next step when the message has none", () => {
    expect(plainError("ZIP packing failed", "Try again.")).toBe("ZIP packing failed. Try again.");
  });
  it("leaves a message alone when it already says what to do", () => {
    expect(plainError("Could not copy. Use Export CSV instead.", "Try again.")).toBe("Could not copy. Use Export CSV instead.");
  });
  it("offers Settings for a missing key or a message that points at Settings", () => {
    expect(needsSettings("Add a Google key in Settings → Engines before sending a batch.")).toBe(true);
    expect(needsSettings("The key was refused.")).toBe(true);
    expect(needsSettings("The picture is too big.")).toBe(false);
    expect(needsSettings("No key saved for this painter.")).toBe(true);
    expect(needsSettings("ZIP packing failed.")).toBe(false);
  });
  it("opens the Settings page the message names", () => {
    expect(settingsSectionFor("Add a key in Settings → Text engines.")).toBe("text");
    expect(settingsSectionFor("Link a folder first — Settings → Folders.")).toBe("folders");
    expect(settingsSectionFor("Add a Google key in Settings → Engines.")).toBe("engines");
  });
  it("every toast error is run through plainError, and the error line offers Settings", () => {
    const app = fs.readFileSync("src/App.tsx", "utf8");
    expect(app).toMatch(/kind === "err" \? plainError\(/);
    expect(app).toMatch(/forge:open-settings/);
    const line = fs.readFileSync("src/components/ErrorLine.tsx", "utf8");
    expect(line).toMatch(/Open Settings/);
  });
});
