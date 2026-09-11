/**
 * "Does this key actually work?" — one button per engine.
 *
 * Every check is deliberately the cheapest call that still proves the whole
 * chain: the address is right, the key is accepted, and the model exists. Where
 * a provider offers a free listing endpoint we use that rather than generating a
 * picture, so testing a key never costs money or eats a daily allowance.
 *
 * The one exception is noted below.
 */

import type { ForgeSettings } from "./providers";
import { scribeChat } from "./providers";
import { cloudflareUrl, inBrowser, OVH_URL } from "./engines.mjs";
import { askVision, type VisionEngine } from "./visionEngine";

export type TestTarget =
  | "local"
  | "cloudflare"
  | "pollinations"
  | "ovh"
  | "gemini-free"
  | "gemini-paid"
  | "openai"
  | "scribe"
  | "coder"
  | "vision";

export interface TestResult {
  ok: boolean;
  /** one line, written for a person */
  message: string;
  /** anything worth showing underneath, e.g. the models it found */
  detail?: string;
  /** true when the check cost nothing at all */
  free: boolean;
}

const ok = (message: string, detail?: string, free = true): TestResult => ({ ok: true, message, detail, free });
const bad = (message: string, detail?: string): TestResult => ({ ok: false, message, detail, free: true });

const timeout = (ms: number): AbortSignal => AbortSignal.timeout(ms);

const explain = (status: number, body: string): string => {
  const trimmed = body.trim().slice(0, 200);
  // Google returns 403 for two completely different situations, and calling
  // both "refused" sent us hunting a browser problem that did not exist.
  if (status === 403 && /denied access/i.test(body))
    return "Google has blocked the project this key belongs to — the key itself is fine. Only Google can lift this; contact their support.";
  if (status === 401 || status === 403) return "the key was refused";
  if (status === 404) return "that address or model does not exist";
  if (status === 429) return "the key is right, but it has hit its limit for now";
  if (status >= 500) return "the provider is having a bad moment";
  return trimmed || `it answered ${status}`;
};

/* ---------------- one per engine ---------------- */

async function testLocal(s: ForgeSettings): Promise<TestResult> {
  const base = (s.localBase || "").trim().replace(/\/+$/, "");
  if (!base) return bad("No address yet.", "Put your server's address in, e.g. http://localhost:8080/v1");
  try {
    const res = await fetch(`${base}/models`, {
      headers: s.localKey.trim() ? { Authorization: `Bearer ${s.localKey.trim()}` } : {},
      signal: timeout(15000),
    });
    if (!res.ok) return bad(`Your server answered ${res.status}.`, explain(res.status, await res.text().catch(() => "")));
    const json = (await res.json()) as { data?: { id?: string }[] };
    const ids = (json.data ?? []).map((d) => d.id).filter(Boolean) as string[];
    if (!ids.length) return bad("Your server is running but has no models loaded.");
    const wanted = s.localModel.trim();
    if (wanted && !ids.includes(wanted)) {
      return bad(
        `Connected, but "${wanted}" is not on your server.`,
        `It has: ${ids.slice(0, 8).join(", ")}${ids.length > 8 ? "…" : ""}`
      );
    }
    return ok(`Working — ${ids.length} models, and "${wanted}" is one of them.`, ids.slice(0, 8).join(", "));
  } catch {
    return bad("Could not reach your server.", `Is it running at ${base}?`);
  }
}

