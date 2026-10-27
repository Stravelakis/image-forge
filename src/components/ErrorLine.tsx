import { needsSettings, plainError, settingsSectionFor } from "../lib/plainError";
import { Btn } from "./ui";

/** Ask the app to open Settings (App listens for this). */
export function openSettings(message = "") {
  window.dispatchEvent(new CustomEvent("forge:open-settings", { detail: { section: settingsSectionFor(message) } }));
}

/**
 * One error message. The text says what happened and what to do next (see
 * lib/plainError), it explains itself on hover, and when the problem is a
 * missing or refused key, or points at Settings, it offers a button that opens
 * the right Settings page.
 *
 * `next` is the fallback advice, used only when the message has none of its own.
 */
export function ErrorLine({
  text,
  next = "Try again. If it keeps happening, check Settings.",
  tip = "What went wrong, and what to do next.",
  className = "text-[12px] leading-relaxed text-blood",
}: {
  text: string;
  next?: string;
  tip?: string;
  className?: string;
}) {
  const shown = plainError(text, next);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <p data-tip={tip} className={`${className} break-words whitespace-pre-wrap`}>{shown}</p>
      {needsSettings(shown) && (
        <Btn data-tip="Opens Settings, where you add or fix the key." onClick={() => openSettings(shown)}>
          Open Settings
        </Btn>
      )}
    </div>
  );
}
