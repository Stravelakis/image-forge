/**
 * "Open Image Forge in a window, or in my browser."
 *
 * Only shown in the desktop app. Switching carries everything stored in this
 * page across (see lib/desktop.ts) — without that, the other side would open
 * empty and look like every setting had been lost.
 */
import { useEffect, useState } from "react";
import { Btn } from "./ui";
import { desktopInfo, switchMode, thisSide, type LaunchMode } from "../lib/desktop";
import type { Toast } from "../types";

export const MOVED_EVENT = "forge:moved";

export default function DesktopModeCard({ pushToast }: { pushToast: (kind: Toast["kind"], msg: string) => void }) {
  const [mode, setMode] = useState<LaunchMode | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void desktopInfo().then((i) => setMode(i ? thisSide() : null));
  }, []);

  if (!mode) return null;

  const go = async (to: LaunchMode) => {
    setBusy(true);
    try {
      await switchMode(to);
      window.dispatchEvent(new CustomEvent(MOVED_EVENT, { detail: to }));
    } catch (e) {
      pushToast("err", `Could not switch — ${(e as Error).message}. Nothing was changed.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-line bg-[var(--color-field)] p-4">
      <p className="font-display text-[15px] tracking-wide text-cream">Where Image Forge opens</p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-dust">
        {mode === "window"
          ? "Right now it opens in its own window."
          : "Right now it opens in your browser. A small Image Forge icon by the clock keeps it running — right-click it to quit."}{" "}
        Switching takes your settings, keys and list with it. Your linked folder has to be picked again once, because
        browsers do not share folder permissions.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {mode === "window" ? (
          <Btn variant="moss" disabled={busy} onClick={() => go("browser")}>
            {busy ? "Switching…" : "Open in my browser instead"}
          </Btn>
        ) : (
          <Btn variant="moss" disabled={busy} onClick={() => go("window")}>
            {busy ? "Switching…" : "Open in its own window instead"}
          </Btn>
        )}
      </div>
    </div>
  );
}
