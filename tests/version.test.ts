/**
 * One version number, everywhere it is shown.
 *
 * It lives in three places that nothing ties together: package.json (which
 * names the installer and the exe), src/lib/version.ts (which Settings shows
 * and the update check compares against), and the MCP server's handshake.
 *
 * They drifted. v1.0.1 was built and installed with package.json saying 1.0.1
 * while the app itself still reported 1.0.0 — so the update check would have
 * told someone on the new version that they were behind. Nothing failed; the
 * number was just wrong. That is the kind of thing only a test catches.
 */
import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { APP_VERSION } from "../src/lib/version";

const pkg = JSON.parse(await readFile("package.json", "utf8")) as { version: string };
const mcp = await readFile("scripts/mcp-server.js", "utf8");

describe("the version number", () => {
  it("is a plain x.y.z", () => {
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("is the same in the app as in the installer", () => {
    expect(APP_VERSION).toBe(pkg.version);
  });

  it("is the same in the agent API", () => {
    const announced = mcp.match(/name:\s*"image-forge",\s*version:\s*"([^"]+)"/)?.[1];
    expect(announced).toBe(pkg.version);
  });

  it("is the same in the experimental Tauri build", async () => {
    // Tauri is kept but not built in CI. Its config still said 1.0.0 with a
    // dev address on a port nothing uses, because nothing checked it.
    const conf = JSON.parse(await readFile("src-tauri/tauri.conf.json", "utf8")) as { version: string; build: { devUrl: string } };
    const cargo = await readFile("src-tauri/Cargo.toml", "utf8");
    expect(conf.version).toBe(pkg.version);
    expect(cargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1]).toBe(pkg.version);
    // `npm run dev` serves on 3000 (strictPort in vite.config.js).
    expect(conf.build.devUrl).toBe("http://localhost:3000");
  });
});