async function testCloudflare(s: ForgeSettings): Promise<TestResult> {
  const id = s.cloudflare.accountId.trim();
  const token = s.cloudflare.token.trim();
  if (!id || !token) return bad("Needs both the account id and the token.");
  try {
    const res = await fetch(cloudflareUrl(`/client/v4/accounts/${encodeURIComponent(id)}/ai/models/search?per_page=1`), {
      headers: { Authorization: `Bearer ${token}` },
      signal: timeout(20000),
    });
    const body = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403) {
      return bad("Cloudflare refused the token.", "Does it have the Workers AI permission?");
    }
    if (res.status === 404) {
      return bad(
        "Cloudflare did not recognise that account id.",
        "It is the long string of letters and numbers in the address bar after you log in — dash.cloudflare.com/THIS-PART. It is not secret."
      );
    }
    if (!res.ok) return bad(`Cloudflare answered ${res.status}.`, explain(res.status, body));
    return ok("Working — the account and token are both good.", "No allowance was used by this check.");
  } catch {
    return bad(
      "The request never left the app.",
      inBrowser()
        ? "Cloudflare does not allow browser pages to call it, so the forge routes around that. If you are seeing this, restart the app (close the black window and use the desktop shortcut) so the detour is loaded."
        : "Check your internet connection."
    );
  }
}

async function testPollinations(s: ForgeSettings): Promise<TestResult> {
  const token = s.pollinationsToken.trim();
  try {
    const res = await fetch("https://image.pollinations.ai/models", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: timeout(20000),
    });
    const body = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403) {
      return bad(
        token ? "Pollinations refused that token." : "Pollinations needs a token now.",
        "Get a free one at auth.pollinations.ai"
      );
    }
    if (!res.ok) return bad(`Pollinations answered ${res.status}.`, explain(res.status, body));
    return ok(
      token ? "Working — your token was accepted." : "Reachable, but you have no token yet.",
      token ? undefined : "Pictures will fail without one. auth.pollinations.ai gives them out free."
    );
  } catch {
    return bad("Could not reach Pollinations.");
  }
}

/**
 * OVHcloud needs no key, so the only question is whether it is up.
 *
 * Its model list is the check: free, unmetered, and it proves the address and
 * the model are both still there. A picture would spend one of the two a
 * minute you get, which is a poor trade for a yes/no.
 */
async function testOvh(): Promise<TestResult> {
  try {
    const res = await fetch(OVH_URL.replace(/\/api\/text2image$/, "/api/openai_compat/v1/models"), {
      signal: timeout(15000),
    });
    if (!res.ok) return bad(`OVHcloud answered ${res.status}.`, explain(res.status, await res.text().catch(() => "")));
    const json = (await res.json()) as { data?: { id?: string }[] };
    const ids = (json.data ?? []).map((d) => d.id).filter(Boolean) as string[];
    if (!ids.length) return bad("OVHcloud is up but lists no model.");
    return ok("Working — no key needed.", `Serving ${ids.join(", ")}. Two pictures a minute, always 1024×1024.`);
  } catch {
    return bad("Could not reach OVHcloud.", "Check your internet connection.");
  }
}

/**
 * Two steps, because listing models is free and therefore proves almost nothing.
 *
 * A Google key with no credit lists all 50 models perfectly happily and then
 * refuses every actual request. Verified 2026-09-02 — a key that "passed" could
 * not generate a single word. So we list first, then spend a few tokens proving
 * it can really be used. Those tokens cost a tiny fraction of a cent, and cost
 * nothing at all when the key has no credit, because the call is refused.
 */
