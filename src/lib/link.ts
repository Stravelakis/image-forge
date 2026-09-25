/**
 * The page's half of the link — see electron/link.mjs for the whole idea.
 *
 * The desktop app's main process watches a folder where another app on this
 * computer (first: BYOK Vid Creator) drops requests for pictures. This file
 * turns those requests into ordinary manifest rows, and reports back when
 * they are finished.
 *
 * In the browser (`npm run dev`) there is no main process, the endpoints do
 * not exist, and all of this quietly does nothing.
 */
import type { ManifestRow, AspectKey, Category } from "../types";

/** A request as the main process hands it over — already validated there. */
export interface LinkRequest {
  id: string;
  from: string;
  note: string;
  createdAt: string;
  state: "new" | "working";
  rows: {
    filename: string;
    prompt: string;
    negative_prompt: string;
    style: string;
    aspect_ratio: AspectKey;
    category: Category;
    model: string;
    seed?: number;
  }[];
}

const HEADERS = { "X-Forge-Link": "1" };

/** Requests waiting, or null when this is not the desktop app. */
export async function fetchRequests(): Promise<LinkRequest[] | null> {
  try {
    const res = await fetch("/link/requests", { headers: HEADERS });
    if (!res.ok) return null;
    const json = (await res.json()) as { requests?: LinkRequest[] };
    return Array.isArray(json.requests) ? json.requests : [];
  } catch {
    return null;
  }
}

export async function claimRequest(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/link/requests/${encodeURIComponent(id)}/claim`, { method: "POST", headers: HEADERS });
    return res.ok && ((await res.json()) as { ok?: boolean }).ok === true;
  } catch {
    return false;
  }
}

export async function sendPicture(id: string, filename: string, blob: Blob): Promise<boolean> {
  try {
    const res = await fetch(`/link/requests/${encodeURIComponent(id)}/files/${encodeURIComponent(filename)}`, {
      method: "PUT",
      headers: HEADERS,
      body: blob,
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function finishRequest(id: string, summary: RequestSummary): Promise<boolean> {
  try {
    const res = await fetch(`/link/requests/${encodeURIComponent(id)}/done`, {
      method: "POST",
      headers: { ...HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify(summary),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * A request's pictures as manifest rows, tagged so they can be found again.
 *
 * Filenames that already exist in the manifest get a suffix rather than
 * overwriting someone else's picture; the request is told the final name.
 */
export function rowsForRequest(req: LinkRequest, startId: number, taken: Set<string>): ManifestRow[] {
  let id = startId;
  return req.rows.map((r) => {
    let filename = r.filename;
    if (taken.has(filename)) {
      const dot = filename.lastIndexOf(".");
      const stem = filename.slice(0, dot);
      const ext = filename.slice(dot);
      let n = 2;
      while (taken.has(`${stem}_${n}${ext}`)) n++;
      filename = `${stem}_${n}${ext}`;
    }
    taken.add(filename);
    return {
      id: id++,
      filename,
      prompt: r.prompt,
      negative_prompt: r.negative_prompt || undefined,
      note: `asked for by ${req.from}`,
      category: r.category,
      item_id: "",
      shop_id: "",
      event_id: "",
      style: r.style,
      aspect_ratio: r.aspect_ratio,
      seed: r.seed ?? Math.floor(Math.random() * 98) + 1,
      model: r.model,
      status: "pending",
      error: "",
      generated_at: "",
      imported_attachment_id: "",
      request_id: req.id,
    };
  });
}

export interface RequestSummary {
  done: string[];
  failed: { filename: string; error: string }[];
}

/**
 * Is this request finished, and how did it go? null while any row is still
 * pending or being made. Skipped counts as failed: the other app asked for it
 * and did not get it.
 */
export function requestOutcome(rows: ManifestRow[], requestId: string): RequestSummary | null {
  const mine = rows.filter((r) => r.request_id === requestId);
  if (mine.length === 0) return null;
  if (mine.some((r) => r.status === "pending" || r.status === "generating")) return null;
  // A row parked on a rate limit will try again by itself; it is not over yet.
  if (mine.some((r) => r.status === "failed" && r.retry_at && Date.parse(r.retry_at) > Date.now())) return null;
  return {
    done: mine.filter((r) => r.status === "done" || r.status === "imported").map((r) => r.filename),
    failed: mine
      .filter((r) => r.status === "failed" || r.status === "skipped")
      .map((r) => ({ filename: r.filename, error: r.error || (r.status === "skipped" ? "skipped in Image Forge" : "failed") })),
  };
}
