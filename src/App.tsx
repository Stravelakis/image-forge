import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { AspectKey, Category, LogEntry, ManifestRow, Status, Toast } from "./types";
import { ASPECTS, STYLES, accentHex, migrateCategory } from "./types";
import { APP_VERSION } from "./lib/version";
import { checkForge, isNewerThan } from "./lib/selfCheck";
import { surfacesFor } from "./lib/theme";

/**
 * Where this app comes from. Used when the user has not set their own repo,
 * so the update check works out of the box. A fork's own setting still wins.
 */
const HOME_REPO = { owner: "Stravelakis", repo: "image-forge" };

type UpdateReady = {
  version: string;
  notesUrl: string;
  assetName: string;
  assetUrl: string;
  sizeNote: string;
};
import { SEED_ROWS } from "./lib/seed";
import { downloadCsv, parseCsv, rowsFromCsv, rowsToCsv } from "./lib/csv";
import { renderPreview } from "./lib/preview";
import { nameForMime, styleDriftCount, uniqueName, violationCount, withSuffix } from "./lib/validate";
import {
  RateLimitError,
  RETIRED_MODELS,
  estimateCost,
  textQualityFor,
  findModel,
  formatUsd,
  bumpUsage,
  cooldownHoursFor,
  generateReal,
  normalizeSettings,
  resolveRoute,
  type ForgeSettings,
} from "./lib/providers";
import {
  buildZipBlob,
  clearDirHandle,
  dataUrlToBlob,
  downloadBlob,
  ensureSubfolders,
  fsSupported,
  loadDirHandle,
  pickOutputFolder,
  saveDirHandle,
  svgToPngBlob,
  writeImageFile,
  writeTextFile,
} from "./lib/output";
import type { Batch, BatchSetup, FactoryItem, SavedSetup } from "./lib/batches";
import { factoryToRows, loadBatches, loadSetups, saveBatches, saveSetups, uid } from "./lib/batches";
import { measureStorage, safeSet, storageWarning, type SaveResult } from "./lib/storage";
import { saveSettingsVerified, type SaveProof } from "./lib/settingsBackup";
import { tailorPrompt } from "./lib/promptTailor";
import { styleById } from "./lib/styleCatalogue";
import { checkPaidRun, type PaidRunCheck } from "./lib/paidGuard";
import PaidConfirm from "./components/PaidConfirm";
import { checkBatch, collectBatch, describeJob, submitBatch } from "./lib/geminiBatch.mjs";
import {
  clearTauriFolder,
  isTauri,
  loadTauriFolder,
  saveTauriFolder,
  tauriFolderName,
  tauriPickFolder,
  tauriWriteImage,
  tauriWriteText,
} from "./lib/tauriFs";
import Sidebar from "./components/Sidebar";
import ManifestView from "./components/ManifestView";
import DocsView from "./components/DocsView";
import AgentsView from "./components/AgentsView";
import SettingsView, { type SettingsSection } from "./components/SettingsView";
import WizardView from "./components/WizardView";
import PromptFactory from "./components/PromptFactory";
import { BatchLibrary, ImageLibrary, StyleLibrary, TemplateLibrary } from "./components/LibraryViews";
import WpImportModal from "./components/WpImportModal";
import GifMaker from "./components/GifMaker";
import UpdateReadyDialog from "./components/UpdateReadyDialog";
import ChatView from "./components/ChatView";
import StartView from "./components/StartView";
import { withStyleBlock } from "./lib/engines.mjs";
import {
  claimRequest as linkClaim,
  fetchRequests as linkFetch,
  finishRequest as linkFinish,
  requestOutcome,
  rowsForRequest,
  sendPicture as linkSend,
} from "./lib/link";
import { CardPanel } from "./components/nav";
import { filenameFor, type ChatPlan, type RowEdit } from "./lib/chatPlan";
import { CountUp, type MotionLevel } from "./components/motion";
import Letterer from "./components/Letterer";
import SheetMaker from "./components/SheetMaker";
import VectorMaker from "./components/VectorMaker";
import TopMenu, { type View } from "./components/TopMenu";
import { CursorFX, DotField, EmberField, StarField } from "./components/effects";
import { Btn, IAnvil, IFolder, IPlay, IQuill, IWand, ToastHost, IX } from "./components/ui";
import type { FolderState } from "./components/SettingsDrawer";
import MarketApp from "./market/MarketApp";

const LS_KEY = "image-forge-manifest-v1";
const LS_SETTINGS = "image-forge-settings-v1";

const withPreview = (r: ManifestRow): ManifestRow =>
  r.status === "done" || r.status === "imported" ? { ...r, preview: renderPreview(r) } : { ...r, preview: undefined };

/**
 * How a load ended, because "I got defaults" has two very different causes.
 *
 *   "stored"  we read what was there
 *   "empty"   there was genuinely nothing — a first run
 *   "rescued" something WAS there and could not be used
 *
 * The third is the dangerous one. Falling back to defaults is right; writing
 * those defaults back 350ms later over the data we failed to read is not, and
 * that is exactly what used to happen. One unreadable read — a browser
 * hiccup, a half-written value, a JSON error — and the real manifest and every
 * API key were overwritten by seeds, permanently, with nothing said.
 *
 * So a rescued load keeps the original bytes under a ".rescue" key and blocks
 * autosave for that store until you decide. Nothing is destroyed while you are
 * being asked.
 */
type LoadOutcome = "stored" | "empty" | "rescued";

const RESCUE_SUFFIX = ".rescue";

/** Put the unreadable original somewhere safe before anything overwrites it. */
function stashRescue(key: string, raw: string): void {
  try {
    localStorage.setItem(key + RESCUE_SUFFIX, raw);
  } catch {
    /* if even this fails the box is full; the warning below still fires */
  }
}

function loadInitial(): { rows: ManifestRow[]; outcome: LoadOutcome } {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(LS_KEY);
  } catch {
    return { rows: SEED_ROWS.map(withPreview), outcome: "rescued" };
  }
  if (!raw) return { rows: SEED_ROWS.map(withPreview), outcome: "empty" };
  try {
    const parsed = JSON.parse(raw) as { rows?: ManifestRow[] };
    if (Array.isArray(parsed.rows)) {
      return {
        rows: parsed.rows
          .map((r) => (r.status === "generating" ? { ...r, status: "pending" as Status } : r))
          // Rows saved before the categories became asset types still say
          // shop / item / event / npc. Changing the type is a compile-time
          // move; the data on disk does not migrate itself, and an unmigrated
          // value used to reach CATEGORY_META and blank the whole app.
          .map((r) => ({ ...r, category: migrateCategory(String(r.category ?? "")) }))
          .map(withPreview),
        outcome: "stored",
      };
    }
  } catch {
    /* fall through */
  }
  stashRescue(LS_KEY, raw);
  return { rows: SEED_ROWS.map(withPreview), outcome: "rescued" };
}

function loadSettings(): { settings: ForgeSettings; outcome: LoadOutcome } {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(LS_SETTINGS);
  } catch {
    return { settings: normalizeSettings({}), outcome: "rescued" };
  }
  if (!raw) return { settings: normalizeSettings({}), outcome: "empty" };
  try {
    return { settings: normalizeSettings(JSON.parse(raw) as Partial<ForgeSettings>), outcome: "stored" };
  } catch {
    stashRescue(LS_SETTINGS, raw);
    return { settings: normalizeSettings({}), outcome: "rescued" };
  }
}

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
const nowTime = () => new Date().toLocaleTimeString("en-GB", { hour12: false });

export default function App() {
  const [mode, setMode] = useState<"forge" | "market">("forge");
  if (mode === "market") {
    return <MarketApp onOpenForge={() => setMode("forge")} />;
  }
  return <ForgeApp onOpenMarket={() => setMode("market")} />;
}

