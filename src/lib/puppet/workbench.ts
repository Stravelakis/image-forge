/**
 * THE REVIEW WORKBENCH, the thinking part (#11, Ak, 26 Oct 2026).
 *
 * Pure: grouping, levels, filters, counts, the "submit this page" and "accept
 * this group" changes to the puppet's record, the zoom boxes and the keyboard.
 * The screen (components/PuppetWorkbench.tsx) only draws what this says.
 *
 * Rules that live here, because they were said out loud:
 *  - "not checked" is never green: a part is green only when its last try's
 *    checkers said yes;
 *  - accepting is per group, submitting is per page (= one group's parts);
 *  - your marks are kept as they are (✓ / ✗ / unmarked) — they become the
 *    answer key the picture checks are tuned against.
 */
import type { PanelLevel } from "./quality";
import type { TryRecord } from "./maker";
import { PUPPET_PARTS } from "./recipe";
import type { MarkRegion, PartMarks, PartReview, WorkshopMeta } from "./workshop";

/* ---------------- groups ---------------- */

export interface GroupDef {
  id: string;
  label: string;
  /** hover help, plain words */
  tip: string;
}
export const GROUPS: GroupDef[] = [
  { id: "mouths", label: "Mouths", tip: "The mouth shapes used when the puppet talks. Each one should look like the same mouth, just opened differently." },
  { id: "lids", label: "Eyes / lids", tip: "The eyes closed, half shut and wide. They make the puppet blink and look sleepy or surprised." },
  { id: "brows", label: "Brows", tip: "The eyebrow looks: happy, firm, surprised, worried, puzzled." },
  { id: "arms", label: "Arms", tip: "The arm poses: wave, point, shrug, explain. Each arm should be there once, with its hand." },
  { id: "side", label: "3/4 view", tip: "The same puppet turned a little sideways, so two puppets can talk to each other." },
  { id: "sit", label: "Full body", tip: "The sitting puppet, whole body." },
];

export type PartKind = "mouth" | "lid" | "brow" | "arms";
const KIND_GROUP: Record<PartKind, string> = { mouth: "mouths", lid: "lids", brow: "brows", arms: "arms" };

/** "side_mouth_AH" → "mouth_AH" */
export const baseId = (id: string) => id.replace(/^(side|sit)_/, "");
export const viewOf = (id: string): "side" | "sit" | null => (id.startsWith("side_") ? "side" : id.startsWith("sit_") ? "sit" : null);

export function kindOf(id: string): PartKind | null {
  const b = baseId(id);
  const known = PUPPET_PARTS.find((p) => p.id === b);
  if (known) return known.kind;
  if (b.startsWith("mouth_")) return "mouth";
  if (b.startsWith("lid_")) return "lid";
  if (b.startsWith("brow_")) return "brow";
  if (b.startsWith("arms_")) return "arms";
  return null;
}

/** Which group (page) a part is on. Side and sitting views are their own groups. */
export function groupOf(id: string): string {
  const v = viewOf(id);
  if (v) return v;
  const k = kindOf(id);
  return k ? KIND_GROUP[k] : "arms";
}

/* ---------------- levels ---------------- */

/** green / amber / red / grey ("not checked"). */
export type Level = PanelLevel | null;
export const LEVEL_WORD: Record<"yes" | "maybe" | "no" | "none", string> = { yes: "yes", maybe: "maybe no", no: "no", none: "not checked" };
export const levelKey = (l: Level): "yes" | "maybe" | "no" | "none" => l ?? "none";

/** The tries of one part, oldest first. */
export const triesFor = (tries: TryRecord[], id: string): TryRecord[] =>
  tries.filter((t) => t.part === id).sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.try - b.try));

/**
 * What the checkers said about the part as it stands: the last try's level.
 * No try on record, or no checker could look → not checked (grey), never green.
 * A part the maker marked missing is "no"; one it marked unsure can't be better
 * than "maybe no", whatever an older try said.
 */
export function partLevel(report: Pick<PartReview, "status"> | undefined, own: TryRecord[]): Level {
  if (report?.status === "missing") return "no";
  const last = own[own.length - 1];
  const lvl: Level = last?.level ?? null;
  if (report?.status === "unsure" && lvl === "yes") return "maybe";
  return lvl;
}

