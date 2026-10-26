/**
 * The small checks the desktop server and window rely on. (Audit 25 Oct 2026,
 * findings M1, M5, L1, L2 and the Content-Security-Policy half of H4.)
 */
import { describe, expect, it, vi } from "vitest";
import {
  CONTENT_SECURITY_POLICY,
  hostAllowed,
  isAppCall,
  isOwnPage,
  safeDecodeUri,
  safeExternalUrl,
} from "../electron/guards.mjs";
import { installForgeFetch, isRelayCall } from "../src/lib/forgeFetch";

describe("hostAllowed — DNS rebinding", () => {
  it("accepts the app's own two names on its own port", () => {
    expect(hostAllowed("127.0.0.1:47821", 47821)).toBe(true);
    expect(hostAllowed("localhost:47821", 47821)).toBe(true);
    expect(hostAllowed("LOCALHOST:47821", 47821)).toBe(true);
  });

  it.each(["evil.example.com:47821", "evil.example.com", "127.0.0.1", "localhost", "127.0.0.1:47822", "127.0.0.1:47821.evil.com", "", undefined, "[::1]:47821", "0.0.0.0:47821"])(
    "refuses %j",
    (host) => {
      expect(hostAllowed(host as string, 47821)).toBe(false);
    }
  );

  it("refuses everything when the port is not known", () => {
    expect(hostAllowed("127.0.0.1:47821", undefined)).toBe(false);
  });
});

describe("safeExternalUrl — what may be handed to Windows", () => {
  it("passes web addresses", () => {
    expect(safeExternalUrl("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
    expect(safeExternalUrl("http://example.com")).toBe("http://example.com/");
  });

  it.each([
    "file:///C:/Windows/System32/calc.exe",
    "javascript:alert(1)",
    "ms-settings:privacy",
    "ms-msdt:/id PCWDiagnostic",
    "search-ms:query=x",
    "vscode://file/x",
    "steam://run/1",
    "data:text/html,<script>alert(1)</script>",
    "httpx://x",
    "http",
    "",
    "not a url",
  ])("refuses %j", (u) => {
    expect(safeExternalUrl(u)).toBeNull();
  });

  it("is not fooled by a scheme that merely starts with http", () => {
    expect(safeExternalUrl("http-evil://x")).toBeNull();
    expect(safeExternalUrl("httpfoo:bar")).toBeNull();
  });

  it("keeps the one Windows link Settings itself shows, and no other of its kind", () => {
    expect(safeExternalUrl("ms-settings:appsfeatures")).toBe("ms-settings:appsfeatures");
    expect(safeExternalUrl("ms-settings:appsfeatures?x=1")).toBeNull();
    expect(safeExternalUrl("ms-settings:network")).toBeNull();
  });
});

describe("isOwnPage", () => {
  it("is only this port on 127.0.0.1", () => {
    expect(isOwnPage("http://127.0.0.1:47821/", 47821)).toBe(true);
    expect(isOwnPage("http://127.0.0.1:47821/#/made", 47821)).toBe(true);
    expect(isOwnPage("http://127.0.0.1:47822/", 47821)).toBe(false);
    expect(isOwnPage("http://127.0.0.1:478210/", 47821)).toBe(false);
    expect(isOwnPage("https://127.0.0.1:47821/", 47821)).toBe(false);
    expect(isOwnPage("http://127.0.0.1.evil.com:47821/", 47821)).toBe(false);
    expect(isOwnPage("nonsense", 47821)).toBe(false);
  });
});

describe("safeDecodeUri", () => {
  it("decodes ordinary paths", () => {
    expect(safeDecodeUri("/assets/a%20b.js")).toBe("/assets/a b.js");
  });
  it.each(["/%", "/%E0%A4%A", "/%zz", "/%c0%"])("says null, not an exception, for %j", (s) => {
    expect(safeDecodeUri(s)).toBeNull();
  });
});

describe("the relays need the app's pass", () => {
  it("isAppCall wants the exact header value", () => {
    expect(isAppCall({ headers: { "x-forge-app": "1" } })).toBe(true);
    expect(isAppCall({ headers: {} })).toBe(false);
    expect(isAppCall({ headers: { "x-forge-app": "0" } })).toBe(false);
  });

  it("knows which page calls are relay calls", () => {
    const o = "http://127.0.0.1:47821";
    expect(isRelayCall("/cf-api/client/v4/accounts/x/ai/run/y", o)).toBe(true);
    expect(isRelayCall("/nv-api/v1/chat/completions", o)).toBe(true);
    expect(isRelayCall(`${o}/nv-api/v1/models`, o)).toBe(true);
    expect(isRelayCall("/cf-apix/y", o)).toBe(false);
    expect(isRelayCall("/local-api/80/v1", o)).toBe(false);
    expect(isRelayCall("https://evil.test/cf-api/x", o)).toBe(false);
    expect(isRelayCall("https://api.cloudflare.com/client/v4", o)).toBe(false);
  });

  it("the page adds the header to relay calls only", async () => {
    const seen: { url: string; pass: string | null }[] = [];
    const fake = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      seen.push({ url, pass: new Headers(init?.headers).get("x-forge-app") });
      return new Response("{}");
    });
    vi.stubGlobal("window", { fetch: fake, location: { origin: "http://127.0.0.1:47821" } });
    installForgeFetch();
    installForgeFetch(); // twice is harmless
    const f = (window as unknown as { fetch: typeof fetch }).fetch;
    await f("/cf-api/x", { headers: { Authorization: "Bearer k" } });
    await f("/nv-api/y");
    await f("https://generativelanguage.googleapis.com/v1/z", { headers: { "x-goog-api-key": "k" } });
    await f("/local-api/80/v1");
    expect(seen.map((s) => s.pass)).toEqual(["1", "1", null, null]);
    vi.unstubAllGlobals();
  });
});

describe("the Content-Security-Policy", () => {
  const rules = Object.fromEntries(
    CONTENT_SECURITY_POLICY.split(";").map((r) => {
      const [name, ...v] = r.trim().split(/\s+/);
      return [name, v];
    })
  );

  it("lets no inline script run, which is what stops an injected onerror", () => {
    expect(rules["script-src"]).toContain("'self'");
    expect(rules["script-src"]).not.toContain("'unsafe-inline'");
    expect(rules["default-src"]).toEqual(["'self'"]);
  });

  it("allows eval for the cursor chaser and nothing broader in scripts", () => {
    expect(rules["script-src"]).toEqual(["'self'", "'unsafe-eval'"]);
  });

  it("lets the page reach engines over https and your own http servers (OmniRoute on the mini PC), nothing else", () => {
    const connect = rules["connect-src"];
    expect(connect).toEqual(["'self'", "https:", "http:"]);
    expect(connect).not.toContain("*");
  });

  it("shuts plugins and base-tag tricks", () => {
    expect(rules["object-src"]).toEqual(["'none'"]);
    expect(rules["base-uri"]).toEqual(["'self'"]);
  });
});
