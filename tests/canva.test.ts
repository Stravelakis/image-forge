import { describe, it, expect } from "vitest";
import { authLink, canvaClient, SCOPES } from "../electron/canva.mjs";
import { parsePasted } from "../src/components/CanvaFill";

const memStore = (t: unknown) => {
  let v = t;
  return { read: async () => v, write: async (x: unknown) => void (v = x), clear: async () => void (v = null) };
};

describe("Canva (used by Image Forge)", () => {
  it("builds a PKCE sign-in link with the scopes and the loopback return address", () => {
    const l = authLink({ clientId: "OC-abc", redirectUri: "http://127.0.0.1:47821/canva/callback" });
    const u = new URL(l.url);
    expect(u.host).toBe("www.canva.com");
    expect(u.searchParams.get("code_challenge_method")).toBe("s256");
    expect(u.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:47821/canva/callback");
    expect(u.searchParams.get("scope")).toBe(SCOPES.join(" "));
    expect(l.verifier.length).toBeGreaterThan(43);
    expect(u.searchParams.get("state")).toBe(l.state);
  });

  it("uploads, fills a template, exports and downloads — waiting on each job", async () => {
    const calls: string[] = [];
    const reply = (j: unknown) => new Response(JSON.stringify(j), { status: 200 });
    let polls = 0;
    const fake = async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      calls.push(`${init?.method ?? "GET"} ${u.replace("https://api.canva.com/rest/v1", "")}`);
      if (u.endsWith("/asset-uploads")) return reply({ job: { id: "up1", status: "in_progress" } });
      if (u.endsWith("/asset-uploads/up1")) return reply({ job: { id: "up1", status: polls++ ? "success" : "in_progress", asset: { id: "A1" } } });
      if (u.endsWith("/autofills")) return reply({ job: { id: "af1" } });
      if (u.endsWith("/autofills/af1")) return reply({ job: { status: "success", result: { design: { id: "D1", urls: { edit_url: "https://canva/edit" } } } } });
      if (u.endsWith("/exports")) return reply({ job: { id: "ex1" } });
      if (u.endsWith("/exports/ex1")) return reply({ job: { status: "success", urls: ["https://dl/x.png"] } });
      if (u === "https://dl/x.png") return new Response(new Uint8Array([137, 80, 78, 71]));
      return new Response("{}", { status: 404 });
    };
    const c = canvaClient({ clientId: "a", clientSecret: "b" }, memStore({ access: "T", expiresAt: Date.now() + 1e6 }), { fetchImpl: fake as typeof fetch, sleep: async () => {} });
    expect(await c.upload("pic.png", Buffer.from([1, 2, 3]))).toBe("A1");
    const out = await c.fillAndExport("BT1", { title: { type: "text", text: "Hi" } }, "test");
    expect([...out.bytes]).toEqual([137, 80, 78, 71]);
    expect(out.designUrl).toBe("https://canva/edit");
    expect(calls).toContain("POST /autofills");
    expect(calls).toContain("POST /exports");
  });

  it("says plainly when it is not connected", async () => {
    const c = canvaClient({ clientId: "a", clientSecret: "b" }, memStore(null));
    await expect(c.templates()).rejects.toThrow(/Not connected to Canva/);
  });

  it("reads a table pasted from Google Sheets (tabs) or a CSV", () => {
    expect(parsePasted("title\tphoto\nSummer sale\tpotion.png\n")).toEqual({ head: ["title", "photo"], rows: [["Summer sale", "potion.png"]] });
    expect(parsePasted("a,b\n1,2").rows).toEqual([["1", "2"]]);
  });
});