/* ---------------- rows, filters, counts ---------------- */

export interface Row {
  id: string;
  label: string;
  group: string;
  level: Level;
  status: PartReview["status"] | "none";
  approved: boolean;
  redo: boolean;
  tries: number;
  marks?: PartMarks;
}

export function rowsOf(meta: WorkshopMeta, tries: TryRecord[]): Row[] {
  const ids = new Set<string>([...meta.reports.map((r) => r.id), ...Object.keys(meta.boxes ?? {}).filter((id) => kindOf(id) !== null)]);
  const out: Row[] = [];
  for (const id of ids) {
    const rep = meta.reports.find((r) => r.id === id);
    const own = triesFor(tries, id);
    out.push({
      id,
      label: rep?.label ?? id,
      group: groupOf(id),
      level: partLevel(rep, own),
      status: rep?.status ?? "none",
      approved: !!rep?.approved,
      redo: !!rep?.redo && !rep?.approved,
      tries: Math.max(own.length, rep?.tries ?? 0),
      marks: meta.marks?.[id],
    });
  }
  const order = (id: string) => PUPPET_PARTS.findIndex((p) => p.id === baseId(id));
  return out.sort((a, b) => GROUPS.findIndex((g) => g.id === a.group) - GROUPS.findIndex((g) => g.id === b.group) || order(a.id) - order(b.id) || a.id.localeCompare(b.id));
}

export type Filter = "all" | "needs" | "maybe" | "no" | "accepted";
export const FILTERS: { id: Filter; label: string; tip: string }[] = [
  { id: "all", label: "All", tip: "Every picture, whatever the checkers said." },
  { id: "needs", label: "Needs you", tip: "Pictures you have not accepted and not sent back to be remade. These are the ones waiting for your eyes." },
  { id: "maybe", label: "Maybe no", tip: "The checkers disagreed or could not tell. Look at these closely." },
  { id: "no", label: "No", tip: "The checkers found a real fault, or no picture was made." },
  { id: "accepted", label: "Accepted", tip: "Pictures you said are right." },
];

export function matchesFilter(r: Row, f: Filter): boolean {
  switch (f) {
    case "all": return true;
    case "accepted": return r.approved;
    case "needs": return !r.approved && !r.redo;
    case "maybe": return !r.approved && r.level === "maybe";
    case "no": return !r.approved && r.level === "no";
  }
}
export const filterRows = (rows: Row[], f: Filter): Row[] => rows.filter((r) => matchesFilter(r, f));
export const filterCounts = (rows: Row[]): Record<Filter, number> =>
  Object.fromEntries(FILTERS.map((f) => [f.id, filterRows(rows, f.id).length])) as Record<Filter, number>;

export interface GroupInfo extends GroupDef {
  total: number;
  accepted: number;
  /** after the current filter */
  shown: number;
  /** every part accepted, or the whole group accepted at once */
  done: boolean;
}
export function groupInfos(rows: Row[], filter: Filter): GroupInfo[] {
  return GROUPS.map((g) => {
    const mine = rows.filter((r) => r.group === g.id);
    const accepted = mine.filter((r) => r.approved).length;
    return { ...g, total: mine.length, accepted, shown: filterRows(mine, filter).length, done: mine.length > 0 && accepted === mine.length };
  }).filter((g) => g.total > 0);
}

/* ---------------- marks ---------------- */

export const REGIONS: { id: MarkRegion; label: string; tip: string }[] = [
  { id: "mouth", label: "mouth", tip: "Is the mouth drawn right: shape, lips, teeth, tongue?" },
  { id: "eyes", label: "eyes", tip: "Are the eyes right: how many, where they look, open or shut as asked?" },
  { id: "brows", label: "brows", tip: "Are the eyebrows right and the same as the original where they should not change?" },
  { id: "ears", label: "ears", tip: "Are the ears the same as the original, none lost or doubled?" },
  { id: "outline", label: "outline", tip: "Is the outline of the head and body clean, with no smear or extra edge?" },
  { id: "colours", label: "colours", tip: "Do the skin, fur and clothes keep the same colours as the original?" },
  { id: "background", label: "background", tip: "Is the flat background colour still flat, with none of it on the character?" },
  { id: "other", label: "other", tip: "Anything else wrong or right that does not fit the others. Say what in the note." },
];

