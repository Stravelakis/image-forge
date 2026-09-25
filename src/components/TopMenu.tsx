import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ForgeSettings, ProviderId } from "../lib/providers";
import { MODELS, PROVIDER_META, formatCountdown } from "../lib/providers";
import { Btn, IDownload, IChevron, IFlask, IFolder, IGear, IImage, IPlay, IQuill, IRetry, ISparkle, IUpload, IWand, IBook, IX } from "./ui";
import { CardPanel, PillNav, type NavCard } from "./nav";
import type { MotionLevel } from "./motion";

export type View =
  | "start"
  | "workbench"
  | "chat"
  | "wizard"
  | "factory"
  | "lib-images"
  | "lib-styles"
  | "lib-templates"
  | "lib-batches"
  | "settings"
  | "docs"
  | "agents";

type PanelId = "wizards" | "gallery" | "settings" | "docs" | "download";

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

function Dropdown({
  label,
  active,
  children,
}: {
  label: string;
  active: boolean;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onDoc = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, []);
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`btn-press flex items-center gap-1 rounded-lg px-3 py-2 font-display text-[13px] tracking-wide transition-colors ${
          active || open ? "text-cream" : "text-dust hover:text-parch"
        }`}
      >
        {label}
        <IChevron size={12} className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="pop-in absolute left-0 top-full z-40 mt-1.5 w-60 overflow-hidden rounded-xl border border-line2 bg-panel shadow-[0_24px_60px_rgba(0,0,0,0.55)]">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

const Item = ({
  onClick,
  icon,
  title,
  hint,
  badge,
}: {
  onClick: () => void;
  icon: ReactNode;
  title: string;
  hint?: string;
  badge?: string;
}) => (
  <button
    onClick={onClick}
    className="btn-press flex w-full items-center gap-3 border-b border-line/50 px-3.5 py-2.5 text-left transition-colors last:border-0 hover:bg-raise/60"
  >
    <span className="text-ember">{icon}</span>
    <span className="min-w-0 flex-1">
      <span className="block text-[13px] font-semibold text-cream">{title}</span>
      {hint && <span className="block truncate text-[10.5px] text-dust">{hint}</span>}
    </span>
    {badge && <span className="rounded-md border border-ember/40 bg-ember/10 px-1.5 py-0.5 font-mono text-[9.5px] text-ember">{badge}</span>}
  </button>
);

