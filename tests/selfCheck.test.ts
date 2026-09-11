/**
 * The forge checking itself over. These pin two things: that a finding names
 * a real problem in words a person can act on, and that "fixable" never
 * claims something the repair does not actually do.
 */
import { describe, expect, it } from "vitest";
import { checkForge, compareVersions, fixableOf, isNewerThan, summarise } from "../src/lib/selfCheck";
import type { ForgeSettings } from "../src/lib/providers";
import type { ManifestRow } from "../src/types";

const key = (id: string, k = `secret-${id}`) => ({ id, label: id, key: k, exhaustedUntil: 0 });

const settings = (over: Record<string, unknown> = {}) =>
  ({
    provider: "cloudflare",
    geminiKeys: [],
    geminiPaidKeys: [],
    openaiKeys: [],
    localBase: "",
    cloudflare: { accountId: "acct", token: "tok" },
    pollinationsToken: "",
    pausedEngines: [],
    scribe: { base: "b", key: "k", model: "m" },
    coder: { base: "b", key: "k", model: "m" },
    vision: { base: "b", key: "k", model: "m" },
    ...over,
  }) as unknown as ForgeSettings;

const row = (over: Partial<ManifestRow> = {}): ManifestRow =>
  ({ id: 1, filename: "shop_a.png", prompt: "x", status: "pending", model: "", ...over }) as ManifestRow;

const idsOf = (fs: { id: string }[]) => fs.map((f) => f.id);

describe("comparing versions like a person means it", () => {
  it("knows 1.10.0 is newer than 1.9.0", () => {
    // The old check was string equality, so this was the bug waiting to happen.
    expect(isNewerThan("1.10.0", "1.9.0")).toBe(true);
    expect(compareVersions("1.10.0", "1.9.0")).toBeGreaterThan(0);
  });

  it("does not offer an update when you are already on it", () => {
    expect(isNewerThan("1.0.0", "1.0.0")).toBe(false);
  });

  it("does not offer an OLDER release as an update", () => {
    // A dev build ahead of the last release used to be told to downgrade.
    expect(isNewerThan("1.0.0", "1.2.0")).toBe(false);
  });

  it("ignores a leading v", () => {
    expect(isNewerThan("v1.1.0", "1.0.0")).toBe(true);
    expect(compareVersions("v2.0.0", "2.0.0")).toBe(0);
  });

  it("treats a pre-release as older than the real thing", () => {
    expect(isNewerThan("1.1.0-beta", "1.1.0")).toBe(false);
    expect(isNewerThan("1.1.0", "1.1.0-beta")).toBe(true);
  });

  it("copes with different lengths", () => {
    expect(compareVersions("1.1", "1.1.0")).toBe(0);
    expect(isNewerThan("1.1.1", "1.1")).toBe(true);
  });
});

describe("a healthy forge", () => {
  it("finds nothing to report", () => {
    expect(checkForge(settings(), [row()])).toEqual([]);
  });

  it("says so in words", () => {
    expect(summarise([])).toMatch(/good order/i);
  });
});

describe("things that are actually broken", () => {
  it("finds rows stuck mid-strike", () => {
    const f = checkForge(settings(), [row({ status: "generating" })]);
    expect(idsOf(f)).toContain("stuck-rows");
    expect(f[0].fixable).toBe(true);
  });

  it("finds rows aimed at a switched-off model", () => {
    const f = checkForge(settings(), [row({ model: "imagen-4-ultra" })]);
    const hit = f.find((x) => x.id === "retired-models");
    expect(hit?.fixable).toBe(true);
    expect(hit?.detail).toMatch(/fail every single time/i);
  });

  it("finds two rows writing to the same filename", () => {
    const f = checkForge(settings(), [row(), row({ id: 2 })]);
    const hit = f.find((x) => x.id === "duplicate-filenames");
    expect(hit?.severity).toBe("broken");
    expect(hit?.detail).toMatch(/silently lose work/i);
  });

  it("does not call it broken when only OVHcloud is available, because that one works", () => {
    const f = checkForge(settings({ cloudflare: { accountId: "", token: "" }, provider: "cloudflare" }), [row()]);
    expect(idsOf(f)).not.toContain("no-engine");
  });

  it("says plainly when no engine is set up at all", () => {
    const f = checkForge(
      settings({ cloudflare: { accountId: "", token: "" }, provider: "cloudflare", pausedEngines: ["ovh"] }),
      [row()]
    );
    expect(idsOf(f)).toContain("no-engine");
  });

  it("does not complain about a missing engine on the practice forge", () => {
    const f = checkForge(settings({ cloudflare: { accountId: "", token: "" }, provider: "simulated" }), [row()]);
    expect(idsOf(f)).not.toContain("no-engine");
  });
});

