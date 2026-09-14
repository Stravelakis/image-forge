import type { Category, ManifestRow } from "../types";

/*
 * What a file's name and bytes must agree on lives in engines.mjs, so the MCP
 * server — which cannot import TypeScript — uses exactly the same rules.
 */
export {
  KNOWN_EXTENSIONS,
  extensionForMime,
  extensionOf,
  nameForMime,
  mimeFromBytes,
  withSuffix,
  uniqueName,
} from "./engines.mjs";
import { KNOWN_EXTENSIONS, extensionOf } from "./engines.mjs";

/** What the categories were called before they described the artefact. */
const LEGACY_PREFIXES: string[] = ["shop_", "item_", "event_", "npc_"];

export interface RuleCheck {
  id: string;
  label: string;
  pass: boolean;
  detail?: string;
  /** false when this rule is switched off, in which case pass is always true */
  enabled?: boolean;
}

/**
 * Which rules you can switch off, and which you cannot.
 *
 * Most of these are house style: they keep a hundred files findable a month
 * later, and if your project wants capitals or hyphens that is your business.
 *
 * Three are not negotiable, and it is worth saying why rather than just
 * greying them out:
 *
 *   · unique — two rows sharing a filename means the second silently
 *     overwrites the first when they are saved. That is lost work, not a
 *     style preference.
 *   · nospecial — characters like \ / : * ? " < > | cannot appear in a
 *     Windows filename at all, so allowing them produces files that cannot
 *     be written.
 *
 * "ends with .png" used to be a third unswitchable rule, on the grounds that
 * "the engines return PNG". They do not. Google's image API refuses to return
 * anything but JPEG, and Pollinations sends whatever it likes — so that rule
 * was writing a .png name onto JPEG bytes and calling it correctness. What an
 * engine makes is what it makes. The rule is now optional and merely asks for
 * SOME known extension; the true one is settled from the bytes at save time.
 */
export const RULES: { id: string; label: string; why: string; optional: boolean }[] = [
  { id: "lowercase", label: "lowercase only", why: "so a file is never lost to a capital you forgot", optional: true },
  { id: "nospace", label: "no spaces", why: "spaces break URLs and shell commands", optional: true },
  { id: "nospecial", label: "no special characters", why: "Windows refuses these outright: \\ / : * ? < > |", optional: false },
  { id: "underscores", label: "words joined with underscores", why: "consistent word breaks make a list scannable", optional: true },
  { id: "prefix", label: "starts with what it makes", why: "so a name says what it is, and sorts with its kind", optional: true },
  { id: "ext", label: "ends with a known extension", why: `so the name says what the file is — one of ${KNOWN_EXTENSIONS.join(", ")}`, optional: true },
  { id: "unique", label: "unique across the manifest", why: "two rows with one name means the second overwrites the first", optional: false },
];

/** The rules that cannot be switched off, whatever the settings say. */
const REQUIRED = new Set(RULES.filter((r) => !r.optional).map((r) => r.id));

/** Turn the saved preferences into a straight yes/no per rule. */
export const rulesEnabled = (prefs?: Record<string, boolean>): Record<string, boolean> =>
  Object.fromEntries(RULES.map((r) => [r.id, REQUIRED.has(r.id) ? true : (prefs?.[r.id] ?? true)]));

export function validateFilename(
  name: string,
  category: Category,
  allNames: { id: number; filename: string }[],
  rowId: number,
  /** which rules are switched on; anything omitted counts as on */
  prefs?: Record<string, boolean>
): RuleCheck[] {
  const on = rulesEnabled(prefs);
  // A rule that is switched off reports as passing, so everything that counts
  // failures — the sidebar, the auto-fix, the row badge — needs no knowledge
  // of which rules exist.
  const gate = (checks: RuleCheck[]): RuleCheck[] =>
    checks.map((c) => (c.enabled === false ? { ...c, pass: true } : c));
  return gate([
    { id: "lowercase", enabled: on.lowercase, label: "lowercase only", pass: name.length > 0 && name === name.toLowerCase() },
    { id: "nospace", enabled: on.nospace, label: "no spaces", pass: !/\s/.test(name) },
    {
      id: "nospecial",
      enabled: on.nospecial,
      label: "no special characters",
      // Only characters a filesystem genuinely refuses.
      //
      // This used to be /^[a-z0-9_]+\.png$/, which also rejected capitals —
      // so it silently did the lowercase rule's job as well. Since this one
      // cannot be switched off, turning "lowercase only" off changed nothing,
      // which is a rule that lies about what it does. Case belongs to the
      // lowercase rule; spaces belong to the nospace rule; this one is about
      // characters Windows cannot write.
      pass: name.length > 0 && !/[<>:"/\\|?*\u0000-\u001f]/.test(name),
      detail: "Windows refuses a filename containing \\ / : * ? < > | or a quote",
    },
    { id: "underscores", enabled: on.underscores, label: "words joined with underscores", pass: !/--|-{2,}/.test(name) && !/__/.test(name) },
    {
      id: "prefix",
      enabled: on.prefix,
      label: `category prefix “${category}_”`,
      // Legacy prefixes count as valid for "image".
      //
      // The categories used to be shop / item / event / npc and are now asset
      // types. Migrating a row's category is free; renaming its file is not —
      // those PNGs already exist on disk under the old name. Rejecting them
      // would mark every row of an existing manifest broken over a change the
      // user never asked for. New rows get the new prefix; old ones are left
      // alone and still pass.
      pass: name.startsWith(category + "_") || (category === "image" && LEGACY_PREFIXES.some((lp) => name.startsWith(lp))),
    },
    {
      id: "ext",
      enabled: on.ext,
      label: "ends with a known extension",
      // Any of them, not .png specifically. The engine decides the format and
      // then the save step corrects the name to match the bytes, so demanding
      // .png here would only mark honest names broken.
      pass: KNOWN_EXTENSIONS.some((e) => name.toLowerCase().endsWith(e)),
      detail: `one of ${KNOWN_EXTENSIONS.join(", ")}`,
    },
    {
      id: "unique",
      enabled: on.unique,
      label: "unique across the manifest",
      pass: name !== "" && !allNames.some((r) => r.id !== rowId && r.filename === name),
    },
  ]);
}

export function autoFixFilename(raw: string, category: Category): string {
  // Whatever extension it already wears is kept. Forcing .png here is how a
  // JPEG came to be called a PNG in the first place; if the name is bare we
  // still have to guess something, and .png is the commonest truth.
  const ext = extensionOf(raw) || ".png";
  let base = raw.toLowerCase().slice(0, raw.length - (extensionOf(raw).length || 0)).trim();
  base = base.replace(/[\s\-]+/g, "_");
  base = base.replace(/[^a-z0-9_]/g, "");
  base = base.replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  if (!base) base = "untitled";
  const prefix = category + "_";
  if (!base.startsWith(prefix)) {
    base = base.replace(/^(shop|item|event|npc)_/, "");
    base = prefix + base;
  }
  return base + ext;
}

export function styleDriftCount(rows: ManifestRow[], locked: string): number {
  return rows.filter((r) => r.style !== locked).length;
}

export function violationCount(rows: ManifestRow[], prefs?: Record<string, boolean>): number {
  const names = rows.map((x) => ({ id: x.id, filename: x.filename }));
  return rows.filter((r) => validateFilename(r.filename, r.category, names, r.id, prefs).some((c) => !c.pass)).length;
}
