/**
 * Canva, used BY Image Forge (Ak, 13 Oct 2026: "us using Canva").
 *
 * Canva's own kit for apps that work on someone's Canva account ("Connect
 * API", https://www.canva.dev/docs/connect/). Bring-your-own like every other
 * key here: you make a free "integration" in Canva's developer portal, paste
 * its Client ID and secret into Settings → Canva, and sign in once. Nothing is
 * sent to anyone but Canva, and no secret ships with the app.
 *
 * What it does:
 *  · uploads pictures into your Canva uploads (any plan);
 *  · fills one of your brand templates from data — text, and pictures already
 *    uploaded — and exports the result as a PNG (Canva Pro and up);
 *  · lists your brand templates and the fields each has.
 *
 * The sign-in is OAuth with PKCE (a one-time code checked with a secret only
 * this app knows): the browser goes to Canva, Canva sends it back to
 * http://127.0.0.1:<port>/canva/callback, and the tokens are kept locked with
 * Windows' own per-user encryption, like the shared keys.
 *
 * Plain Node, no Electron import (the caller opens the browser), so the
 * request-building is testable.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { dpapi } from "./forgeKeys.mjs";

export const API = "https://api.canva.com/rest/v1";
export const AUTHORIZE = "https://www.canva.com/api/oauth/authorize";
export const SCOPES = [
  "asset:read",
  "asset:write",
  "design:meta:read",
  "design:content:read",
  "design:content:write",
  "brandtemplate:meta:read",
  "brandtemplate:content:read",
  "profile:read",
];

const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** The sign-in link, and what has to be remembered until Canva sends the browser back. */
export function authLink({ clientId, redirectUri }) {
  const verifier = b64url(crypto.randomBytes(48));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  const state = b64url(crypto.randomBytes(18));
  const q = new URLSearchParams({
    code_challenge: challenge,
    code_challenge_method: "s256",
    scope: SCOPES.join(" "),
    response_type: "code",
    client_id: clientId,
    state,
    redirect_uri: redirectUri,
  });
  return { url: `${AUTHORIZE}?${q}`, verifier, state };
}

/* ---------------- tokens, kept locked ---------------- */

export function tokenStore(dir, crypt = dpapi) {
  const file = path.join(dir, "canva-tokens.bin");
  return {
    async read() {
      try {
        const buf = await fs.promises.readFile(file);
        return JSON.parse(crypt.available ? await crypt.unlock(buf) : buf.toString("utf8"));
      } catch {
        return null;
      }
    },
    async write(t) {
      await fs.promises.mkdir(dir, { recursive: true });
      const text = JSON.stringify(t);
      await fs.promises.writeFile(file, crypt.available ? await crypt.lock(text) : text, { mode: 0o600 });
    },
    async clear() {
      await fs.promises.rm(file, { force: true });
    },
  };
}

async function tokenCall(creds, body) {
  const r = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Canva sign-in: ${j.message || j.error_description || j.error || r.status}`);
  return { access: j.access_token, refresh: j.refresh_token, expiresAt: Date.now() + (Number(j.expires_in) || 3600) * 1000 - 60000 };
}

export const exchangeCode = (creds, { code, verifier, redirectUri }) =>
  tokenCall(creds, { grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: redirectUri });

/** A Canva client: every call with a fresh token, refreshed when it runs out. */
export function canvaClient(creds, store, { fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const token = async () => {
    let t = await store.read();
    if (!t?.access) throw new Error("Not connected to Canva — Settings → Canva → Connect.");
    if (Date.now() > t.expiresAt && t.refresh) {
      t = await tokenCall(creds, { grant_type: "refresh_token", refresh_token: t.refresh });
      await store.write(t);
    }
    return t.access;
  };
  const call = async (method, p, { json, body, headers = {} } = {}) => {
    const r = await fetchImpl(`${API}${p}`, {
      method,
      headers: { Authorization: `Bearer ${await token()}`, ...(json ? { "Content-Type": "application/json" } : {}), ...headers },
      body: json ? JSON.stringify(json) : body,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Canva ${r.status}: ${j.message || j.code || "request refused"}`);
    return j;
  };
  /** Canva does big things as jobs: start, then ask until done (2 minutes at most). */
  const wait = async (p, pick) => {
    for (let i = 0; i < 60; i++) {
      const j = await call("GET", p);
      const job = pick(j);
      if (job?.status === "success") return job;
      if (job?.status === "failed") throw new Error(`Canva: ${job.error?.message || "the job failed"}`);
      await sleep(2000);
    }
    throw new Error("Canva took too long — try again in a minute.");
  };
  return {
    me: () => call("GET", "/users/me/profile"),
    /** Put a picture in your Canva uploads. Returns the asset id. */
    async upload(name, bytes) {
      const j = await call("POST", "/asset-uploads", {
        body: bytes,
        headers: { "Content-Type": "application/octet-stream", "Asset-Upload-Metadata": JSON.stringify({ name_base64: Buffer.from(name.slice(0, 50)).toString("base64") }) },
      });
      const job = await wait(`/asset-uploads/${j.job.id}`, (x) => x.job);
      return job.asset.id;
    },
    templates: async () => (await call("GET", "/brand-templates?limit=100")).items ?? [],
    dataset: async (id) => (await call("GET", `/brand-templates/${encodeURIComponent(id)}/dataset`)).dataset ?? {},
    /** Fill a template, export it as PNG, and return the picture's bytes. */
    async fillAndExport(templateId, data, title) {
      const a = await call("POST", "/autofills", { json: { brand_template_id: templateId, title: String(title || "Image Forge").slice(0, 255), data } });
      const done = await wait(`/autofills/${a.job.id}`, (x) => x.job);
      const designId = done.result?.design?.id;
      if (!designId) throw new Error("Canva filled the template but sent no design back.");
      const e = await call("POST", "/exports", { json: { design_id: designId, format: { type: "png" } } });
      const ex = await wait(`/exports/${e.job.id}`, (x) => x.job);
      const url = ex.urls?.[0];
      if (!url) throw new Error("Canva made no picture to download.");
      const r = await fetchImpl(url);
      return { bytes: Buffer.from(await r.arrayBuffer()), designUrl: done.result?.design?.urls?.edit_url ?? done.result?.design?.url ?? "" };
    },
  };
}
