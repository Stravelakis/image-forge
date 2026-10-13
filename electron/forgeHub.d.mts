export const HUB_VERSION: number;
export const MADE_KINDS: string[];
export const FORGES: string[];
export function madeFile(root: string): string;
export interface MadeEntry { v: number; app: string; kind: string; file: string; title?: string; language?: string; width?: number; height?: number; durationSec?: number; altText?: string; captions?: Record<string, string>; tags?: string[]; link?: string; madeWith?: string; aiMade: boolean; createdAt: string }
export function cleanMade(raw: unknown): { ok: true; entry: MadeEntry } | { ok: false; problem: string };
export function recordMade(root: string, raw: Partial<MadeEntry> & { app: string; kind: string; file: string }): { ok: true; entry: MadeEntry } | { ok: false; problem: string };
export function listMade(root: string, opts?: { kind?: string; app?: string; limit?: number }): MadeEntry[];
