import { loadPet, savePet, type PetChoice } from "./CursorPet";
import { useRef, useState, useEffect } from "react";
import DesktopModeCard from "./DesktopModeCard";
import type { ManifestRow, Toast } from "../types";
import { ACCENTS, STYLES } from "../types";
import type { ApiKey, ForgeSettings, ProviderId } from "../lib/providers";
import { MODELS, MODEL_TRAITS, PROVIDER_META, formatCountdown, formatUsd, newKey, usedToday, scribeChat, SCRIBE_SYSTEMS } from "../lib/providers";
import { SUBFOLDERS, fsSupported } from "../lib/output";
import { RULES } from "../lib/validate";
import {
  findDuplicateKeys,
  summarisePool,
  testConnection,
  testPool,
  type TestResult,
  type TestTarget,
} from "../lib/testConnection";
import { WHY_MANUAL_DATE, creditNoteFor } from "../lib/paidGuard";
import { backupFilename, buildBackup, censusOf, describeCensus, readBackup, type SaveProof } from "../lib/settingsBackup";
import { downloadCsv } from "../lib/csv";
import { VISION_PRESETS, listChatModels } from "../lib/visionEngine";
import { checkForge, fixableOf, summarise, type Finding } from "../lib/selfCheck";
import { Spotlight, Stagger } from "./motion";
import TextEngines from "./TextEngines";
import {
  STYLE_CATALOGUE,
  STYLE_GROUPS,
  availableModelsForStyle,
  defaultModelForStyle,
  stylesInGroup,
} from "../lib/styleCatalogue";
import type { FolderState } from "./SettingsDrawer";
import { BorderGlow } from "./effects";
import { Btn, IAlert, ICheck, IDownload, IFolder, IRetry, IUpload, ISparkle, ITrash, IX } from "./ui";

export type SettingsSection =
  | "engines"
  | "styles"
  | "text"
  | "prompts"
  | "filenames"
  | "folders"
  | "wp"
  | "appearance"
  | "advanced";

const SECTIONS: { id: SettingsSection; label: string; hint: string }[] = [
  { id: "engines", label: "Image engines", hint: "who paints" },
  { id: "styles", label: "Image styles", hint: "how pictures are drawn" },
  { id: "text", label: "Text engines", hint: "who writes" },
  { id: "prompts", label: "Text prompts", hint: "how they write" },
  { id: "filenames", label: "Filenames", hint: "the rules" },
  { id: "folders", label: "Folders", hint: "where files go" },
  { id: "wp", label: "WP connections", hint: "the hand-off" },
  { id: "appearance", label: "Language & pet", hint: "the app's words, your cursor pet" },
  { id: "advanced", label: "Advanced", hint: "care & updates" },
];

const H = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <h2 className={`font-display text-2xl text-cream ${className}`}>{children}</h2>
);
const P = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <p className={`text-[13.5px] leading-relaxed text-parch ${className}`}>{children}</p>
);
const field = "w-full rounded-lg border border-line bg-[var(--color-field)] px-3 py-2 text-[13px] text-cream placeholder:text-dust/60";

/** One "does this work?" button, with its answer underneath. */
function TestButton({
  target,
  settings,
  label = "Test it",
  watch,
  "data-tip": tip,
}: {
  target: TestTarget;
  settings: ForgeSettings;
  label?: string;
  /** the key or token it checks — a pasted one (a jump from short to long) is checked straight away */
  watch?: string;
  /** the hover help for the button */
  "data-tip"?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<TestResult | null>(null);
  const last = useRef(watch ?? "");
  useEffect(() => {
    const before = last.current;
    last.current = watch ?? "";
    if (watch === undefined || watch.length < 12 || watch.length - before.length < 12) return;
    const t = window.setTimeout(async () => {
      setBusy(true);
      setRes(null);
      setRes(await testConnection(target, settings));
      setBusy(false);
    }, 500);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watch]);
  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-2">
        <Btn
          data-tip={tip ?? "Checks that this connection works."}
          onClick={async () => {
            setBusy(true);
            setRes(null);
            setRes(await testConnection(target, settings));
            setBusy(false);
          }}
          disabled={busy}
        >
          {busy ? "checking…" : label}
        </Btn>
        {res && (
          <span className={`text-[11.5px] ${res.ok ? "text-moss" : "text-blood"}`}>
            {res.ok ? "✓ " : "✗ "}
            {res.message}
          </span>
        )}
        {res?.ok && res.free && <span className="font-mono text-[9.5px] text-dust">cost nothing</span>}
      </div>
      {res?.detail && <p className="mt-1 text-[11px] leading-snug text-dust">{res.detail}</p>}
    </div>
  );
}

/**
 * One key, checked on its own (Ak, 13 Oct 2026: "a test button for the api
 * keys when they are pasted in"). The pool is narrowed to just this key, so
 * the answer is about this key and not the first one.
 */
