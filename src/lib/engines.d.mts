/** Type surface for the shared, DOM-free engine module (engines.mjs). */

export type ProviderId = "simulated" | "local" | "pollinations" | "ovh" | "gemini" | "cloudflare" | "openai";

export interface ApiKey {
  id: string;
  label: string;
  key: string;
  /** epoch ms until which this key is benched after a 429; 0 = healthy */
  exhaustedUntil: number;
  /** ISO date this key's credit runs out — typed in by you, since Google publishes no way to read it */
  creditEndsOn?: string;
  /** what you call this credit, e.g. "tier 1 voucher" */
  creditLabel?: string;
}

export interface ModelDef {
  id: string;
  label: string;
  engine: ProviderId;
  apiId: string;
  /** US dollars per image; 0 means the engine is free */
  priceUsd: number;
  /** US dollars per image in a half-price batch job, or null when unsupported */
  batchPriceUsd: number | null;
  needsKey: boolean;
  free: string;
  allowance: string;
  note: string;
  /** ISO date the provider switches it off, or null */
  retiresOn: string | null;
  defaultCooldownH: number;
}

export type TextQuality = "poor" | "fair" | "good";

export interface ModelTraits {
  textQuality: TextQuality;
  promptStyle: string;
}

export interface RetiredModelInfo {
  replacedBy: string;
  retiredOn: string;
}

/** The slice of settings the engines actually read. */
export interface EngineSettings {
  provider: ProviderId;
  pollinationsModel: string;
  pollinationsToken: string;
  pollinationsReferrer: string;
  geminiKeys: ApiKey[];
  geminiPaidKeys: ApiKey[];
  geminiModel: string;
  geminiImageSize: string;
  cloudflare: { accountId: string; token: string };
  cloudflareSteps: number;
  openaiKeys: ApiKey[];
  openaiBase: string;
  openaiModel: string;
  localBase: string;
  localModel: string;
  localKey: string;
  localTextQuality: TextQuality;
  suppressTextOnWeakModels: boolean;
}

/** The slice of a manifest row the engines actually read. */
export interface EngineRow {
  prompt: string;
  negative_prompt?: string;
  aspect_ratio: string;
  seed: number;
  model: string;
}

export interface EngineBytes {
  bytes: Uint8Array<ArrayBuffer>;
  mime: string;
}

export type Exhaust = (pool: "geminiKeys" | "geminiPaidKeys" | "openaiKeys", keyId: string, untilMs: number) => void;

export declare const DIMS: Record<string, { w: number; h: number }>;
export declare const MODELS: ModelDef[];
export declare const RETIRED_MODELS: Record<string, RetiredModelInfo>;
export declare function findModel(id: string): ModelDef | undefined;

export declare function priceFor(modelId: string, opts?: { batch?: boolean }): number | null;
export declare function estimateCost(
  rows: EngineRow[],
  settings: EngineSettings,
  opts?: { batch?: boolean }
): { total: number; unknown: number; count: number };
export declare function formatUsd(n: number): string;
export declare function explainFailure(status: number, body: string, engine: string): string;

export declare class RateLimitError extends Error {
  retryAt: number;
  keyLabel: string;
  constructor(message: string, retryAt: number, keyLabel: string);
}

export declare class RetiredModelError extends Error {
  modelId: string;
  replacedBy: string;
  constructor(modelId: string, info: RetiredModelInfo);
}

export declare function resolveRoute(
  row: EngineRow,
  s: EngineSettings
): { engine: ProviderId | "retired"; apiModel: string; def?: ModelDef };

export declare const MODEL_TRAITS: Record<string, ModelTraits>;
export declare const NO_TEXT_NEGATIVE: string;
export declare function textQualityFor(row: EngineRow, s: EngineSettings): TextQuality;
export declare function promptStyleFor(row: EngineRow, s: EngineSettings): string | null;
export declare function suppressTextIfWeak<T extends EngineRow>(row: T, s: EngineSettings): T;

export declare function inBrowser(): boolean;
export declare const CLOUDFLARE_BASE: string;
export declare function cloudflareUrl(path: string): string;

export declare function b64ToBytes(b64: string): Uint8Array<ArrayBuffer>;
export declare function readGeminiImage(json: unknown): string | null;
export declare function geminiRequestBody(
  row: EngineRow,
  apiModel: string,
  opts?: { imageSize?: string }
): Record<string, unknown>;

export interface GenerateOptions {
  /** base64 PNG data (no data: prefix) for the model to work from */
  refImages?: string[];
}

export declare function generateBytes(
  row: EngineRow,
  s: EngineSettings,
  signal: AbortSignal | undefined,
  exhaust: Exhaust,
  cooldownMs: number,
  opts?: GenerateOptions
): Promise<EngineBytes>;

export const OVH_URL: string;

export declare const KNOWN_EXTENSIONS: readonly string[];
export declare function extensionForMime(mime: string): string;
export declare function extensionOf(name: string): string;
export declare function nameForMime(name: string, mime: string): string;
export declare function mimeFromBytes(bytes: Uint8Array | null | undefined): string;
export declare function withStyleBlock(prompt: string, block: string, engine: string): string;
export declare function withSuffix(name: string, suffix: string): string;
export declare function uniqueName(name: string, taken: Set<string>): string;
