export const SHARED_NAMES: string[];
export interface SharedEntry { value: string; at: number; from: string }
export interface Crypt { available: boolean; lock(t: string): Promise<Buffer>; unlock(b: Buffer): Promise<string> }
interface Opts { file?: string; crypt?: Crypt; now?: number }
export const dpapi: Crypt;
export function sharedKeysFile(env?: Record<string, string | undefined>): string;
export function readShared(opts?: Opts): Promise<Record<string, SharedEntry>>;
export function sharedValues(opts?: Opts): Promise<Record<string, string>>;
export function putShared(changes: Record<string, string | null>, from: string, opts?: Opts): Promise<string[]>;
