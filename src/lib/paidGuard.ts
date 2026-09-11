/**
 * Nothing costs money without being asked first.
 *
 * The forge prefers free engines everywhere: text, vision and code go through
 * Mistral and Codestral, pictures through your own machine or Cloudflare. A
 * paid engine is only ever reached when you say so, for that run.
 *
 * When a run would spend money this works out how much, which credit it comes
 * out of, and when that credit runs out — so the question you are asked is a
 * real one, not a shrug.
 */

import type { ApiKey, ForgeSettings } from "./providers";
import { estimateCost, formatUsd, resolveRoute } from "./providers";
import type { ManifestRow } from "../types";

/** Engines that never cost anything. */
export const FREE_ENGINES = new Set(["local", "simulated", "cloudflare", "pollinations"]);

export interface CreditNote {
  /** what you called this credit, e.g. "tier 1 voucher" */
  label: string;
  /** ISO date the credit expires, or "" when you have not said */
  endsOn: string;
  /** days left, or null when there is no date */
  daysLeft: number | null;
  expired: boolean;
  /** true when it runs out within a fortnight */
  endingSoon: boolean;
}

const DAY = 86_400_000;

/** Read the credit note off a key, if it has one. */
export function creditNoteFor(key: Pick<ApiKey, "label"> & { creditEndsOn?: string; creditLabel?: string }): CreditNote {
  const endsOn = (key.creditEndsOn ?? "").trim();
  if (!endsOn) {
    return { label: key.creditLabel || key.label, endsOn: "", daysLeft: null, expired: false, endingSoon: false };
  }
  const end = Date.parse(endsOn + "T23:59:59");
  const daysLeft = Number.isFinite(end) ? Math.ceil((end - Date.now()) / DAY) : null;
  return {
    label: key.creditLabel || key.label,
    endsOn,
    daysLeft,
    expired: daysLeft !== null && daysLeft < 0,
    endingSoon: daysLeft !== null && daysLeft >= 0 && daysLeft <= 14,
  };
}

export interface PaidRunCheck {
  /** true when this run would spend money */
  costs: boolean;
  /** the engine that would be used */
  engine: string;
  model: string;
  /** how many rows would actually be billed — NOT the size of the queue */
  rows: number;
  totalUsd: number;
  /** the credit it would come out of, when we know */
  credit: CreditNote | null;
  /** everything free you could use instead */
  freeAlternatives: { id: string; label: string }[];
  /** one line, ready to show */
  headline: string;
  /** the warning about the credit, or null */
  creditWarning: string | null;
}

/** What free engines are set up and could take this job instead? */
export function freeAlternativesFor(s: ForgeSettings): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  if (s.localBase.trim() && s.localModel.trim()) out.push({ id: "local", label: `your own machine (${s.localModel})` });
  if (s.cloudflare.accountId.trim() && s.cloudflare.token.trim())
    out.push({ id: "cloudflare", label: "Cloudflare — free, about 690 a day" });
  if (s.pollinationsToken.trim()) out.push({ id: "pollinations", label: "Pollinations — free, a little slow" });
  return out;
}

/**
 * Would running these rows spend money, and if so what should we say about it?
 */
export function checkPaidRun(rows: ManifestRow[], s: ForgeSettings, opts: { batch?: boolean } = {}): PaidRunCheck {
  /*
   * Which rows actually cost money — one route per row, not one for the batch.
   *
   * This used to resolve the route from rows[0] and then describe rows.length
   * of them. A queue holding two Google rows and twenty free ones was
   * announced as "22 pictures on Nano Banana 2 Lite", eleven times the real
   * number, while the total underneath was correct. Overstating a bill is as
   * corrosive as understating one: the whole point of this dialog is that the
   * number in it can be trusted, and a run that is mostly free should say so.
   *
   * The `model` column routes each row on its own, which is the feature that
   * lets one batch mix free and paid — so the check has to work the same way.
   */
  const paidRows = rows.filter((r) => {
    const route = resolveRoute(r as never, s);
    if (FREE_ENGINES.has(String(route.engine))) return false;
    return estimateCost([r] as never, s, opts).total > 0;
  });

  const { total } = estimateCost(rows as never, s, opts);
  const costs = paidRows.length > 0 && total > 0;

  // Describe the engine that will actually be billed, not whichever row
  // happened to sort first.
  const route = resolveRoute((paidRows[0] ?? rows[0] ?? { prompt: "", aspect_ratio: "1:1", seed: 1, model: "" }) as never, s);

  /*
   * Which credit to warn about.
   *
   * Free keys are tried first, but they are the ones without a date on them —
   * so naming only the first key would stay silent about the credit that is
   * actually going to be spent. Instead: of every key that could take this job,
   * show the dated one that runs out soonest. That is the one worth knowing.
   */
  const usable = [...(s.geminiKeys ?? []), ...(s.geminiPaidKeys ?? [])].filter(
    (k) => k.key.trim() && k.exhaustedUntil <= Date.now()
  );
  const dated = usable
    .map((k) => creditNoteFor(k))
    .filter((n) => n.endsOn)
    .sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0));
  const credit = route.engine === "gemini" ? (dated[0] ?? (usable[0] ? creditNoteFor(usable[0]) : null)) : null;

  // Per-picture is the price of a PAID picture. Averaging over the free ones
  // too would print a number no row will ever be charged.
  const per = paidRows.length ? total / paidRows.length : 0;
  const free = rows.length - paidRows.length;
  const label = route.def?.label ?? route.apiModel;
  const n = paidRows.length;

  let headline: string;
  if (!costs) {
    headline = "This run is free.";
  } else {
    const priced =
      `${n} picture${n === 1 ? "" : "s"} on ${label} — about ${formatUsd(total)}` +
      `${n > 1 ? ` (${formatUsd(per)} each)` : ""}${opts.batch ? ", at the half-price batch rate" : ""}.`;
    headline = free > 0 ? `${priced} The other ${free} ${free === 1 ? "is" : "are"} free.` : priced;
  }

  let creditWarning: string | null = null;
  if (credit?.expired) {
    creditWarning = `Careful — “${credit.label}” credit ran out on ${credit.endsOn}. This will either fail or bill you another way.`;
  } else if (credit?.endingSoon) {
    creditWarning = `“${credit.label}” credit ends on ${credit.endsOn} — ${credit.daysLeft} day${credit.daysLeft === 1 ? "" : "s"} left.`;
  } else if (credit?.endsOn) {
    creditWarning = `Coming out of “${credit.label}”, which lasts until ${credit.endsOn} (${credit.daysLeft} days).`;
  } else if (costs) {
    creditWarning = "You have not said when this credit expires — you can add a date beside the key in Settings.";
  }

  return {
    costs,
    engine: String(route.engine),
    model: label,
    // The rows that would be BILLED. The dialog counts what you are paying
    // for; the free rows in the same queue are named in the headline.
    rows: paidRows.length,
    totalUsd: total,
    credit,
    freeAlternatives: freeAlternativesFor(s),
    headline,
    creditWarning,
  };
}

/**
 * Google gives no way to read a prepay balance from an API key — it is shown
 * only in AI Studio, under Dashboard → Usage and Limits. So the end date is
 * typed in by hand, and this is the honest note about that.
 */
export const WHY_MANUAL_DATE =
  "Google does not publish a balance or expiry you can read from a key — it only appears in AI Studio. " +
  "So the date is yours to type in, and the forge simply reminds you.";