export type RegionMarks = PartMarks["regions"];

/** Click ✓ or ✗: set it, or clear it when it was already that. Three states: unmarked / ok / bad. */
export function toggleMark(regions: RegionMarks, region: MarkRegion, want: "ok" | "bad"): RegionMarks {
  const next = { ...regions };
  if (next[region] === want) delete next[region];
  else next[region] = want;
  return next;
}
export const badRegions = (regions: RegionMarks): MarkRegion[] => REGIONS.filter((r) => regions[r.id] === "bad").map((r) => r.id);
export const markedCount = (regions: RegionMarks) => Object.keys(regions).length;

/* ---------------- drafts and submitting the page ---------------- */

/** What you have set on a picture on this page but not sent yet. */
export interface Draft {
  regions: RegionMarks;
  note: string;
  /** "make this one again" ticked */
  remake: boolean;
}

export const draftOf = (meta: WorkshopMeta, id: string): Draft => {
  const rep = meta.reports.find((r) => r.id === id);
  const m = meta.marks?.[id];
  return { regions: { ...(m?.regions ?? {}) }, note: m?.note ?? rep?.note ?? "", remake: !!rep?.redo && !rep?.approved };
};

const sameRegions = (a: RegionMarks, b: RegionMarks) => REGIONS.every((r) => a[r.id] === b[r.id]);
export const isDirty = (meta: WorkshopMeta, id: string, d: Draft | undefined): boolean => {
  if (!d) return false;
  const s = draftOf(meta, id);
  return !sameRegions(s.regions, d.regions) || s.note.trim() !== d.note.trim() || s.remake !== d.remake;
};
export const dirtyIds = (meta: WorkshopMeta, drafts: Record<string, Draft>, ids: string[]) => ids.filter((id) => isDirty(meta, id, drafts[id]));

/** A part goes back for remaking when you ticked it, or marked any region ✗. */
export const wantsRedo = (d: Draft) => d.remake || badRegions(d.regions).length > 0;

/** The note the next try is given: yours, plus the places you marked ✗. */
export function redoNote(d: Draft): string | undefined {
  const bad = badRegions(d.regions);
  const parts = [d.note.trim(), bad.length ? `Problem areas: ${bad.join(", ")}.` : ""].filter(Boolean);
  return parts.length ? parts.join(" ") : undefined;
}

const statusOf = (m: WorkshopMeta, reports: PartReview[]): WorkshopMeta["status"] =>
  m.status === "making" ? "making" : reports.every((r) => r.approved || r.status === "ok") ? "approved" : "review";

/**
 * SUBMIT CHANGES FOR THIS PAGE: every picture in `ids` with a draft gets its
 * marks and note saved, and goes back for remaking (the same redo flag the old
 * review uses, so "Remake all marked" finds it) when you ticked it or marked
 * any region ✗. A picture you sent back is no longer accepted.
 */
export function submitPage(meta: WorkshopMeta, drafts: Record<string, Draft>, ids: string[], at: string): WorkshopMeta {
  const marks = { ...(meta.marks ?? {}) };
  let reports = meta.reports;
  for (const id of ids) {
    const d = drafts[id];
    if (!d || !isDirty(meta, id, d)) continue;
    const note = d.note.trim();
    if (markedCount(d.regions) === 0 && !note) delete marks[id];
    else marks[id] = { regions: { ...d.regions }, ...(note ? { note } : {}), at };
    const redo = wantsRedo(d);
    reports = reports.map((r) =>
      r.id !== id
        ? r
        : { ...r, redo: redo || undefined, approved: redo ? false : r.approved, note: redo ? redoNote(d) : note || undefined }
    );
  }
  const acceptedGroups = (meta.acceptedGroups ?? []).filter((g) => !ids.some((id) => groupOf(id) === g && reports.find((r) => r.id === id)?.redo));
  return { ...meta, marks, reports, acceptedGroups, status: statusOf(meta, reports) };
}

/** Parts that should make you stop before accepting a group: red, or marked wrong, or ticked for remake. */
export function acceptBlockers(rows: Row[], drafts: Record<string, Draft>, group: string): Row[] {
  return rows.filter((r) => r.group === group && !r.approved).filter((r) => {
    const d = drafts[r.id];
    return r.level === "no" || r.status === "missing" || (d ? wantsRedo(d) : r.redo || Object.values(r.marks?.regions ?? {}).includes("bad"));
  });
}

