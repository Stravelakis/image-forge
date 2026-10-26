/**
 * Small, pure checks the desktop server and window use. Kept apart from
 * main.js (which needs Electron to load) so tests can run them.
 */

/**
 * The browser-side rules for the page the app serves.
 *
 * script-src has no 'unsafe-inline': a script or an onerror="…" that gets into
 * the page (model-written SVG, a pasted prompt) cannot run. 'unsafe-eval' is
 * needed for one thing, the cursor chaser (lib/cursorChaser.ts builds its
 * function with new Function).
 * connect-src lets the page talk to itself, to https services (the engines),
 * to this computer (your own picture server), and to plain-http servers on
 * your own network, such as a model gateway on another of your machines
 * (OmniRoute on the mini PC is http://100.x). Allowing http: adds no new way
 * out — https: to anywhere is already allowed — and blocking it broke those.
 * The style and font lines are there because the page genuinely needs them:
 * inline style attributes and style tags (React, the charts) and the Google
 * Fonts stylesheet linked from index.html.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "img-src 'self' data: blob:",
  "connect-src 'self' https: http:",
  "script-src 'self' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "media-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

/**
 * Is this request really addressed to us? A web page on another site can make
 * its own name point at 127.0.0.1 for a moment (DNS rebinding) and then talk
 * to this server as if it were the app's own page; the Host header it sends
 * still carries ITS name, so only our own two names are accepted.
 */
export function hostAllowed(hostHeader, port) {
  const h = String(hostHeader || "").trim().toLowerCase();
  return h === `127.0.0.1:${port}` || h === `localhost:${port}`;
}

/**
 * The one non-web link the app itself shows: Settings has a "Windows apps
 * list" link, for uninstalling. Exactly this address, nothing else of its kind.
 */
const OS_LINKS = new Set(["ms-settings:appsfeatures"]);

/**
 * Only web addresses (and the one link above) may be handed to the operating
 * system. Anything else (file:, another ms-settings: page, a registered
 * protocol handler, a malformed string) gives null. Returns the address as the
 * URL parser wrote it.
 */
export function safeExternalUrl(raw) {
  const text = String(raw).trim();
  if (OS_LINKS.has(text.toLowerCase())) return text.toLowerCase();
  let u;
  try {
    u = new URL(text);
  } catch {
    return null;
  }
  return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
}

/** Is this address a page of the app itself, on this port? */
export function isOwnPage(raw, port) {
  try {
    const u = new URL(String(raw));
    return u.protocol === "http:" && u.hostname === "127.0.0.1" && u.port === String(port);
  } catch {
    return false;
  }
}

/** decodeURIComponent that says "no" instead of throwing on a bad escape such as "/%". */
export function safeDecodeUri(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return null;
  }
}

/** Is this the app's own page calling (it always sends X-Forge-App: 1)? */
export const isAppCall = (req) => req.headers["x-forge-app"] === "1";
