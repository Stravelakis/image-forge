/**
 * Bytes that make a file parse differently on someone else's machine.
 *
 * This exists because of a real failure. The v1.0.0 release build died on a
 * fresh Windows checkout with "SyntaxError: Invalid or unexpected token",
 * while the same commit passed on the author's own Windows machine and in
 * Linux CI.
 *
 * The cause was the shebang. `scripts/mcp-server.js` starts with
 * `#!/usr/bin/env node`, and Git checks source out as CRLF on Windows unless
 * told otherwise. Vitest strips the shebang up to the newline and leaves the
 * carriage return behind, which lands in front of the first statement as a
 * stray token. Node itself parses the same file happily, and so does esbuild,
 * which is why it survived every check until a release actually ran.
 *
 * The fix is .gitattributes pinning line endings to LF. These tests guard the
 * things that make it come back:
 *
 *   · a file starting with a shebang must not have CRLF endings
 *   · invisible characters must be written as escapes, so they cannot be
 *     silently lost, transformed, or mistaken for whitespace
 */
import { describe, expect, it } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const ROOTS = ["src", "scripts", "tests", "electron"];

/** Every file we actually parse. */
async function sourceFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries: Awaited<ReturnType<typeof readdir>>;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await sourceFiles(p)));
    else if (/\.(ts|tsx|js|mjs|cjs)$/.test(e.name)) out.push(p);
  }
  return out;
}

const allFiles = (await Promise.all(ROOTS.map(sourceFiles))).flat();

describe("source files parse the same everywhere", () => {
  it("finds files to check, so a broken glob cannot make this pass silently", () => {
    expect(allFiles.length).toBeGreaterThan(20);
  });

  it("contains no invisible byte-order marks", async () => {
    const offenders: string[] = [];
    for (const f of allFiles) {
      const text = await readFile(f, "utf8");
      // Written as a code point so this test does not contain the very
      // character it forbids.
      if (text.includes(String.fromCharCode(0xfeff))) offenders.push(f);
    }
    expect(offenders, `use the escape \\uFEFF instead of the literal character in: ${offenders.join(", ")}`).toEqual([]);
  });

  it("contains no raw control characters", async () => {
    // A real one got in: ChatView.tsx held a literal backspace byte where the
    // regex escape \b was meant, because a shell heredoc interpreted the
    // escape before the file was written. It compiled, it ran, and the regex
    // silently tested for something that can never appear in a model name.
    // Anything below space other than tab and newline is a mistake here.
    const control = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/;
    const offenders: string[] = [];
    for (const f of allFiles) {
      if (control.test(await readFile(f, "utf8"))) offenders.push(f);
    }
    expect(offenders, `write these as escapes rather than raw bytes: ${offenders.join(", ")}`).toEqual([]);
  });

  it("contains no other invisible or direction-changing characters", async () => {
    // Zero-width spaces and bidirectional overrides are worse than a BOM: they
    // can make code read differently to a human than it does to the compiler.
    const nasty = /[\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/;
    const offenders: string[] = [];
    for (const f of allFiles) {
      if (nasty.test(await readFile(f, "utf8"))) offenders.push(f);
    }
    expect(offenders, `invisible or bidirectional characters in: ${offenders.join(", ")}`).toEqual([]);
  });

  it("keeps the BOM strip working, however it is written", async () => {
    // The point of the original character: a CSV saved by Excel starts with a
    // BOM, and without stripping it the first column name is unmatchable.
    const { parseCsv } = await import("../src/lib/csv");
    const withBom = String.fromCharCode(0xfeff) + "filename,prompt\na.png,x\n";
    const { headers } = parseCsv(withBom);
    expect(headers[0]).toBe("filename");
  });
});

describe("a shebang and CRLF must never meet again", () => {
  it("keeps every shebang file on LF endings", async () => {
    // The exact combination that broke the v1.0.0 release build.
    const offenders: string[] = [];
    for (const f of allFiles) {
      const text = await readFile(f, "utf8");
      if (text.startsWith("#!") && text.includes("\r\n")) offenders.push(f);
    }
    expect(
      offenders,
      `these start with a shebang AND use CRLF, which breaks the loader: ${offenders.join(", ")}`
    ).toEqual([]);
  });

  it("checks .gitattributes actually pins line endings", async () => {
    // Without this file the endings depend on who cloned the repo, which is
    // how the same commit passed locally and failed on a fresh checkout.
    const attrs = await readFile(".gitattributes", "utf8");
    expect(attrs).toMatch(/text=auto\s+eol=lf/);
  });
});

describe("the desktop app must keep the same origin every launch", () => {
  it("never asks for a random port", async () => {
    // listen(0) means "any free port". The browser keys localStorage by
    // ORIGIN, and the port is part of it, so a new port each launch meant a
    // new empty storage each launch — settings, engine keys and the manifest
    // all appearing to reset themselves on restart. Nothing was failing to
    // save; each launch looked in a different box.
    const main = await readFile("electron/main.js", "utf8");
    expect(main).not.toMatch(/\.listen\(\s*0\s*,/);
  });

  it("uses a fixed list of ports", async () => {
    const main = await readFile("electron/main.js", "utf8");
    // A fixed default list; a test copy may name its own (IMAGEFORGE_PORTS).
    expect(main).toMatch(/IMAGEFORGE_PORTS \|\| "\d{4,5}(,\d{4,5})+"/);
  });

  it("still falls back when a port is busy, rather than refusing to start", async () => {
    const main = await readFile("electron/main.js", "utf8");
    expect(main).toMatch(/EADDRINUSE/);
  });
});