describe("things worth a look", () => {
  it("spots the same key pasted into two slots without revealing it", () => {
    const f = checkForge(settings({ geminiKeys: [key("a", "AIzaSAMEKEY123456"), key("b", "AIzaSAMEKEY123456")] }), [row()]);
    const hit = f.find((x) => x.id === "duplicate-keys-geminiKeys");
    expect(hit).toBeTruthy();
    expect(hit?.detail).toMatch(/halves the allowance/i);
    // the key value itself must never appear in a message
    expect(JSON.stringify(f)).not.toContain("AIzaSAMEKEY123456");
  });

  it("does not call two different keys a duplicate", () => {
    const f = checkForge(settings({ geminiKeys: [key("a", "AIzaONE1111111111"), key("b", "AIzaTWO2222222222")] }), [row()]);
    expect(idsOf(f)).not.toContain("duplicate-keys-geminiKeys");
  });

  it("warns when every engine costs money", () => {
    const f = checkForge(
      settings({ cloudflare: { accountId: "", token: "" }, geminiKeys: [key("a")], provider: "gemini", pausedEngines: ["ovh"] }),
      [row()]
    );
    const hit = f.find((x) => x.id === "no-free-fallback");
    expect(hit?.detail).toMatch(/no card/i);
  });

  it("re-queues a cooldown that already passed", () => {
    const f = checkForge(settings(), [row({ retry_at: new Date(Date.now() - 60_000).toISOString() })]);
    const hit = f.find((x) => x.id === "overdue-retries");
    expect(hit?.fixable).toBe(true);
  });

  it("leaves a cooldown that has not passed alone", () => {
    const f = checkForge(settings(), [row({ retry_at: new Date(Date.now() + 60_000).toISOString() })]);
    expect(idsOf(f)).not.toContain("overdue-retries");
  });

  it("reminds you an engine is paused", () => {
    const f = checkForge(settings({ pausedEngines: ["gemini"] }), [row()]);
    expect(f.find((x) => x.id === "paused-engines")?.severity).toBe("note");
  });
});

describe("what repair promises", () => {
  it("never offers to fix failed rows, because retrying can cost money", () => {
    const f = checkForge(settings(), [row({ status: "failed" })]);
    expect(f.find((x) => x.id === "failed-rows")?.fixable).toBe(false);
  });

  it("never offers to fix an unknown model, which may be a real custom one", () => {
    const f = checkForge(settings(), [row({ model: "my-own-server-model" })]);
    const hit = f.find((x) => x.id === "unknown-models");
    expect(hit?.fixable).toBe(false);
    expect(hit?.detail).toMatch(/custom model on your own server is fine/i);
  });

  it("only lists the fixable ones as fixable", () => {
    const f = checkForge(settings({ pausedEngines: ["gemini"] }), [row({ status: "generating" }), row({ id: 2, status: "failed" })]);
    for (const x of fixableOf(f)) expect(x.fixable).toBe(true);
    expect(idsOf(fixableOf(f))).toContain("stuck-rows");
    expect(idsOf(fixableOf(f))).not.toContain("failed-rows");
  });
});
