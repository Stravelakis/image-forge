// ---------------------------------------------------------------------------
// Every error the person sees says what to do next (Ak, plan item 17).
//
// `plainError` takes whatever was thrown, removes Electron's wrapper words
// ("Error invoking remote method ..."), and, unless the message already tells
// the person what to do, adds the next step for that place on screen.
// `needsSettings` says whether the message is about a missing or refused key,
// so the screen can offer an "Open Settings" button next to it.
// ---------------------------------------------------------------------------

const WRAPPER = /^Error invoking remote method '[^']+': (Error: )?/;

/** Words that mean the message already says what to do. */
const ALREADY_ADVISES = /\b(try|add|press|click|check|pick|choose|open|wait|paste|fix|install|start|use|change|make|generate|save|connect|restart|quit|remove|write|type|enter|set|turn|allow)\b/i;

export function messageOf(e: unknown): string {
  const raw = e instanceof Error ? e.message : typeof e === "string" ? e : "Something went wrong.";
  return raw.replace(WRAPPER, "").trim() || "Something went wrong.";
}

/** The error in plain words, with a next step added when it has none. */
export function plainError(e: unknown, next: string): string {
  const msg = messageOf(e);
  if (ALREADY_ADVISES.test(msg)) return msg;
  const end = /[.!?]$/.test(msg) ? "" : ".";
  return `${msg}${end} ${next}`;
}

/** True when the message is about a missing, refused or unreadable key, or sends the person to Settings. */
export function needsSettings(msg: string): boolean {
  return (/\bkeys?\b/i.test(msg) && /(saved|refused|rejected|accept|missing|settings|no .* key)/i.test(msg)) || /\bSettings\s*(→|>)/.test(msg);
}

/** Which Settings page a message points at, so the button opens the right one. */
export function settingsSectionFor(msg: string): "engines" | "text" | "folders" {
  if (/text[ -]engines?|text model|writing helper/i.test(msg)) return "text";
  if (/Settings\s*(→|>)\s*Folders/i.test(msg)) return "folders";
  return "engines";
}
