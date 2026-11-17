/**
 * Rows already sent to Google in a half-price batch are paid for and on their
 * way back. They must never be run again live (full price) or sent in a
 * second batch while that batch is still waiting.
 *
 * Before 17 Nov 2026 every "generating" row went back to "pending" when the
 * app started, batch rows included, and the next Forge press ran them again at
 * full price while the batch was billed too (review 16 Nov 2026, B1).
 *
 * Pure, for the tests.
 */
import type { BatchJob } from "./providers";

type RowLike = { filename: string; status: string };

/** Every filename that belongs to a batch still waiting at Google. */
export function filenamesInBatch(jobs: readonly Pick<BatchJob, "filenames">[] | undefined): Set<string> {
  const out = new Set<string>();
  for (const j of jobs ?? []) for (const f of j?.filenames ?? []) out.add(f);
  return out;
}

/** Is this row inside a batch that is still waiting? */
export function inWaitingBatch(row: Pick<RowLike, "filename">, held: Set<string>): boolean {
  return held.has(row.filename);
}

/**
 * On start: a row left "generating" by a closed app goes back to "pending",
 * unless it belongs to a waiting batch. Those stay "generating" until
 * "Check batches" collects them (or marks them failed).
 */
export function resumeRows<T extends RowLike>(rows: T[], jobs: readonly Pick<BatchJob, "filenames">[] | undefined): T[] {
  const held = filenamesInBatch(jobs);
  return rows.map((r) => (r.status === "generating" && !held.has(r.filename) ? ({ ...r, status: "pending" } as T) : r));
}

/** Leave out rows that belong to a waiting batch: they must not be run or sent again. */
export function withoutBatchRows<T extends Pick<RowLike, "filename">>(rows: T[], jobs: readonly Pick<BatchJob, "filenames">[] | undefined): T[] {
  const held = filenamesInBatch(jobs);
  return held.size ? rows.filter((r) => !held.has(r.filename)) : rows;
}
