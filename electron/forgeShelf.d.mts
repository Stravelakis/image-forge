export const SHELF_VERSION: number;
export interface ShelfOrder { id: string; kind: "puppet"; to?: string; from: string; name: string; description: string; style: string; framing: "head" | "waist" | "full"; auto: boolean; inspirations: string[]; createdAt: string }
export interface ShelfPuppet { slug: string; name: string; rigPath: string; basePath: string; framing: "head" | "waist" | "full"; madeAt: string }
export function shelfRoot(env?: Record<string, string | undefined>): string;
export function validateOrder(raw: unknown): { ok: true; order: ShelfOrder } | { ok: false; problem: string };
export function placeOrder(root: string, order: Partial<ShelfOrder> & { id: string; description: string }, pictures?: Buffer[]): { ok: true; order: ShelfOrder } | { ok: false; problem: string };
export function openOrders(root: string): ShelfOrder[];
export function orderPicture(root: string, id: string, file: string): Buffer | null;
export function finishOrder(root: string, id: string, result: { slug?: string; problem?: string }): { ok: boolean; problem?: string };
export function orderResult(root: string, id: string): { id: string; slug: string | null; problem: string | null; finishedAt: string } | null;
export function savePuppetFile(root: string, slug: string, file: string, bytes: Buffer): { ok: boolean; problem?: string; path?: string };
export function listPuppets(root: string): ShelfPuppet[];
export function puppetFile(root: string, slug: string, file: string): Buffer | null;
export function removePuppet(root: string, slug: string, now?: Date): { ok: boolean; problem?: string; gone?: boolean; to?: string };
