/**
 * The link between Image Forge and another app on the same computer.
 *
 * A request arrives as a file written by a different program, so it is
 * untrusted input: these pin that bad requests are refused with a reason the
 * other app can read, that nothing can be written outside the request's own
 * outbox folder, and that "done" is only signalled once, at the end.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  claimRequest,
  finishRequest,
  linkPaths,
  pendingRequests,
  removePresence,
  safeName,
  validateRequest,
  writePresence,
  writeResult,
} from "../electron/link.mjs";
import { requestOutcome, rowsForRequest, type LinkRequest } from "../src/lib/link";
import type { ManifestRow } from "../src/types";

let dir: string;
let p: ReturnType<typeof linkPaths>;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "forge-link-"));
  p = linkPaths(dir);
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const good = (over: Record<string, unknown> = {}) => ({
  id: "vid-creator-0001",
  from: "BYOK Vid Creator",
  rows: [{ filename: "sheet_kaiti_neutral.png", prompt: "Kaiti, nine mouth shapes", category: "sheet" }],
  ...over,
});
const drop = (body: unknown, name = "vid-creator-0001") => {
  fs.mkdirSync(p.inbox, { recursive: true });
  fs.writeFileSync(path.join(p.inbox, `${name}.json`), typeof body === "string" ? body : JSON.stringify(body));
};

describe("presence — how the other app knows the forge is here", () => {
  it("writes a note with version and port, and removes it on quit", () => {
    writePresence(p, { version: "1.0.2", port: 47821 });
    const note = JSON.parse(fs.readFileSync(p.presence, "utf8"));
    expect(note).toMatchObject({ app: "image-forge", version: "1.0.2", port: 47821, linkVersion: 1 });
    expect(note.inbox).toBe(p.inbox);
    removePresence(p);
    expect(fs.existsSync(p.presence)).toBe(false);
  });
});

describe("checking a request", () => {
  it("accepts a well-formed one and fills in defaults", () => {
    const v = validateRequest(good());
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.request.rows[0]).toMatchObject({ aspect_ratio: "1:1", category: "sheet", style: "" });
  });

  it.each([
    ["not JSON", "{nope", /not valid JSON/],
    ["a bad id", good({ id: "../../etc" }), /request id/],
    ["no pictures", good({ rows: [] }), /no pictures/],
    ["too many", good({ rows: Array.from({ length: 61 }, (_, i) => ({ filename: `a_${i}.png`, prompt: "x" })) }), /at most 60/],
    ["an empty prompt", good({ rows: [{ filename: "a.png", prompt: " " }] }), /no prompt/],
    ["a path in a filename", good({ rows: [{ filename: "../evil.png", prompt: "x" }] }), /filename/],
    ["a non-picture file", good({ rows: [{ filename: "run.exe", prompt: "x" }] }), /filename/],
    ["two pictures with one name", good({ rows: [{ filename: "a.png", prompt: "x" }, { filename: "a.png", prompt: "y" }] }), /both called/],
  ])("refuses %s, saying why", (_label, body, why) => {
    const v = validateRequest(typeof body === "string" ? body : JSON.stringify(body));
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.problem).toMatch(why);
  });

  it("refuses a request over the size limit before parsing it", () => {
    expect(validateRequest("x".repeat(300 * 1024))).toMatchObject({ ok: false });
  });

  it("only allows plain picture names", () => {
    expect(safeName("sheet_a.png")).toBe("sheet_a.png");
    expect(safeName("a.jpg")).toBe("a.jpg");
    for (const bad of ["../a.png", "a/b.png", "A.png", "a.png.exe", "", "a b.png"]) expect(safeName(bad), bad).toBeNull();
  });
});

describe("the round trip", () => {
  it("offers a request, claims it once, takes pictures, then signals done", () => {
    drop(good());
    const first = pendingRequests(p);
    expect(first.map((r) => r.id)).toEqual(["vid-creator-0001"]);
    expect(first[0].state).toBe("new");

    expect(claimRequest(p, "vid-creator-0001")).toBe(true);
    // Claimed but not finished: still offered, marked as in progress, so a
    // forge that was closed mid-way picks it back up.
    expect(pendingRequests(p)[0].state).toBe("working");

    expect(writeResult(p, "vid-creator-0001", "sheet_kaiti_neutral.png", Buffer.from([1, 2, 3])).ok).toBe(true);
    expect(finishRequest(p, "vid-creator-0001", { done: ["sheet_kaiti_neutral.png"], failed: [] }).ok).toBe(true);

    const done = JSON.parse(fs.readFileSync(path.join(p.outbox, "vid-creator-0001", "done.json"), "utf8"));
    expect(done.done).toEqual(["sheet_kaiti_neutral.png"]);
    expect(pendingRequests(p)).toEqual([]);
  });

  it("moves a bad request aside with a note the other app can read", () => {
    drop(good({ rows: [] }), "vid-creator-0002");
    expect(pendingRequests(p)).toEqual([]);
    expect(fs.readFileSync(path.join(p.rejected, "vid-creator-0002.why.txt"), "utf8")).toMatch(/no pictures/);
  });

  it("will not write outside the request's own folder", () => {
    drop(good());
    claimRequest(p, "vid-creator-0001");
    expect(writeResult(p, "vid-creator-0001", "../escape.png", Buffer.from([1])).ok).toBe(false);
    expect(writeResult(p, "../../x", "a.png", Buffer.from([1])).ok).toBe(false);
    expect(fs.existsSync(path.join(p.outbox, "escape.png"))).toBe(false);
  });

  it("will not take pictures for a request nobody claimed", () => {
    expect(writeResult(p, "never-claimed-01", "a.png", Buffer.from([1])).ok).toBe(false);
  });
});

describe("turning a request into rows", () => {
  const req: LinkRequest = {
    id: "vid-creator-0003",
    from: "BYOK Vid Creator",
    note: "",
    createdAt: "",
    state: "new",
    rows: [
      { filename: "a.png", prompt: "one", negative_prompt: "", style: "claymation", aspect_ratio: "1:1", category: "sheet", model: "" },
      { filename: "b.png", prompt: "two", negative_prompt: "", style: "", aspect_ratio: "16:9", category: "image", model: "" },
    ],
  };

  it("tags every row so the answer can find them again", () => {
    const rows = rowsForRequest(req, 10, new Set());
    expect(rows.map((r) => r.id)).toEqual([10, 11]);
    expect(rows.every((r) => r.request_id === "vid-creator-0003" && r.status === "pending")).toBe(true);
    expect(rows[0].note).toMatch(/BYOK Vid Creator/);
  });

  it("never takes over a filename the manifest already uses", () => {
    const rows = rowsForRequest(req, 1, new Set(["a.png"]));
    expect(rows[0].filename).toBe("a_2.png");
  });
});

describe("knowing when a request is over", () => {
  const row = (over: Partial<ManifestRow>): ManifestRow =>
    ({ id: 1, filename: "a.png", status: "done", error: "", request_id: "r-000001", ...over }) as ManifestRow;

  it("waits while anything is still pending or being made", () => {
    expect(requestOutcome([row({}), row({ id: 2, filename: "b.png", status: "generating" })], "r-000001")).toBeNull();
  });

  it("waits for a row parked on a rate limit — it will retry by itself", () => {
    const later = new Date(Date.now() + 3600e3).toISOString();
    expect(requestOutcome([row({ status: "failed", retry_at: later })], "r-000001")).toBeNull();
  });

  it("reports done and failed, and counts skipped as not delivered", () => {
    const out = requestOutcome(
      [row({}), row({ id: 2, filename: "b.png", status: "failed", error: "no credit" }), row({ id: 3, filename: "c.png", status: "skipped" })],
      "r-000001"
    );
    expect(out?.done).toEqual(["a.png"]);
    expect(out?.failed.map((f) => f.filename)).toEqual(["b.png", "c.png"]);
  });

  it("ignores rows that belong to no request", () => {
    expect(requestOutcome([row({ request_id: undefined })], "r-000001")).toBeNull();
  });
});
