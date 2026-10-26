/**
 * The one door every picture-making caller goes through before it spends.
 *
 * `ensureAffordable(rows, settings)` answers "may I generate these?" for the
 * Forge button, "Forge a variant", the Sheet maker, the delayed queue and the
 * puppet maker alike. If the run is free it says yes at once. If it costs (or
 * its price is unknown) it asks you, in the same PaidConfirm window, and waits
 * for the answer. If nobody is there to ask, the answer is no: a missing
 * dialog must never turn into a silent charge.
 */

import { checkPaidRun, type PaidRunCheck } from "./paidGuard";
import type { ForgeSettings } from "./providers";
import type { ManifestRow } from "../types";

export interface PaidAskOptions {
  /** price at the half-price delayed (batch) rate */
  batch?: boolean;
  /** an extra paragraph for the dialog, e.g. "worst case includes the fix rounds" */
  note?: string;
  /** the label for the go-ahead button */
  approveLabel?: string;
  /** refuse outright when the total would pass this many dollars (0 = no paid pictures at all) */
  capUsd?: number;
  /** what the cap belongs to, for the refusal sentence, e.g. "a puppet" */
  capFor?: string;
}

/** What the person chose in the dialog. */
export type PaidAnswer = { kind: "approve" } | { kind: "cancel" } | { kind: "free"; engineId: string };

/** Shows the dialog and waits. The app registers one at start-up. */
export type PaidAsker = (check: PaidRunCheck, opts: PaidAskOptions) => Promise<PaidAnswer>;

export interface Affordable {
  ok: boolean;
  check: PaidRunCheck;
  /** why the answer is no, in plain words (empty when ok) */
  reason: string;
  /** set when the person picked a free engine from the dialog instead */
  useFree?: string;
}

let asker: PaidAsker | null = null;
let asking = false;

/** The app calls this once; pass null on unmount. */
export function registerPaidAsker(fn: PaidAsker | null): void {
  asker = fn;
}

/** Test hook: forget any question that is still open. */
export function resetPaidGate(): void {
  asking = false;
}

export async function ensureAffordable(
  rows: ManifestRow[],
  settings: ForgeSettings,
  opts: PaidAskOptions = {}
): Promise<Affordable> {
  const check = checkPaidRun(rows, settings, { batch: opts.batch });
  const no = (reason: string, extra: Partial<Affordable> = {}): Affordable => ({ ok: false, check, reason, ...extra });

  // A banned model is refused even when "ask before paid runs" is switched off.
  if (check.blocked) return no(check.blocked);
  if (!check.costs) return { ok: true, check, reason: "" };

  // A cap on the spend of one job. $0 means free engines only.
  if (typeof opts.capUsd === "number") {
    const what = opts.capFor ?? "this job";
    if (opts.capUsd <= 0) {
      return no(
        `Paid engines are switched off for ${what}. Pick a free engine, or raise the spending limit in Settings.`
      );
    }
    if (check.unknownPriceRows > 0) {
      return no(`The price of ${what} is unknown, so it cannot be kept under your limit. Pick a model with a known price.`);
    }
    if (check.totalUsd > opts.capUsd) {
      return no(
        `${what[0].toUpperCase()}${what.slice(1)} could cost up to $${check.totalUsd.toFixed(2)}, ` +
          `which is over your limit of $${opts.capUsd.toFixed(2)}. Raise the limit in Settings or pick a free engine.`
      );
    }
  }

  // The person has switched the question off in Settings.
  if (settings.confirmPaidRuns === false) return { ok: true, check, reason: "" };

  if (!asker) return no("Nobody is here to approve the cost, so nothing was spent.");
  if (asking) return no("A cost question is already open. Answer it first.");

  asking = true;
  try {
    const answer = await asker(check, opts);
    if (answer.kind === "approve") return { ok: true, check, reason: "" };
    if (answer.kind === "free") return no("Switched to a free engine.", { useFree: answer.engineId });
    return no("Cancelled. Nothing was spent.");
  } finally {
    asking = false;
  }
}
