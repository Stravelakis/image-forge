/**
 * Google batch jobs — the same pictures for half the money.
 *
 * You hand Google a pile of prompts at once, it works through them in the
 * background, and you come back later for the images. Google charges 50% of
 * the normal price for this. The trade is time: the target is 24 hours, though
 * in practice it is usually much quicker.
 *
 * Batch jobs speak the older `generateContent` shape, NOT the Interactions API
 * the live queue uses — verified against Google's batch docs on 2026-09-02.
 *
 * The job survives closing the app: its name is saved, and "check batch" picks
 * the results back up. Google keeps finished results for six weeks.
 */

import { readGeminiImage, findModel, b64ToBytes, mimeFromBytes } from "./engines.mjs";

const API = "https://generativelanguage.googleapis.com/v1beta";

const headers = (key) => ({ "Content-Type": "application/json", "x-goog-api-key": key.trim() });

/** One row as a batch-shaped generateContent request. */
export function batchRequestFor(row, { aspectRatio, imageSize = "1K" } = {}) {
  const prompt = row.negative_prompt ? `${row.prompt}\n\nAvoid: ${row.negative_prompt}` : row.prompt;
  return {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: {
        aspectRatio: aspectRatio || row.aspect_ratio || "1:1",
        imageSize,
      },
    },
  };
}

/**
 * Send rows off as one batch job.
 * Returns { name, model, count, submittedAt } — keep it, you need `name` later.
 */
export async function submitBatch(rows, { apiKey, modelId, imageSize = "1K", displayName } = {}) {
  const def = findModel(modelId);
  if (!def || def.engine !== "gemini") throw new Error(`${modelId} cannot be sent as a batch job.`);
  if (!rows.length) throw new Error("Nothing to send.");
  if (!apiKey?.trim()) throw new Error("No Google key — add one in Settings → Engines.");

  const requests = rows.map((row) => ({
    request: batchRequestFor(row, { imageSize }),
    metadata: { key: row.filename },
  }));

  const res = await fetch(`${API}/models/${def.apiId}:batchGenerateContent`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify({
      batch: {
        display_name: displayName || `image-forge-${new Date().toISOString().slice(0, 19)}`,
        input_config: { requests: { requests } },
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Google refused the batch (${res.status}) — ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  const name = json?.name;
  if (!name) throw new Error("Google accepted the batch but did not name it, so it cannot be tracked.");
  return {
    name,
    model: modelId,
    count: rows.length,
    filenames: rows.map((r) => r.filename),
    submittedAt: new Date().toISOString(),
  };
}

const STATE_LABELS = {
  JOB_STATE_PENDING: "waiting in Google's queue",
  JOB_STATE_RUNNING: "Google is drawing them now",
  JOB_STATE_SUCCEEDED: "finished",
  JOB_STATE_FAILED: "failed",
  JOB_STATE_CANCELLED: "cancelled",
  JOB_STATE_EXPIRED: "expired — results are older than six weeks",
};

/** Ask Google how a job is doing. */
export async function checkBatch(name, apiKey) {
  const res = await fetch(`${API}/${name}`, { headers: headers(apiKey) });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Could not check the batch (${res.status}) — ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  const state = json?.metadata?.state ?? json?.state ?? "JOB_STATE_PENDING";
  return {
    raw: json,
    state,
    done: json?.done === true || state === "JOB_STATE_SUCCEEDED",
    failed: ["JOB_STATE_FAILED", "JOB_STATE_CANCELLED", "JOB_STATE_EXPIRED"].includes(state),
    label: STATE_LABELS[state] || state,
  };
}

/**
 * Pull the finished images out of a completed job.
 * Returns [{ filename, bytes, mime }] plus any per-row failures.
 */
export function collectBatch(job, filenames = []) {
  const out = [];
  const failures = [];
  const responses =
    job?.response?.inlinedResponses?.inlinedResponses ??
    job?.response?.inlineResponses?.inlineResponses ??
    job?.response?.inlinedResponses ??
    [];

  responses.forEach((entry, i) => {
    const filename = entry?.metadata?.key ?? filenames[i] ?? `batch_${i + 1}.png`;
    if (entry?.error) {
      failures.push({ filename, error: entry.error.message || "Google could not draw this one." });
      return;
    }
    const b64 = readGeminiImage(entry?.response);
    if (!b64) {
      failures.push({ filename, error: "Came back without an image — the prompt may have been blocked." });
      return;
    }
    // This said "image/png" by hand. Google's image API only returns JPEG, so
    // every half-price picture was saved as a JPEG called PNG.
    const bytes = b64ToBytes(b64);
    out.push({ filename, bytes, mime: mimeFromBytes(bytes) || "image/jpeg" });
  });

  return { images: out, failures };
}

/** Plain-words summary for the console. */
export function describeJob(job) {
  const when = job.submittedAt ? new Date(job.submittedAt).toLocaleString("en-GB") : "unknown";
  return `${job.count} image${job.count === 1 ? "" : "s"} on ${job.model}, sent ${when}`;
}
