/**
 * Proving the settings were really saved, and getting them back when they were not.
 *
 * This exists because of a real failure, and the failure was not the saving.
 * The desktop build served itself on `listen(0)` — a random port each launch.
 * The browser keys storage by ORIGIN, and the port is part of the origin, so
 * every launch opened a different, empty box. Keys typed on Tuesday were still
 * on disk under port 51334 while Wednesday's launch looked in 49820 and found
 * nothing. Nothing was failing to save; each launch looked somewhere else.
 *
 * That is fixed by the fixed port list in electron/main.js. What was missing
 * either way is any way to TELL: the app saved silently, so "saved" and "wrote
 * it into a box nobody will open again" looked identical.
 *
 * So, three things:
 *
 *   · every save is read back and compared, and says so out loud
 *   · a count of what is stored, which can be shown without ever showing a key
 *   · a backup file, because a browser storage box is not a safe place to keep
 *     the only copy of anything
 */

import type { ForgeSettings } from "./providers";
import { safeSet, type SaveResult } from "./storage";

export interface SaveProof {
  ok: boolean;
  /** when it happened, for showing "saved 20:14:03" */
  at: number;
  bytes: number;
  /** set when something went wrong, ready to show */
  problem?: string;
}

/**
 * What is stored, counted — never quoted.
 *
 * Keys are compared and displayed by COUNT alone. A fingerprint is enough to
 * answer "did my keys survive?" and it is never enough to leak one.
 */
export interface SettingsCensus {
  geminiFree: number;
  geminiPaid: number;
  openai: number;
  textProviders: number;
  cloudflare: boolean;
  pollinations: boolean;
  /** everything above added up, for a one-line "3 keys stored" */
  totalKeys: number;
}

export function censusOf(s: ForgeSettings): SettingsCensus {
  const filled = (pool?: { key: string }[]) => (pool ?? []).filter((k) => k.key.trim()).length;
  const geminiFree = filled(s.geminiKeys);
  const geminiPaid = filled(s.geminiPaidKeys);
  const openai = filled(s.openaiKeys);
  const textProviders = (s.textProviders ?? []).filter((p) => p.key.trim()).length;
  const cloudflare = Boolean(s.cloudflare?.accountId.trim() && s.cloudflare?.token.trim());
  const pollinations = Boolean(s.pollinationsToken?.trim());
  return {
    geminiFree,
    geminiPaid,
    openai,
    textProviders,
    cloudflare,
    pollinations,
    totalKeys: geminiFree + geminiPaid + openai + textProviders + (cloudflare ? 1 : 0) + (pollinations ? 1 : 0),
  };
}

/** One line a person can read: "4 keys stored". */
export const describeCensus = (c: SettingsCensus): string =>
  c.totalKeys === 0 ? "no keys stored yet" : `${c.totalKeys} key${c.totalKeys === 1 ? "" : "s"} stored`;

/**
 * Save, then read it back and check it is really there.
 *
 * A bare setItem can fail in ways that throw nothing useful — a quota that
 * silently truncates, a private window that accepts the write and discards it
 * on close, an extension intercepting the call. Reading back is the only
 * answer that means anything, and it costs microseconds.
 */
export function saveSettingsVerified(key: string, settings: ForgeSettings): SaveProof {
  const json = JSON.stringify(settings);
  const res: SaveResult = safeSet(key, json);
  if (!res.ok) return { ok: false, at: Date.now(), bytes: res.bytes, problem: res.message };

  let readBack: string | null = null;
  try {
    readBack = localStorage.getItem(key);
  } catch {
    return {
      ok: false,
      at: Date.now(),
      bytes: res.bytes,
      problem: "The browser accepted the save and then refused to read it back. Back up to a file now.",
    };
  }
  if (readBack !== json) {
    return {
      ok: false,
      at: Date.now(),
      bytes: res.bytes,
      problem:
        "What was read back does not match what was written, so the save did not stick. " +
        "Back up to a file before closing this window.",
    };
  }
  return { ok: true, at: Date.now(), bytes: res.bytes };
}

/** The shape of a backup file, so a future version can tell what it is holding. */
export interface SettingsBackup {
  kind: "image-forge-settings";
  version: 1;
  savedAt: string;
  settings: ForgeSettings;
}

export const BACKUP_KIND = "image-forge-settings";

export function buildBackup(settings: ForgeSettings): string {
  const backup: SettingsBackup = {
    kind: BACKUP_KIND,
    version: 1,
    savedAt: new Date().toISOString(),
    settings,
  };
  return JSON.stringify(backup, null, 2);
}

/**
 * Read a backup file back.
 *
 * Deliberately strict about the wrapper and forgiving about the contents: a
 * backup from an older version is missing fields a newer one has, and
 * normalizeSettings fills those in. Refusing it would make the backup useless
 * at exactly the moment it is needed.
 */
export function readBackup(text: string): { ok: true; settings: Partial<ForgeSettings>; savedAt: string } | { ok: false; problem: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, problem: "That file is not a backup — it is not even JSON." };
  }
  const b = parsed as Partial<SettingsBackup>;
  if (b?.kind !== BACKUP_KIND) {
    return { ok: false, problem: "That is a JSON file, but not an Image Forge settings backup." };
  }
  if (!b.settings || typeof b.settings !== "object") {
    return { ok: false, problem: "That backup has no settings inside it." };
  }
  return { ok: true, settings: b.settings as Partial<ForgeSettings>, savedAt: String(b.savedAt ?? "") };
}

/** A filename that sorts by date and says what it is. */
export const backupFilename = (d = new Date()): string =>
  `image-forge-settings-${d.toISOString().slice(0, 10)}.json`;
