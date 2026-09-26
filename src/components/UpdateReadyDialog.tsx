/**
 * "There is a newer version."
 *
 * Shown only when a genuinely newer release exists — the version comparison
 * is a real one, so running a build ahead of the last release says nothing.
 *
 * It says the size before downloading, because 200 MB arriving unannounced on
 * a metered connection is rude, and it says plainly that nothing of yours is
 * touched, because that is the first thing anyone wonders before updating.
 */
import { useState } from "react";
import { Btn, IDownload, IX } from "./ui";

export interface UpdateInfo {
  version: string;
  notesUrl: string;
  assetName: string;
  assetUrl: string;
  sizeNote: string;
}

export default function UpdateReadyDialog({
  info,
  current,
  onClose,
  onDownload,
  installs = false,
}: {
  info: UpdateInfo;
  current: string;
  onClose: () => void;
  onDownload: () => Promise<void>;
  /** the desktop app installs it itself; a browser can only download it */
  installs?: boolean;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-2xl border border-line bg-panel p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl text-cream">Version {info.version} is out</h2>
            <p className="mt-1 font-mono text-[11.5px] text-dust">you are on v{current}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-dust transition hover:text-cream" aria-label="Close">
            <IX size={16} />
          </button>
        </div>

        <div className="mt-4 rounded-xl border border-moss/40 bg-moss/10 p-3">
          <p className="text-[12.5px] leading-relaxed text-parch">
            <span className="text-cream">Nothing of yours is touched.</span> Your keys, settings, manifest and pictures
            all stay exactly where they are — the installer updates the app around them.
          </p>
        </div>

        <p className="mt-3 text-[12.5px] leading-relaxed text-dust">
          <a href={info.notesUrl} target="_blank" rel="noreferrer" className="text-ember underline">
            Read what changed
          </a>{" "}
          before you decide. Updating is never required — the version you have keeps working.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {info.assetUrl ? (
            <Btn
              variant="primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onDownload();
                } finally {
                  setBusy(false);
                }
              }}
            >
              <IDownload size={13} />
              {busy ? (installs ? "Downloading, then installing…" : "Downloading…") : installs ? `Update now${info.sizeNote}` : `Download the installer${info.sizeNote}`}
            </Btn>
          ) : (
            <a
              href={info.notesUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-line px-3 py-2 text-[13px] text-cream transition hover:border-ember"
            >
              Open the release page
            </a>
          )}
          <Btn onClick={onClose}>Not now</Btn>
        </div>

        {info.assetUrl && installs && (
          <p className="mt-3 text-[11px] leading-relaxed text-dust">
            Image Forge downloads the new version, closes, installs it and opens again by itself. It takes a minute or
            two.
          </p>
        )}

        {info.assetUrl && !installs && (
          <p className="mt-3 text-[11px] leading-relaxed text-dust">
            Once it has downloaded, run it. It installs over the version you have. Windows will show its usual warning
            about unsigned software — click <span className="text-parch">More info</span>, then{" "}
            <span className="text-parch">Run anyway</span>.
          </p>
        )}
      </div>
    </div>
  );
}
