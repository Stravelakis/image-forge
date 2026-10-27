/**
 * "Flow job file" — a plain list of picture instructions that the Flow Prompt
 * Feeder browser extension can read, so pictures can still be re-made by hand
 * in Google Flow after the Google credit has ended.
 *
 * THE SAME FORMAT in three places: here, Video Forge tools/puppets/flow-export.mjs
 * and the extension (flow/jobs.js). The format is written down in the
 * extension's README. Change it in all three or in none.
 *
 *   { "format": "flow-jobs", "version": 1, "made": "<ISO time>", "source": "...",
 *     "jobs": [ { "name", "prompt", "negative"?, "aspect"?, "style"?, "refs": [file names], "notes"? } ] }
 *
 * Pure functions: no files, no clock unless asked, nothing sent anywhere.
 */
import type { ManifestRow } from "../types";
import type { TryRecord } from "./puppet/maker";

export interface FlowJob {
  /** file name the picture is saved under, without the extension */
  name: string;
  prompt: string;
  negative?: string;
  /** "16:9", "1:1", "9:16" or "4:3" */
  aspect?: string;
  style?: string;
  /** file names of the pictures to attach by hand in Flow */
  refs: string[];
  notes?: string;
}

export interface FlowJobFile {
  format: "flow-jobs";
  version: 1;
  made: string;
  source: string;
  jobs: FlowJob[];
}

/** Letters, digits, dash, underscore and dot only — safe as a file name anywhere. */
export function safeJobName(raw: string): string {
  const s = String(raw ?? "")
    .replace(/\.[A-Za-z0-9]{2,4}$/, "") // a file extension is not part of the name
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 80);
  return s || "picture";
}

/** Two jobs never share a name: the second becomes name_2, the third name_3. */
function uniqueNames(jobs: FlowJob[]): FlowJob[] {
  const seen = new Map<string, number>();
  return jobs.map((j) => {
    const n = (seen.get(j.name) ?? 0) + 1;
    seen.set(j.name, n);
    return n === 1 ? j : { ...j, name: `${j.name}_${n}` };
  });
}

const baseName = (p: string) => String(p ?? "").split(/[\\/]/).pop() ?? "";

/** Drops empty optional fields so the file stays short and readable. */
function tidy(j: FlowJob): FlowJob {
  const out: FlowJob = { name: j.name, prompt: j.prompt.trim(), refs: j.refs };
  if (j.negative?.trim()) out.negative = j.negative.trim();
  if (j.aspect?.trim()) out.aspect = j.aspect.trim();
  if (j.style?.trim()) out.style = j.style.trim();
  if (j.notes?.trim()) out.notes = j.notes.trim();
  return out;
}

/** One job per manifest row that has a prompt. Order is kept. */
export function jobsFromRows(rows: ManifestRow[]): FlowJob[] {
  return uniqueNames(
    rows
      .filter((r) => (r.prompt ?? "").trim() !== "")
      .map((r) =>
        tidy({
          name: safeJobName(r.filename),
          prompt: r.prompt,
          negative: r.negative_prompt,
          aspect: r.aspect_ratio,
          style: r.style,
          refs: [],
          notes: r.note,
        }),
      ),
  );
}

export interface TryJobOptions {
  /** put in front of every name, for example the puppet's name */
  prefix?: string;
  /** reference pictures to attach (file names), the same for every try */
  refs?: string[];
  /** puppet pictures are square */
  aspect?: string;
}

/** One job per puppet try that has a prompt. Order is kept. */
export function jobsFromTries(tries: TryRecord[], opts: TryJobOptions = {}): FlowJob[] {
  const prefix = opts.prefix ? `${safeJobName(opts.prefix)}_` : "";
  const refs = (opts.refs ?? []).map(baseName).filter(Boolean);
  return uniqueNames(
    tries
      .filter((t) => (t.prompt ?? "").trim() !== "")
      .map((t) =>
        tidy({
          name: `${prefix}${safeJobName(`${t.part}_try${t.try}`)}`,
          prompt: t.prompt,
          negative: t.negative,
          aspect: opts.aspect ?? "1:1",
          refs,
          notes: `Made ${t.at}${t.engine ? ` with ${t.engine}` : ""}. Check: ${t.cut === "ok" ? t.why : t.cut}`,
        }),
      ),
  );
}

export interface ToFlowJobsInput {
  rows?: ManifestRow[];
  tries?: TryRecord[];
  tryOptions?: TryJobOptions;
  /** says where the list came from, for example "Image Forge manifest" */
  source?: string;
  /** the time written into the file; defaults to now */
  now?: Date;
}

/** The whole file, ready to be written as JSON. */
export function toFlowJobs(input: ToFlowJobsInput): FlowJobFile {
  const jobs = uniqueNames([...jobsFromRows(input.rows ?? []), ...jobsFromTries(input.tries ?? [], input.tryOptions)]);
  return {
    format: "flow-jobs",
    version: 1,
    made: (input.now ?? new Date()).toISOString(),
    source: input.source ?? "Image Forge",
    jobs,
  };
}