/** ACCEPT A GROUP: all its parts are approved together, and any remake request on them is dropped. */
export function acceptGroup(meta: WorkshopMeta, group: string): WorkshopMeta {
  const reports = meta.reports.map((r) => (groupOf(r.id) === group ? { ...r, approved: true, redo: undefined } : r));
  return { ...meta, reports, acceptedGroups: [...new Set([...(meta.acceptedGroups ?? []), group])], status: statusOf(meta, reports) };
}
export function unacceptGroup(meta: WorkshopMeta, group: string): WorkshopMeta {
  const reports = meta.reports.map((r) => (groupOf(r.id) === group ? { ...r, approved: false } : r));
  return { ...meta, reports, acceptedGroups: (meta.acceptedGroups ?? []).filter((g) => g !== group), status: statusOf(meta, reports) };
}

/* ---------------- zoom box ---------------- */

export interface BoxLike { x: number; y: number; w: number; h: number }

/** The part's box with some of the picture around it, kept inside the picture. */
export function paddedBox(box: BoxLike, imgW: number, imgH: number, pad = 0.25): BoxLike {
  const px = Math.round(box.w * pad), py = Math.round(box.h * pad);
  const x = Math.max(0, box.x - px), y = Math.max(0, box.y - py);
  const x2 = Math.min(imgW, box.x + box.w + px), y2 = Math.min(imgH, box.y + box.h + py);
  return { x, y, w: Math.max(1, x2 - x), h: Math.max(1, y2 - y) };
}
/** One box that holds all the boxes — the contact sheet shows every part through it, at one scale. */
export function unionBox(boxes: BoxLike[]): BoxLike | null {
  if (!boxes.length) return null;
  const x = Math.min(...boxes.map((b) => b.x)), y = Math.min(...boxes.map((b) => b.y));
  const x2 = Math.max(...boxes.map((b) => b.x + b.w)), y2 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x, y, w: x2 - x, h: y2 - y };
}

/* ---------------- the keyboard ---------------- */

export interface Focus {
  /** index into the pictures on the page */
  part: number;
  /** index into REGIONS */
  region: number;
}
export type KeyAction =
  | { type: "move"; part?: number; region?: number }
  | { type: "mark"; mark: "ok" | "bad" | "clear" }
  | { type: "submit" }
  | { type: "none" };

/** What a key does. Arrows move, y / n mark the focused region ✓ / ✗, 0 clears it, Enter submits the page. */
export function keyAction(key: string, mods: { ctrl?: boolean; meta?: boolean; alt?: boolean } = {}): KeyAction {
  if (mods.alt) return { type: "none" };
  if (key === "Enter") return { type: "submit" };
  if (mods.ctrl || mods.meta) return { type: "none" };
  switch (key) {
    case "ArrowLeft": return { type: "move", part: -1 };
    case "ArrowRight": return { type: "move", part: 1 };
    case "ArrowUp": return { type: "move", region: -1 };
    case "ArrowDown": return { type: "move", region: 1 };
    case "y": case "Y": return { type: "mark", mark: "ok" };
    case "n": case "N": return { type: "mark", mark: "bad" };
    case "0": case "Backspace": case "Delete": return { type: "mark", mark: "clear" };
    default: return { type: "none" };
  }
}

/** The new focus after a move: stays inside the page (no wrapping, so the end is felt). */
export function moveFocus(f: Focus, a: Extract<KeyAction, { type: "move" }>, parts: number): Focus {
  const clamp = (n: number, max: number) => Math.min(Math.max(0, n), Math.max(0, max - 1));
  return { part: clamp(f.part + (a.part ?? 0), parts), region: clamp(f.region + (a.region ?? 0), REGIONS.length) };
}

/** Typing in a box must not be taken for a shortcut. */
export const typingTarget = (el: { tagName?: string; isContentEditable?: boolean } | null): boolean =>
  !!el && (el.isContentEditable === true || ["INPUT", "TEXTAREA", "SELECT"].includes((el.tagName ?? "").toUpperCase()));