function ForgeApp({ onOpenMarket }: { onOpenMarket?: () => void }) {
  // Loaded once, outcome kept: a rescued load must never be autosaved over
  // the data it failed to read.
  const firstLoad = useRef<{ rows: ReturnType<typeof loadInitial>; settings: ReturnType<typeof loadSettings> }>(null!);
  if (!firstLoad.current) firstLoad.current = { rows: loadInitial(), settings: loadSettings() };
  const [rows, setRows] = useState<ManifestRow[]>(() => firstLoad.current.rows.rows);
  // The front door (HANDOFF §14.1): one box, one number, one button.
  const [view, setView] = useState<View>("start");
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("engines");
  const [batchFilter, setBatchFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [catFilter, setCatFilter] = useState<Category | "all">("all");
  const [modelFilter, setModelFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [styleLock, setStyleLockState] = useState("claymation");
  const [appendStyle, setAppendStyle] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [settings, setSettings] = useState<ForgeSettings>(() => firstLoad.current.settings.settings);
  const rowsRescued = firstLoad.current.rows.outcome === "rescued";
  const settingsRescued = firstLoad.current.settings.outcome === "rescued";
  /** Stores whose autosave is held back until the user decides. */
  const [heldBack, setHeldBack] = useState<{ rows: boolean; settings: boolean }>(() => ({
    rows: firstLoad.current.rows.outcome === "rescued",
    settings: firstLoad.current.settings.outcome === "rescued",
  }));
  /**
   * A request handed to the chat from somewhere else in the app.
   *
   * This replaces the Scribe drawer. The drawer did one row at a time behind a
   * button labelled with a word — "scribe" — that said nothing about what it
   * did. The chat does the same job, plus whole lists, and can be asked in
   * plain words.
   */
  const [chatSeed, setChatSeed] = useState<string | null>(null);
  const [folder, setFolder] = useState<FolderState>({ linked: false, name: "", pendingName: null, error: "" });
  const [batches, setBatches] = useState<Batch[]>(loadBatches);
  const [setups, setSetups] = useState<SavedSetup[]>(loadSetups);
  const [wpOpen, setWpOpen] = useState(false);
  const [wizardPreset, setWizardPreset] = useState<SavedSetup | null>(null);
  const [factoryItems, setFactoryItems] = useState<FactoryItem[]>([]);
  const [compare, setCompare] = useState<null | { rowId: number; variantSeed: number; variant: string }>(null);
  const [gifFor, setGifFor] = useState<null | { row: ManifestRow; blob: Blob }>(null);
  const [textFor, setTextFor] = useState<null | { row: ManifestRow; blob: Blob }>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [vectorOpen, setVectorOpen] = useState(false);
  const [animateOpen, setAnimateOpen] = useState(false);
  const [paidAsk, setPaidAsk] = useState<null | { check: PaidRunCheck; targets: number[] }>(null);

  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const [updateReady, setUpdateReady] = useState<UpdateReady | null>(null);
  const stopRef = useRef(false);
  const folderRef = useRef<FileSystemDirectoryHandle | null>(null);
  const tauriFolderRef = useRef<string | null>(null);
  const imagesRef = useRef<Map<string, Blob>>(new Map());
  const toastId = useRef(1);
  /** set once repairForge exists, so the load-time warning can offer to run it */
  const repairForgeRef = useRef<null | (() => void)>(null);

  useEffect(() => saveBatches(batches), [batches]);
  useEffect(() => saveSetups(setups), [setups]);



  /* ---------- restore linked folder ---------- */
  useEffect(() => {
    // Tauri build: the saved path just works — no permission dance
    if (isTauri()) {
      const saved = loadTauriFolder();
      if (saved) {
        tauriFolderRef.current = saved;
        setFolder({ linked: true, name: tauriFolderName(saved), pendingName: null, error: "", path: saved });
      }
      return;
    }
    let alive = true;
    (async () => {
      if (!fsSupported()) return;
      const h = await loadDirHandle();
      if (!h || !alive) return;
      try {
        const perm = await h.queryPermission({ mode: "readwrite" });
        if (!alive) return;
        if (perm === "granted") {
          folderRef.current = h;
          setFolder({ linked: true, name: h.name, pendingName: null, error: "" });
        } else {
          setFolder((f) => ({ ...f, pendingName: h.name }));
        }
      } catch { /* stale handle */ }
    })();
    return () => {
      alive = false;
    };
  }, []);

  /* ---------- helpers ---------- */
  const pushToast = useCallback((kind: Toast["kind"], msg: string, action?: Toast["action"]) => {
    const id = toastId.current++;
    setToasts((t) => [...t.slice(-3), { id, kind, msg, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 7000 : 4600);
  }, []);

  const pushLog = useCallback((msg: string, kind: LogEntry["kind"]) => {
    setLog((l) => [...l.slice(-90), { t: nowTime(), msg, kind }]);
  }, []);

  /* ---------- persistence (debounced — a run mutates rows many times per second) ----------
     A failed save used to be swallowed, so a full storage box quietly ate your
     work. Now it shouts once, and keeps quiet until the situation changes. */
  const storageAlarmRef = useRef<string>("");
  const announceSave = useCallback(
    (res: SaveResult) => {
      if (res.ok) {
        if (storageAlarmRef.current) storageAlarmRef.current = "";
        return;
      }
      if (storageAlarmRef.current === res.reason) return;
      storageAlarmRef.current = res.reason;
      pushToast("err", res.message);
      pushLog(`⚠ ${res.message}`, "err");
    },
    [pushLog, pushToast]
  );

  useEffect(() => {
    // Held back after a rescued load: writing seeds over a manifest we merely
    // failed to READ is how work disappears for good.
    if (heldBack.rows) return;
    const t = setTimeout(() => {
      announceSave(
        safeSet(LS_KEY, JSON.stringify({ rows: rows.map(({ preview: _p, ...r }) => r), styleLock, appendStyle }))
      );
    }, 350);
    return () => clearTimeout(t);
  }, [rows, styleLock, appendStyle, announceSave, heldBack.rows]);

  /*
   * Settings are saved on every change AND read straight back.
   *
   * They always were saved; what was missing was any way to tell. The desktop
   * build used to serve itself on a random port, and the browser keys storage
   * by origin — port included — so every launch opened a different empty box.
   * Keys typed yesterday were still on disk under a port nothing would visit
   * again. Reading back after the write is what turns that from a mystery into
   * a message, and it is what the "saved" line in Settings is showing.
   */
  const [saveProof, setSaveProof] = useState<SaveProof | null>(null);
  const saveSettingsNow = useCallback((next?: ForgeSettings) => {
    const proof = saveSettingsVerified(LS_SETTINGS, next ?? settingsRef.current);
    setSaveProof(proof);
    if (!proof.ok && proof.problem) {
      pushToast("err", proof.problem);
      pushLog(`⚠ settings not saved — ${proof.problem}`, "err");
    }
    return proof;
  }, [pushLog, pushToast]);

  useEffect(() => {
    if (heldBack.settings) return;
    saveSettingsNow(settings);
  }, [settings, saveSettingsNow, heldBack.settings]);

  /* Once on load: say if the storage box is filling, and if any row is aimed at
     a model the provider has since switched off. Both bite silently otherwise. */
  useEffect(() => {
    const warning = storageWarning(measureStorage(), settings.storageWarnAtPct);
    if (warning) {
      pushToast("info", warning);
      pushLog(`· ${warning}`, "info");
    }
    /* A rescued load is the loudest thing that can happen at startup: there WAS
       data and we could not read it. Nothing has been overwritten — saving is
       held back until this is answered — but it has to be answered. */
    if (rowsRescued || settingsRescued) {
      const what = [rowsRescued && "your manifest", settingsRescued && "your settings and keys"]
        .filter(Boolean)
        .join(" and ");
      const msg = `Could not read ${what}. The original is kept safe and nothing has been overwritten.`;
      pushLog(`⚠ ${msg} Saving is paused until you choose.`, "err");
      pushToast("err", msg, {
        label: "Try again",
        run: () => window.location.reload(),
      });
    }

    const stale = rowsRef.current.filter((r) => RETIRED_MODELS[(r.model || "").trim()]);
    if (stale.length) {
      const msg =
        `${stale.length} row${stale.length > 1 ? "s" : ""} still use a model the provider switched off — ` +
        `they will fail until they are moved.`;
      pushLog(`⚠ ${msg} Settings → Advanced → Repair moves them.`, "err");
      pushToast("err", msg, { label: "Fix them", run: () => repairForgeRef.current?.() });
    }
    // deliberately once on mount — a nag on every change would be unbearable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patchRow = useCallback((id: number, patch: Partial<ManifestRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  const patchSettings = useCallback((p: Partial<ForgeSettings>) => {
    setSettings((s) => ({ ...s, ...p }));
  }, []);

  /* ---------- auto-retry: rows whose cooldown elapsed go back in the queue ---------- */
  useEffect(() => {
    if (!settings.autoRetry) return;
    const t = setInterval(() => {
      const due = rowsRef.current.filter(
        (r) => (r.status === "failed" || r.status === "pending") && r.retry_at && Date.parse(r.retry_at) <= Date.now()
      );
      if (due.length === 0) return;
      setRows((prev) =>
        prev.map((r) =>
          due.some((d) => d.id === r.id) ? { ...r, status: "pending" as Status, retry_at: "", error: "" } : r
        )
      );
      pushLog(`⏰ ${due.length} row${due.length > 1 ? "s" : ""} cooldown elapsed — back in the queue`, "info");
    }, 20000);
    return () => clearInterval(t);
  }, [settings.autoRetry, pushLog]);

  const getBlobFor = useCallback(async (r: ManifestRow): Promise<Blob | null> => {
    const cached = imagesRef.current.get(r.filename);
    if (cached) return cached;
    if (!r.preview) return null;
    if (r.preview.startsWith("<svg") || r.preview.startsWith("data:image/svg")) {
      const dims = ASPECTS[r.aspect_ratio];
      try {
        return await svgToPngBlob(r.preview, dims.w, dims.h);
      } catch {
        return null;
      }
    }
    try {
      return dataUrlToBlob(r.preview);
    } catch {
      return null;
    }
  }, []);

  const saveToFolder = useCallback(
    async (row: ManifestRow, blob: Blob) => {
      try {
        if (isTauri() && tauriFolderRef.current) {
          const path = await tauriWriteImage(tauriFolderRef.current, row, blob);
          pushLog(`⤓ ${row.filename} → ${path}`, "ok");
          return;
        }
        const h = folderRef.current;
        if (!h) return;
        const path = await writeImageFile(h, row, blob);
        pushLog(`⤓ ${row.filename} → ${path}`, "ok");
      } catch {
        pushLog(`⚠ could not write ${row.filename} into the linked folder`, "err");
      }
    },
    [pushLog]
  );

  /* ---------- the strike ---------- */
  const strike = useCallback(
    async (id: number): Promise<"done" | "failed" | "parked" | "stopped" | "gone"> => {
      const row = rowsRef.current.find((r) => r.id === id);
      if (!row) return "gone";
      const s = settingsRef.current;
      const route = resolveRoute(row, s);
      const halted = () => stopRef.current;
      const modelId = route.def?.id || row.model || "";
      const cdH = cooldownHoursFor(modelId || s.provider, s);
      const exhaust = (poolName: "geminiKeys" | "geminiPaidKeys" | "openaiKeys", keyId: string, untilMs: number) =>
        setSettings((prev) => ({
          ...prev,
          [poolName]: prev[poolName].map((k) => (k.id === keyId ? { ...k, exhaustedUntil: untilMs } : k)),
        }));

      patchRow(id, { status: "generating", error: "" });
      pushLog(`→ ${row.filename} via ${route.engine} · ${route.apiModel} · ${row.aspect_ratio}`, "run");

      if (route.engine === "simulated") {
        await sleep(900 + Math.random() * 1100);
        if (halted()) {
          setRows((prev) => prev.map((r) => (r.id === id && r.status === "generating" ? { ...r, status: "pending" } : r)));
          return "stopped";
        }
        const failChance = row.error ? 0.12 : 0.18;
        if (Math.random() < failChance) {
          patchRow(id, { status: "failed", error: "429 rate_limited — the demo endpoint said enough for now", preview: undefined });
          pushLog(`✗ ${row.filename} failed (simulated rate limit)`, "err");
          return "failed";
        }
        const preview = renderPreview({ ...row, status: "done" });
        patchRow(id, { status: "done", generated_at: new Date().toISOString(), preview, error: "" });
        pushLog(`✓ ${row.filename} struck`, "ok");
        if (folderRef.current) {
          try {
            const dims = ASPECTS[row.aspect_ratio];
            const png = await svgToPngBlob(preview, dims.w, dims.h);
            imagesRef.current.set(row.filename, png);
            await saveToFolder(row, png);
          } catch {
            pushLog(`⚠ ${row.filename}: folder write skipped`, "err");
          }
        }
        return "done";
      }

      const styleBlockFor =
        STYLES.find((x) => x.id === row.style)?.block ??
        settingsRef.current.customStyles.find((x) => x.id === row.style)?.block ??
        "";
      // Where the look goes depends on the engine — see withStyleBlock.
      let prompt = appendStyle ? withStyleBlock(row.prompt, styleBlockFor, String(route.engine)) : row.prompt;

      // Each style carries its own negatives — "no photographic sheen" for clay,
      // "no colour" for line art — merged with whatever the row already asks to avoid.
      const styleDef = styleById(row.style);
      const negative_prompt = [row.negative_prompt?.trim(), styleDef?.negative]
        .filter(Boolean)
        .join(", ");

      // A style built around readable words on a model that cannot spell will
      // disappoint. Say so once, rather than letting it fail quietly.
      if (styleDef?.needsText && textQualityFor(row, s) !== "good") {
        pushLog(
          `⚠ ${row.filename}: the “${styleDef.name}” look needs readable words, but ${route.apiModel} cannot spell. ` +
            `Use a Google model or DALL·E for this one.`,
          "err"
        );
      }

      // Optional, off by default: let your text model reshape the prompt to
      // suit whichever painter is about to draw it.
      if (s.tailorPrompts) {
        const tailored = await tailorPrompt({ ...row, prompt }, s);
        if (tailored.problem) {
          pushLog(`· prompt tailor skipped — ${tailored.problem}`, "info");
        } else if (tailored.changed) {
          prompt = tailored.prompt;
          pushLog(`✎ prompt tailored for ${route.apiModel}`, "info");
        }
      }

      try {
        const { blob, dataUrl } = await generateReal({ ...row, prompt, negative_prompt }, s, undefined, exhaust, cdH * 3600e3);
        if (halted()) {
          setRows((prev) => prev.map((r) => (r.id === id && r.status === "generating" ? { ...r, status: "pending" } : r)));
          pushLog(`· ${row.filename} halted mid-strike`, "info");
          return "stopped";
        }
        /* The name now tells the truth about the bytes.
           Engines do not agree on a format and never did: Cloudflare and the
           OpenAI-shaped ones send PNG, Google's image API refuses to send
           anything but JPEG, Pollinations sends what it likes. We used to
           write every one of them out as .png, which meant a JPEG in a file
           claiming to be a PNG — fine for anything that sniffs the bytes, a
           real problem for WordPress uploads and strict tooling.
           The stem never changes, so the row keeps its identity; only the
           extension moves, and only when it is actually wrong. A rename that
           would collide with another row is skipped rather than allowed to
           overwrite it. */
        let filename = row.filename;
        const trueName = nameForMime(filename, blob.type);
        if (trueName !== filename) {
          const taken = rowsRef.current.some((r) => r.id !== id && r.filename === trueName);
          if (taken) {
            pushLog(`· ${filename} is really ${blob.type}, but ${trueName} is already taken — name left alone`, "info");
          } else {
            pushLog(`✎ ${filename} → ${trueName} (${route.engine} returned ${blob.type})`, "info");
            filename = trueName;
          }
        }
        const saved = { ...row, filename };
        imagesRef.current.set(filename, blob);
        patchRow(id, { filename, status: "done", generated_at: new Date().toISOString(), preview: dataUrl, error: "" });
        pushLog(`✓ ${filename} struck · ${(blob.size / 1024).toFixed(0)} KB via ${route.engine}`, "ok");
        setSettings((prev) => ({ ...prev, usage: bumpUsage(prev.usage, modelId || s.provider) }));
        // The picture exists and is already counted. If writing it to the
        // folder fails — disk full, folder moved, permission withdrawn — say
        // so and keep the row done, rather than reporting the strike itself
        // as a failure and inviting a second paid attempt.
        try {
          await saveToFolder(saved, blob);
        } catch (e) {
          const why = (e as { message?: string })?.message ?? "unknown reason";
          pushLog(`⚠ ${filename} made, but not written to the folder — ${why}. Use Save all.`, "err");
        }
        return "done";
      } catch (e) {
        if (halted() || (e as { name?: string })?.name === "AbortError") {
          setRows((prev) => prev.map((r) => (r.id === id && r.status === "generating" ? { ...r, status: "pending" } : r)));
          return "stopped";
        }
        if (e instanceof RateLimitError) {
          const retryAt = Date.now() + cdH * 3600e3;
          patchRow(id, {
            status: "failed",
            error: `429 — every ${route.engine} key is resting · auto-retry in ${cdH}h`,
            retry_at: new Date(retryAt).toISOString(),
            preview: undefined,
          });
          pushLog(`⏸ ${row.filename} parked — retry in ${cdH}h (you choose this in Settings → Image engines)`, "err");
          return "parked";
        }
        const msg = (e as { message?: string })?.message ?? "request failed";
        patchRow(id, { status: "failed", error: msg.slice(0, 160), preview: undefined });
        pushLog(`✗ ${row.filename} — ${msg}`, "err");
        return "failed";
      }
    },
    [appendStyle, patchRow, pushLog, saveToFolder]
  );

  const runQueue = useCallback(
    async (targets?: number[], approvedCost = false) => {
      if (isRunning) return;
      const ids = targets ?? rowsRef.current.filter((r) => r.status === "pending" || r.status === "failed").map((r) => r.id);
      if (ids.length === 0) return;

      // Nothing spends money without being asked. Free engines never get here.
      if (!approvedCost && settingsRef.current.confirmPaidRuns) {
        const about = ids
          .map((id) => rowsRef.current.find((r) => r.id === id))
          .filter((r): r is ManifestRow => Boolean(r));
        const check = checkPaidRun(about, settingsRef.current);
        if (check.costs) {
          setPaidAsk({ check, targets: ids });
          return;
        }
      }

      stopRef.current = false;
      setIsRunning(true);

      const queued = ids
        .map((id) => rowsRef.current.find((r) => r.id === id))
        .filter((r): r is ManifestRow => Boolean(r));
      const { total, unknown } = estimateCost(queued, settingsRef.current);
      const lanes = Math.min(Math.max(settingsRef.current.concurrency || 1, 1), 6);
      pushLog(
        `── forge lit · ${ids.length} row${ids.length > 1 ? "s" : ""} in the queue` +
          (lanes > 1 ? ` · ${lanes} at a time` : "") +
          ` · ${total > 0 ? `about ${formatUsd(total)}` : "free"}${unknown ? ` (+${unknown} unpriced)` : ""} ──`,
        "info"
      );

      let done = 0;
      let failed = 0;

      /* Rows are handed out one at a time to however many lanes are running, so
         a slow picture never blocks the others and "stop" still lands quickly. */
      let cursor = 0;
      const takeNext = (): number | null => {
        while (cursor < ids.length) {
          const id = ids[cursor++];
          const row = rowsRef.current.find((r) => r.id === id);
          if (!row) continue;
          if (!targets && row.retry_at && Date.parse(row.retry_at) > Date.now()) {
            pushLog(`· ${row.filename} cooling — retries ${new Date(row.retry_at).toLocaleString("en-GB")}`, "info");
            continue;
          }
          return id;
        }
        return null;
      };

      // Anything a lane throws is caught here. An escaped error would reject
      // the Promise.all below, and setIsRunning(false) would never run: the
      // app would sit on "forging" with only a Stop button and no way back.
      const lane = async () => {
        for (;;) {
          if (stopRef.current) return;
          const id = takeNext();
          if (id === null) return;
          const res = await strike(id);
          if (res === "done") done++;
          else if (res === "failed" || res === "parked") failed++;
          else if (res === "stopped") {
            stopRef.current = true;
            return;
          }
        }
      };

      try {
        await Promise.all(Array.from({ length: lanes }, lane));
      } catch (e) {
        stopRef.current = true;
        const why = (e as { message?: string })?.message ?? "unknown reason";
        pushLog(`✗ the run stopped unexpectedly — ${why}`, "err");
        pushToast("err", "The run stopped unexpectedly. Nothing was lost — press Forge to carry on.");
      } finally {
        setIsRunning(false);
      }
      const halted = stopRef.current;
      pushLog(`── run ${halted ? "halted" : "complete"} · ${done} struck · ${failed} failed ──`, failed > 0 ? "err" : "ok");
      const csvTargets = tauriFolderRef.current ?? null;
      if (!halted && settingsRef.current.writeCsvOnSync && (folderRef.current || csvTargets)) {
        try {
          if (csvTargets) {
            await tauriWriteText(csvTargets, "marketplace-images.csv", rowsToCsv(rowsRef.current));
            pushLog(`⤓ marketplace-images.csv refreshed in ${tauriFolderName(csvTargets)}`, "ok");
          } else if (folderRef.current) {
            await writeTextFile(folderRef.current, "marketplace-images.csv", rowsToCsv(rowsRef.current));
            pushLog(`⤓ marketplace-images.csv refreshed in ${folderRef.current.name}`, "ok");
          }
        } catch { /* non-fatal */ }
      }
      pushToast(
        failed > 0 ? "err" : "ok",
        halted
          ? `Forge halted — ${done} struck before the halt.`
          : failed > 0
            ? `Run finished: ${done} struck, ${failed} need another look.`
            : `Run finished: ${done} image${done === 1 ? "" : "s"} struck.`
      );
    },
    [isRunning, strike, pushLog, pushToast]
  );

  /* ---------- row actions ---------- */
  const addRow = useCallback(() => {
    const maxId = rowsRef.current.reduce((m, r) => Math.max(m, r.id), 0);
    const row: ManifestRow = {
      id: maxId + 1,
      filename: `image_new_${maxId + 1}.png`,
      prompt: "",
      category: "image",
      item_id: "",
      shop_id: "",
      event_id: "",
      style: styleLock,
      aspect_ratio: "1:1",
      seed: Math.floor(Math.random() * 98) + 1,
      model: "",
      status: "pending",
      error: "",
      generated_at: "",
      imported_attachment_id: "",
    };
    setRows((prev) => [...prev, row]);
    setSelectedId(row.id);
    setView("workbench");
    pushLog(`+ row #${row.id} added to the manifest`, "info");
  }, [styleLock, pushLog]);

  const deleteRow = useCallback(
    (id: number) => {
      const idx = rowsRef.current.findIndex((x) => x.id === id);
      if (idx === -1) return;
      const r = rowsRef.current[idx];
      setRows((prev) => prev.filter((x) => x.id !== id));
      setSelectedId((s) => (s === id ? null : s));
      pushToast("info", `${r.filename} removed from the manifest.`, {
        label: "undo",
        run: () =>
          setRows((prev) => {
            if (prev.some((x) => x.id === id)) return prev; // already back
            const next = [...prev];
            next.splice(Math.min(idx, next.length), 0, r);
            return next;
          }),
      });
    },
    [pushToast]
  );

  const duplicateRow = useCallback((id: number) => {
    const src = rowsRef.current.find((x) => x.id === id);
    if (!src) return;
    const maxId = rowsRef.current.reduce((m, r) => Math.max(m, r.id), 0);
    setRows((prev) => [
      ...prev,
      { ...src, id: maxId + 1, filename: uniqueName(withSuffix(src.filename, "_copy"), new Set(rowsRef.current.map((r) => r.filename))), status: "pending", generated_at: "", imported_attachment_id: "", error: "", preview: undefined },
    ]);
  }, []);

  const generateOne = useCallback(
    (id: number) => {
      if (isRunning) {
        pushToast("info", "The forge is busy — wait for the current run to finish.");
        return;
      }
      runQueue([id]);
    },
    [isRunning, runQueue, pushToast]
  );

  const forceRetry = useCallback(
    (id: number) => {
      patchRow(id, { retry_at: "", status: "pending", error: "" });
      if (isRunning) {
        pushToast("info", "Cooldown cleared — it will run as soon as the forge finishes the current plate.");
        return;
      }
      pushToast("info", "Cooldown cleared — striking at once.");
      runQueue([id]);
    },
    [isRunning, patchRow, pushToast, runQueue]
  );

  const markSkipped = useCallback((id: number) => patchRow(id, { status: "skipped", error: "" }), [patchRow]);
  const setToPending = useCallback((id: number) => patchRow(id, { status: "pending", error: "", retry_at: "" }), [patchRow]);

  const markImported = useCallback(
    (id: number) => {
      const att = String(8200 + id * 13 + Math.floor(Math.random() * 9));
      patchRow(id, { status: "imported", imported_attachment_id: att });
      pushToast("ok", `Marked imported — attachment #${att} stored.`);
    },
    [patchRow, pushToast]
  );

  const exportCsv = useCallback(() => {
    downloadCsv("marketplace-images.csv", rowsToCsv(rowsRef.current));
    pushToast("ok", "marketplace-images.csv exported with the full schema.");
  }, [pushToast]);

  const importCsv = useCallback(
    (text: string, mode: "merge" | "replace", forgeAfter: boolean) => {
      try {
        const { headers, records } = parseCsv(text);
        if (headers.length === 0 || records.length === 0) {
          pushToast("err", "No rows found in that CSV — check the header line.");
          return;
        }
        const taken = new Set(mode === "replace" ? [] : rowsRef.current.map((r) => r.id));
        const { rows: imported, skipped } = rowsFromCsv(headers, records, taken);
        if (imported.length === 0) {
          pushToast("err", "Nothing importable — every row was missing a filename.");
          return;
        }
        // duplicate filenames would overwrite each other in the output folder — uniquify
        const names = new Set(mode === "replace" ? [] : rowsRef.current.map((r) => r.filename));
        let renamed = 0;
        for (const r of imported) {
          if (names.has(r.filename)) {
            r.filename = uniqueName(r.filename, names);
            renamed++;
          }
          names.add(r.filename);
        }
        if (renamed > 0) pushLog(`· ${renamed} duplicate filename${renamed > 1 ? "s" : ""} got a suffix to stay unique`, "info");
        setRows((prev) => (mode === "replace" ? imported.map(withPreview) : [...prev, ...imported.map(withPreview)]));
        pushLog(`⇡ manifest ${mode === "replace" ? "replaced" : "merged"} · ${imported.length} rows in, ${skipped} skipped`, "ok");
        pushToast("ok", `Imported ${imported.length} row${imported.length > 1 ? "s" : ""} (${mode}).`);
        if (forgeAfter) setTimeout(() => runQueue(imported.map((r) => r.id)), 150);
      } catch {
        pushToast("err", "Could not parse that CSV — is it comma-separated with a header?");
      }
    },
    [pushLog, pushToast, runQueue]
  );

  const setStyleLock = useCallback(
    (s: string) => {
      setStyleLockState(s);
      const name = STYLES.find((x) => x.id === s)?.name ?? settingsRef.current.customStyles.find((x) => x.id === s)?.name ?? s;
      pushToast("info", `Visual language locked to “${name}”.`);
    },
    [pushToast]
  );

  /* ---------- output ---------- */
  const linkFolder = useCallback(async () => {
    if (isTauri()) {
      try {
        const picked = await tauriPickFolder();
        if (!picked) return; // user cancelled
        tauriFolderRef.current = picked;
        saveTauriFolder(picked);
        setFolder({ linked: true, name: tauriFolderName(picked), pendingName: null, error: "", path: picked });
        pushLog(`⤓ output folder linked (native): ${picked}`, "ok");
        pushToast("ok", `Linked ${tauriFolderName(picked)} — images will land in shops/items/events/npcs.`);
      } catch (e) {
        const msg = `Couldn't link that folder (${(e as { message?: string })?.message ?? "unknown reason"}).`;
        setFolder((f) => ({ ...f, error: msg }));
        pushToast("err", msg);
      }
      return;
    }
    if (!fsSupported()) {
      setFolder((f) => ({ ...f, error: "This browser can't link folders (needs Chrome or Edge). The ZIP door always works." }));
      pushToast("err", "Folder linking needs Chrome or Edge — use the ZIP instead.");
      return;
    }
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setFolder((f) => ({ ...f, error: "The page must run on https (or localhost) for folder access." }));
      return;
    }
    try {
      const h = await pickOutputFolder();
      folderRef.current = h;
      await saveDirHandle(h);
      const { found, created } = await ensureSubfolders(h);
      setFolder({ linked: true, name: h.name, pendingName: null, error: "" });
      pushLog(`⤓ output folder linked: ${h.name} · found [${found.join(", ")}]${created.length ? ` · created [${created.join(", ")}]` : ""}`, "ok");
      pushToast("ok", created.length ? `Linked ${h.name} — created ${created.join(", ")}.` : `Linked ${h.name} — subfolders ready.`);
    } catch (e) {
      const err = e as { name?: string; message?: string };
      if (err?.name === "AbortError") return;
      const msg =
        err?.name === "SecurityError"
          ? "The browser blocked folder access here (sandboxed preview). Open the app in a normal Chrome/Edge tab, or use the ZIP."
          : `Couldn't link that folder (${err?.message ?? "unknown reason"}).`;
      setFolder((f) => ({ ...f, error: msg }));
      pushToast("err", msg);
    }
  }, [pushLog, pushToast]);

  const unlinkFolder = useCallback(async () => {
    folderRef.current = null;
    tauriFolderRef.current = null;
    clearTauriFolder();
    await clearDirHandle();
    setFolder({ linked: false, name: "", pendingName: null, error: "" });
    pushToast("info", "Output folder unlinked.");
  }, [pushToast]);

  const syncAllToFolder = useCallback(async () => {
    const tauri = isTauri();
    const tRoot = tauriFolderRef.current;
    const h = folderRef.current;
    if (!tRoot && !h) {
      pushToast("err", "Link an output folder first — Settings → Folders.");
      return;
    }
    const targets = rowsRef.current.filter((r) => r.status === "done" || r.status === "imported");
    if (targets.length === 0) {
      pushToast("info", "No finished plates to sync yet.");
      return;
    }
    let ok = 0;
    for (const r of targets) {
      const b = await getBlobFor(r);
      if (!b) continue;
      try {
        if (tRoot) await tauriWriteImage(tRoot, r, b);
        else if (h) await writeImageFile(h, r, b);
        ok++;
      } catch { /* counted */ }
    }
    const name = tRoot ? tauriFolderName(tRoot) : h?.name ?? "folder";
    pushLog(`⤓ folder sync complete · ${ok}/${targets.length} plates written into ${name}`, "ok");
    pushToast("ok", `${ok} plate${ok === 1 ? "" : "s"} written to ${name}.`);
  }, [getBlobFor, pushLog, pushToast]);

  const zipAll = useCallback(async () => {
    const targets = rowsRef.current.filter((r) => r.status === "done" || r.status === "imported");
    if (targets.length === 0) {
      pushToast("info", "No finished plates yet — generate a row first.");
      return;
    }
    try {
      const { blob, count } = await buildZipBlob(rowsRef.current, getBlobFor, rowsToCsv(rowsRef.current));
      downloadBlob("marketplace-images.zip", blob);
      pushToast("ok", `ZIP ready — ${count} plate${count === 1 ? "" : "s"} in shops/items/events/npcs plus the CSV.`);
    } catch {
      pushToast("err", "ZIP packing failed.");
    }
  }, [getBlobFor, pushToast]);

  const downloadRow = useCallback(
    async (id: number) => {
      const r = rowsRef.current.find((x) => x.id === id);
      if (!r || !r.preview) {
        pushToast("info", "That row has no plate yet — generate it first.");
        return;
      }
      const b = await getBlobFor(r);
      if (!b) return;
      downloadBlob(r.filename, b);
    },
    [getBlobFor, pushToast]
  );

  /* ---------- strike a variant for side-by-side compare ---------- */
  const strikeVariant = useCallback(
    async (id: number) => {
      const row = rowsRef.current.find((x) => x.id === id);
      if (!row) return;
      if (!row.preview) {
        pushToast("info", "Generate the original first, then forge a variant to compare.");
        return;
      }
      const variantSeed = row.seed + 1;
      const s = settingsRef.current;
      pushToast("info", `Forging a variant of ${row.filename}…`);
      try {
        let variant: string;
        const isSvgPlate = row.preview.startsWith("<svg") || row.preview.startsWith("image/svg");
        if (isSvgPlate || s.provider === "simulated") {
          // procedural — instant and free
          variant = renderPreview({ ...row, seed: variantSeed });
        } else {
          // real engine — one more API image, so we reuse the same route
          const { dataUrl } = await generateReal({ ...row, seed: variantSeed }, s, undefined, () => {}, 0);
          variant = dataUrl;
        }
        setCompare({ rowId: id, variantSeed, variant });
      } catch (e) {
        pushToast("err", `Variant failed — ${(e as { message?: string })?.message ?? "unknown"}`);
      }
    },
    [pushToast]
  );

  const keepVariant = useCallback(
    (id: number) => {
      if (!compare || compare.rowId !== id) return;
      const blob = dataUrlToBlob(compare.variant);
      const row = rowsRef.current.find((x) => x.id === id);
      // A variant is a fresh picture and can come back in a different format
      // from the one it replaces, so its name follows its own bytes.
      let filename = row?.filename ?? "";
      if (row) {
        const trueName = nameForMime(row.filename, blob.type);
        if (trueName !== row.filename && !rowsRef.current.some((r) => r.id !== id && r.filename === trueName)) filename = trueName;
        imagesRef.current.set(filename, blob);
      }
      patchRow(id, { preview: compare.variant, seed: compare.variantSeed, ...(row ? { filename } : {}) });
      setCompare(null);
      pushToast("ok", "Variant kept — it replaces the original.");
    },
    [compare, patchRow, pushToast]
  );

  /* ---------- exports ---------- */
  const exportBatchCsv = useCallback(
    (batchId: string) => {
      const b = batches.find((x) => x.id === batchId);
      if (!b) return;
      const subset = rowsRef.current.filter((r) => b.rowIds.includes(r.id));
      downloadCsv(`${b.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")}.csv`, rowsToCsv(subset));
      pushToast("ok", `Exported ${subset.length} rows for “${b.name}”.`);
    },
    [batches, pushToast]
  );

  const exportXlsx = useCallback(async () => {
    try {
      const XLSX = await import("xlsx");
      const ws = XLSX.utils.json_to_sheet(
        rowsRef.current.map((r) => {
          const dims = ASPECTS[r.aspect_ratio];
          return {
            id: r.id, filename: r.filename, prompt: r.prompt, negative_prompt: r.negative_prompt ?? "",
            note: r.note ?? "", category: r.category, kind: r.kind ?? "", item_id: r.item_id, shop_id: r.shop_id,
            event_id: r.event_id, style: r.style, aspect_ratio: r.aspect_ratio, width: dims.w, height: dims.h,
            seed: r.seed, model: r.model, status: r.status, error: r.error, generated_at: r.generated_at,
            imported_attachment_id: r.imported_attachment_id,
          };
        })
      );
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "manifest");
      XLSX.writeFile(wb, "marketplace-images.xlsx");
      pushToast("ok", "marketplace-images.xlsx exported.");
    } catch {
      pushToast("err", "XLSX export failed.");
    }
  }, [pushToast]);

  /* ---------- advanced: repair / backup / reset / github ---------- */
  const repairForge = useCallback(async () => {
    const fixes: string[] = [];
    const stuck = rowsRef.current.filter((r) => r.status === "generating").length;
    if (stuck) fixes.push(`${stuck} stuck row${stuck > 1 ? "s" : ""} back to pending`);
    const seen = new Set<string>();
    let moved = 0;
    let overdue = 0;
    const repaired = rowsRef.current.map((r) => {
      let out = r.status === "generating" ? { ...r, status: "pending" as Status } : r;
      // A cooldown that has already passed should have re-queued itself. If
      // the app was closed when it expired, the watcher never saw it.
      if (out.retry_at && Date.parse(out.retry_at) < Date.now()) {
        out = { ...out, retry_at: "", status: out.status === "failed" ? ("pending" as Status) : out.status };
        overdue++;
      }
      // Rows saved before a provider retired a model would fail forever.
      const gone = RETIRED_MODELS[(out.model || "").trim()];
      if (gone) {
        out = { ...out, model: gone.replacedBy };
        moved++;
      }
      if (seen.has(out.filename)) {
        const next = uniqueName(out.filename, seen);
        fixes.push(`renamed ${r.filename} → ${next}`);
        out = { ...out, filename: next };
      }
      seen.add(out.filename);
      return out;
    });
    if (moved) fixes.push(`${moved} row${moved > 1 ? "s" : ""} moved off a model the provider switched off`);
    if (overdue) fixes.push(`${overdue} expired cooldown${overdue > 1 ? "s" : ""} cleared`);
    setRows(repaired);
    let folderOk = false;
    const tRoot = tauriFolderRef.current;
    if (isTauri() && tRoot) {
      try {
        await tauriWriteText(tRoot, "marketplace-images.csv", rowsToCsv(repaired));
        folderOk = true;
      } catch { /* reported below */ }
    } else if (folderRef.current) {
      try {
        await ensureSubfolders(folderRef.current);
        await writeTextFile(folderRef.current, "marketplace-images.csv", rowsToCsv(repaired));
        folderOk = true;
        fixes.push("folder structure re-checked · CSV rewritten");
      } catch { /* reported below */ }
    }
    if (tRoot && folderOk && fixes.every((f) => !f.includes("CSV"))) fixes.push("CSV rewritten into the linked folder");
    pushLog(`🛠 repair run · ${fixes.length ? fixes.join(" · ") : "everything checked, nothing needed fixing"}`, "ok");
    pushToast(
      fixes.length ? "ok" : "info",
      fixes.length ? `Repair done — ${fixes.length} fix${fixes.length > 1 ? "es" : ""} applied.` : "Repair checked everything — the forge is healthy."
    );
  }, [pushLog, pushToast]);

  /* ---------- batch jobs: the same pictures for half the money ---------- */

  const sendBatch = useCallback(async () => {
    const s = settingsRef.current;
    const pending = rowsRef.current.filter((r) => r.status === "pending" || r.status === "failed");
    if (!pending.length) {
      pushToast("info", "Nothing pending to send.");
      return;
    }
    const modelId = findModel((pending[0].model || "").trim())?.id ?? s.geminiModel;
    const def = findModel(modelId);
    if (!def || def.engine !== "gemini" || def.batchPriceUsd === null) {
      pushToast("err", "Batch jobs are a Google feature — set those rows to a Nano Banana model first.");
      return;
    }
    const apiKey = s.geminiKeys.find((k) => k.key.trim())?.key ?? "";
    if (!apiKey.trim()) {
      pushToast("err", "Add a Google key in Settings → Engines before sending a batch.");
      return;
    }
    const { total } = estimateCost(pending, s, { batch: true });
    try {
      pushLog(`── sending ${pending.length} row(s) to Google as one batch · about ${formatUsd(total)} ──`, "info");
      const job = await submitBatch(pending, { apiKey, modelId, imageSize: s.geminiImageSize });
      patchSettings({ batchJobs: [...s.batchJobs, job] });
      setRows((prev) =>
        prev.map((r) => (pending.some((p) => p.id === r.id) ? { ...r, status: "generating" as Status, error: "" } : r))
      );
      pushLog(`⤒ batch accepted — ${describeJob(job)}. Come back and press "Check batches".`, "ok");
      pushToast("ok", `Batch sent — ${pending.length} pictures for about ${formatUsd(total)}. Usually well under an hour.`);
    } catch (e) {
      const msg = (e as { message?: string })?.message ?? "unknown";
      pushLog(`✗ batch refused — ${msg}`, "err");
      pushToast("err", `Batch refused — ${msg}`);
    }
  }, [patchSettings, pushLog, pushToast]);

  const checkBatches = useCallback(async () => {
    const s = settingsRef.current;
    if (!s.batchJobs.length) {
      pushToast("info", "No batches are waiting.");
      return;
    }
    const apiKey = s.geminiKeys.find((k) => k.key.trim())?.key ?? "";
    if (!apiKey.trim()) {
      pushToast("err", "Add a Google key to check on your batches.");
      return;
    }
    const stillWaiting: typeof s.batchJobs = [];
    for (const job of s.batchJobs) {
      try {
        const status = await checkBatch(job.name, apiKey);
        if (!status.done && !status.failed) {
          pushLog(`· ${describeJob(job)} — ${status.label}`, "info");
          stillWaiting.push({ ...job, state: status.state, lastCheckedAt: new Date().toISOString() });
          continue;
        }
        if (status.failed) {
          pushLog(`✗ ${describeJob(job)} — ${status.label}`, "err");
          setRows((prev) =>
            prev.map((r) => (job.filenames.includes(r.filename) ? { ...r, status: "failed" as Status, error: status.label } : r))
          );
          continue;
        }
        const { images, failures } = collectBatch(status.raw, job.filenames);
        for (const img of images) {
          const blob = new Blob([img.bytes], { type: img.mime });
          const row = rowsRef.current.find((r) => r.filename === img.filename);
          if (!row) continue;
          // This path kept the row's name whatever came back. Google's image
          // API only returns JPEG, so every half-price picture was a JPEG
          // called PNG. Same rule as a normal strike: the stem stays, the
          // extension follows the bytes, and never onto another row's name.
          const trueName = nameForMime(row.filename, blob.type);
          const filename =
            trueName !== row.filename && !rowsRef.current.some((r) => r.id !== row.id && r.filename === trueName)
              ? trueName
              : row.filename;
          if (filename !== row.filename) pushLog(`✎ ${row.filename} → ${filename} (Google returned ${blob.type})`, "info");
          imagesRef.current.set(filename, blob);
          await saveToFolder({ ...row, filename }, blob);
          patchRow(row.id, { filename, status: "done", generated_at: new Date().toISOString(), error: "" });
        }
        for (const f of failures) {
          const row = rowsRef.current.find((r) => r.filename === f.filename);
          if (row) patchRow(row.id, { status: "failed", error: f.error.slice(0, 140) });
        }
        pushLog(`✓ batch collected — ${images.length} struck, ${failures.length} failed`, failures.length ? "err" : "ok");
        pushToast("ok", `Batch back: ${images.length} pictures saved.`);
      } catch (e) {
        const msg = (e as { message?: string })?.message ?? "unknown";
        pushLog(`✗ could not check a batch — ${msg}`, "err");
        stillWaiting.push(job);
      }
    }
    patchSettings({ batchJobs: stillWaiting });
  }, [patchRow, patchSettings, pushLog, pushToast, saveToFolder]);

  /** Open the GIF maker for a finished row, if we still hold its picture. */
  const openGifMaker = useCallback(
    (row: ManifestRow) => {
      const blob = imagesRef.current.get(row.filename);
      if (!blob) {
        pushToast(
          "info",
          "That picture is not in memory any more — press Redo to make it again, then turn it into a GIF."
        );
        return;
      }
      setGifFor({ row, blob });
    },
    [pushToast]
  );

  /** Open the lettering panel for a finished row. */
  const openLetterer = useCallback(
    (row: ManifestRow) => {
      const blob = imagesRef.current.get(row.filename);
      if (!blob) {
        pushToast("info", "That picture is not in memory any more — press Redo to make it again, then add lettering.");
        return;
      }
      setTextFor({ row, blob });
    },
    [pushToast]
  );

  repairForgeRef.current = repairForge;

  const backupAll = useCallback(() => {
    const keys = [LS_KEY, LS_SETTINGS, "image-forge-setups-v1", "image-forge-batches-v1", "emberfair-v1"];
    const dump: Record<string, unknown> = { exportedAt: new Date().toISOString(), version: APP_VERSION };
    for (const k of keys) {
      const v = localStorage.getItem(k);
      if (v) {
        try {
          dump[k] = JSON.parse(v);
        } catch {
          dump[k] = v;
        }
      }
    }
    downloadBlob(`image-forge-backup-${new Date().toISOString().slice(0, 10)}.json`, new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" }));
    pushToast("ok", "Backup downloaded — keep it somewhere safe before resetting.");
  }, [pushToast]);

  const resetForge = useCallback(
    (c: { rows: boolean; recipes: boolean; settings: boolean; market: boolean }) => {
      if (c.rows) localStorage.removeItem(LS_KEY);
      if (c.recipes) {
        localStorage.removeItem("image-forge-setups-v1");
        localStorage.removeItem("image-forge-batches-v1");
      }
      if (c.settings) localStorage.removeItem(LS_SETTINGS);
      if (c.market) localStorage.removeItem("emberfair-v1");
      imagesRef.current.clear();
      pushToast("info", "Wiped the checked stores — reloading with a clean slate…");
      setTimeout(() => window.location.reload(), 600);
    },
    [pushToast]
  );

  const pullManifest = useCallback(
    async (mode: "merge" | "replace") => {
      const g = settingsRef.current.github;
      if (!g.owner.trim() || !g.repo.trim()) {
        pushToast("err", "Set the repo owner and name first — they're right above the button.");
        return;
      }
      const url = `https://raw.githubusercontent.com/${g.owner.trim()}/${g.repo.trim()}/${(g.branch || "main").trim()}/${(g.csvPath || "marketplace-images.csv").trim().replace(/^\//, "")}`;
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`GitHub said ${res.status} — is the repo public and the path correct?`);
        importCsv(await res.text(), mode, false);
        pushLog(`⇣ manifest pulled from ${g.owner}/${g.repo} (${mode})`, "ok");
      } catch (e) {
        pushToast("err", `Pull failed — ${(e as { message?: string })?.message ?? "network trouble"}`);
      }
    },
    [importCsv, pushLog, pushToast]
  );

  /**
   * The chat proposes; this is what actually happens.
   *
   * It adds a real manifest row and runs it through the ordinary queue, so the
   * paid confirmation, key rotation, cooldowns and folder saving all apply
   * exactly as they do everywhere else. The chat gets no private path to
   * spending money.
   */
  /**
   * The Start screen's list, straight into the manifest and straight into the
   * queue. Free engines run at once; a paid engine stops at the usual dialog,
   * because runQueue always asks before money is spent.
   */
  const makeFromStart = useCallback(
    async (prompts: string[], style: string, aspect: AspectKey): Promise<number[]> => {
      const taken = rowsRef.current.map((r) => r.filename);
      let nextId = rowsRef.current.reduce((m, r) => Math.max(m, r.id), 0);
      const made: ManifestRow[] = prompts.map((prompt) => {
        nextId += 1;
        const filename = filenameFor(prompt, "image", taken);
        taken.push(filename);
        return {
          id: nextId,
          filename,
          prompt,
          category: "image",
          item_id: "",
          shop_id: "",
          event_id: "",
          style,
          aspect_ratio: aspect,
          seed: Math.floor(Math.random() * 98) + 1,
          model: "",
          status: "pending",
          error: "",
          generated_at: "",
          imported_attachment_id: "",
        };
      });
      setRows((prev) => [...prev, ...made]);
      pushLog(`▸ Start: ${made.length} picture${made.length === 1 ? "" : "s"} added`, "info");
      await new Promise((r) => setTimeout(r, 0));
      const ids = made.map((r) => r.id);
      void runQueue(ids);
      return ids;
    },
    [pushLog, runQueue]
  );

  const forgeFromChat = useCallback(
    async (plan: ChatPlan): Promise<number | null> => {
      const taken = rowsRef.current.map((r) => r.filename);
      const id = rowsRef.current.reduce((m, r) => Math.max(m, r.id), 0) + 1;
      const row: ManifestRow = {
        id,
        filename: filenameFor(plan.prompt, "item", taken),
        prompt: plan.prompt,
        category: "image",
        item_id: "",
        shop_id: "",
        event_id: "",
        style: plan.style,
        aspect_ratio: plan.aspect,
        seed: Math.floor(Math.random() * 98) + 1,
        model: plan.model,
        status: "pending",
        error: "",
        generated_at: "",
        imported_attachment_id: "",
      };
      setRows((prev) => [...prev, row]);
      // Let the new row reach state before the queue looks for it.
      await new Promise((r) => setTimeout(r, 0));
      await runQueue([id]);
      return id;
    },
    [runQueue]
  );

  /* ---------- the link: another app asks for pictures (electron/link.mjs) ----------
     Polled only while the app is open. In the browser the endpoint does not
     exist, the first call returns null, and polling stops for good. */
  const linkSeen = useRef<Set<string>>(new Set());
  const linkSent = useRef<Set<string>>(new Set());
  const [linkAvailable, setLinkAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    if (linkAvailable === false) return;
    let stop = false;
    const tick = async () => {
      const reqs = await linkFetch();
      if (stop) return;
      if (reqs === null) {
        setLinkAvailable(false);
        return;
      }
      setLinkAvailable(true);
      for (const req of reqs) {
        if (linkSeen.current.has(req.id)) continue;
        linkSeen.current.add(req.id);
        // Already turned into rows in an earlier session: leave them be.
        if (rowsRef.current.some((r) => r.request_id === req.id)) continue;
        if (!(await linkClaim(req.id))) continue;
        const taken = new Set(rowsRef.current.map((r) => r.filename));
        const start = rowsRef.current.reduce((m, r) => Math.max(m, r.id), 0) + 1;
        const made = rowsForRequest(req, start, taken);
        setRows((prev) => [...prev, ...made]);
        pushLog(`⇄ ${req.from} asked for ${made.length} picture${made.length === 1 ? "" : "s"}${req.note ? ` — ${req.note}` : ""}`, "info");
        pushToast("info", `${req.from} asked for ${made.length} picture${made.length === 1 ? "" : "s"}.`);
        // Seen on a real request: free SDXL asked for a 3x3 grid of mouth
        // shapes painted one portrait instead. Say so before, not after.
        const weak = made.filter((r) => r.category === "sheet" && ["ovh", "cloudflare", "pollinations"].includes(String(resolveRoute(r, settingsRef.current).engine)));
        if (weak.length)
          pushLog(
            `⚠ ${weak.length} of these are sheets (many panels in one picture). Free engines usually draw one picture instead — check them, or use a Google model.`,
            "err"
          );
        await new Promise((r) => setTimeout(r, 0));
        // Free engines start by themselves; paid ones stop at the usual dialog.
        void runQueue(made.map((r) => r.id));
      }
    };
    void tick();
    const t = setInterval(() => void tick(), 5000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [linkAvailable, pushLog, pushToast, runQueue]);

  // When every row of a request has ended, hand the pictures back.
  useEffect(() => {
    if (!linkAvailable) return;
    const ids = [...new Set(rows.map((r) => r.request_id).filter(Boolean) as string[])];
    for (const id of ids) {
      if (linkSent.current.has(id)) continue;
      const outcome = requestOutcome(rows, id);
      if (!outcome) continue;
      linkSent.current.add(id);
      void (async () => {
        const failed = [...outcome.failed];
        const done: string[] = [];
        for (const filename of outcome.done) {
          const blob = imagesRef.current.get(filename);
          // A picture made in an earlier session is not in memory any more.
          if (blob && (await linkSend(id, filename, blob))) done.push(filename);
          else failed.push({ filename, error: "the picture was made, but is not in memory any more — press Redo in Image Forge" });
        }
        const ok = await linkFinish(id, { done, failed });
        pushLog(
          ok
            ? `⇄ sent back ${done.length} picture${done.length === 1 ? "" : "s"}${failed.length ? `, ${failed.length} did not work` : ""}`
            : "⚠ could not hand the pictures back to the other app",
          ok ? "ok" : "err"
        );
      })();
    }
  }, [rows, linkAvailable, pushLog]);

  /**
   * A whole list from the chat, into the manifest.
   *
   * Deliberately does not run them. Forty pictures is exactly the moment you
   * want to read the list, change your mind about three, and press Run
   * yourself — rather than find out afterwards what was spent.
   */
  const addRowsFromChat = useCallback(async (plans: ChatPlan[]): Promise<number> => {
    const taken = [...rowsRef.current.map((r) => r.filename)];
    let nextId = rowsRef.current.reduce((m, r) => Math.max(m, r.id), 0);
    const made: ManifestRow[] = plans.map((plan) => {
      nextId += 1;
      const filename = filenameFor(plan.prompt, "item", taken);
      taken.push(filename);
      return {
        id: nextId,
        filename,
        prompt: plan.prompt,
        category: "image",
        item_id: "",
        shop_id: "",
        event_id: "",
        style: plan.style,
        aspect_ratio: plan.aspect,
        seed: Math.floor(Math.random() * 98) + 1,
        model: plan.model,
        status: "pending",
        error: "",
        generated_at: "",
        imported_attachment_id: "",
      };
    });
    setRows((prev) => [...prev, ...made]);
    pushLog(`✎ ${made.length} row${made.length > 1 ? "s" : ""} written by the chat`, "ok");
    return made.length;
  }, [pushLog]);

  /**
   * Apply the chat's changes to rows that already exist.
   *
   * Only the fields the chat is allowed to touch are copied across, and they
   * are copied one by one rather than spread — a spread would let an unexpected
   * key through and quietly rewrite a status or an id.
   */
  const editRowsFromChat = useCallback(async (edits: RowEdit[]): Promise<number> => {
    let changed = 0;
    setRows((prev) =>
      prev.map((r) => {
        const e = edits.find((x) => x.id === r.id);
        if (!e) return r;
        const next: ManifestRow = { ...r };
        if (e.prompt !== undefined) next.prompt = e.prompt;
        if (e.negative_prompt !== undefined) next.negative_prompt = e.negative_prompt;
        if (e.note !== undefined) next.note = e.note;
        if (e.filename !== undefined) next.filename = e.filename;
        if (e.style !== undefined) next.style = e.style;
        if (e.model !== undefined) next.model = e.model;
        if (e.aspect !== undefined) next.aspect_ratio = e.aspect;
        changed += 1;
        return next;
      })
    );
    pushLog(`✎ ${edits.length} row${edits.length === 1 ? "" : "s"} rewritten by the chat`, "ok");
    return edits.length;
  }, [pushLog]);

  const checkForUpdate = useCallback(async () => {
    // The app knows where it came from. Asking the user to type the owner and
    // repo before it would even look was a pointless gate — their setting
    // still wins, so a fork can point this at itself.
    const g = settingsRef.current.github;
    const owner = g.owner.trim() || HOME_REPO.owner;
    const repo = g.repo.trim() || HOME_REPO.repo;

    pushToast("info", `Checking for something newer than v${APP_VERSION}…`);
    try {
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`);
      if (res.status === 404) {
        pushToast("info", "No releases published yet — nothing to update to.");
        return;
      }
      if (res.status === 403) {
        pushToast("err", "GitHub is rate-limiting anonymous checks right now. Try again in a few minutes.");
        return;
      }
      if (!res.ok) throw new Error(`GitHub said ${res.status}`);
      const rel = (await res.json()) as {
        tag_name: string;
        html_url?: string;
        assets?: { name: string; browser_download_url: string; size?: number }[];
      };
      const latest = (rel.tag_name || "").replace(/^v/, "");

      // A real comparison, not string equality: running a build NEWER than the
      // last release used to be reported as an available update.
      if (!latest || !isNewerThan(latest, APP_VERSION)) {
        pushToast("ok", `You are on the newest version (v${APP_VERSION}).`);
        pushLog(`✓ update check · v${APP_VERSION} is current${latest ? ` (latest release v${latest})` : ""}`, "ok");
        return;
      }

      const asset = (rel.assets ?? []).find((a) => /setup.*\.exe$/i.test(a.name));
      const mb = asset?.size ? ` (${Math.round(asset.size / 1e6)} MB)` : "";
      pushLog(`⬆ v${latest} is available — you are on v${APP_VERSION}`, "info");
      setUpdateReady({
        version: latest,
        notesUrl: rel.html_url || `https://github.com/${owner}/${repo}/releases/latest`,
        assetName: asset?.name ?? "",
        assetUrl: asset?.browser_download_url ?? "",
        sizeNote: mb,
      });
    } catch (e) {
      pushToast("err", `Update check failed — ${(e as { message?: string })?.message ?? "network trouble"}`);
    }
  }, [pushToast, pushLog]);

  /* ---------- batches, wizard, factory ---------- */
  const startBatch = useCallback(
    (setup: BatchSetup, items: FactoryItem[], saveTemplateAs: string | null) => {
      const startId = rowsRef.current.reduce((m, r) => Math.max(m, r.id), 0) + 1;
      const newRows = factoryToRows(items, {
        styleId: setup.styleId,
        kind: setup.kind,
        model: setup.model,
        aspect: setup.aspect,
        defaultNegative: setup.defaultNegative,
        startId,
      });
      if (newRows.length === 0) return;
      setRows((prev) => [...prev, ...newRows]);
      const batch: Batch = {
        id: uid(),
        name: setup.name.trim() || "Unnamed batch",
        createdAt: new Date().toISOString(),
        setupName: saveTemplateAs ?? undefined,
        rowIds: newRows.map((r) => r.id),
      };
      setBatches((b) => [batch, ...b]);
      if (saveTemplateAs) {
        setSetups((s) => [{ id: uid(), name: saveTemplateAs, createdAt: new Date().toISOString(), data: setup }, ...s]);
        pushToast("ok", `Recipe “${saveTemplateAs}” saved to the template library.`);
      }
      setStyleLockState(setup.styleId);
      setBatchFilter(batch.id);
      setView("workbench");
      pushLog(`✦ batch “${batch.name}” arranged · ${newRows.length} pictures`, "ok");
      pushToast("ok", `Batch ready — ${newRows.length} picture ideas on the workbench.`);
      if (setup.linkFolder && !folderRef.current) void linkFolder();
      if (setup.runAfter) setTimeout(() => runQueue(newRows.map((r) => r.id)), 250);
    },
    [linkFolder, pushLog, pushToast, runQueue]
  );

  const rerunMarked = useCallback(
    (ids: number[]) => {
      const targets = rowsRef.current.filter((r) => ids.includes(r.id));
      if (targets.length === 0) return;
      setRows((prev) =>
        prev.map((r) => {
          if (!ids.includes(r.id)) return r;
          const note = (r.note ?? "").trim();
          return {
            ...r,
            status: "pending" as Status,
            retry_at: "",
            error: "",
            note: "",
            prompt: note ? `${r.prompt}, fix: ${note}` : r.prompt,
          };
        })
      );
      setView("workbench");
      pushLog(
        `↻ ${targets.length} picture${targets.length > 1 ? "s" : ""} sent back to the forge${
          targets.some((t) => (t.note ?? "").trim()) ? " — notes became instructions" : ""
        }`,
        "info"
      );
      setTimeout(() => runQueue(ids), 200);
    },
    [pushLog, runQueue]
  );

  const nav = useCallback((v: View, section?: SettingsSection) => {
    setView(v);
    if (section) setSettingsSection(section);
    if (v === "wizard") setWizardPreset(null);
  }, []);

  /* ---------- derived ---------- */
  const batchRows = useMemo(
    () => (batchFilter ? rows.filter((r) => batches.find((b) => b.id === batchFilter)?.rowIds.includes(r.id)) : rows),
    [rows, batches, batchFilter]
  );
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return batchRows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (catFilter !== "all" && r.category !== catFilter) return false;
      if (modelFilter !== "all" && ((r.model || "").trim() || "(default)") !== modelFilter) return false;
      if (q && !r.filename.toLowerCase().includes(q) && !r.prompt.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [batchRows, statusFilter, catFilter, modelFilter, search]);

  const drift = useMemo(() => styleDriftCount(rows, styleLock), [rows, styleLock]);
  const violations = useMemo(() => violationCount(rows, settings.filenameRules), [rows, settings.filenameRules]);
  const queueLen = rows.filter((r) => r.status === "pending" || r.status === "failed").length;
  /* Batch is a Google-only trick, so only offer it when the waiting rows can use it. */
  const batchable = rows.filter((r) => {
    if (r.status !== "pending" && r.status !== "failed") return false;
    const def = findModel((r.model || "").trim()) ?? findModel(settings.geminiModel);
    return def?.engine === "gemini" && def.batchPriceUsd !== null;
  }).length;
  const doneCount = rows.filter((r) => r.status === "done").length;
  const finishedCount = doneCount + rows.filter((r) => r.status === "imported").length;
  const markedCount = rows.filter((r) => r.status === "failed" || ((r.note ?? "").trim() !== "" && (r.status === "done" || r.status === "imported"))).length;
  const coolingCount = rows.filter((r) => r.retry_at && Date.parse(r.retry_at) > Date.now()).length;

  const activeBatch = batchFilter ? batches.find((b) => b.id === batchFilter) : null;
  const styleBlock = STYLES.find((s) => s.id === styleLock)?.block ?? settings.customStyles.find((s) => s.id === styleLock)?.block ?? "";
  const accent = accentHex(settings.ambient.accent);

  /**
   * The motion setting lives on <html> so plain CSS can act on it, including
   * inside components that never see React state. "system" sets nothing at
   * all, which leaves the prefers-reduced-motion media query in charge.
   */
  const motionPref = settings.ambient.motion ?? "system";
  useEffect(() => {
    const root = document.documentElement;
    if (motionPref === "system") root.removeAttribute("data-motion");
    else root.setAttribute("data-motion", motionPref);
  }, [motionPref]);

  /**
   * The palette goes on <html>, not on the app's own div.
   *
   * CSS variables cascade downwards, and some of the things that need them
   * live ABOVE the app: the scrollbar is styled on <html>, and the page
   * background on <body>. Setting them on a div left the scrollbar the
   * original brown whatever accent was chosen.
   */
  useEffect(() => {
    const root = document.documentElement;
    const palette = surfacesFor(accentHex(settings.ambient.accent));
    for (const [name, value] of Object.entries(palette)) root.style.setProperty(name, value);
    root.style.setProperty("--color-ember", accentHex(settings.ambient.accent));
    root.style.setProperty("--accent", accentHex(settings.ambient.accent));
  }, [settings.ambient.accent]);

  /** What the motion components should do. "system" resolves at use site. */
  const motionLevel: MotionLevel = motionPref === "system" ? "full" : motionPref;

  return (
    <div
      className="grain relative flex h-screen flex-col overflow-hidden bg-ink"
      data-glow={settings.ambient.glow}
      style={
        {
          // The palette itself is set on <html> in the effect above, because
          // the scrollbar and the page background live there. These two stay
          // for the glow, which is scoped to the app.
          "--fg-glow": `${accent}8c`,
          "--fg-glow-idle": `${accent}29`,
        } as CSSProperties
      }
    >
      {settings.ambient.background === "dots" && (
        <DotField
          className="absolute inset-0 z-0"
          dotSpacing={Math.round(46 - settings.ambient.density * 0.24)}
          dotRadius={1.25}
          cursorRadius={300}
          bulgeStrength={34}
          glowRadius={230}
          sparkle={settings.ambient.sparkle}
          waveAmplitude={settings.ambient.wave ? 2.2 : 0}
          gradientFrom="color-mix(in srgb, var(--color-parch) 20%, transparent)"
          gradientTo={`${accent}26`}
          glowColor={`${accent}14`}
        />
      )}
      {settings.ambient.background === "embers" && (
        <EmberField className="absolute inset-0 z-0" density={settings.ambient.density} color={accent} />
      )}
      {settings.ambient.background === "stars" && <StarField className="absolute inset-0 z-0" density={settings.ambient.density + 40} />}
      <CursorFX mode={settings.ambient.cursor} size={settings.ambient.cursorSize} color={accent} />
      {settings.ambient.background !== "none" && (
        <>
          {/*
            The three corner lights.
            They were fixed rgba oranges and purples, so they stayed warm
            whatever accent you chose — and there was no way to switch them
            off, which made "Quiet" not actually quiet. They take the accent
            now, and the Quiet background already turned them off — that guard
            was here all along, so what could not be switched off was the
            colour, not the light.
          */}
          <>
              <div
                className="lantern-glow"
                style={{ top: -140, left: -120, width: 460, height: 460, background: "color-mix(in srgb, var(--color-ember) 16%, transparent)" }}
              />
              <div
                className="lantern-glow"
                style={{ bottom: -180, right: -140, width: 520, height: 520, background: "color-mix(in srgb, var(--color-ember) 10%, transparent)", animationDelay: "-3.4s" }}
              />
              <div
                className="lantern-glow"
                style={{ top: "38%", right: "22%", width: 300, height: 300, background: "color-mix(in srgb, var(--color-cream) 6%, transparent)", animationDelay: "-5.2s" }}
              />
          </>
        </>
      )}

      {/* header */}
      <header className="relative z-20 flex shrink-0 flex-wrap items-center gap-x-5 gap-y-2 border-b border-line bg-coal/85 px-5 py-3 backdrop-blur">
        <button onClick={() => nav("workbench")} className="btn-press flex items-center gap-3 text-left">
          <span className="plaque flex h-10 w-10 items-center justify-center rounded-xl text-ember">
            <IAnvil size={24} />
          </span>
          <span>
            <span className="block font-display text-[19px] leading-none tracking-wide text-cream">
              IMAGE <span className="text-ember">FORGE</span>
            </span>
            <span className="mt-1 block font-mono text-[9.5px] tracking-[0.14em] text-dust uppercase">image pipeline</span>
          </span>
        </button>

        <TopMenu
          view={view}
          onNav={nav}
          provider={settings.provider}
          onProvider={(p) => patchSettings({ provider: p })}
          settings={settings}
          markedCount={markedCount}
          templateCount={setups.length}
          batchCount={batches.length}
          doneCount={doneCount}
          onRerunMarked={() => {
            const ids = rows
              .filter((r) => r.status === "failed" || ((r.note ?? "").trim() !== "" && (r.status === "done" || r.status === "imported")))
              .map((r) => r.id);
            if (ids.length === 0) {
              pushToast("info", "Nothing marked and nothing failed — the wall is clean.");
              return;
            }
            rerunMarked(ids);
          }}
          onWpImport={() => setWpOpen(true)}
          onZip={zipAll}
          motion={motionLevel}
              onExportCsv={exportCsv}
              onExportXlsx={exportXlsx}
            />

        <div className="ml-auto flex items-center gap-2">
          {/* Everything that moves, behind one door. Sheets, vectors, Lottie
              and GIFs were four separate ideas in the UI and one idea to a
              person: making something animate.

              Hidden until a picture exists: every one of these needs something
              to work from, so offering them on an empty manifest is offering
              a dead end. */}
          {doneCount > 0 && (
          <div className="relative">
            <button
              onClick={() => setAnimateOpen((o) => !o)}
              title="Animated characters, animated graphics, and motion from a still"
              className={`btn-press flex items-center gap-1.5 rounded-lg border px-2.5 py-2 ${
                animateOpen ? "border-potion/60 bg-potion/15 text-potion" : "border-line bg-panel/70 text-parch hover:border-potion/50 hover:text-potion"
              }`}
            >
              <span className="text-[13px] leading-none">◈</span>
              <span className="hidden text-[12px] lg:inline">Animate</span>
            </button>
            {animateOpen && (
              <CardPanel
                level={motionLevel}
                onClose={() => setAnimateOpen(false)}
                cards={[
                  {
                    id: "character",
                    title: "Animated character",
                    hint: "walk cycles, turnarounds, expressions, and a talking head with mouth shapes, blinks and brows",
                    icon: <span className="text-[13px] leading-none">☺</span>,
                    onPick: () => setSheetOpen(true),
                  },
                  {
                    id: "graphics",
                    title: "Animated graphics",
                    hint: "SVG icons and illustrations, and Lottie JSON that plays in a web page",
                    icon: <span className="text-[13px] leading-none">◆</span>,
                    onPick: () => setVectorOpen(true),
                  },
                  {
                    id: "gif",
                    title: "Motion from a picture",
                    hint: "turn any finished picture into a GIF — free, no second generation",
                    icon: <span className="text-[13px] leading-none">▶</span>,
                    onPick: () => {
                      const done = rowsRef.current.find((r) => r.status === "done");
                      if (!done) {
                        pushToast("info", "Make a picture first — then any finished row can become a GIF.");
                        return;
                      }
                      openGifMaker(done);
                    },
                  },
                ]}
              />
            )}
          </div>
          )}
          <span className="hidden font-mono text-[10.5px] text-dust xl:block">
            {queueLen > 0 ? `${queueLen} awaiting the hammer` : coolingCount > 0 ? `${coolingCount} cooling` : "queue clear"}
          </span>
          {settings.batchJobs.length > 0 && (
            <button
              onClick={() => void checkBatches()}
              className="btn-press hidden items-center gap-1.5 rounded-lg border border-moss/50 bg-moss/10 px-3 py-2 text-[12px] font-semibold text-moss lg:flex"
              title="Ask Google whether your half-price jobs have finished"
            >
              Collect delayed · {settings.batchJobs.length}
            </button>
          )}
          {batchable > 0 && (
            <button
              onClick={() => void sendBatch()}
              disabled={isRunning}
              className="btn-press hidden items-center gap-1.5 rounded-lg border border-line bg-panel/70 px-3 py-2 text-[12px] font-semibold text-parch hover:text-cream disabled:opacity-35 xl:flex"
              title={`Send ${batchable} row${batchable > 1 ? "s" : ""} to Google as a background job at HALF PRICE. You collect them later — usually within the hour. Nothing to do with a "batch" of rows; this is only about cost.`}
            >
              New €/2 delayed queue
            </button>
          )}
          {/* The two live together: one makes work, the other does it. They
              used to sit at opposite ends of the bar sharing a play icon,
              which said both were ways of starting the same thing. */}
          <button
            onClick={() => nav("wizard")}
            title="Set up a new queue of pictures — the wizard asks one easy question at a time"
            className="btn-press flex items-center gap-1.5 rounded-lg border border-line2 bg-panel/70 px-3 py-2 text-[13px] text-parch hover:border-ember/50 hover:text-cream"
          >
            <IWand size={13} /> New queue
          </button>
          <button
            onClick={() => runQueue()}
            disabled={isRunning || queueLen === 0}
            className={`btn-press flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-semibold ${
              isRunning
                ? "stripes-live text-[var(--color-on-accent)]"
                : `bg-ember text-[var(--color-on-accent)] hover:bg-[var(--color-accent-lift)] disabled:cursor-not-allowed disabled:opacity-35 disabled:shadow-none ${queueLen > 0 ? "breathe" : ""}`
            }`}
          >
            <IPlay size={13} />
            {isRunning ? "Forging…" : `Run queue · ${queueLen}`}
          </button>
        </div>
      </header>

      {/* body */}
      <div className="relative z-10 flex min-h-0 flex-1">
        {view === "start" ? (
          <main className="min-w-0 flex-1 overflow-y-auto">
            <StartView
              settings={settings}
              rows={rows}
              isRunning={isRunning}
              onMake={makeFromStart}
              onOpenForge={() => nav("workbench")}
              onOpenSettings={() => nav("settings", "engines")}
            />
          </main>
        ) : view === "workbench" ? (
          <>
            <Sidebar
              rows={rows}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              catFilter={catFilter}
              modelFilter={modelFilter}
              setModelFilter={setModelFilter}
              setCatFilter={setCatFilter}
              styleLock={styleLock}
              isRunning={isRunning}
              onRun={() => runQueue()}
              onStop={() => {
                stopRef.current = true;
              }}
              drift={drift}
              violations={violations}
              motion={motionLevel}
              onJumpSpec={() => nav("settings", "filenames")}
            />
            <main className="relative flex min-w-0 flex-1 flex-col">
              {activeBatch && (
                <div className="flex shrink-0 items-center gap-2.5 border-b border-line bg-panel/60 px-5 py-2">
                  <span className="font-mono text-[10px] tracking-[0.2em] text-dust uppercase">showing batch</span>
                  <span className="rounded-md border border-ember/40 bg-ember/10 px-2 py-0.5 font-mono text-[11px] text-ember">{activeBatch.name}</span>
                  <span className="font-mono text-[10px] text-dust">{activeBatch.rowIds.length} pictures</span>
                  <button onClick={() => setBatchFilter(null)} className="btn-press ml-auto flex items-center gap-1 font-mono text-[10px] text-dust hover:text-cream">
                    <IX size={10} /> show everything
                  </button>
                </div>
              )}
              <ManifestView
                rows={filtered}
                allRows={rows}
                filenameRules={settings.filenameRules}
                total={rows.length}
                search={search}
                setSearch={setSearch}
                statusFilter={statusFilter}
                setStatusFilter={setStatusFilter}
                catFilter={catFilter}
                setCatFilter={setCatFilter}
                selectedId={selectedId}
                onSelect={setSelectedId}
                openScribe={(id) => {
                  const r = rowsRef.current.find((x) => x.id === id);
                  setChatSeed(`Look at row #${id} (${r?.filename ?? ""}) and `);
                  nav("chat");
                }}
                startWizard={() => nav("wizard")}
                addRow={addRow}
                updateRow={patchRow}
                deleteRow={deleteRow}
                duplicateRow={duplicateRow}
                generateOne={generateOne}
                forceRetry={forceRetry}
                setToPending={setToPending}
                markSkipped={markSkipped}
                markImported={markImported}
                downloadRow={downloadRow}
                importCsv={importCsv}
                exportCsv={exportCsv}
                exportXlsx={exportXlsx}
                compare={compare}
                strikeVariant={strikeVariant}
                keepVariant={keepVariant}
                discardVariant={() => setCompare(null)}
                log={log}
                isRunning={isRunning}
                styleLock={styleLock}
                appendStyle={appendStyle}
                setAppendStyle={setAppendStyle}
              />
            </main>
          </>
        ) : view === "wizard" ? (
          <main className="min-w-0 flex-1 overflow-y-auto">
            <WizardView
              key={wizardPreset?.id ?? "fresh"}
              preset={wizardPreset}
              setups={setups}
              settings={settings}
              patchSettings={patchSettings}
              folder={folder}
              onLinkFolder={linkFolder}
              onFinish={startBatch}
              onExit={() => nav("workbench")}
              pushToast={pushToast}
            />
          </main>
        ) : view === "factory" ? (
          <main className="min-w-0 flex-1 overflow-y-auto">
            <PromptFactory
              settings={settings}
              styleId={styleLock}
              styleBlock={styleBlock}
              items={factoryItems}
              setItems={setFactoryItems}
              pushToast={pushToast}
            />
            {factoryItems.filter((i) => i.filename.trim() && i.prompt.trim()).length > 0 && (
              <div className="sticky bottom-0 border-t border-line bg-coal/90 px-6 py-3 backdrop-blur">
                <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
                  <p className="font-mono text-[11px] text-dust">
                    {factoryItems.filter((i) => i.filename.trim() && i.prompt.trim()).length} pictures ready · style “{styleLock}” will be appended
                  </p>
                  <Btn
                    variant="moss"
                    onClick={() => {
                      const ready = factoryItems.map((i) => ({
                        ...i,
                        prompt: styleBlock && appendStyle && !i.prompt.endsWith(styleBlock) ? `${i.prompt}, ${styleBlock}` : i.prompt,
                      }));
                      startBatch(
                        {
                          name: `Factory batch ${new Date().toLocaleDateString("en-GB")}`,
                          kind: "none",
                          styleId: styleLock,
                          model: "",
                          aspect: "per-category",
                          linkFolder: folder.linked,
                          runAfter: false,
                          defaultNegative: "",
                        },
                        ready,
                        null
                      );
                      setFactoryItems([]);
                    }}
                  >
                    <IPlay size={13} /> Arrange on the workbench
                  </Btn>
                </div>
              </div>
            )}
          </main>
        ) : view === "lib-images" ? (
          <main className="min-w-0 flex-1 overflow-y-auto">
            <ImageLibrary rows={rows} batches={batches} updateRow={patchRow} onRedo={rerunMarked} onMakeGif={openGifMaker} onAddText={openLetterer} />
          </main>
        ) : view === "lib-styles" ? (
          <main className="min-w-0 flex-1 overflow-y-auto">
              <StyleLibrary settings={settings} patchSettings={patchSettings} styleLock={styleLock} setStyleLock={setStyleLock} pushToast={pushToast} />          </main>
        ) : view === "lib-templates" ? (
          <main className="min-w-0 flex-1 overflow-y-auto">
            <TemplateLibrary
              setups={setups}
              onDelete={(id) => setSetups((s) => s.filter((x) => x.id !== id))}
              onUse={(t) => {
                setWizardPreset(t);
                setView("wizard");
              }}
            />
          </main>
        ) : view === "lib-batches" ? (
          <main className="min-w-0 flex-1 overflow-y-auto">
            <BatchLibrary
              batches={batches}
              rows={rows}
              onExport={exportBatchCsv}
              onOpen={(id) => {
                setBatchFilter(id);
                setView("workbench");
              }}
              onRerun={(id) => {
                const b = batches.find((x) => x.id === id);
                if (!b) return;
                const ids = rowsRef.current.filter((r) => b.rowIds.includes(r.id) && (r.status === "pending" || r.status === "failed")).map((r) => r.id);
                if (ids.length === 0) {
                  pushToast("info", "Nothing left to rerun in that batch.");
                  return;
                }
                rerunMarked(ids);
              }}
              onDelete={(id) => setBatches((b) => b.filter((x) => x.id !== id))}
            />
          </main>
        ) : view === "settings" ? (
          <main className="min-w-0 flex-1 overflow-y-auto">
            <SettingsView
              section={settingsSection}
              onSection={setSettingsSection}
              settings={settings}
              patchSettings={patchSettings}
              folder={folder}
              onLinkFolder={linkFolder}
              onUnlinkFolder={unlinkFolder}
              onSyncAll={syncAllToFolder}
              onGoStyles={() => nav("lib-styles")}
              rows={rows}
              onRepair={repairForge}
              onBackup={backupAll}
              onReset={resetForge}
              onPullManifest={pullManifest}
              onCheckUpdate={checkForUpdate}
              appVersion={APP_VERSION}
              pushToast={pushToast}
              saveProof={saveProof}
              onSaveNow={() => saveSettingsNow()}
              onRestoreSettings={(partial) => setSettings((prev) => normalizeSettings({ ...prev, ...partial }))}
              styleLock={styleLock}
              onLockStyle={setStyleLock}
            />
          </main>
        ) : view === "chat" ? (
          <main className="min-w-0 flex-1 overflow-y-auto">
            <ChatView
              settings={settings}
              rows={rows}
              motion={motionLevel}
              onForge={forgeFromChat}
              onAddRows={addRowsFromChat}
              onEditRows={editRowsFromChat}
              seed={chatSeed ?? undefined}
              onSeedUsed={() => setChatSeed(null)}
              onOpenSettings={() => nav("settings", "text")}
              pushToast={pushToast}
            />
          </main>
        ) : view === "docs" ? (
          <main className="min-w-0 flex-1 overflow-y-auto">
            <DocsView
              rows={rows}
              settings={settings}
              folderLinked={folder.linked}
              folderName={folder.name}
              onLinkFolder={linkFolder}
              onZip={zipAll}
              onOpenSettings={() => nav("settings", "engines")}
            />
          </main>
        ) : (
          <main className="min-w-0 flex-1 overflow-y-auto">
            <AgentsView />
          </main>
        )}
      </div>

      {gifFor && (
        <GifMaker
          row={gifFor.row}
          blob={gifFor.blob}
          settings={settings}
          onClose={() => setGifFor(null)}
          onSaved={async (name, gif) => {
            // drop it beside the picture it came from, if a folder is linked
            const tRoot = tauriFolderRef.current;
            // the writers take a row and use its filename, so hand them the .gif name
            const asGif = { ...gifFor.row, filename: name };
            try {
              if (isTauri() && tRoot) await tauriWriteImage(tRoot, asGif, gif);
              else if (folderRef.current) await writeImageFile(folderRef.current, asGif, gif);
              else return;
              pushLog(`⤓ ${name} written beside ${gifFor.row.filename}`, "ok");
            } catch {
              pushLog(`⚠ could not write ${name} into the linked folder`, "err");
            }
          }}
          pushToast={pushToast}
        />
      )}

      {paidAsk && (
        <PaidConfirm
          check={paidAsk.check}
          onCancel={() => setPaidAsk(null)}
          onApprove={() => {
            const t = paidAsk.targets;
            const spend = formatUsd(paidAsk.check.totalUsd);
            const on = paidAsk.check.model;
            setPaidAsk(null);
            pushLog(`⚑ you approved about ${spend} on ${on}`, "info");
            void runQueue(t, true);
          }}
          onUseFree={(engineId) => {
            const t = paidAsk.targets;
            setPaidAsk(null);
            patchSettings({ provider: engineId as ForgeSettings["provider"] });
            pushLog(`↪ switched to ${engineId} instead — this run is free`, "ok");
            // let the new engine settle into state before running
            setTimeout(() => void runQueue(t, true), 60);
          }}
        />
      )}

      {sheetOpen && (
        <SheetMaker
          settings={settings}
          onClose={() => setSheetOpen(false)}
          pushToast={pushToast}
          pushLog={pushLog}
          onExhaust={(pool, id, until) =>
            setSettings((prev) => ({
              ...prev,
              [pool]: prev[pool].map((k) => (k.id === id ? { ...k, exhaustedUntil: until } : k)),
            }))
          }
        />
      )}

      {vectorOpen && (
        <VectorMaker
          settings={settings}
          onClose={() => setVectorOpen(false)}
          pushToast={pushToast}
          pushLog={pushLog}
        />
      )}

      {textFor && (
        <Letterer
          row={textFor.row}
          blob={textFor.blob}
          settings={settings}
          onClose={() => setTextFor(null)}
          onSaved={async (name, png) => {
            const tRoot = tauriFolderRef.current;
            const asPng = { ...textFor.row, filename: name };
            try {
              if (isTauri() && tRoot) await tauriWriteImage(tRoot, asPng, png);
              else if (folderRef.current) await writeImageFile(folderRef.current, asPng, png);
              else return;
              pushLog(`⤓ ${name} written beside ${textFor.row.filename}`, "ok");
            } catch {
              pushLog(`⚠ could not write ${name} into the linked folder`, "err");
            }
          }}
          pushToast={pushToast}
          pushLog={pushLog}
        />
      )}

      <WpImportModal
        open={wpOpen}
        onClose={() => setWpOpen(false)}
        settings={settings}
        patchSettings={patchSettings}
        rows={rows}
        batches={batches}
        getBlob={getBlobFor}
        patchRow={patchRow}
        pushToast={pushToast}
      />

      <ToastHost toasts={toasts} dismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
    </div>
  );
}