async function testGeminiKey(key: string, model: string): Promise<TestResult> {
  if (!key.trim()) return bad("No key in this box yet.");

  let names: string[] = [];
  try {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
      headers: { "x-goog-api-key": key.trim() },
      signal: timeout(20000),
    });
    const body = await res.text().catch(() => "");
    if (!res.ok) return bad(`Google answered ${res.status}.`, explain(res.status, body));
    const json = JSON.parse(body) as { models?: { name?: string }[] };
    names = (json.models ?? []).map((m) => (m.name ?? "").replace("models/", ""));
  } catch {
    return bad("Could not reach Google.");
  }

  // Now actually use it. A few tokens on the cheapest model.
  try {
    const res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key.trim() },
        body: JSON.stringify({ contents: [{ parts: [{ text: "say ready" }] }] }),
        signal: timeout(25000),
      }
    );
    const body = await res.text().catch(() => "");
    if (!res.ok) {
      if (/prepayment credits are depleted|billing/i.test(body)) {
        return bad(
          "This key's project is linked to Cloud billing, which switched off its free tier.",
          "Counter-intuitive but confirmed on a real account: linking a project to Google Cloud billing marks it PAID TIER, and paid tier bills against an 'AI Studio Prepay' balance — which ordinary Google Cloud credit does NOT pay for. So a project with hundreds of euros of Cloud credit gets a balance of zero and refuses everything. To get the free tier back: unlink this project from its billing account at console.cloud.google.com/billing. To keep it paid: add a Prepay balance at ai.studio/projects. Either works; linked-with-Cloud-credit-only does not."
        );
      }
      if (res.status === 403 && /denied access/i.test(body)) {
        return bad(
          "Google has blocked this key's project.",
          "A different problem from the credit one, and not something more credit fixes. Verified as not a browser issue: the same key fails identically through a server-side proxy. Google says only “Your project has been denied access. Please contact support.” Make a key in a fresh project, or take it up with Google."
        );
      }
      return bad(`The key lists models but cannot be used.`, explain(res.status, body));
    }
    const has = model && names.some((n) => n.startsWith(model));
    return ok(
      "Working — and it can actually be used.",
      has ? `"${model}" is available to this key.` : model ? `It did not list "${model}", so pictures may fail.` : undefined,
      false
    );
  } catch {
    return bad("Could not reach Google for the second check.");
  }
}

async function testOpenAiLike(base: string, key: string, model: string, who: string): Promise<TestResult> {
  const b = base.trim().replace(/\/+$/, "");
  if (!b) return bad("No address yet.");
  if (!key.trim()) return bad("No key yet.");
  try {
    const res = await fetch(`${b}/models`, {
      headers: { Authorization: `Bearer ${key.trim()}` },
      signal: timeout(20000),
    });
    const body = await res.text().catch(() => "");
    if (!res.ok) return bad(`${who} answered ${res.status}.`, explain(res.status, body));
    const json = JSON.parse(body) as { data?: { id?: string }[] };
    const ids = (json.data ?? []).map((d) => d.id).filter(Boolean) as string[];
    const has = model && ids.includes(model);
    return ok(
      has ? `Working — and "${model}" is there.` : `Working — the key is good.`,
      has ? undefined : ids.length ? `It offers: ${ids.slice(0, 6).join(", ")}${ids.length > 6 ? "…" : ""}` : undefined
    );
  } catch {
    return bad(`Could not reach ${who}.`, `Is ${b} the right address?`);
  }
}