function KeyCheck({ target, settings, pool, keyId, auto }: { target: TestTarget; settings: ForgeSettings; pool: "geminiKeys" | "geminiPaidKeys" | "openaiKeys"; keyId: string; auto: number }) {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<TestResult | null>(null);
  const run = async () => {
    const only = settings[pool].filter((k) => k.id === keyId);
    if (!only.length || !only[0].key.trim()) return;
    setBusy(true);
    setRes(null);
    setRes(await testConnection(target, { ...settings, [pool]: only.map((k) => ({ ...k, exhaustedUntil: 0 })) }));
    setBusy(false);
  };
  // Pasted in: check straight away.
  useEffect(() => {
    if (auto) void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <Btn data-tip="Checks that this one key works." onClick={() => void run()} disabled={busy} className="!px-2.5 !py-1 !text-[11.5px]">
        {busy ? "…" : "Test"}
      </Btn>
      {res && (
        <span className={`max-w-[14rem] truncate text-[11px] ${res.ok ? "text-moss" : "text-blood"}`} title={`${res.message}${res.detail ? ` — ${res.detail}` : ""}`}>
          {res.ok ? "✓" : "✗"} {res.message}
        </span>
      )}
    </span>
  );
}

function KeyPoolEditor({
  title,
  hint,
  pool,
  onChange,
  pushToast,
  test,
  settings,
  credits,
}: {
  title: string;
  hint: string;
  pool: ApiKey[];
  onChange: (k: ApiKey[]) => void;
  pushToast: (kind: Toast["kind"], msg: string) => void;
  test?: TestTarget;
  settings?: ForgeSettings;
  /** show a credit label and end date beside each key — for paid pools */
  credits?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [poolBusy, setPoolBusy] = useState("");
  const [poolNote, setPoolNote] = useState("");
  const [poolResults, setPoolResults] = useState<{ id: string; label: string; result: TestResult }[]>([]);
  // A paste bumps this key's counter, which KeyCheck answers by testing.
  const [pasted, setPasted] = useState<Record<string, number>>({});
  const poolName: "geminiKeys" | "geminiPaidKeys" | "openaiKeys" | null =
    test === "gemini-free" ? "geminiKeys" : test === "gemini-paid" ? "geminiPaidKeys" : test === "openai" ? "openaiKeys" : null;
  return (
    <div className="rounded-xl border border-line bg-panel/50 p-4">
      <p className="font-display text-[15px] tracking-wide text-cream">{title}</p>
      <p className="mt-1 text-[12px] text-dust">{hint}</p>
      <div className="mt-3 space-y-2">
        {pool.map((k, i) => {
          const benched = k.exhaustedUntil > Date.now();
          return (
            <div key={k.id} className="flex items-center gap-2">
              <span className={`h-2 w-2 shrink-0 rounded-full ${benched ? "bg-blood" : k.key.trim() ? "bg-moss" : "bg-dust/40"}`} />
              <input data-tip="Paste one key here. It stays on this computer and the forge uses it to ask for pictures."
                value={k.key}
                type="password"
                placeholder="paste key…"
                onChange={(e) => onChange(pool.map((x) => (x.id === k.id ? { ...x, key: e.target.value } : x)))}
                onPaste={() => window.setTimeout(() => setPasted((p) => ({ ...p, [k.id]: (p[k.id] ?? 0) + 1 })), 400)}
                className={`${field} font-mono !text-[12px]`}
              />
              {test && settings && poolName && k.key.trim() && <KeyCheck target={test} settings={settings} pool={poolName} keyId={k.id} auto={pasted[k.id] ?? 0} />}
              {benched ? (
                <span className="shrink-0 rounded-md border border-blood/40 bg-blood/10 px-2 py-1 font-mono text-[9.5px] whitespace-nowrap text-blood" title="click to un-bench early">
                  resting {formatCountdown(k.exhaustedUntil)}
                  <button className="ml-1.5 underline" onClick={() => onChange(pool.map((x) => (x.id === k.id ? { ...x, exhaustedUntil: 0 } : x)))}>
                    wake
                  </button>
                </span>
              ) : (
                <button data-tip="Takes this key out of the list. The last key can't be removed."
                  onClick={() => onChange(pool.filter((x) => x.id !== k.id))}
                  disabled={pool.length === 1}
                  className="btn-press shrink-0 rounded-md p-1.5 text-dust hover:bg-blood/15 hover:text-blood disabled:opacity-30"
                >
                  <ITrash size={13} />
                </button>
              )}
              <span className="hidden font-mono text-[9.5px] text-dust sm:block">#{i + 1}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex gap-2">
        <input data-tip="Paste another key here, then press Add key. More keys means more pictures a day, because the forge moves to the next key when one runs out." value={draft} onChange={(e) => setDraft(e.target.value)} type="password" placeholder="add another key — more keys, more daily allowance" className={`${field} font-mono !text-[12px]`} />
        <Btn data-tip="Puts the key you pasted into the list so the forge can use it."
          variant="primary"
          disabled={!draft.trim()}
          onClick={() => {
            onChange([...pool, { ...newKey(`key-${pool.length + 1}`), key: draft.trim() }]);
            setDraft("");
            pushToast("ok", "Key added to the rotation pool.");
          }}
        >
          Add key
        </Btn>
      </div>
      {credits && (
        <div className="mt-3 space-y-2 rounded-lg border border-line bg-[var(--color-field)] p-3">
          <p className="font-mono text-[10px] tracking-[0.2em] text-dust uppercase">when does each credit run out?</p>
          {pool
            .filter((k) => k.key.trim())
            .map((k, i) => {
              const note = creditNoteFor(k);
              return (
                <div key={k.id} className="flex flex-wrap items-center gap-2">
                  <span className="w-14 shrink-0 font-mono text-[10px] text-dust">#{i + 1}</span>
                  <input data-tip="A short note so you remember what this credit is, like Free trial."
                    value={k.creditLabel ?? ""}
                    onChange={(e) => onChange(pool.map((x) => (x.id === k.id ? { ...x, creditLabel: e.target.value } : x)))}
                    placeholder="what is this credit?"
                    className={`${field} !w-auto min-w-[9rem] flex-1 !py-1.5 !text-[12px]`}
                  />
                  <input data-tip="The day this credit stops working. The forge warns you as it gets close."
                    type="date"
                    value={k.creditEndsOn ?? ""}
                    onChange={(e) => onChange(pool.map((x) => (x.id === k.id ? { ...x, creditEndsOn: e.target.value } : x)))}
                    className={`${field} !w-auto !py-1.5 !text-[12px]`}
                  />
                  {note.endsOn && (
                    <span
                      className={`font-mono text-[10px] ${
                        note.expired ? "text-blood" : note.endingSoon ? "text-ember" : "text-moss"
                      }`}
                    >
                      {note.expired ? "expired" : `${note.daysLeft}d left`}
                    </span>
                  )}
                </div>
              );
            })}
          <p className="text-[11px] leading-snug text-dust">{WHY_MANUAL_DATE}</p>
        </div>
      )}
      {test && settings && (
        <div className="mt-2 flex flex-wrap items-start gap-2">
          <TestButton data-tip="Checks that the first key in the list works." target={test} settings={settings} label="Check the first key" />
          {(test === "gemini-free" || test === "gemini-paid" || test === "openai") && pool.filter((k) => k.key.trim()).length > 1 && (
            <Btn data-tip="Tries every key in the list one by one and tells you which ones work."
              onClick={async () => {
                setPoolBusy("checking…");
                setPoolResults([]);
                const dupes = await findDuplicateKeys(pool);
                const results = await testPool(
                  pool,
                  test === "openai" ? settings.openaiModel : settings.geminiModel,
                  test === "openai" ? "openai" : "gemini",
                  settings.openaiBase,
                  (done, total) => setPoolBusy(`checking ${done} of ${total}…`),
                  test === "gemini-paid" ? "paid" : "free"
                );
                setPoolResults(results);
                setPoolNote(
                  summarisePool(results).message +
                    (dupes.length ? ` · the same key appears twice: ${dupes.join("; ")}` : "")
                );
                setPoolBusy("");
              }}
              disabled={Boolean(poolBusy)}
            >
              {poolBusy || `Check all ${pool.filter((k) => k.key.trim()).length} keys`}
            </Btn>
          )}
        </div>
      )}

      {poolNote && (
        <p className="mt-2 rounded-lg border border-line bg-[var(--color-field)] px-3 py-2 text-[11.5px] text-parch">{poolNote}</p>
      )}
      {poolResults.length > 0 && (
        <div className="mt-2 space-y-1">
          {poolResults.map((r, i) => (
            <div key={r.id} className="flex items-start gap-2 text-[11.5px]">
              <span className="w-10 shrink-0 font-mono text-[10px] text-dust">#{i + 1}</span>
              <span className={r.result.ok ? "text-moss" : "text-blood"}>
                {r.result.ok ? "✓" : "✗"} {r.result.message}
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="mt-2 text-[11px] text-dust">
        On a 429 the current key rests and the next one retries the same row immediately. A row parks only when every key is resting.
      </p>
    </div>
  );
}

/**
 * "Check the forge over."
 *
 * Looks for the quiet problems — a key pasted twice, an engine paused and
 * forgotten, rows aimed at a model that no longer exists — and says what each
 * one means before offering to fix anything. Nothing is changed until you ask.
 */
function HealthCheck({
  settings,
  rows,
  onRepair,
}: {
  settings: ForgeSettings;
  rows: ManifestRow[];
  onRepair: () => Promise<void>;
}) {
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [busy, setBusy] = useState(false);

  const tone: Record<Finding["severity"], string> = {
    broken: "border-rust/50 bg-rust/10",
    warning: "border-ember/40 bg-ember/10",
    note: "border-line bg-panel/60",
  };
  const word: Record<Finding["severity"], string> = {
    broken: "needs fixing",
    warning: "worth a look",
    note: "for information",
  };

  const fixable = findings ? fixableOf(findings) : [];

  return (
    <div className="rounded-xl border border-line bg-panel/50 p-4">
      <p className="font-display text-[15px] tracking-wide text-cream">Check the forge over</p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-dust">
        Looks for the things that go quietly wrong and cost you later: the same key pasted into two slots, an engine you
        paused and forgot, rows aimed at a model the provider switched off, no free engine to fall back on. It only
        looks — nothing changes until you say so.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Btn data-tip="Looks over your setup for quiet problems, like a key pasted twice. It only looks and changes nothing." variant="primary" onClick={() => setFindings(checkForge(settings, rows))}>
          Check the forge
        </Btn>
        {findings && fixable.length > 0 && (
          <Btn data-tip="Fixes the problems from the check that are safe to fix automatically."
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onRepair();
                setFindings(checkForge(settings, rows));
              } finally {
                setBusy(false);
              }
            }}
          >
            <IRetry size={13} /> {busy ? "Fixing…" : `Fix the ${fixable.length} that can be fixed`}
          </Btn>
        )}
      </div>

      {findings && (
        <div className="mt-3 space-y-2">
          <p className="font-mono text-[11.5px] text-parch">{summarise(findings)}</p>
          <Stagger className="space-y-2">
            {findings.map((f) => (
              <Spotlight key={f.id} className={`rounded-lg border p-3 ${tone[f.severity]}`}>
                <p className="text-[13px] text-cream">
                  {f.title}
                  <span className="ml-2 font-mono text-[10px] text-dust uppercase">{word[f.severity]}</span>
                  {f.fixable && <span className="ml-2 font-mono text-[10px] text-moss">fixable</span>}
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-dust">{f.detail}</p>
              </Spotlight>
            ))}
          </Stagger>
        </div>
      )}
    </div>
  );
}

/**
 * Switch an engine off without dismantling it.
 *
 * A provider having a bad month should not cost you your key setup. Paused
 * rows fail instantly with a sentence naming the reason, which is far kinder
 * than a queue of timeouts.
 */
function PauseSwitch({
  engine,
  label,
  note,
  settings,
  patchSettings,
}: {
  engine: string;
  label: string;
  note: string;
  settings: ForgeSettings;
  patchSettings: (patch: Partial<ForgeSettings>) => void;
}) {
  const paused = settings.pausedEngines.includes(engine);
  const toggle = () =>
    patchSettings({
      pausedEngines: paused
        ? settings.pausedEngines.filter((e) => e !== engine)
        : [...settings.pausedEngines, engine],
    });

  return (
    <div className={`rounded-xl border p-4 ${paused ? "border-rust/60 bg-rust/10" : "border-line bg-panel/50"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-display text-[15px] tracking-wide text-cream">
            {label} {paused && <span className="ml-1 font-mono text-[10px] text-rust">PAUSED</span>}
          </p>
          <p className="mt-1 max-w-2xl text-[12px] text-dust">{note}</p>
        </div>
        <Btn data-tip={`${paused ? `Turns ${label} back on so the forge uses it again.` : `Stops the forge using ${label} for now. Your keys stay saved.`}`} variant={paused ? "primary" : undefined} onClick={toggle}>
          {paused ? `Switch ${label} back on` : `Pause ${label}`}
        </Btn>
      </div>
    </div>
  );
}


/**
 * Proof that what you typed is actually stored.
 *
 * Autosave was already happening on every keystroke; the problem was that it
 * was invisible, so "saved" and "written into a box this app will never open
 * again" looked exactly the same. That is not hypothetical — the desktop build
 * served itself on a random port, and storage is keyed by origin, so each
 * launch got a fresh empty box and yesterday's keys stayed stranded under
 * yesterday's port.
 *
 * So this says the time of the last verified save, counts what is stored
 * without ever showing it, and offers a backup file — because a browser
 * storage box is not a safe place for the only copy of anything.
 */
function SaveBar({
  settings,
  saveProof,
  onSaveNow,
  onRestoreSettings,
  pushToast,
}: {
  settings: ForgeSettings;
  saveProof?: SaveProof | null;
  onSaveNow?: () => void;
  onRestoreSettings?: (s: Partial<ForgeSettings>) => void;
  pushToast: (kind: Toast["kind"], msg: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const census = censusOf(settings);
  const at = saveProof ? new Date(saveProof.at).toLocaleTimeString("en-GB", { hour12: false }) : null;
  const good = saveProof?.ok !== false;

  return (
    <div
      className={`mb-5 rounded-xl border p-3.5 ${good ? "border-line bg-panel/50" : "border-blood/50 bg-blood/10"}`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className={`flex items-center gap-1.5 text-[12.5px] ${good ? "text-moss" : "text-blood"}`}>
          {good ? <ICheck size={14} /> : <IAlert size={14} />}
          {good ? (at ? `Saved and checked at ${at}` : "Saved automatically") : "NOT saved"}
        </span>
        <span className="font-mono text-[10.5px] text-dust">{describeCensus(census)}</span>
        <span className="ml-auto flex flex-wrap gap-2">
          <Btn data-tip="Saves your settings again right now. They already save by themselves as you type." onClick={() => onSaveNow?.()}>Save now</Btn>
          <Btn data-tip="Saves a file with all your settings and keys. The keys are in plain text, so keep it somewhere private."
            onClick={() => {
              // The file holds the keys in plain text, so it is never written
              // without a deliberate click and never written anywhere on its own.
              downloadCsv(backupFilename(), buildBackup(settings));
              pushToast("ok", "Backup saved. It holds your keys in plain text — keep it somewhere private.");
            }}
          >
            <IDownload size={13} /> Back up to a file
          </Btn>
          <Btn data-tip="Loads your settings back from a backup file you saved earlier." onClick={() => fileRef.current?.click()}>
            <IUpload size={13} /> Restore
          </Btn>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              const parsed = readBackup(await f.text());
              if (!parsed.ok) {
                pushToast("err", parsed.problem);
                return;
              }
              onRestoreSettings?.(parsed.settings);
              pushToast("ok", `Restored the backup from ${parsed.savedAt.slice(0, 10) || "an earlier day"}.`);
            }}
          />
        </span>
      </div>
      {saveProof?.problem && <p className="mt-2 text-[12px] leading-relaxed text-blood">{saveProof.problem}</p>}
    </div>
  );
}

export default function SettingsView({
  section,
  onSection,
  settings,
  patchSettings,
  rows,
  folder,
  onLinkFolder,
  onUnlinkFolder,
  onSyncAll,
  onGoStyles,
  onRepair,
  onBackup,
  onReset,
  onPullManifest,
  onCheckUpdate,
  appVersion,
  pushToast,
  saveProof,
  onSaveNow,
  onRestoreSettings,
  styleLock,
  onLockStyle,
}: {
  section: SettingsSection;
  onSection: (s: SettingsSection) => void;
  settings: ForgeSettings;
  patchSettings: (p: Partial<ForgeSettings>) => void;
  /** the manifest, so the health check can look at it */
  rows: ManifestRow[];
  folder: FolderState;
  onLinkFolder: () => void;
  onUnlinkFolder: () => void;
  onSyncAll: () => void;
  onGoStyles: () => void;
  onRepair: () => Promise<void>;
  onBackup: () => void;
  onReset: (c: { rows: boolean; recipes: boolean; settings: boolean; market: boolean }) => void;
  onPullManifest: (mode: "merge" | "replace") => void;
  onCheckUpdate: () => void;
  appVersion: string;
  pushToast: (kind: Toast["kind"], msg: string) => void;
  /** whether the last settings write was read back successfully */
  saveProof?: SaveProof | null;
  onSaveNow?: () => void;
  onRestoreSettings?: (s: Partial<ForgeSettings>) => void;
  /** the look every new row starts with */
  styleLock?: string;
  onLockStyle?: (id: string) => void;
}) {
  const [testBusy, setTestBusy] = useState(false);
  const [testResult, setTestResult] = useState("");
  const [repairBusy, setRepairBusy] = useState(false);
  const [pullBusy, setPullBusy] = useState(false);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [pullMode, setPullMode] = useState<"merge" | "replace">("merge");
  const [resetChecks, setResetChecks] = useState({ rows: false, recipes: false, settings: false, market: false });
  const [confirmReset, setConfirmReset] = useState(false);
  const [localModels, setLocalModels] = useState<string[]>([]);
  const [localBusy, setLocalBusy] = useState(false);
  const [localNote, setLocalNote] = useState("");

  const testText = async () => {
    setTestBusy(true);
    setTestResult("");
    try {
      const out = await scribeChat(settings.scribe, "Reply with exactly: the forge is lit.", "ready?");
      setTestResult(out);
      pushToast("ok", "Text engine answered — the connection works.");
    } catch (e) {
      pushToast("err", `Text engine test failed — ${(e as { message?: string })?.message ?? "unknown"}`);
    } finally {
      setTestBusy(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl gap-8 px-6 py-10">
      {/* rail */}
      <nav className="hidden w-52 shrink-0 md:block">
        <p className="mb-3 font-mono text-[10px] tracking-[0.28em] text-dust uppercase">settings</p>
        <div className="space-y-1">
          {SECTIONS.map((s) => (
            <button data-tip={`${`Jumps to the ${s.label} settings (${s.hint}).`}`}
              key={s.id}
              onClick={() => onSection(s.id)}
              className={`btn-press flex w-full items-baseline justify-between rounded-lg px-3 py-2 text-left ${
                section === s.id ? "bg-ember/12 text-cream" : "text-parch hover:bg-raise/50"
              }`}
            >
              <span className="text-[13px] font-semibold">{s.label}</span>
              <span className="font-mono text-[9px] text-dust">{s.hint}</span>
            </button>
          ))}
        </div>
      </nav>

      <div className="min-w-0 flex-1 space-y-5">
        <SaveBar
          settings={settings}
          saveProof={saveProof}
          onSaveNow={onSaveNow}
          onRestoreSettings={onRestoreSettings}
          pushToast={pushToast}
        />

        {/* mobile rail */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 md:hidden">
          {SECTIONS.map((s) => (
            <button data-tip={`${`Jumps to the ${s.label} settings (${s.hint}).`}`}
              key={s.id}
              onClick={() => onSection(s.id)}
              className={`shrink-0 rounded-lg border px-3 py-1.5 font-mono text-[10.5px] uppercase ${
                section === s.id ? "border-ember/60 bg-ember/10 text-ember" : "border-line text-dust"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {section === "engines" && (
          <>
            <div>
              <H>Image engines</H>
              <P className="mt-1">
                The default engine paints rows whose <span className="font-mono text-cream">model</span> column is empty. Rows with a model of their own always win.
              </P>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {(Object.keys(PROVIDER_META) as ProviderId[]).map((id) => {
                const m = PROVIDER_META[id];
                const active = settings.provider === id;
                return (
                  <BorderGlow key={id} radius={14} glow={active ? "rgba(242,163,60,0.65)" : "color-mix(in srgb, var(--color-ember) 40%, transparent)"} idle={active ? "rgba(242,163,60,0.55)" : "#3e2f21"} innerClassName={active ? "bg-[var(--color-panel2)]" : "bg-[var(--color-panel)]"}>
                    <button data-tip={`${`Makes ${m.name} the default painter for rows that don't name their own model.`}`} onClick={() => patchSettings({ provider: id })} className="btn-press w-full p-4 text-left">
                      <span className="flex items-center gap-2.5">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: m.dot }} />
                        <span className="font-display text-[15px] tracking-wide text-cream">{m.name}</span>
                        {active && <span className="ml-auto font-mono text-[9px] tracking-widest text-ember uppercase">active</span>}
                      </span>
                      <span className="mt-2 block text-[12px] leading-relaxed text-parch">{m.note}</span>
                      <span className="mt-2 block font-mono text-[10.5px] text-ember">{m.free}</span>
                    </button>
                  </BorderGlow>
                );
              })}
            </div>
            {/* ---- your own machine ---- */}
            <div className="rounded-xl border border-line bg-panel/50 p-4">
              <p className="font-display text-[15px] tracking-wide text-cream">
                Your own machine <span className="ml-1 font-mono text-[10px] text-moss">free · unlimited · private</span>
              </p>
              <p className="mt-1 text-[12px] text-dust">
                If you run LocalAI, ComfyUI, LM Studio or an SD WebUI, point the forge at it. No key, no limit, nothing
                leaves your computer. The model name must match exactly what your server calls it.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block font-mono text-[10px] tracking-[0.2em] text-dust uppercase">server address</label>
                  <input data-tip="The web address of the picture program running on your own computer."
                    value={settings.localBase}
                    onChange={(e) => patchSettings({ localBase: e.target.value.trim() })}
                    placeholder="http://localhost:8080/v1"
                    className={field}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block font-mono text-[10px] tracking-[0.2em] text-dust uppercase">model</label>
                  {localModels.length > 0 ? (
                    <select data-tip="Pick the model your own server has ready. Press Find my models to fill this list."
                      value={settings.localModel}
                      onChange={(e) => patchSettings({ localModel: e.target.value })}
                      className={field}
                    >
                      {!localModels.includes(settings.localModel) && (
                        <option value={settings.localModel}>{settings.localModel} (not on the server)</option>
                      )}
                      {localModels.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input data-tip="Type the model's name exactly the way your own server calls it."
                      value={settings.localModel}
                      onChange={(e) => patchSettings({ localModel: e.target.value.trim() })}
                      placeholder="flux.2-klein-4b"
                      className={field}
                    />
                  )}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Btn data-tip="Asks your own server which models it has so you can pick one."
                  onClick={async () => {
                    setLocalBusy(true);
                    setLocalNote("");
                    try {
                      const base = settings.localBase.replace(/\/+$/, "");
                      const res = await fetch(`${base}/models`, {
                        headers: settings.localKey.trim() ? { Authorization: `Bearer ${settings.localKey.trim()}` } : {},
                      });
                      if (!res.ok) throw new Error(`the server answered ${res.status}`);
                      const json = (await res.json()) as { data?: { id?: string }[] };
                      const ids = (json.data ?? []).map((d) => d.id).filter((x): x is string => Boolean(x)).sort();
                      if (!ids.length) throw new Error("the server has no models loaded");
                      setLocalModels(ids);
                      setLocalNote(`Found ${ids.length} model${ids.length > 1 ? "s" : ""}.`);
                      pushToast("ok", `Found ${ids.length} models on your machine.`);
                    } catch (e) {
                      const why = (e as { message?: string })?.message ?? "unknown";
                      setLocalNote(`Could not reach it — ${why}. Is the server running at that address?`);
                      pushToast("err", `Could not reach your local server — ${why}`);
                    } finally {
                      setLocalBusy(false);
                    }
                  }}
                  disabled={localBusy || !settings.localBase.trim()}
                >
                  {localBusy ? "Looking…" : "Find my models"}
                </Btn>
                {localNote && <span className="text-[11.5px] text-dust">{localNote}</span>}
              </div>
              <TestButton data-tip="Checks that the forge can reach your own server." target="local" settings={settings} label="Check the connection" />
              <p className="mt-2 text-[11px] text-dust">
                Leave the key blank unless your server asks for one. Local pictures are slow — the forge waits up to
                fifteen minutes before giving up on one. A row's own <span className="font-mono text-cream">model</span>{" "}
                column still wins, so you can mix models within one batch (at the cost of a reload between them).
              </p>
            </div>

            {/* ---- Cloudflare: the free one ---- */}
            <div className="rounded-xl border border-line bg-panel/50 p-4">
              <p className="font-display text-[15px] tracking-wide text-cream">
                Cloudflare — the free option <span className="ml-1 font-mono text-[10px] text-moss">recommended</span>
              </p>
              <p className="mt-1 text-[12px] text-dust">
                About 690 pictures a day, free, resetting at midnight UTC. No card needed. Get both of these from your
                Cloudflare dashboard: the account id is in the address bar when you are logged in, and you make a token
                under My Profile → API Tokens with the “Workers AI” permission.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block font-mono text-[10px] tracking-[0.2em] text-dust uppercase">account id</label>
                  <input data-tip="Your Cloudflare account number. You can see it in the address bar when you are logged in to Cloudflare."
                    value={settings.cloudflare.accountId}
                    onChange={(e) => patchSettings({ cloudflare: { ...settings.cloudflare, accountId: e.target.value.trim() } })}
                    placeholder="a1b2c3d4e5f6…"
                    className={field}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block font-mono text-[10px] tracking-[0.2em] text-dust uppercase">api token</label>
                  <input data-tip="Your Cloudflare key. It lets the app use Cloudflare's free picture engine."
                    type="password"
                    value={settings.cloudflare.token}
                    onChange={(e) => patchSettings({ cloudflare: { ...settings.cloudflare, token: e.target.value.trim() } })}
                    placeholder="paste your Workers AI token"
                    className={field}
                  />
                </div>
              </div>
              <div className="mt-3">
                <label className="mb-1.5 block font-mono text-[10px] tracking-[0.2em] text-dust uppercase">
                  quality · {settings.cloudflareSteps} steps
                </label>
                <input data-tip="More steps gives a better picture but fewer pictures a day. Four is the usual setting."
                  type="range"
                  min={1}
                  max={8}
                  step={1}
                  value={settings.cloudflareSteps}
                  onChange={(e) => patchSettings({ cloudflareSteps: Number(e.target.value) })}
                  className="h-1.5 w-full accent-[var(--color-ember)]"
                />
                <p className="mt-1.5 text-[11px] text-dust">
                  More steps means a better picture and fewer pictures per day, because Cloudflare charges by the step.
                  At 4 steps you get roughly 690 a day; at 8 steps roughly 380. Four is the model's intended setting.
                </p>
              </div>
              <TestButton data-tip="Checks that your Cloudflare account number and key work." target="cloudflare" settings={settings} label="Check the account and token" watch={settings.cloudflare.token} />
            </div>

            {/* ---- Pollinations: free, but needs a token now ---- */}
            <div className="rounded-xl border border-line bg-panel/50 p-4">
              <p className="font-display text-[15px] tracking-wide text-cream">Pollinations token</p>
              <p className="mt-1 text-[12px] text-dust">
                Pollinations stopped serving anonymous requests — without a token every picture fails with “Missing
                Turnstile token”. A free token at <span className="font-mono text-cream">auth.pollinations.ai</span> fixes
                it and removes the watermark. Unlimited in total, but paced to one picture every few seconds.
              </p>
              <div className="mt-3">
                <input data-tip="Your free Pollinations key. Without it, Pollinations refuses every picture."
                  type="password"
                  value={settings.pollinationsToken}
                  onChange={(e) => patchSettings({ pollinationsToken: e.target.value.trim() })}
                  placeholder="paste your free Pollinations token"
                  className={field}
                />
              </div>
              <TestButton data-tip="Checks that your Pollinations key works." target="pollinations" settings={settings} label="Check the token" watch={settings.pollinationsToken} />
            </div>

            {/* ---- OVHcloud: free, nothing to set up ---- */}
            <div className="rounded-xl border border-line bg-panel/50 p-4">
              <p className="font-display text-[15px] tracking-wide text-cream">OVHcloud SDXL</p>
              <p className="mt-1 text-[12px] text-dust">
                Stable Diffusion XL, hosted free by OVHcloud. No key, no signup, nothing to fill in. Paced to two
                pictures a minute, so the queue waits its turn rather than failing. Always 1024×1024, and it takes no
                seed — the same prompt twice gives two different pictures. Put{" "}
                <span className="font-mono text-cream">ovh-sdxl</span> in a row's model column, or pick it as the engine.
              </p>
              <TestButton data-tip="Checks that the OVHcloud picture engine is up and answering." target="ovh" settings={settings} label="Check it is up" />
            </div>

            <PauseSwitch
              engine="ovh"
              label="OVHcloud"
              settings={settings}
              patchSettings={patchSettings}
              note="Paused means OVHcloud stops being offered as a free fallback and rows routed to it stop immediately."
            />

            <PauseSwitch
              engine="gemini"
              label="Google"
              settings={settings}
              patchSettings={patchSettings}
              note="Paused means rows routed to Google stop immediately with a plain message, instead of spending thirty seconds each proving the account still has no credit. Your keys and settings are kept exactly as they are."
            />

            <KeyPoolEditor
              title="Google keys — FREE accounts"
              hint="keys at aistudio.google.com/apikey · tried first, and expected to run out. Add one per project to stretch the allowance further."
              pool={settings.geminiKeys}
              onChange={(k) => patchSettings({ geminiKeys: k })}
              pushToast={pushToast}
              test="gemini-free"
              settings={settings}
            />
            <KeyPoolEditor
              title="Google keys — PAID accounts"
              hint="only reached once every free key above is resting, so a free allowance is never wasted while money is spent."
              pool={settings.geminiPaidKeys}
              onChange={(k) => patchSettings({ geminiPaidKeys: k })}
              pushToast={pushToast}
              test="gemini-paid"
              settings={settings}
              credits
            />
            <div className="rounded-xl border border-line bg-panel/50 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block font-mono text-[10px] tracking-[0.2em] text-dust uppercase">
                    default Google model
                  </label>
                  <select data-tip="The Google model used for rows that don't name one. The price per picture is shown next to each name."
                    value={settings.geminiModel}
                    onChange={(e) => patchSettings({ geminiModel: e.target.value })}
                    className={field}
                  >
                    {MODELS.filter((m) => m.engine === "gemini").map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label} — {formatUsd(m.priceUsd)}/image
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block font-mono text-[10px] tracking-[0.2em] text-dust uppercase">picture size</label>
                  <select data-tip="How big Google paints each picture. Bigger pictures cost more."
                    value={settings.geminiImageSize}
                    onChange={(e) => patchSettings({ geminiImageSize: e.target.value })}
                    className={field}
                  >
                    <option value="512px">512px — cheapest</option>
                    <option value="1K">1K — the usual choice</option>
                    <option value="2K">2K — costs more</option>
                    <option value="4K">4K — costs most</option>
                  </select>
                </div>
              </div>
            </div>
            <KeyPoolEditor
              title="OpenAI-compatible key pool"
              hint="OpenAI, Together, OpenRouter, local SD WebUI — anything with /images/generations"
              pool={settings.openaiKeys}
              onChange={(k) => patchSettings({ openaiKeys: k })}
              pushToast={pushToast}
              test="openai"
              settings={settings}
            />
            <div className="rounded-xl border border-line bg-panel/50 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block font-mono text-[10px] tracking-[0.2em] text-dust uppercase">endpoint base URL</label>
                  <input data-tip="The web address of the OpenAI-style service the forge sends picture requests to." value={settings.openaiBase} onChange={(e) => patchSettings({ openaiBase: e.target.value })} className={field} />
                </div>
                <div>
                  <label className="mb-1.5 block font-mono text-[10px] tracking-[0.2em] text-dust uppercase">default model id</label>
                  <input data-tip="The model name used when a row doesn't name one." value={settings.openaiModel} onChange={(e) => patchSettings({ openaiModel: e.target.value })} className={field} />
                </div>
              </div>
            </div>
            {/* ---- what each picture costs ---- */}
            <div className="rounded-xl border border-line bg-panel/50 p-4">
              <p className="font-display text-[15px] tracking-wide text-cream">What each picture costs</p>
              <p className="mt-1 text-[12px] text-dust">
                Checked against the providers on 2 September 2026. “Batch” is Google's half price for pictures you are
                happy to wait for.
              </p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-[12px]">
                  <thead>
                    <tr className="font-mono text-[9.5px] tracking-[0.18em] text-dust uppercase">
                      <th className="py-1.5 pr-3">model</th>
                      <th className="py-1.5 pr-3">each</th>
                      <th className="py-1.5 pr-3">batch</th>
                      <th className="py-1.5">free allowance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MODELS.map((m) => (
                      <tr key={m.id} className="border-t border-line/60">
                        <td className="py-1.5 pr-3">
                          <span className="block font-mono text-[11.5px] text-cream">{m.id}</span>
                          <span className="block text-[10.5px] text-dust">{m.label}</span>
                          {m.retiresOn && (
                            <span className="block font-mono text-[9.5px] text-rust">switched off {m.retiresOn}</span>
                          )}
                        </td>
                        <td className="py-1.5 pr-3 font-mono text-[11.5px] text-cream">{formatUsd(m.priceUsd)}</td>
                        <td className="py-1.5 pr-3 font-mono text-[11.5px] text-moss">
                          {m.batchPriceUsd === null ? "—" : formatUsd(m.batchPriceUsd)}
                        </td>
                        <td className="py-1.5 text-[11px] text-parch">{m.allowance}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ---- writing inside pictures ---- */}
            <div className="rounded-xl border border-line bg-panel/50 p-4">
              <p className="font-display text-[15px] tracking-wide text-cream">Writing inside pictures</p>
              <p className="mt-1 text-[12px] text-dust">
                Most models cannot spell. Ask a small model for a shop sign and you get convincing gibberish. Only
                Google's models and DALL·E write real words reliably.
              </p>
              <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-lg border border-line bg-[var(--color-field)] px-3 py-2.5">
                <input data-tip="When on, the forge tells models that can't spell not to draw words, so you don't get gibberish text. Your manifest is not changed."
                  type="checkbox"
                  checked={settings.suppressTextOnWeakModels}
                  onChange={(e) => patchSettings({ suppressTextOnWeakModels: e.target.checked })}
                  className="h-4 w-4 accent-[var(--color-ember)]"
                />
                <span>
                  <span className="block text-[13px] font-semibold text-cream">
                    Tell weak models not to attempt writing
                  </span>
                  <span className="block text-[11.5px] text-dust">
                    Quietly adds “no text, letters, words, watermark” to the negatives whenever the chosen model is bad
                    at spelling. Your manifest is not changed. Models that write well are left alone.
                  </span>
                </span>
                {settings.suppressTextOnWeakModels && <ICheck size={15} className="ml-auto shrink-0 text-moss" />}
              </label>
              <div className="mt-3">
                <label className="mb-1.5 block font-mono text-[10px] tracking-[0.2em] text-dust uppercase">
                  how good is YOUR local model at writing?
                </label>
                <select data-tip="Tells the forge how well your own model writes words, so it knows when to keep words out of pictures."
                  value={settings.localTextQuality}
                  onChange={(e) => patchSettings({ localTextQuality: e.target.value as typeof settings.localTextQuality })}
                  className={field}
                >
                  <option value="poor">Poor — it produces gibberish (FLUX klein, Z-Image, SD 1.5)</option>
                  <option value="fair">Fair — short words usually survive</option>
                  <option value="good">Good — it writes real sentences</option>
                </select>
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-[11.5px]">
                  <thead>
                    <tr className="font-mono text-[9.5px] tracking-[0.18em] text-dust uppercase">
                      <th className="py-1 pr-3">model</th>
                      <th className="py-1">can it write?</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MODELS.map((m) => {
                      const q = MODEL_TRAITS[m.id]?.textQuality ?? "fair";
                      const tone = q === "good" ? "text-moss" : q === "fair" ? "text-ember" : "text-rust";
                      return (
                        <tr key={m.id} className="border-t border-line/60">
                          <td className="py-1 pr-3 font-mono text-cream">{m.id}</td>
                          <td className={`py-1 font-mono ${tone}`}>{q}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ---- prompt tailor ---- */}
            <div className="rounded-xl border border-line bg-panel/50 p-4">
              <p className="font-display text-[15px] tracking-wide text-cream">
                Tailor prompts to the model <span className="ml-1 font-mono text-[10px] text-dust">off by default</span>
              </p>
              <p className="mt-1 text-[12px] text-dust">
                Different painters want different instructions. Google reads long flowing sentences; a small model on
                your own machine wants one short concrete line. Switch this on and your text model (Settings → Text
                engines) rewrites each prompt to suit whoever is drawing it — just before sending, never in your
                manifest. If the text model is unreachable the original prompt is used and the forge says so.
              </p>
              <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-lg border border-line bg-[var(--color-field)] px-3 py-2.5">
                <input data-tip="When on, your text model rewrites each prompt to suit the picture engine just before it is sent. Your manifest is not changed."
                  type="checkbox"
                  checked={settings.tailorPrompts}
                  onChange={(e) => patchSettings({ tailorPrompts: e.target.checked })}
                  className="h-4 w-4 accent-[var(--color-ember)]"
                />
                <span>
                  <span className="block text-[13px] font-semibold text-cream">Rewrite each prompt for its model</span>
                  <span className="block text-[11.5px] text-dust">
                    Costs one small text request per picture. Repeated prompts are remembered, so a re-run is free.
                  </span>
                </span>
                {settings.tailorPrompts && <ICheck size={15} className="ml-auto shrink-0 text-moss" />}
              </label>
              {settings.tailorPrompts && !settings.scribe.key.trim() && (
                <p className="mt-2 rounded-lg border border-blood/40 bg-blood/10 px-3 py-2 text-[11.5px] text-blood">
                  You have no text-engine key yet, so this will do nothing. Add one under Settings → Text engines.
                </p>
              )}
            </div>

            {/* ---- speed dial ---- */}
            <div className="rounded-xl border border-line bg-panel/50 p-4">
              <p className="font-display text-[15px] tracking-wide text-cream">Speed — how many at once</p>
              <p className="mt-1 text-[12px] text-dust">
                1 means one picture at a time, exactly as the forge has always worked. Turning it up finishes big batches
                faster, at the cost of hitting rate limits sooner — the forge already handles that by resting the key and
                moving on, so the risk is a slower run, not lost work.
              </p>
              <div className="mt-3 flex items-center gap-4">
                <input data-tip="How many pictures are made at the same time. Higher is faster but hits rate limits sooner."
                  type="range"
                  min={1}
                  max={6}
                  step={1}
                  value={settings.concurrency}
                  onChange={(e) => patchSettings({ concurrency: Number(e.target.value) })}
                  className="h-1.5 flex-1 accent-[var(--color-ember)]"
                />
                <span className="w-28 shrink-0 text-right font-mono text-[12px] text-cream">
                  {settings.concurrency === 1 ? "one at a time" : `${settings.concurrency} at once`}
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-line bg-panel/50 p-4">
              <p className="font-display text-[15px] tracking-wide text-cream">Cooldowns — you choose the wait</p>
              <p className="mt-1 text-[12px] text-dust">hours a row rests after its whole key pool is rate-limited. 24h suits daily quotas; 0 retries at once.</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {MODELS.map((m) => (
                  <div key={m.id} className="flex items-center gap-2.5 rounded-lg border border-line bg-[var(--color-field)] px-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-[11.5px] text-cream">{m.id}</span>
                      <span className="block font-mono text-[9px] text-dust">{m.free} · used {usedToday(settings.usage, m.id)}/day</span>
                    </span>
                    <input data-tip={`${`Hours ${m.id} rests after all its keys are rate-limited. 0 means try again straight away.`}`}
                      type="number"
                      min={0}
                      value={settings.cooldowns[m.id] ?? m.defaultCooldownH}
                      onChange={(e) => patchSettings({ cooldowns: { ...settings.cooldowns, [m.id]: Math.max(0, parseFloat(e.target.value) || 0) } })}
                      className="w-16 rounded-md border border-line bg-panel2 px-2 py-1 text-right font-mono text-[12px] text-cream"
                    />
                    <span className="font-mono text-[10px] text-dust">h</span>
                  </div>
                ))}
              </div>
            </div>

            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-line bg-panel/50 px-4 py-3">
              <input data-tip="When on, a row that was waiting out a pause goes back in the queue by itself once the pause ends."
                type="checkbox"
                checked={settings.autoRetry}
                onChange={(e) => patchSettings({ autoRetry: e.target.checked })}
                className="h-4 w-4 accent-[var(--color-ember)]"
              />
              <span>
                <span className="block text-[13.5px] font-semibold text-cream">Automatic retry</span>
                <span className="block text-[11.5px] text-dust">
                  when a parked row's cooldown expires, the forge quietly puts it back in the queue
                </span>
              </span>
              {settings.autoRetry && <ICheck size={15} className="ml-auto text-moss" />}
            </label>
          </>
        )}

        {section === "styles" && (
          <>
            <H>Image styles</H>
            <P>Styles live in the library now — lock them, add your own languages, keep every batch consistent.</P>
            <Btn data-tip="Opens the style library, where you pick, lock and add looks." variant="primary" onClick={onGoStyles}>Open the style library →</Btn>
            <P className="mt-1">
              {STYLE_CATALOGUE.length} looks, grouped. Each one knows which models suit it and which of those you have
              set up. The <span className="text-moss">green</span> model is what it will use if you change nothing — always
              the best free option you have, except where the look needs readable words.
            </P>

            {STYLE_GROUPS.map((group) => {
              const inGroup = stylesInGroup(group.id);
              if (!inGroup.length) return null;
              return (
                <div key={group.id} className="rounded-xl border border-line bg-panel/50 p-4">
                  <p className="font-display text-[15px] tracking-wide text-cream">
                    {group.label} <span className="ml-1 font-mono text-[10px] text-dust">{group.hint}</span>
                  </p>
                  <div className="mt-3 grid gap-2.5 lg:grid-cols-2">
                    {inGroup.map((st) => {
                      const usable = availableModelsForStyle(st, settings);
                      const pick = defaultModelForStyle(st, settings);
                      const locked = styleLock === st.id;
                      return (
                        <div
                          key={st.id}
                          className={`rounded-lg border p-3 ${locked ? "border-ember/60 bg-ember/8" : "border-line bg-[var(--color-field)]"}`}
                        >
                          <div className="flex items-start gap-2.5">
                            <span className="mt-0.5 flex shrink-0 overflow-hidden rounded">
                              {st.swatch.map((c) => (
                                <span key={c} className="h-4 w-4" style={{ background: c }} />
                              ))}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-[13px] font-semibold text-cream">
                                {st.name}
                                {st.needsText && (
                                  <span className="ml-1.5 font-mono text-[9px] tracking-wider text-ember uppercase">
                                    needs words
                                  </span>
                                )}
                              </p>
                              <p className="mt-0.5 text-[11.5px] leading-snug text-dust">{st.blurb}</p>
                            </div>
                            <button data-tip={`${locked ? `${st.name} is added to every prompt now. Click to turn it off.` : `Adds the ${st.name} look to every prompt so the whole batch matches.`}`}
                              onClick={() => onLockStyle?.(st.id)}
                              className={`btn-press shrink-0 rounded-md px-2 py-1 font-mono text-[9.5px] tracking-wider uppercase ${
                                locked ? "bg-ember text-[var(--color-on-accent)]" : "border border-line text-dust hover:text-cream"
                              }`}
                            >
                              {locked ? "in use" : "use"}
                            </button>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            {st.recommended.map((m) => {
                              const have = usable.includes(m);
                              const isPick = m === pick;
                              const label = m === "local" ? "your machine" : m;
                              return (
                                <span
                                  key={m}
                                  title={
                                    have
                                      ? isPick
                                        ? "this is what it will use"
                                        : "set up and available"
                                      : "not set up yet — add it under Image engines"
                                  }
                                  className={`rounded px-1.5 py-0.5 font-mono text-[9.5px] ${
                                    isPick
                                      ? "bg-moss/20 text-moss"
                                      : have
                                        ? "border border-line text-parch"
                                        : "border border-line/50 text-dust/50 line-through"
                                  }`}
                                >
                                  {label}
                                </span>
                              );
                            })}
                            {!usable.length && (
                              <span className="font-mono text-[9.5px] text-blood">no engine set up for this yet</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </>
        )}

        {section === "text" && (
          <>
            <div>
              <H>Text engines</H>
              <P className="mt-1">
                Three jobs — writing, code and vision — drawing on the accounts you set up once. Anything that speaks{" "}
                <span className="font-mono text-cream">/chat/completions</span> works.
              </P>
            </div>
            <TextEngines settings={settings} patchSettings={patchSettings} />
          </>
        )}

        {section === "prompts" && (
          <>
            <div>
              <H>Text prompts</H>
              <P className="mt-1">
                These are the instructions the writer follows. Empty means “use the built-in”. Change them to bend the
                AI to your taste — adjust image prompts, filename forging, style picking, WordPress metadata, and the factory itself.
              </P>
            </div>
            {(
              [
                ["promptWriter", "Image prompt writer", "rewrites short notes into full prompts ending in the style block"],
                ["factory", "Prompt factory", "invents whole lists of ideas with filenames and negative prompts"],
                ["filenameForger", "Filename forger", "turns prompts into rule-perfect filenames"],
                ["stylePicker", "Style picker", "chooses the visual language for a subject"],
                ["wpMeta", "WordPress metadata", "writes title / alt / caption JSON"],
              ] as const
            ).map(([key, label, hint]) => (
              <div key={key} className="rounded-xl border border-line bg-panel/50 p-4">
                <div className="flex items-center justify-between">
                  <p className="font-display text-[14px] tracking-wide text-cream">{label}</p>
                  {settings.metaPrompts[key] && (
                    <button data-tip="Throws away your changes and goes back to the built-in instructions." onClick={() => patchSettings({ metaPrompts: { ...settings.metaPrompts, [key]: "" } })} className="btn-press font-mono text-[10px] text-dust underline hover:text-blood">
                      reset to built-in
                    </button>
                  )}
                </div>
                <p className="mt-0.5 text-[11.5px] text-dust">{hint}</p>
                <textarea data-tip={`${`Your own instructions for ${label}. Leave it empty to use the built-in ones.`}`}
                  value={settings.metaPrompts[key]}
                  onChange={(e) => patchSettings({ metaPrompts: { ...settings.metaPrompts, [key]: e.target.value } })}
                  rows={3}
                  placeholder="(built-in instructions — type here to override)"
                  className={`${field} mt-2 resize-y font-mono !text-[11.5px]`}
                />
              </div>
            ))}
          </>
        )}

        {section === "filenames" && (
          <>
            <H>Filenames</H>
            <P className="max-w-2xl">
              The rules every filename must pass. They are checked as you type and fixed with one click. Switch off any
              that do not suit your project — three cannot be switched off, and each says why.
            </P>
            <ul className="space-y-2">
              {RULES.map((rule, i) => {
                const on = rule.optional ? (settings.filenameRules[rule.id] ?? true) : true;
                return (
                  <li
                    key={rule.id}
                    className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${
                      on ? "border-line bg-panel/50" : "border-line/50 bg-panel/20"
                    }`}
                  >
                    <span className={`font-display text-[15px] ${on ? "text-ember" : "text-dust/50"}`}>{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-[13px] ${on ? "text-parch" : "text-dust/60 line-through"}`}>
                        {rule.label}
                      </span>
                      <span className="mt-0.5 block text-[11.5px] leading-snug text-dust">{rule.why}</span>
                    </span>
                    {rule.optional ? (
                      <button data-tip={`${`Turns the rule "${rule.label}" on or off.`}`}
                        onClick={() =>
                          patchSettings({
                            filenameRules: { ...settings.filenameRules, [rule.id]: !on },
                          })
                        }
                        role="switch"
                        aria-checked={on}
                        aria-label={rule.label}
                        className={`mt-0.5 h-5 w-9 shrink-0 rounded-full border transition ${
                          on ? "border-ember/60 bg-ember/30" : "border-line bg-panel2"
                        }`}
                      >
                        <span
                          className={`block h-3.5 w-3.5 rounded-full transition-transform ${
                            on ? "translate-x-4 bg-ember" : "translate-x-0.5 bg-dust"
                          }`}
                        />
                      </button>
                    ) : (
                      <span
                        className="mt-0.5 shrink-0 rounded-full border border-line px-2 py-0.5 font-mono text-[9.5px] text-dust uppercase"
                        title="This one protects your files, so it cannot be switched off."
                      >
                        always
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {section === "folders" && (
          <>
            <H>Folders</H>
            <P className="max-w-2xl">
              Link one folder and every finished picture saves itself into <span className="font-mono text-cream">{SUBFOLDERS.join(" / ")}</span>. Your
              pre-created subfolders are used as-is; missing ones are created. Point it at your Google Drive sync folder and files float to the cloud.
            </P>
            <div className={`rounded-xl border p-4 ${folder.linked ? "border-moss/50 bg-moss/8" : "border-line bg-panel/50"}`}>
              <div className="flex items-center gap-3">
                <IFolder size={20} className={folder.linked ? "text-moss" : "text-dust"} />
                <div className="flex-1">
                  <p className="font-display text-[15px] tracking-wide text-cream">{folder.linked ? folder.name : folder.pendingName ? `${folder.pendingName} (needs one click)` : "No folder linked"}</p>
                  <p className="text-[12px] text-parch">
                    {folder.linked ? "auto-save is on · the CSV refreshes after every run" : folder.pendingName ? "the browser wants you to re-confirm permission once" : "needs Chrome or Edge · the ZIP door always works"}
                  </p>
                </div>
                <div className="flex gap-2">
                  {fsSupported() && <Btn data-tip={`${folder.linked ? `Pick a different folder for your finished pictures.` : `Pick the folder on your computer where finished pictures are saved automatically.`}`} variant="primary" onClick={onLinkFolder}>{folder.linked ? "Change" : folder.pendingName ? "Re-link" : "Link folder…"}</Btn>}
                  {folder.linked && (
                    <>
                      <Btn data-tip="Saves everything that is finished into the linked folder again." onClick={onSyncAll}>Sync all now</Btn>
                      <Btn data-tip="Stops saving into this folder. The files already in it stay where they are." variant="danger" onClick={onUnlinkFolder}>
                        <IX size={12} /> Unlink
                      </Btn>
                    </>
                  )}
                </div>
              </div>
              {folder.error && (
                <p className="mt-3 flex items-start gap-2 rounded-lg border border-blood/30 bg-blood/8 px-3 py-2 text-[12px] text-blood">
                  <IAlert size={13} className="mt-0.5 shrink-0" /> {folder.error}
                </p>
              )}
            </div>
            <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-parch">
              <input data-tip="When on, the forge updates the manifest CSV file inside your folder after each run." type="checkbox" checked={settings.writeCsvOnSync} onChange={(e) => patchSettings({ writeCsvOnSync: e.target.checked })} className="accent-[var(--color-ember)]" />
              refresh marketplace-images.csv inside the folder after each run
            </label>
          </>
        )}

        {section === "wp" && (
          <>
            <div>
              <H>WP connections</H>
              <P className="mt-1">
                The forge can upload finished plates straight into a WordPress Media Library using an{" "}
                <span className="font-mono text-cream">application password</span> (Users → Profile → Application Passwords in WP admin). Imagify
                then optimizes whatever lands there, and attachment IDs are written back into the manifest.
              </P>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1.5 block font-mono text-[10px] tracking-[0.2em] text-dust uppercase">site URL</label>
                <input data-tip="The web address of your WordPress site." value={settings.wp.url} onChange={(e) => patchSettings({ wp: { ...settings.wp, url: e.target.value } })} placeholder="https://example.com" className={field} />
              </div>
              <div>
                <label className="mb-1.5 block font-mono text-[10px] tracking-[0.2em] text-dust uppercase">username</label>
                <input data-tip="Your WordPress login name." value={settings.wp.user} onChange={(e) => patchSettings({ wp: { ...settings.wp, user: e.target.value } })} className={field} />
              </div>
              <div>
                <label className="mb-1.5 block font-mono text-[10px] tracking-[0.2em] text-dust uppercase">application password</label>
                <input data-tip="A special password WordPress makes for apps like this one. It is not your normal login password." type="password" value={settings.wp.appPassword} onChange={(e) => patchSettings({ wp: { ...settings.wp, appPassword: e.target.value } })} placeholder="xxxx xxxx xxxx xxxx" className={field} />
              </div>
            </div>
            <p className="text-[12px] text-dust">
              CORS note: many hosts allow browser requests to <span className="font-mono">/wp-json/wp/v2/media</span>; if yours doesn't, the Agents &amp; API page in Docs has the n8n-friendly recipe.
            </p>
            <div className="rounded-xl border border-line bg-panel/50 p-4">
              <p className="font-mono text-[10px] tracking-[0.22em] text-dust uppercase">what an upload writes back</p>
              <p className="mt-1.5 font-mono text-[11.5px] text-parch">
                status → <span className="text-lagoon">imported</span> · imported_attachment_id → <span className="text-lagoon">{"{the id WordPress returns}"}</span>
              </p>
            </div>
          </>
        )}

        {section === "appearance" && (
          <>
            <H>Language</H>
            <p className="mt-1 max-w-xl text-[13px] text-parch">
              The language the app's own words are in. More are coming once the app has settled — they will come in the simple,
              explain-it-like-I'm-five voice. Your pictures and prompts can be in any language today.
            </p>
            <div className="mt-4 grid max-w-xl grid-cols-2 gap-2 sm:grid-cols-3">
              {[
                ["English", "English", true],
                ["Ελληνικά", "Greek", false],
                ["Français", "French", false],
                ["Deutsch", "German", false],
                ["Español", "Spanish", false],
                ["Português", "Portuguese", false],
              ].map(([own, en, ready]) => (
                <div
                  key={String(en)}
                  title={ready ? "The language the app is in now." : `${en}: coming soon.`}
                  className={`rounded-xl border px-4 py-3 ${ready ? "border-ember/60 bg-ember/10 text-cream" : "border-line text-dust"}`}
                >
                  <div className="text-[14px]">{own}</div>
                  <div className="mt-0.5 text-[11px]">{ready ? "in use" : "coming soon"}</div>
                </div>
              ))}
            </div>
            <PetCard />
          </>
        )}

        {section === "advanced" && (
          <>
            <div className="flex items-end justify-between gap-3">
              <div>
                <H>Advanced</H>
                <P className="mt-1">Care, recovery and updates for the forge itself.</P>
              </div>
              <span className="shrink-0 rounded-lg border border-line bg-panel/60 px-3 py-1.5 font-mono text-[11px] text-parch">
                v{appVersion}
              </span>
            </div>

            <HealthCheck settings={settings} rows={rows} onRepair={onRepair} />

            {/* repair */}
            <div className="rounded-xl border border-line bg-panel/50 p-4">
              <p className="font-display text-[15px] tracking-wide text-cream">Repair</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-dust">
                If the forge is acting strange, this fixes the usual suspects in one pass: rows stuck mid-strike go back
                to <span className="font-mono text-parch">pending</span>, duplicate filenames get a suffix, the
                shops/items/events/npcs structure in your linked folder is re-created, and a fresh CSV is written there.
              </p>
              <Btn data-tip="Fixes the usual problems in one go: stuck rows go back to waiting and duplicate filenames get a number added."
                variant="primary"
                className="mt-3"
                disabled={repairBusy}
                onClick={async () => {
                  setRepairBusy(true);
                  try {
                    await onRepair();
                  } finally {
                    setRepairBusy(false);
                  }
                }}
              >
                <IRetry size={13} /> {repairBusy ? "Repairing…" : "Run repair"}
              </Btn>
            </div>

            {/* update from github */}
            <div className="rounded-xl border border-line bg-panel/50 p-4">
              <p className="font-display text-[15px] tracking-wide text-cream">Sync &amp; update from GitHub</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-dust">
                Point the forge at its repository. Then you can pull the manifest straight from the repo (great when an
                agent or a teammate edits the CSV there), and check whether a newer installer has been published.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block font-mono text-[9.5px] tracking-[0.2em] text-dust uppercase">repo owner</label>
                  <input data-tip="The GitHub account or group that owns the repository." value={settings.github.owner} onChange={(e) => patchSettings({ github: { ...settings.github, owner: e.target.value } })} placeholder="your-github-name" className={`${field} font-mono !text-[12px]`} />
                </div>
                <div>
                  <label className="mb-1 block font-mono text-[9.5px] tracking-[0.2em] text-dust uppercase">repo name</label>
                  <input data-tip="The name of the repository on GitHub." value={settings.github.repo} onChange={(e) => patchSettings({ github: { ...settings.github, repo: e.target.value } })} placeholder="image-forge" className={`${field} font-mono !text-[12px]`} />
                </div>
                <div>
                  <label className="mb-1 block font-mono text-[9.5px] tracking-[0.2em] text-dust uppercase">branch</label>
                  <input data-tip="The branch to read from, like main." value={settings.github.branch} onChange={(e) => patchSettings({ github: { ...settings.github, branch: e.target.value } })} placeholder="main" className={`${field} font-mono !text-[12px]`} />
                </div>
                <div>
                  <label className="mb-1 block font-mono text-[9.5px] tracking-[0.2em] text-dust uppercase">manifest path in repo</label>
                  <input data-tip="Where the manifest CSV file sits inside the repository." value={settings.github.csvPath} onChange={(e) => patchSettings({ github: { ...settings.github, csvPath: e.target.value } })} placeholder="marketplace-images.csv" className={`${field} font-mono !text-[12px]`} />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <div className="flex overflow-hidden rounded-lg border border-line">
                  {(["merge", "replace"] as const).map((m) => (
                    <button data-tip={`${m === "merge" ? `Adds the pulled rows to the ones you already have.` : `Swaps your rows for the pulled ones.`}`}
                      key={m}
                      onClick={() => setPullMode(m)}
                      className={`btn-press px-3 py-2 font-mono text-[10.5px] uppercase ${pullMode === m ? "bg-ember/15 text-ember" : "text-dust hover:text-cream"}`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                <Btn data-tip="Downloads the manifest from the repository and loads it into the forge."
                  onClick={async () => {
                    setPullBusy(true);
                    try {
                      await onPullManifest(pullMode);
                    } finally {
                      setPullBusy(false);
                    }
                  }}
                  disabled={pullBusy}
                >
                  <IDownload size={13} /> {pullBusy ? "Pulling…" : "Pull manifest"}
                </Btn>
                <Btn data-tip="Checks whether a newer version of the app has been published."
                  variant="moss"
                  onClick={async () => {
                    setUpdateBusy(true);
                    try {
                      await onCheckUpdate();
                    } finally {
                      setUpdateBusy(false);
                    }
                  }}
                  disabled={updateBusy}
                >
                  <ISparkle size={13} /> {updateBusy ? "Checking…" : "Check for app update"}
                </Btn>
              </div>
              <p className="mt-2 text-[11px] text-dust">
                Pull reads <span className="font-mono text-parch">raw.githubusercontent.com</span> — the repo must be public (or use a gist).
                The update check reads the repo's latest release. In the desktop app, <span className="text-parch">Update now</span> downloads its <span className="font-mono text-parch">Setup.exe</span>, installs it and reopens Image Forge — your settings and pictures are not touched.
              </p>
            </div>

            <DesktopModeCard pushToast={pushToast} />

            {/* reset */}
            <div className="rounded-xl border border-blood/25 bg-blood/4 p-4">
              <p className="font-display text-[15px] tracking-wide text-cream">Reset — start from a clean slate</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-dust">
                Wipes local app data <em>only</em> — images already written to your folders on disk are never touched.
                Tick exactly what should go, then confirm twice.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {(
                  [
                    { key: "rows", label: "Manifest & generated previews", desc: "every row, status, cooldown and note" },
                    { key: "recipes", label: "Recipes & previous batches", desc: "saved wizard setups and batch history" },
                    { key: "settings", label: "Settings, styles & API keys", desc: "engines, keys, cooldowns" },
                    { key: "market", label: "Marketplace progress", desc: "Emberfair purse, satchel, standing" },
                  ] as const
                ).map((o) => (
                  <label key={o.key} className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line bg-[var(--color-field)] px-3 py-2.5">
                    <input data-tip={`${`Tick to erase: ${o.label}.`}`}
                      type="checkbox"
                      checked={resetChecks[o.key]}
                      onChange={(e) => {
                        setResetChecks((c) => ({ ...c, [o.key]: e.target.checked }));
                        setConfirmReset(false);
                      }}
                      className="mt-0.5 accent-[#e2593f]"
                    />
                    <span>
                      <span className="block text-[12.5px] font-semibold text-parch">{o.label}</span>
                      <span className="block text-[10.5px] text-dust">{o.desc}</span>
                    </span>
                  </label>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Btn data-tip="Saves a backup file first so you can get things back after a reset." onClick={onBackup}>
                  <IDownload size={13} /> Download backup first
                </Btn>
                <Btn data-tip="Erases the things you ticked. It asks you to click twice because it can't be undone."
                  variant="danger"
                  disabled={!resetChecks.rows && !resetChecks.recipes && !resetChecks.settings && !resetChecks.market}
                  onClick={() => {
                    if (!confirmReset) {
                      setConfirmReset(true);
                      pushToast("info", "One more click to really erase — this cannot be undone.");
                      return;
                    }
                    onReset(resetChecks);
                  }}
                >
                  <ITrash size={13} /> {confirmReset ? "Click again — erase for real" : "Reset the checked things"}
                </Btn>
              </div>
            </div>

            {/* uninstall */}
            <div className="rounded-xl border border-line bg-panel/50 p-4">
              <p className="font-display text-[15px] tracking-wide text-cream">Uninstall the desktop app</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-dust">
                The installer registered a proper Windows uninstaller. Use the Start Menu entry or Windows Settings —
                on the way out it asks whether to also remove your forge data from{" "}
                <span className="font-mono text-parch">%APPDATA%\Image Forge</span>. Say no if you plan to reinstall;
                your data survives either way until you opt in.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <a data-tip="Opens the Windows list of installed apps, where you can uninstall Image Forge."
                  href="ms-settings:appsfeatures"
                  target="_blank"
                  rel="noreferrer"
                  className="btn-press inline-flex items-center gap-2 rounded-lg border border-line bg-panel2/70 px-3.5 py-2 text-[13px] font-semibold text-cream hover:border-line2"
                >
                  <IFolder size={14} /> Open Windows “Installed apps”
                </a>
                <span className="font-mono text-[10.5px] text-dust">…then find “Image Forge” → Uninstall</span>
              </div>
              <p className="mt-2.5 text-[11px] text-dust">
                Prefer to keep the app but lose the data? The reset above does exactly that without uninstalling anything.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** The cursor pet: on or off, the built-in fox or a walk cycle you made. */
function PetCard() {
  const [pet, setPet] = useState<PetChoice>(loadPet);
  const set = (p: PetChoice) => {
    savePet(p);
    setPet(p);
  };
  return (
    <div className="mt-8 max-w-xl">
      <H>Your cursor pet</H>
      <p className="mt-1 text-[13px] text-parch">
        A little creature that runs after your mouse, sits when it catches up and naps if you stop. Make your own with
        Wizards → Animate a character → Walk cycle → “Make it my cursor pet”.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          data-tip="Show the pet."
          onClick={() => set({ ...pet, on: true })}
          className={`btn-press rounded-lg border px-4 py-2 text-[13px] ${pet.on ? "border-ember/60 bg-ember/15 text-cream" : "border-line text-parch"}`}
        >
          On
        </button>
        <button
          data-tip="No pet."
          onClick={() => set({ ...pet, on: false })}
          className={`btn-press rounded-lg border px-4 py-2 text-[13px] ${!pet.on ? "border-ember/60 bg-ember/15 text-cream" : "border-line text-parch"}`}
        >
          Off
        </button>
        {pet.custom && (
          <button data-tip={`Go back to the little fox instead of ${pet.custom.name}.`} onClick={() => set({ on: true })} className="btn-press rounded-lg border border-line px-4 py-2 text-[13px] text-parch">
            Back to the fox (now: {pet.custom.name})
          </button>
        )}
      </div>
    </div>
  );
}
