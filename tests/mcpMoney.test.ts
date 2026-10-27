/**
 * The agent server has no human to click "yes", so it must refuse to spend by
 * itself, run one job at a time, and never overwrite rows it did not touch.
 * (Audit 25 Oct 2026, finding H3.) No picture is ever generated here: every
 * path that would reach an engine is refused or blocked first.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const HEADER = "id,filename,prompt,negative_prompt,category,style,aspect_ratio,seed,model,status,error,generated_at\n";
const line = (id: number, name: string, model = "", status = "pending") =>
  `${id},${name},a thing,,image,,1:1,${id},${model},${status},,\n`;

let dir = "";
const savedArgv = [...process.argv];
const savedEnv = { ...process.env };

/** Load a fresh copy of the server, as if started with these settings. */
async function boot(env: Record<string, string> = {}) {
  vi.resetModules();
  for (const k of ["FORGE_ALLOW_PAID", "FORGE_MAX_USD", "FORGE_PROVIDER", "GEMINI_API_KEY", "GEMINI_API_KEYS", "OPENAI_API_KEY", "OPENAI_API_KEYS"]) delete process.env[k];
  Object.assign(process.env, env);
  process.argv = [...savedArgv.slice(0, 2), "--csv", path.join(dir, "m.csv"), "--out", path.join(dir, "out")];
  return import("../scripts/mcp-server.js");
}