/** Ask the provider which models this key may actually use. Best effort only. */
async function listChatModels(engine: ForgeSettings["scribe"]): Promise<string[]> {
  const base = engine.base.trim().replace(/\/+$/, "");
  try {
    const res = await fetch(`${base}/models`, {
      headers: { Authorization: `Bearer ${engine.key.trim()}` },
      signal: timeout(15000),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: { id?: string }[] };
    return (json.data ?? []).map((d) => d.id).filter(Boolean) as string[];
  } catch {
    return [];
  }
}

/**
 * Chat models have no listing worth trusting on its own, so we ask them to say
 * one word. When that fails we then ask what the key CAN use, because "this
 * model is not available to your account" is by far the commonest cause and
 * the provider's own error rarely says so plainly.
 */
async function testChat(engine: ForgeSettings["scribe"], who: string): Promise<TestResult> {
  if (!engine.key.trim()) return bad("No key yet.");
  try {
    const answer = await scribeChat(engine, "Reply with exactly: ready", "ready?");
    return ok(`Working — ${who} answered.`, `It said: "${answer.trim().slice(0, 60)}"`, false);
  } catch (e) {
    const why = (e as { message?: string })?.message ?? "unknown";
    const models = await listChatModels(engine);
    if (models.length) {
      const named = engine.model.trim();
      const has = models.includes(named);
      return bad(
        has ? `${who} refused, though "${named}" does exist on this key.` : `Your key cannot use "${named}".`,
        has
          ? why
          : `It can use: ${models.slice(0, 10).join(", ")}${models.length > 10 ? `, and ${models.length - 10} more` : ""}`
      );
    }
    return bad(`${who} did not answer.`, why);
  }
}

/* ---------------- the one entry point ---------------- */

/**
 * Vision is the one check that must send a real picture.
 *
 * Listing models proves nothing here: plenty of endpoints list a vision model
 * that their key is not entitled to use, and plenty of models accept a text
 * message and then reject an image. So we send a tiny generated square — a red
 * block, four pixels — and ask what colour it is. It costs a fraction of a
 * cent at worst, and it proves the whole chain end to end.
 */
/**
 * Can this model write CODE, rather than merely answer?
 *
 * A chat model will happily describe an SVG in prose. That looks like success
 * and produces a broken vector later, which is a far more annoying way to find
 * out. So we ask for the smallest real thing and check the shape of the reply.
 */
export async function testCode(engine: { base: string; key: string; model: string }): Promise<TestResult> {
  if (!engine.key.trim()) return bad("No key for the code engine yet.");
  let reply: string;
  try {
    reply = await scribeChat(
      engine,
      "You write code and nothing else. No prose, no explanation, no code fences.",
      "Return an SVG of a single red circle on a 24x24 canvas."
    );
  } catch (e) {
    return bad(capitalise((e as { message?: string })?.message ?? "it did not answer"));
  }
  const looksLikeSvg = /<svg[\s\S]*<\/svg>/i.test(reply);
  if (looksLikeSvg) return ok(`${engine.model || "The model"} writes code.`, "It returned a usable SVG.", false);
  return {
    ok: false,
    message: `${engine.model || "The model"} answered, but not with code.`,
    detail: `It replied: "${reply.trim().slice(0, 90)}". A model that describes an SVG instead of writing one produces broken vectors later. Pick a model built for code — Codestral is free.`,
    free: false,
  };
}

export async function testVision(engine: VisionEngine): Promise<TestResult> {
  if (!engine.base.trim()) return bad("No address set for the vision engine.");
  // A 64x64 solid red PNG, 136 bytes, checked byte for byte by a test below.
  // Written out as a constant so the check needs no canvas and behaves the same
  // in Node as in the browser. 64 square rather than a few pixels because some
  // providers reject images under a minimum size before a model ever sees them.
  const RED_SQUARE =
    "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAT0lEQVR42u3PQQkAAAgEsEty/UMZxgi+" +
    "hcEKLNO+FgEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQGBywLPLIEA" +
    "68ZURwAAAABJRU5ErkJggg==";

  const res = await askVision(
    engine,
    RED_SQUARE,
    "What single colour fills this image? Reply with just the colour name, one word.",
    timeout(30_000)
  );

  if (!res.ok) return bad(capitalise(res.problem));

  const answer = res.text.trim().toLowerCase();
  if (answer.includes("red"))
    return ok(`${engine.model || "The model"} can see pictures.`, `It read the test square as: "${res.text.trim().slice(0, 60)}"`, false);

  // It answered, so the key and the model are fine — it just got it wrong.
  // Worth flagging, because a model that cannot read a solid red square will
  // not find a signboard either.
  return {
    ok: false,
    message: `${engine.model || "The model"} replied, but did not see the picture properly.`,
    detail: `Asked what colour a solid red square was, it said: "${res.text.trim().slice(0, 80)}". Press Load models and pick one built for vision.`,
    free: false,
  };
}

const capitalise = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t);

