/**
 * "Is anything wrong with my forge?"
 *
 * One pass over the settings and the manifest that finds the things which go
 * quietly wrong: a key pasted twice, an engine paused and forgotten, rows
 * pointing at a model the provider switched off, a paid engine selected with
 * no free fallback configured, storage filling up.
 *
 * Every finding says what is wrong in plain words, why it matters, and whether
 * the app can fix it without asking. Nothing here touches the network or the
 * DOM, so the whole thing is testable and the MCP server can use it too.
 */

import { MODELS, RETIRED_MODELS } from "./engines.mjs";
import type { ForgeSettings } from "./providers";
import type { ManifestRow } from "../types";

export type Severity = "broken" | "warning" | "note";

export interface Finding {
  id: string;
  severity: Severity;
  /** one line, written for a person */
  title: string;
  /** why it matters, and what happens if it is left */
  detail: string;
  /** true when "Fix what can be fixed" will deal with it */
  fixable: boolean;
  /** how many things this finding covers, when that is meaningful */
  count?: number;
}

/* ---------------- version comparison ---------------- */

/**
 * Compare two versions the way a person means it: 1.10.0 is newer than 1.9.0,
 * even though the string "1.10.0" sorts earlier. Returns >0 when `a` is newer.
 *
 * The old check was `latest === APP_VERSION`, which called every mismatch an
 * update — including running a dev build newer than the last release.
 */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) =>
    v
      .trim()
      .replace(/^v/i, "")
      .split(/[.+-]/)
      .map((p) => (/^\d+$/.test(p) ? Number(p) : NaN));
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i];
    const y = pb[i];
    // A non-numeric part (a pre-release tag) sorts BEFORE a plain release,
    // so 1.1.0-beta is older than 1.1.0.
    if (Number.isNaN(x) && Number.isNaN(y)) continue;
    if (Number.isNaN(x)) return -1;
    if (Number.isNaN(y)) return 1;
    if ((x ?? 0) !== (y ?? 0)) return (x ?? 0) - (y ?? 0);
  }
  return 0;
}

export const isNewerThan = (candidate: string, current: string) => compareVersions(candidate, current) > 0;

/* ---------------- the checks ---------------- */

const liveModelIds = new Set(MODELS.map((m) => m.id));

/** Keys are compared by shape, never logged or shown. */
const keyShape = (k: string) => `${k.length}:${k.slice(0, 4)}:${k.slice(-4)}`;

