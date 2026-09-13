/**
 * The desktop app behaves like a normal installed Windows program.
 *
 * None of these are visible from `npm run dev`, which never runs
 * electron/main.js and never builds an installer. Every one was found by
 * reading the packaged build, and each shipped in v1.0.0:
 *
 *   · main.js is ESM, and the Cloudflare/NVIDIA proxy called require(), which
 *     does not exist there — so the free engine crashed in the desktop app
 *     while working perfectly in the browser.
 *   · the uninstaller's "delete my data too?" removed %APPDATA%\Image Forge,
 *     a folder that has never existed. Answering Yes deleted nothing.
 *   · the docs promised the portable build "leaves nothing behind".
 *   · a port that would not open left no window and no message.
 *
 * These are source checks on purpose: they are cheap, they run in CI on every
 * push, and they fail before a release rather than after someone installs it.
 */
import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

const main = await readFile("electron/main.js", "utf8");
const buildScript = await readFile("scripts/build-exe.js", "utf8");
const installer = await readFile("build/installer.nsh", "utf8");
const pkg = JSON.parse(await readFile("package.json", "utf8")) as Record<string, unknown>;
const download = await readFile("docs/download.md", "utf8");
const readme = await readFile("README.md", "utf8");

/** Strip // and block comments, so a warning ABOUT require() is not a hit. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("the main process", () => {
  it("never calls require(), because it is an ES module", () => {
    expect(pkg.type).toBe("module");
    expect(code(main)).not.toMatch(/\brequire\s*\(/);
  });

  it("imports https for the proxy instead", () => {
    expect(main).toMatch(/^import https from "node:https";$/m);
  });

  it("says so when it cannot start, rather than showing nothing", () => {
    // The CALL, not the definition — `function startServer(distDir)` comes first.
    const start = code(main).indexOf("await startServer(distDir)");
    expect(start).toBeGreaterThan(-1);
    expect(code(main).slice(start, start + 400)).toMatch(/showErrorBox/);
  });

  it("stays a single instance, like a normal app", () => {
    expect(main).toMatch(/requestSingleInstanceLock\(\)/);
  });

  it("remembers the window size and position", () => {
    expect(main).toMatch(/window-state\.json/);
  });
});

describe("where the user's data lives", () => {
  // Electron names the data folder after package.json "productName" if there
  // is one, otherwise after "name". There is no productName, so the folder is
  // %APPDATA%\image-forge. Adding a productName now would silently move every
  // existing user's settings and keys to a new, empty folder.
  const dataDir = String(pkg.name);

  it("has no productName that would move existing data", () => {
    expect(pkg.productName).toBeUndefined();
    expect(dataDir).toBe("image-forge");
  });

  it("asks Electron for the folder instead of typing a name in", () => {
    expect(main).toMatch(/app\.getPath\("userData"\)/);
    expect(code(main)).not.toMatch(/"Image Forge"\)/);
  });

  it("deletes the real folder when the uninstaller is told to", () => {
    // NSIS comments start with ";". The file's own comment names the old wrong
    // folder to explain the bug, so only the instructions are checked.
    const instructions = installer
      .split("\n")
      .filter((l) => !l.trimStart().startsWith(";"))
      .join("\n");
    expect(instructions).toContain(`RMDir /r "$APPDATA\\${dataDir}"`);
    expect(instructions).not.toContain(`$APPDATA\\Image Forge`);
  });

  it("never deletes data during a silent uninstall", () => {
    // /SD IDNO is the answer a silent (/S) uninstall takes. Without it an
    // automated uninstall could wipe keys nobody was asked about.
    expect(installer).toMatch(/MessageBox[^\n]*\/SD IDNO/);
  });

  it("tells users the same folder the app actually uses", () => {
    for (const doc of [download, readme]) {
      expect(doc).not.toContain("%APPDATA%\\Image Forge");
    }
    // The build script prints the path too, escaped once for the JS string.
    expect(buildScript).not.toContain("%APPDATA%\\\\Image Forge");
    expect(download).toContain(`%APPDATA%\\${dataDir}`);
  });

  it("does not promise the portable build leaves nothing behind", () => {
    expect(download).not.toMatch(/leaves nothing behind/i);
  });
});

describe("the installer", () => {
  it("uses one app id everywhere, so an update installs over the old version", () => {
    const builderId = buildScript.match(/appId:\s*"([^"]+)"/)?.[1];
    const runtimeId = main.match(/APP_USER_MODEL_ID\s*=\s*"([^"]+)"/)?.[1];
    expect(builderId).toBeTruthy();
    expect(runtimeId).toBe(builderId);
    expect(main).toMatch(/app\.setAppUserModelId\(APP_USER_MODEL_ID\)/);
  });

  it("creates the shortcuts and uninstaller people expect", () => {
    expect(buildScript).toMatch(/createDesktopShortcut:\s*true/);
    expect(buildScript).toMatch(/createStartMenuShortcut:\s*true/);
    expect(buildScript).toMatch(/uninstallDisplayName:\s*"Image Forge"/);
  });

  it("names the real publisher, not an old project", () => {
    expect(buildScript).not.toMatch(/Emberfair/);
    // An object: electron-builder reads author.name for the Publisher in
    // Settings > Apps. A plain string left it blank on a real install.
    expect(buildScript).toMatch(/author:\s*\{\s*name:\s*"Stravelakis"\s*\}/);
  });

  it("never publishes by itself", () => {
    expect(buildScript).toMatch(/publish:\s*"never"/);
  });
});
