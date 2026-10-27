/**
 * The desktop app's relays for Cloudflare and NVIDIA (/cf-api, /nv-api in
 * electron/main.js) only answer the app's own page, which proves itself with
 * an X-Forge-App header — the same pass every other call that does something
 * already uses. Those two relays are reached from several places in the page
 * (picture engines, text engines, the connection tests), so the header is
 * added in one spot, here, instead of at every call.
 */

/** Does this address go to one of the app's own relays on this origin? */
export function isRelayCall(url: string, origin: string): boolean {
  try {
    const u = new URL(url, origin);
    return u.origin === origin && /^\/(cf-api|nv-api)(\/|$)/.test(u.pathname);
  } catch {
    return false;
  }
}

/** Wrap window.fetch once so relay calls carry the header. Safe to call twice. */
export function installForgeFetch(): void {
  if (typeof window === "undefined" || typeof window.fetch !== "function") return;
  const w = window as unknown as { fetch: typeof fetch; __forgeFetch?: boolean };
  if (w.__forgeFetch) return;
  w.__forgeFetch = true;
  const real = w.fetch.bind(window);
  w.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!isRelayCall(url, window.location.origin)) return real(input, init);
    const headers = new Headers(init?.headers ?? (typeof input === "object" && "headers" in input ? input.headers : undefined));
    headers.set("X-Forge-App", "1");
    return real(input, { ...init, headers });
  };
}