type Handler = (req: unknown, extra: unknown) => Promise<{ content: { text: string }[]; isError?: boolean }>;
const call = async (mod: Awaited<ReturnType<typeof boot>>, name: string, args: Record<string, unknown> = {}) => {
  const h = (mod.server as unknown as { _requestHandlers: Map<string, Handler> })._requestHandlers.get("tools/call")!;
  return h({ method: "tools/call", params: { name, arguments: args } }, {});
};

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "forge-mcp-"));
});
afterEach(() => {
  process.argv = savedArgv;
  for (const k of Object.keys(process.env)) if (!(k in savedEnv)) delete process.env[k];
  Object.assign(process.env, savedEnv);
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("paid engines are off by default", () => {
  it("refuses a row on a paid Google model", async () => {
    const mod = await boot();
    expect(() => mod.chargeOrRefuse({ filename: "a.png", model: "nano-banana-2" })).toThrow(/FORGE_ALLOW_PAID/);
    expect(mod.spentSoFar()).toBe(0);
  });

  it("refuses an unknown model name that the default engine would send to a paid service", async () => {
    const mod = await boot({ FORGE_PROVIDER: "openai" });
    expect(() => mod.chargeOrRefuse({ filename: "a.png", model: "" })).toThrow(/FORGE_ALLOW_PAID/);
  });

  it("lets free engines through", async () => {
    const mod = await boot();
    expect(() => mod.chargeOrRefuse({ filename: "a.png", model: "ovh-sdxl" })).not.toThrow();
    expect(() => mod.chargeOrRefuse({ filename: "a.png", model: "" })).not.toThrow(); // OVHcloud, no key
    expect(() => mod.chargeOrRefuse({ filename: "a.png", model: "cloudflare-flux" })).not.toThrow();
  });

  it("skips a paid row in a run, leaves it pending, and reports why", async () => {
    fs.writeFileSync(path.join(dir, "m.csv"), HEADER + line(1, "paid_one.png", "nano-banana-2"));
    const mod = await boot();
    const r = await call(mod, "forge_generate_pending");
    expect(r.content[0].text).toMatch(/refused.*FORGE_ALLOW_PAID/s);
    expect(fs.readFileSync(path.join(dir, "m.csv"), "utf8")).toMatch(/paid_one\.png,.*,nano-banana-2,pending,/);
    expect(fs.existsSync(path.join(dir, "out"))).toBe(false); // nothing was made
  });

  it("refuses forge_generate_one on a paid row", async () => {
    fs.writeFileSync(path.join(dir, "m.csv"), HEADER + line(1, "paid_one.png", "nano-banana-2"));
    const mod = await boot();
    const r = await call(mod, "forge_generate_one", { filename: "paid_one.png" });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/FORGE_ALLOW_PAID/);
    expect(fs.readFileSync(path.join(dir, "m.csv"), "utf8")).toMatch(/,pending,/);
  });

  it("says in forge_status that paid engines are refused", async () => {
    const mod = await boot();
    const r = await call(mod, "forge_status");
    expect(r.content[0].text).toMatch(/paid engines: refused/);
  });
});

describe("FORGE_MAX_USD", () => {
  it("counts each picture and stops at the limit", async () => {
    const mod = await boot({ FORGE_ALLOW_PAID: "1", FORGE_MAX_USD: "0.1" });
    const row = { filename: "a.png", model: "nano-banana-2-lite" }; // $0.0336
    mod.chargeOrRefuse(row);
    mod.chargeOrRefuse(row);
    expect(mod.spentSoFar()).toBeCloseTo(0.0672, 6);
    try {
      mod.chargeOrRefuse(row);
      throw new Error("should have refused");
    } catch (e) {
      expect((e as { name: string }).name).toBe("PaidRefusal");
      expect((e as { stopRun: boolean }).stopRun).toBe(true);
      expect((e as Error).message).toMatch(/FORGE_MAX_USD/);
    }
    expect(mod.spentSoFar()).toBeCloseTo(0.0672, 6);
  });

  it("defaults to one dollar once paid is allowed", async () => {
    const mod = await boot({ FORGE_ALLOW_PAID: "1" });
    for (let i = 0; i < 14; i++) mod.chargeOrRefuse({ filename: "a.png", model: "nano-banana-2" }); // 14 x 0.067 = 0.938
    expect(() => mod.chargeOrRefuse({ filename: "a.png", model: "nano-banana-2" })).toThrow(/FORGE_MAX_USD/);
  });

  it("refuses a model with no known price even when paid is allowed", async () => {
    const mod = await boot({ FORGE_ALLOW_PAID: "1", FORGE_MAX_USD: "50", FORGE_PROVIDER: "openai" });
    expect(() => mod.chargeOrRefuse({ filename: "a.png", model: "mystery-model" })).toThrow(/price .* unknown/);
  });

  it("refuses a Pro model even when paid is allowed", async () => {
    const mod = await boot({ FORGE_ALLOW_PAID: "1", FORGE_MAX_USD: "50" });
    expect(() => mod.chargeOrRefuse({ filename: "a.png", model: "gemini-3-pro-image" })).toThrow(/Pro image models/);
  });

  it("does not let a free row use up the allowance", async () => {
    const mod = await boot({ FORGE_ALLOW_PAID: "1", FORGE_MAX_USD: "0.05" });
    mod.chargeOrRefuse({ filename: "a.png", model: "ovh-sdxl" });
    expect(mod.spentSoFar()).toBe(0);
  });
});

describe("one run at a time", () => {
  it("a second run is refused while the first holds the lock, and works again after", async () => {
    const mod = await boot();
    expect(mod.acquireRunLock()).toBe(true);
    expect(mod.acquireRunLock()).toBe(false);
    mod.releaseRunLock();
    expect(mod.acquireRunLock()).toBe(true);
    mod.releaseRunLock();
    expect(fs.existsSync(mod.LOCK_PATH)).toBe(false);
  });

  it("refuses forge_generate_pending and forge_generate_one while a run is active", async () => {
    fs.writeFileSync(path.join(dir, "m.csv"), HEADER + line(1, "a.png", "ovh-sdxl"));
    const mod = await boot();
    expect(mod.acquireRunLock()).toBe(true);
    for (const [name, args] of [["forge_generate_pending", {}], ["forge_generate_one", { filename: "a.png" }]] as const) {
      const r = await call(mod, name, args);
      expect(r.isError).toBe(true);
      expect(r.content[0].text).toMatch(/already active/);
    }
    // and the lock is still the first run's
    expect(fs.existsSync(mod.LOCK_PATH)).toBe(true);
    mod.releaseRunLock();
  });

  it("another server's live lock blocks us, a dead one is taken over", async () => {
    const mod = await boot();
    fs.writeFileSync(mod.LOCK_PATH, JSON.stringify({ pid: process.pid, at: Date.now() })); // alive: this process
    expect(mod.acquireRunLock()).toBe(false);
    fs.writeFileSync(mod.LOCK_PATH, JSON.stringify({ pid: 2147483646, at: Date.now() })); // no such process
    expect(mod.acquireRunLock()).toBe(true);
    mod.releaseRunLock();
    fs.writeFileSync(mod.LOCK_PATH, JSON.stringify({ pid: process.pid, at: Date.now() - 7 * 3600e3 })); // far too old
    expect(mod.acquireRunLock()).toBe(true);
    mod.releaseRunLock();
    fs.writeFileSync(mod.LOCK_PATH, "not json");
    expect(mod.acquireRunLock()).toBe(true);
    mod.releaseRunLock();
  });

  it("parks a row left 'generating' by a crash as failed instead of running it again", async () => {
    fs.writeFileSync(path.join(dir, "m.csv"), HEADER + line(1, "stuck.png", "ovh-sdxl", "generating"));
    const mod = await boot();
    const r = await call(mod, "forge_generate_pending");
    expect(r.content[0].text).toMatch(/nothing pending/);
    const csv = fs.readFileSync(path.join(dir, "m.csv"), "utf8");
    expect(csv).toMatch(/stuck\.png,.*,failed,interrupted by a crash/);
    expect(fs.existsSync(mod.LOCK_PATH)).toBe(false); // lock released
  });
});

describe("saving never wipes out other changes", () => {
  it("re-reads the file, so a row added meanwhile survives", async () => {
    fs.writeFileSync(path.join(dir, "m.csv"), HEADER + line(1, "one.png") + line(2, "two.png"));
    const mod = await boot();
    const stale = mod.loadManifest(); // what a long run used to hold on to
    expect(stale.records.length).toBe(2);
    // meanwhile, someone adds a third row to the file
    fs.appendFileSync(path.join(dir, "m.csv"), line(3, "three.png"));
    expect(mod.updateRow("one.png", { status: "done" })).toBe(true);
    const csv = fs.readFileSync(path.join(dir, "m.csv"), "utf8");
    expect(csv).toMatch(/three\.png/);
    expect(csv).toMatch(/one\.png,.*,done,/);
    expect(csv).toMatch(/two\.png,.*,pending,/);
  });

  it("returns false when the row is gone, and leaves the file alone", async () => {
    fs.writeFileSync(path.join(dir, "m.csv"), HEADER + line(1, "one.png"));
    const mod = await boot();
    const before = fs.readFileSync(path.join(dir, "m.csv"), "utf8");
    expect(mod.updateRow("missing.png", { status: "done" })).toBe(false);
    expect(fs.readFileSync(path.join(dir, "m.csv"), "utf8")).toBe(before);
  });

  it("leaves no temp file behind", async () => {
    fs.writeFileSync(path.join(dir, "m.csv"), HEADER + line(1, "one.png"));
    const mod = await boot();
    mod.updateRow("one.png", { status: "done" });
    expect(fs.readdirSync(dir).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });
});