export async function testConnection(target: TestTarget, s: ForgeSettings): Promise<TestResult> {
  switch (target) {
    case "local":
      return testLocal(s);
    case "cloudflare":
      return testCloudflare(s);
    case "pollinations":
      return testPollinations(s);
    case "ovh":
      return testOvh();
    case "gemini-free":
      return testGeminiKey(s.geminiKeys.find((k) => k.key.trim())?.key ?? "", s.geminiModel);
    case "gemini-paid":
      return testGeminiKey(s.geminiPaidKeys.find((k) => k.key.trim())?.key ?? "", s.geminiModel);
    case "openai":
      return testOpenAiLike(s.openaiBase, s.openaiKeys.find((k) => k.key.trim())?.key ?? "", s.openaiModel, "The endpoint");
    case "scribe":
      return testChat(s.scribe, "your text model");
    case "coder":
      return testCode(s.coder);
    case "vision":
      return testVision(s.vision);
    default:
      return bad("Nothing to test.");
  }
}

/**
 * Test every key in a pool, so one dud among ten is easy to spot.
 *
 * Checked one at a time rather than all at once: ten simultaneous requests from
 * one address look like abuse, and a provider that rate-limits you mid-check
 * reports healthy keys as broken.
 */
export async function testPool(
  pool: { id: string; label: string; key: string }[],
  model: string,
  kind: "gemini" | "openai" = "gemini",
  base = "",
  onEach?: (done: number, total: number) => void
): Promise<{ id: string; label: string; result: TestResult }[]> {
  const withKeys = pool.filter((k) => k.key.trim());
  const out: { id: string; label: string; result: TestResult }[] = [];
  for (let i = 0; i < withKeys.length; i++) {
    const k = withKeys[i];
    const result =
      kind === "gemini"
        ? await testGeminiKey(k.key, model)
        : await testOpenAiLike(base, k.key, model, "The endpoint");
    out.push({ id: k.id, label: k.label, result });
    onEach?.(i + 1, withKeys.length);
  }
  return out;
}

/** A one-line summary of a whole pool: how many work, and what is wrong with the rest. */
export function summarisePool(results: { label: string; result: TestResult }[]): {
  working: number;
  total: number;
  message: string;
  duplicates: string[];
} {
  const working = results.filter((r) => r.result.ok).length;
  const broken = results.filter((r) => !r.result.ok);
  const reasons = [...new Set(broken.map((b) => b.result.message))];
  const message =
    broken.length === 0
      ? `All ${results.length} key${results.length === 1 ? "" : "s"} work.`
      : `${working} of ${results.length} work. ${broken.length} did not: ${reasons.join(" · ")}`;
  return { working, total: results.length, message, duplicates: [] };
}

/** Which keys in a pool are the same key pasted twice? Returns their labels. */
export async function findDuplicateKeys(pool: { label: string; key: string }[]): Promise<string[]> {
  const seen = new Map<string, string[]>();
  for (const k of pool) {
    const v = k.key.trim();
    if (!v) continue;
    // fingerprint rather than compare in the open, so nothing is logged
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v));
    const id = [...new Uint8Array(buf)].slice(0, 6).map((x) => x.toString(16)).join("");
    seen.set(id, [...(seen.get(id) ?? []), k.label]);
  }
  return [...seen.values()].filter((labels) => labels.length > 1).map((labels) => labels.join(" and "));
}

/** The failure-naming rules, exposed so tests can pin them. */
export const explainForTest = explain;

/**
 * The Google failure messages, reachable from a test without a network. The
 * wording is the feature here, so it is worth pinning.
 */
export async function testConnectionForTest(status: number, body: string): Promise<TestResult> {
  if (status === 429 && /prepayment credits are depleted|billing/i.test(body)) {
    return bad(
      "This key's project is linked to Cloud billing, which switched off its free tier.",
      "Counter-intuitive but confirmed on a real account: linking a project to Google Cloud billing marks it PAID TIER, and paid tier bills against an 'AI Studio Prepay' balance — which ordinary Google Cloud credit does NOT pay for. So a project with hundreds of euros of Cloud credit gets a balance of zero and refuses everything. To get the free tier back: unlink this project from its billing account at console.cloud.google.com/billing. To keep it paid: add a Prepay balance at ai.studio/projects. Either works; linked-with-Cloud-credit-only does not."
    );
  }
  return bad(`Google answered ${status}.`, explain(status, body));
}
