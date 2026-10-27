/**
 * What a puppet may spend, and the worst case before it starts.
 *
 * A puppet on a paid engine can use far more pictures than the first build:
 * every part gets up to three tries, and "Check and fix" then redoes what is
 * not green for up to two more rounds, three tries each. The figure shown
 * before the run has to include all of that.
 *
 * Pure: no DOM, no network. The wiring is in PuppetMaker.tsx and pageIO.ts.
 */

/** Tries per part, and fix rounds — the same numbers maker.ts and the Check-and-fix button use. */
export const PART_TRIES = 3;
export const FIX_ROUNDS = 2;

/** Money approved for this puppet and money used so far. */
export interface PuppetSpend {
  approvedUsd: number;
  spentUsd: number;
}

export const newPuppetSpend = (): PuppetSpend => ({ approvedUsd: 0, spentUsd: 0 });

/** Pictures for the first build of one view: its parts, each with up to three tries. */
export const partPictures = (nParts: number, tries = PART_TRIES): number => nParts * tries;

/** Pictures for a view's own starting picture (up to three edits of the front picture). */
export const viewBasePictures = (tries = PART_TRIES): number => tries;

/**
 * Worst case for fixing: every one of `nParts` parts is not green in every
 * round, each round giving each part its full tries.
 */
export const fixPictures = (nParts: number, rounds = FIX_ROUNDS, tries = PART_TRIES): number => nParts * tries * rounds;

/**
 * Worst case for a whole puppet: the four faces, the front parts, every extra
 * view (its own base picture and parts), then the fix rounds over everything.
 */
export function wholePuppetPictures(o: {
  faces?: number;
  frontParts: number;
  views: number[]; // part counts, one entry per extra view
  withFix?: boolean;
}): number {
  const faces = o.faces ?? 4;
  const first = partPictures(o.frontParts) + o.views.reduce((n, v) => n + viewBasePictures() + partPictures(v), 0);
  const allParts = o.frontParts + o.views.reduce((n, v) => n + v, 0);
  return faces + first + (o.withFix === false ? 0 : fixPictures(allParts));
}

/** How much more may be spent before the approved amount is used up. */
export const headroomUsd = (s: PuppetSpend): number => Math.max(0, s.approvedUsd - s.spentUsd);

/** Dollars a puppet may still spend under the owner's per-puppet limit. */
export const capLeftUsd = (capUsd: number, s: PuppetSpend): number => Math.max(0, capUsd - s.spentUsd);