export function checkForge(settings: ForgeSettings, rows: ManifestRow[]): Finding[] {
  const found: Finding[] = [];
  const s = settings;

  /* --- rows stuck mid-strike --- */
  const stuck = rows.filter((r) => r.status === "generating").length;
  if (stuck > 0) {
    found.push({
      id: "stuck-rows",
      severity: "broken",
      count: stuck,
      title: `${stuck} row${stuck > 1 ? "s are" : " is"} stuck part-way through`,
      detail:
        "These say they are being generated, but nothing is running — usually the app was closed mid-run. They will never finish on their own. Repair puts them back to pending so you can forge them again.",
      fixable: true,
    });
  }

  /* --- retired models --- */
  const retired = rows.filter((r) => RETIRED_MODELS[(r.model || "").trim()]).length;
  if (retired > 0) {
    found.push({
      id: "retired-models",
      severity: "broken",
      count: retired,
      title: `${retired} row${retired > 1 ? "s point" : " points"} at a model that no longer exists`,
      detail:
        "The provider switched this model off. These rows will fail every single time, however many times you retry. Repair moves them onto the current replacement.",
      fixable: true,
    });
  }

  /* --- unknown models --- */
  const unknown = rows.filter((r) => {
    const m = (r.model || "").trim();
    return m && !liveModelIds.has(m) && !RETIRED_MODELS[m];
  });
  if (unknown.length > 0) {
    const names = [...new Set(unknown.map((r) => r.model))].slice(0, 3).join(", ");
    found.push({
      id: "unknown-models",
      severity: "warning",
      count: unknown.length,
      title: `${unknown.length} row${unknown.length > 1 ? "s name" : " names"} a model the forge does not know`,
      detail: `Not necessarily wrong — a custom model on your own server is fine, and will be passed through as typed. But a typo looks exactly the same. Found: ${names}. Repair leaves these alone; check them yourself.`,
      fixable: false,
    });
  }

  /* --- duplicate filenames --- */
  const seen = new Set<string>();
  let dupeNames = 0;
  for (const r of rows) {
    if (seen.has(r.filename)) dupeNames++;
    seen.add(r.filename);
  }
  if (dupeNames > 0) {
    found.push({
      id: "duplicate-filenames",
      severity: "broken",
      count: dupeNames,
      title: `${dupeNames} filename${dupeNames > 1 ? "s are" : " is"} used twice`,
      detail:
        "The second picture overwrites the first when they are saved, so you silently lose work. Repair adds a numbered suffix to the later ones.",
      fixable: true,
    });
  }

  /* --- duplicate keys, per pool --- */
  for (const [poolName, label] of [
    ["geminiKeys", "free Google"],
    ["geminiPaidKeys", "paid Google"],
    ["openaiKeys", "OpenAI-compatible"],
  ] as const) {
    const pool = (s[poolName] ?? []).filter((k) => k.key.trim());
    const shapes = new Map<string, string[]>();
    for (const k of pool) {
      const sh = keyShape(k.key.trim());
      shapes.set(sh, [...(shapes.get(sh) ?? []), k.label]);
    }
    const dupes = [...shapes.values()].filter((labels) => labels.length > 1);
    if (dupes.length > 0) {
      found.push({
        id: `duplicate-keys-${poolName}`,
        severity: "warning",
        count: dupes.length,
        title: `The same ${label} key is in more than one slot`,
        detail: `${dupes.map((l) => l.join(" and ")).join("; ")} are the same key. That is easy to do and it quietly halves the allowance you think you have — one key resting means both are resting. Remove the copy.`,
        fixable: false,
      });
    }
  }

  /* --- paused engines --- */
  if (s.pausedEngines.length > 0) {
    found.push({
      id: "paused-engines",
      severity: "note",
      count: s.pausedEngines.length,
      title: `${s.pausedEngines.join(", ")} ${s.pausedEngines.length > 1 ? "are" : "is"} paused`,
      detail:
        "You switched this off deliberately at some point. Rows routed there stop immediately rather than trying. Mentioned in case you have forgotten — switch it back on in Image engines.",
      fixable: false,
    });
  }

  /* --- no engine that can actually make a picture --- */
  // OVHcloud needs no setup, so it counts unless it has been paused.
  const freeReady =
    !(s.pausedEngines ?? []).includes("ovh") ||
    Boolean(s.localBase.trim()) ||
    Boolean(s.cloudflare.accountId.trim() && s.cloudflare.token.trim()) ||
    Boolean(s.pollinationsToken.trim());
  const paidReady =
    s.geminiKeys.some((k) => k.key.trim()) ||
    s.geminiPaidKeys.some((k) => k.key.trim()) ||
    s.openaiKeys.some((k) => k.key.trim());
  if (!freeReady && !paidReady && s.provider !== "simulated") {
    found.push({
      id: "no-engine",
      severity: "broken",
      title: "No picture engine is set up",
      detail:
        "Nothing can be generated. The quickest free fix is Cloudflare Workers AI — about 690 pictures a day, no card. Or set the engine to “practice forge” to try the app with nothing at all.",
      fixable: false,
    });
  } else if (!freeReady && paidReady) {
    found.push({
      id: "no-free-fallback",
      severity: "warning",
      title: "Only paid engines are set up",
      detail:
        "Every picture will cost money, and when a key runs out there is nothing to fall back on. Cloudflare gives ~690 a day free with no card — worth adding even if you never rely on it.",
      fixable: false,
    });
  }

  /* --- the three text-side engines --- */
  const textJobs = [
    { key: "scribe", name: "writing" },
    { key: "coder", name: "code (SVG and Lottie)" },
    { key: "vision", name: "vision (placing lettering)" },
  ] as const;
  const missingText = textJobs.filter((j) => !s[j.key].key.trim());
  if (missingText.length > 0 && missingText.length < textJobs.length) {
    found.push({
      id: "partial-text-engines",
      severity: "note",
      count: missingText.length,
      title: `No key for ${missingText.map((j) => j.name).join(" or ")}`,
      detail:
        "One Mistral key covers all three, free. Settings → Text engines has a button that copies the key you already have into the ones that are missing.",
      fixable: false,
    });
  }

  /* --- rows parked with a retry in the past --- */
  const overdue = rows.filter((r) => r.retry_at && Date.parse(r.retry_at) < Date.now()).length;
  if (overdue > 0) {
    found.push({
      id: "overdue-retries",
      severity: "warning",
      count: overdue,
      title: `${overdue} row${overdue > 1 ? "s are" : " is"} waiting on a cooldown that already expired`,
      detail:
        "These should have re-queued themselves. Repair clears the cooldown and puts them back to pending.",
      fixable: true,
    });
  }

  /* --- failed rows worth retrying --- */
  const failed = rows.filter((r) => r.status === "failed").length;
  if (failed > 0) {
    found.push({
      id: "failed-rows",
      severity: "note",
      count: failed,
      title: `${failed} row${failed > 1 ? "s" : ""} failed`,
      detail:
        "Not necessarily a problem — the error on each row says why. Repair does not touch these, because retrying blindly on a paid engine costs money. Use “Retry failed” when you have read them.",
      fixable: false,
    });
  }

  return found;
}

/** Only the things "Fix what can be fixed" will actually change. */
export const fixableOf = (findings: Finding[]) => findings.filter((f) => f.fixable);

/** A one-line summary for a toast or a heading. */
export function summarise(findings: Finding[]): string {
  if (findings.length === 0) return "Nothing wrong — the forge is in good order.";
  const broken = findings.filter((f) => f.severity === "broken").length;
  const warn = findings.filter((f) => f.severity === "warning").length;
  const notes = findings.filter((f) => f.severity === "note").length;
  const bits = [
    broken ? `${broken} to fix` : "",
    warn ? `${warn} worth a look` : "",
    notes ? `${notes} for information` : "",
  ].filter(Boolean);
  return bits.join(" · ");
}