function ModelSelector({
  provider,
  onProvider,
  settings,
}: {
  provider: ProviderId;
  onProvider: (p: ProviderId) => void;
  settings: ForgeSettings;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onDoc = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, []);

  const geminiHealthy = settings.geminiKeys.filter((k) => k.key.trim() && k.exhaustedUntil <= Date.now()).length;
  const openaiHealthy = settings.openaiKeys.filter((k) => k.key.trim() && k.exhaustedUntil <= Date.now()).length;
  const benchedGemini = settings.geminiKeys.filter((k) => k.key.trim() && k.exhaustedUntil > Date.now());

  const options: { id: ProviderId; label: string; sub: string; ok: boolean }[] = [
    { id: "simulated", label: "Simulated Forge", sub: "offline rehearsal · free", ok: true },
    {
      id: "local",
      label: "Your own machine",
      sub: settings.localBase.trim() ? `${settings.localModel || "no model set"} · free, unlimited` : "set the address in Settings",
      ok: Boolean(settings.localBase.trim() && settings.localModel.trim()),
    },
    {
      id: "cloudflare",
      label: "Cloudflare · FLUX",
      sub: settings.cloudflare.accountId.trim() && settings.cloudflare.token.trim()
        ? "free · about 690 pictures a day"
        : "add an account id + token in Settings",
      ok: Boolean(settings.cloudflare.accountId.trim() && settings.cloudflare.token.trim()),
    },
    {
      id: "pollinations",
      label: "Pollinations · FLUX",
      sub: settings.pollinationsToken.trim() ? "free · one every few seconds" : "needs a free token — Settings",
      ok: Boolean(settings.pollinationsToken.trim()),
    },
    {
      id: "ovh",
      label: "OVHcloud · SDXL",
      sub: "free · no key · two a minute",
      ok: true,
    },
    {
      id: "gemini",
      label: "Google · Nano Banana",
      sub:
        geminiHealthy > 0
          ? `${geminiHealthy} key${geminiHealthy > 1 ? "s" : ""} healthy${benchedGemini.length ? ` · ${benchedGemini.length} resting ${formatCountdown(benchedGemini[0].exhaustedUntil)}` : ""}`
          : "add a Google key in Settings",
      ok: geminiHealthy > 0,
    },
    {
      id: "openai",
      label: "OpenAI-compatible",
      sub: openaiHealthy > 0 ? `${openaiHealthy} key${openaiHealthy > 1 ? "s" : ""} · ${settings.openaiModel}` : "add a key in Settings",
      ok: openaiHealthy > 0,
    },
  ];

  const current = options.find((o) => o.id === provider) ?? options[0];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="btn-press flex items-center gap-2 rounded-lg border border-line bg-panel/70 px-3 py-2 hover:border-line2"
        title="Active engine — only engines that are ready to work appear here"
      >
        <span className={`h-2 w-2 rounded-full ${provider !== "simulated" ? "pulse-dot" : ""}`} style={{ background: PROVIDER_META[provider].dot }} />
        <span className="font-mono text-[10.5px] tracking-wide text-parch uppercase">{PROVIDER_META[provider].short}</span>
        <IChevron size={11} className={`text-dust transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="pop-in absolute right-0 top-full z-40 mt-1.5 w-72 overflow-hidden rounded-xl border border-line2 bg-panel shadow-[0_24px_60px_rgba(0,0,0,0.55)]">
          <p className="border-b border-line bg-[var(--color-field)] px-3.5 py-2 font-mono text-[9px] tracking-[0.2em] text-dust uppercase">
            active engine — unavailable ones are hidden
          </p>
          {options.map((o) => {
            if (!o.ok) return null;
            return (
              <button
                key={o.id}
                onClick={() => {
                  onProvider(o.id);
                  setOpen(false);
                }}
                className={`btn-press flex w-full items-center gap-2.5 border-b border-line/50 px-3.5 py-2.5 text-left last:border-0 hover:bg-raise/60 ${
                  provider === o.id ? "bg-ember/8" : ""
                }`}
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: PROVIDER_META[o.id].dot }} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold text-cream">{o.label}</span>
                  <span className="block text-[10.5px] text-dust">{o.sub}</span>
                </span>
                {provider === o.id && <span className="font-mono text-[9px] tracking-widest text-ember uppercase">active</span>}
              </button>
            );
          })}
          <p className="px-3.5 py-2 text-[10px] leading-relaxed text-dust">
            Row-level <span className="font-mono text-parch">model</span> column overrides this for any single row.
          </p>
        </div>
      )}
    </div>
  );
}

export default function TopMenu({
  view,
  onNav,
  provider,
  onProvider,
  settings,
  markedCount,
  templateCount,
  batchCount,
  doneCount,
  onRerunMarked,
  onWpImport,
  onZip,
  onExportCsv,
  onExportXlsx,
  motion,
}: {
  view: View;
  onNav: (v: View, section?: SettingsSection) => void;
  provider: ProviderId;
  onProvider: (p: ProviderId) => void;
  settings: ForgeSettings;
  markedCount: number;
  templateCount: number;
  batchCount: number;
  doneCount: number;
  onRerunMarked: () => void;
  onWpImport: () => void;
  onZip: () => void;
  onExportCsv: () => void;
  onExportXlsx: () => void;
  motion: MotionLevel;
}) {
  const [panel, setPanel] = useState<PanelId | null>(null);

  // Which pill is lit. Several views live under one destination.
  const activePill =
    view === "wizard" || view === "factory"
      ? "wizards"
      : view.startsWith("lib-")
        ? "gallery"
        : view === "docs" || view === "agents"
          ? "docs"
          : view === "chat"
            ? "chat"
            : view === "start"
              ? "start"
            : view === "settings"
              ? "settings"
              : "workbench";

  const wizardCards: NavCard[] = [
    { id: "wizard", title: "Start the wizard", hint: "a new batch, one easy choice at a time", icon: <IWand size={15} />, onPick: () => onNav("wizard") },
    { id: "factory", title: "Prompt factory", hint: "write a huge list — AI or your own CSV", icon: <ISparkle size={15} />, onPick: () => onNav("factory") },
    { id: "rerun", title: "Rerun marked & failed", hint: "notes become extra instructions", icon: <IRetry size={15} />, badge: markedCount > 0 ? String(markedCount) : undefined, onPick: onRerunMarked },
    { id: "wp", title: "Import to WordPress", hint: "real upload with an app password", icon: <IUpload size={15} />, badge: doneCount > 0 ? String(doneCount) : undefined, onPick: onWpImport },
  ];

  const galleryCards: NavCard[] = [
    { id: "lib-images", title: "Images", hint: "mark, note and redo any picture", icon: <IImage size={15} />, onPick: () => onNav("lib-images") },
    { id: "lib-styles", title: "Styles", hint: "the built-in languages, and your own", icon: <IFlask size={15} />, onPick: () => onNav("lib-styles") },
    { id: "lib-templates", title: "Templates", hint: "saved setups, ready to reuse", icon: <IWand size={15} />, badge: templateCount > 0 ? String(templateCount) : undefined, onPick: () => onNav("lib-templates") },
    { id: "lib-batches", title: "Previous batches", hint: "what you have run before", icon: <IFolder size={15} />, badge: batchCount > 0 ? String(batchCount) : undefined, onPick: () => onNav("lib-batches") },
  ];

  const settingsCards: NavCard[] = [
    { id: "engines", title: "Image engines", hint: "keys, models, cooldowns, pausing one", icon: <IImage size={15} />, onPick: () => onNav("settings", "engines") },
    { id: "styles", title: "Image styles", hint: "the 36 looks, and your own", icon: <IFlask size={15} />, onPick: () => onNav("settings", "styles") },
    { id: "text", title: "Text engines", hint: "the models that write, code and see", icon: <IQuill size={15} />, onPick: () => onNav("settings", "text") },
    { id: "prompts", title: "Text prompts", hint: "tune how the AI writes for you", icon: <ISparkle size={15} />, onPick: () => onNav("settings", "prompts") },
    { id: "filenames", title: "Filenames", hint: "the seven naming rules", icon: <IBook size={15} />, onPick: () => onNav("settings", "filenames") },
    { id: "folders", title: "Folders", hint: "where pictures land on disk", icon: <IFolder size={15} />, onPick: () => onNav("settings", "folders") },
    { id: "wp", title: "WP connections", hint: "the WordPress hand-off", icon: <IUpload size={15} />, onPick: () => onNav("settings", "wp") },
    { id: "appearance", title: "Appearance", hint: "colour, background and movement", icon: <IGear size={15} />, onPick: () => onNav("settings", "appearance") },
    { id: "advanced", title: "Advanced", hint: "check the forge, repair, backup, update", icon: <IRetry size={15} />, onPick: () => onNav("settings", "advanced") },
  ];

  const docsCards: NavCard[] = [
    { id: "docs", title: "The manual", hint: "setup to finished pictures, step by step", icon: <IBook size={15} />, onPick: () => onNav("docs") },
    { id: "agents", title: "Agents & API", hint: "MCP, n8n and LangChain recipes", icon: <ISparkle size={15} />, onPick: () => onNav("agents") },
  ];

  const pick = (id: string) => {
    if (id === "wizards" || id === "gallery" || id === "settings" || id === "docs") {
      setPanel((p) => (p === id ? null : (id as PanelId)));
      return;
    }
    setPanel(null);
    if (id === "start") onNav("start");
    else if (id === "workbench") onNav("workbench");
    else if (id === "chat") onNav("chat");
  };

  return (
    <nav className="flex items-center gap-2">
      <div className="relative">
        <PillNav
          level={motion}
          activeId={activePill}
          onPick={pick}
          items={[
            { id: "start", label: "Start" },
            { id: "workbench", label: "Forge" },
            { id: "chat", label: "Chat" },
            { id: "wizards", label: "Wizards", badge: markedCount > 0 ? String(markedCount) : undefined, opens: true },
            { id: "gallery", label: "Gallery", badge: batchCount > 0 ? String(batchCount) : undefined, opens: true },
            { id: "docs", label: "Docs", opens: true },
            { id: "settings", label: "Settings", opens: true },
          ]}
        />
        {panel === "wizards" && <CardPanel level={motion} cards={wizardCards} onClose={() => setPanel(null)} />}
        {panel === "gallery" && <CardPanel level={motion} cards={galleryCards} onClose={() => setPanel(null)} />}
        {panel === "settings" && <CardPanel level={motion} cards={settingsCards} onClose={() => setPanel(null)} />}
        {panel === "docs" && <CardPanel level={motion} cards={docsCards} onClose={() => setPanel(null)} />}
      </div>

      <div className="ml-1 flex items-center gap-2 border-l border-line pl-3">
        <ModelSelector provider={provider} onProvider={onProvider} settings={settings} />
        {/* Three download buttons wearing the same arrow used to be spread
            across two rows. One control, and it says what each thing is. */}
        <div className="relative hidden sm:block">
          <button
            onClick={() => setPanel((p) => (p === "download" ? null : "download"))}
            title="Save your pictures or your manifest"
            className={`btn-press flex items-center gap-1.5 rounded-lg border px-2.5 py-2 ${
              panel === "download" ? "border-ember/60 bg-ember/15 text-cream" : "border-line bg-panel/70 text-parch hover:border-line2"
            }`}
          >
            <IDownload size={13} className="text-dust" />
            <span className="text-[12px]">Download</span>
            <svg aria-hidden viewBox="0 0 24 24" className="h-2.5 w-2.5 opacity-60" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          {panel === "download" && (
            <CardPanel
              level={motion}
              onClose={() => setPanel(null)}
              cards={[
                {
                  id: "zip",
                  title: doneCount > 0 ? `The pictures (${doneCount})` : "The pictures",
                  hint:
                    doneCount > 0
                      ? "one ZIP, sorted into folders, with the CSV inside"
                      : "nothing finished yet — forge something first",
                  icon: <IImage size={15} />,
                  onPick: () => doneCount > 0 && onZip(),
                },
                {
                  id: "csv",
                  title: "The manifest, as CSV",
                  hint: "the same format Import reads back",
                  icon: <IDownload size={15} />,
                  onPick: onExportCsv,
                },
                {
                  id: "xlsx",
                  title: "The manifest, as a spreadsheet",
                  hint: "for handing to someone who wants Excel",
                  icon: <IDownload size={15} />,
                  onPick: onExportXlsx,
                },
              ]}
            />
          )}
        </div>

      </div>
    </nav>
  );
}
