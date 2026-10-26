import { useState, type ReactNode } from "react";
import type { AspectKey, Category, Toast } from "../types";
import { ASPECTS, ASPECT_KEYS, CATEGORY_META, KINDS, STYLES, kindById } from "../types";
import type { ForgeSettings, ProviderId } from "../lib/providers";
import { MODELS, PROVIDER_META, modelOptions } from "../lib/providers";
import { fsSupported } from "../lib/output";
import type { BatchSetup, FactoryItem, SavedSetup } from "../lib/batches";
import { DEFAULT_SETUP } from "../lib/batches";
import { autoFixFilename, validateFilename } from "../lib/validate";
import PromptFactory from "./PromptFactory";
import { BorderGlow } from "./effects";
import { Btn, CatChip, IAlert, ICheck, IFolder, IGear, IPlay, IStar, IX } from "./ui";

// THREE SCREENS, not nine (Ak, 13 Oct 2026: "can we simplify the start the
// wizard?"). The nine parts are all still here — each screen shows a few of
// them (GROUPS), so nothing a part does had to change.
const STEPS = [
  { name: "What to make", short: "the list — name and world are optional" },
  { name: "How it looks", short: "style, shape and engine" },
  { name: "Go", short: "where files land · read and press go" },
];
/** Which of the original nine parts each screen shows. */
const GROUPS: number[][] = [
  // part 1 (the world) lives inside the list's own chooser now — one choice, not two
  [0, 2],
  [3, 5, 4],
  [6, 7, 8],
];

const card = "rounded-xl border border-line bg-panel/50 px-4 py-3.5";
const field = "w-full rounded-lg border border-line bg-[var(--color-field)] px-3 py-2.5 text-[13px] text-cream placeholder:text-dust/60";

function Explain({ children }: { children: ReactNode }) {
  return <p data-tip="A note in plain words to help you with this step." className="mt-3 rounded-lg border border-line/70 bg-[var(--color-field)] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-parch">{children}</p>;
}

function AccordionItem({
  i,
  item,
  open,
  onToggle,
  onPatch,
  kindTag,
}: {
  i: number;
  item: FactoryItem;
  open: boolean;
  onToggle: () => void;
  onPatch: (p: Partial<FactoryItem>) => void;
  kindTag: string;
}) {
  const cat: Category = item.category ?? "image";
  return (
    <div className={`overflow-hidden rounded-xl border transition-colors ${open ? "border-line2 bg-panel/70" : "border-line bg-panel/40"}`}>
      <button data-tip="Opens or closes this picture so you can read and change its prompt." onClick={onToggle} className="btn-press flex w-full items-center gap-3 px-4 py-3 text-left">
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border font-mono text-[10px] transition-transform duration-300 ${
            open ? "rotate-90 border-ember/60 text-ember" : "border-line2 text-dust"
          }`}
        >
          ▸
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono text-[12px] text-cream">
            <span className="text-dust">{String(i + 1).padStart(2, "0")} · </span>
            {item.filename || "unnamed picture"}
          </span>
          {!open && <span className="block truncate text-[11px] text-dust">{item.prompt || "no prompt yet"}</span>}
        </span>
        <CatChip category={cat} />
        {kindTag && <span className="rounded-md border border-potion/35 bg-potion/8 px-1.5 py-0.5 font-mono text-[9.5px] text-potion">{kindTag}</span>}
      </button>
      {open && (
        <div className="rise-in border-t border-line/70 px-4 py-3.5">
          <label data-tip="The full words that tell the painter what to draw." className="mb-1 block font-mono text-[9.5px] tracking-[0.2em] text-dust uppercase">description (prompt) — the full words</label>
          <textarea data-tip="The full words that tell the painter what to draw for this picture." value={item.prompt} onChange={(e) => onPatch({ prompt: e.target.value })} rows={3} className={field + " resize-y text-[12.5px]"} />
          <label data-tip="Things you do NOT want in this picture." className="mb-1 mt-3 block font-mono text-[9.5px] tracking-[0.2em] text-dust uppercase">things to avoid (negative prompt)</label>
          <textarea data-tip="Things you do not want in this picture, like words or a watermark." value={item.negative_prompt ?? ""} onChange={(e) => onPatch({ negative_prompt: e.target.value || undefined })} rows={2} className={field + " resize-y text-[12px] text-blood/80"} />
        </div>
      )}
    </div>
  );
}

export default function WizardView({
  preset,
  setups,
  settings,
  patchSettings,
  folder,
  onLinkFolder,
  onFinish,
  onExit,
  pushToast,
}: {
  preset?: SavedSetup | null;
  setups: SavedSetup[];
  settings: ForgeSettings;
  patchSettings: (p: Partial<ForgeSettings>) => void;
  folder: { linked: boolean; name: string };
  onLinkFolder: () => void;
  onFinish: (setup: BatchSetup, items: FactoryItem[], saveTemplateAs: string | null) => void;
  onExit: () => void;
  pushToast: (kind: Toast["kind"], msg: string) => void;
}) {
  const [step, setStep] = useState(0);
  const [setup, setSetup] = useState<BatchSetup>(
    preset ? { ...preset.data } : { ...DEFAULT_SETUP, name: `Batch ${new Date().toLocaleDateString("en-GB")}` }
  );
  const [items, setItems] = useState<FactoryItem[]>([]);
  const [saveName, setSaveName] = useState("");
  const [wantSave, setWantSave] = useState(false);
  const [geminiUrl, setGeminiUrl] = useState("https://generativelanguage.googleapis.com/v1beta");
  const [geminiKey, setGeminiKey] = useState("");
  const [geminiModel, setGeminiModel] = useState("nano-banana-2");
  const [oaiUrl, setOaiUrl] = useState(settings.openaiBase || "https://api.openai.com/v1");
  const [oaiKey, setOaiKey] = useState("");
  const [oaiModel, setOaiModel] = useState(settings.openaiModel || "gpt-image-1");
  const [openMap, setOpenMap] = useState<Record<number, boolean>>({});

  const patch = (p: Partial<BatchSetup>) => setSetup((s) => ({ ...s, ...p }));
  const kind = kindById(setup.kind);
  const allStyles = [
    ...STYLES,
    ...settings.customStyles.map((c) => ({ ...c, swatch: ["#f4e8d4", "#97876d", "#57432c"] as [string, string, string] })),
  ];
  const styleDef = allStyles.find((s) => s.id === setup.styleId);
  /**
   * Starred looks float to the top of the picker.
   *
   * This is the screen where the shortcut earns its keep: thirty-six cards to
   * scroll past every time you start a batch, when in practice you reach for
   * the same three or four. Nothing is hidden — the rest follow underneath in
   * catalogue order.
   */
  const favoriteStyles = settings.favoriteStyles;
  const orderedStyles = [
    ...favoriteStyles.map((id) => allStyles.find((s) => s.id === id)).filter((s): s is (typeof allStyles)[number] => Boolean(s)),
    ...allStyles.filter((s) => !favoriteStyles.includes(s.id)),
  ];

  const geminiReady = settings.geminiKeys.some((k) => k.key.trim());
  const openaiReady = settings.openaiKeys.some((k) => k.key.trim());

  const applyGemini = () => {
    patchSettings({
      geminiKeys: [{ id: `k${Date.now()}`, label: "wizard-key", key: geminiKey.trim(), exhaustedUntil: 0 }],
    });
    patch({ model: geminiModel });
    pushToast("ok", "Google key saved — the wizard picked it as the painter.");
  };
  const applyOpenai = () => {
    patchSettings({
      openaiBase: oaiUrl.trim() || "https://api.openai.com/v1",
      openaiKeys: [{ id: `k${Date.now()}`, label: "wizard-key", key: oaiKey.trim(), exhaustedUntil: 0 }],
      openaiModel: oaiModel.trim() || "gpt-image-1",
    });
    patch({ model: oaiModel.trim() || "gpt-image-1" });
    pushToast("ok", "Endpoint saved — the wizard picked it as the painter.");
  };

  const canNext = (): boolean => {
    switch (step) {
      case 0:
        return setup.name.trim().length > 0 && items.filter((i) => i.filename.trim() && i.prompt.trim()).length > 0;
      case 2:
        return !wantSave || saveName.trim().length > 0;
      default:
        return true;
    }
  };
  const show = (part: number) => GROUPS[step].includes(part);

  const next = () => {
    // Leaving "How it looks" for "Go": ask for the folder now, so it is linked
    // by the time the summary shows where the files land.
    if (step === 1 && setup.linkFolder && !folder.linked && fsSupported()) onLinkFolder();
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const openAll = () => setOpenMap(Object.fromEntries(items.map((_, i) => [i, true])));
  const closeAll = () => setOpenMap({});
  const allOpen = items.length > 0 && items.every((_, i) => openMap[i]);

  const chosenModel = MODELS.find((m) => m.id === setup.model);

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl gap-8 px-6 py-8">
      {/* step rail */}
      <aside className="hidden w-[230px] shrink-0 md:block">
        <p data-tip="Which step of the wizard you are on." className="mb-4 font-mono text-[10px] tracking-[0.25em] text-ember uppercase">new batch · {step + 1}/{STEPS.length}</p>
        <ol className="space-y-1">
          {STEPS.map((s, i) => {
            const done = i < step;
            const active = i === step;
            return (
              <li key={s.name}>
                <button data-tip="Goes back to a step you already finished."
                  onClick={() => i < step && setStep(i)}
                  className={`btn-press flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                    active ? "border-ember/55 bg-ember/8" : done ? "border-line bg-panel/40 hover:border-line2" : "border-transparent opacity-55"
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border font-mono text-[11px] ${
                      done ? "border-moss/60 bg-moss/15 text-moss" : active ? "border-ember bg-ember text-[var(--color-on-accent)]" : "border-line2 text-dust"
                    }`}
                  >
                    {done ? <ICheck size={11} /> : i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className={`block text-[13px] font-semibold leading-tight ${active ? "text-cream" : done ? "text-parch" : "text-dust"}`}>{s.name}</span>
                    <span className="block truncate text-[10.5px] text-dust">{s.short}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        {setups.length > 0 && step === 0 && !preset && (
          <div className="mt-5 rounded-xl border border-potion/30 bg-potion/6 p-3">
            <p data-tip="Start from a recipe you saved before, so you do not choose everything again." className="font-mono text-[9.5px] tracking-[0.2em] text-potion uppercase">start from a recipe</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {setups.slice(0, 4).map((t) => (
                <button data-tip={`${`Fills in the wizard with the choices saved in the recipe ${t.name}.`}`} key={t.id} onClick={() => setSetup({ ...t.data })} className="btn-press rounded-md border border-line bg-panel/60 px-2 py-1 font-mono text-[10px] text-parch hover:border-potion/50 hover:text-potion">
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </aside>

      {/* step body */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p data-tip="Which step of the wizard you are on." className="font-mono text-[10.5px] tracking-[0.25em] text-dust uppercase">
              step {step + 1} of {STEPS.length}
            </p>
            <h2 data-tip="What this step is about." className="mt-1 font-display text-3xl text-cream">{STEPS[step].name}</h2>
          </div>
          <button data-tip="Leaves the wizard without making a batch." onClick={onExit} className="btn-press rounded-lg border border-line px-3 py-1.5 font-mono text-[11px] text-dust hover:border-line2 hover:text-cream">
            exit wizard
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-12 overflow-y-auto pb-6 pr-1">
          {/* 0 · name */}
          {show(0) && (
            <div className="rise-in max-w-xl">
              <p className="text-[15px] leading-relaxed text-parch">
                Give this batch a name so you can find it later. Think of it like labeling a box of pictures before you fill it.
              </p>
              <input data-tip="A name for this batch so you can find it later. It never appears inside the pictures."
                value={setup.name}
                onChange={(e) => patch({ name: e.target.value })}
                placeholder="e.g. Spring shop fronts"
                className={field + " mt-4 !text-[15px]"}
              />
              <Explain>
                <span className="text-ember">Example:</span> “Harbour district”, “Potion icons round two”, “Posters for the winter fair”.
                The name only helps <em>you</em> — it never appears inside the pictures.
              </Explain>
            </div>
          )}

          {/* 1 · world / kind */}
          {show(1) && (
            <div className="rise-in">
              <p className="max-w-xl text-[15px] leading-relaxed text-parch">
                What world do these pictures live in? This one choice flavors every prompt, fills in the negative
                prompts for you, and adds a little tag to the filenames so you always know what's what.
              </p>
              <div className="mt-5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {KINDS.map((k) => {
                  const active = setup.kind === k.id;
                  return (
                    <BorderGlow key={k.id} radius={13} glow={active ? "rgba(177,140,224,0.6)" : "rgba(177,140,224,0.35)"} idle={active ? "rgba(177,140,224,0.5)" : "#3e2f21"} innerClassName={active ? "bg-[#241b26]" : "bg-[var(--color-panel)]"}>
                      <button data-tip={`${`Choose ${k.label} as what this batch is made of.`}`} onClick={() => patch({ kind: k.id })} className="btn-press w-full p-4 text-left">
                        <span className="flex items-center justify-between gap-2">
                          <span className={`font-display text-[15px] tracking-wide ${active ? "text-potion" : "text-cream"}`}>{k.label}</span>
                          {active && <ICheck size={14} className="text-potion" />}
                        </span>
                        <span className="mt-1 block text-[11.5px] leading-snug text-parch">{k.blurb}</span>
                        <span className="mt-2 block font-mono text-[9.5px] text-dust">
                          {k.tag ? (
                            <>filename tag <span className="text-potion">{k.tag}_</span> · e.g. item_{k.tag}_flask.png</>
                          ) : (
                            "no tag — filenames stay plain: item_flask.png"
                          )}
                        </span>
                      </button>
                    </BorderGlow>
                  );
                })}
              </div>
              <Explain>
                <span className="text-potion">Plain English:</span> picking “Cyberpunk” means every prompt quietly gets
                “neon glow, rain-slick streets…”, every negative prompt gets “medieval, rustic wood…”, and files get
                names like <span className="font-mono text-cream">shop_cyber_noodle_bar.png</span>. Pick{" "}
                <span className="text-cream">Generic · none</span> if your pictures don't belong to any world at all.
              </Explain>
            </div>
          )}

          {/* 2 · pictures */}
          {show(2) && (
            <div className="rise-in order-first">
              <p className="mb-4 max-w-xl text-[15px] leading-relaxed text-parch">
                Now the fun part — list every picture you want. The AI can write the list for you, or paste/upload your own.
              </p>
              <PromptFactory settings={settings} styleId={setup.styleId} styleBlock={null} items={items} setItems={setItems} pushToast={pushToast} world={setup.kind} onWorld={(k) => patch({ kind: k })} />
            </div>
          )}

          {/* 3 · style */}
          {show(3) && (
            <div className="rise-in">
              <p className="max-w-xl text-[15px] leading-relaxed text-parch">
                Choose one visual style for the whole batch. When every picture shares a style, the set feels like it
                belongs together — like cards from the same game box.
              </p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {orderedStyles.map((s) => {
                  const active = setup.styleId === s.id;
                  const starred = favoriteStyles.includes(s.id);
                  return (
                    <BorderGlow key={s.id} radius={13} glow={active ? "color-mix(in srgb, var(--color-ember) 60%, transparent)" : "rgba(242,163,60,0.35)"} idle={active ? "color-mix(in srgb, var(--color-ember) 50%, transparent)" : "var(--color-line)"} innerClassName={active ? "bg-[var(--color-panel2)]" : "bg-[var(--color-panel)]"}>
                      <button data-tip={`${`Paints every picture in the ${s.name} look.`}`} onClick={() => patch({ styleId: s.id })} className="btn-press w-full p-4 text-left">
                        <span className="flex items-center gap-3">
                          <span className="flex shrink-0 overflow-hidden rounded-md border border-line">
                            {s.swatch.map((c) => (
                              <span key={c} className="h-6 w-6" style={{ background: c }} />
                            ))}
                          </span>
                          <span className="flex-1">
                            <span className={`font-display text-[15px] tracking-wide ${active ? "text-ember" : "text-cream"}`}>{s.name}</span>
                            <span className="mt-0.5 block font-mono text-[10px] text-dust">{s.block}</span>
                          </span>
                          {starred && !active && <IStar size={14} filled className="shrink-0 text-ember/70" />}
                          {active && <ICheck size={16} className="shrink-0 text-ember" />}
                        </span>
                      </button>
                    </BorderGlow>
                  );
                })}
              </div>
              <Explain>
                <span className="text-ember">Plain English:</span> “Claymation” makes everything look like a charming
                clay cartoon. “Shadow Puppet” makes everything dramatic silhouettes. You can invent more in{" "}
                <span className="text-cream">Library → Visual styles</span>.
              </Explain>
            </div>
          )}

          {/* 4 · painter */}
          {show(4) && (
            <div className="rise-in max-w-2xl">
              <p className="text-[15px] leading-relaxed text-parch">
                Who should draw these pictures? You only need to set this up once — the forge remembers your keys.
              </p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {/* simulated */}
                <BorderGlow radius={13} glow={setup.model === "" && settings.provider === "simulated" ? "rgba(151,135,109,0.55)" : "rgba(151,135,109,0.3)"} idle="var(--color-line)" innerClassName="bg-[var(--color-panel)]">
                  <button data-tip="Makes quick placeholder pictures on your computer. Good for trying things out because it costs nothing." onClick={() => patch({ model: "" })} className="btn-press w-full p-4 text-left">
                    <span className="flex items-center justify-between">
                      <span className="font-display text-[15px] text-cream">The practice forge</span>
                      <span className="rounded-md border border-moss/40 bg-moss/10 px-2 py-0.5 font-mono text-[9.5px] tracking-widest text-moss uppercase">free · no key</span>
                    </span>
                    <span className="mt-1.5 block text-[12px] text-parch">Makes instant placeholder art right on your computer. Perfect for testing the flow before spending anything.</span>
                  </button>
                </BorderGlow>
                {/* pollinations */}
                <BorderGlow radius={13} glow={setup.model === "flux" || setup.model === "turbo" ? "rgba(86,184,165,0.55)" : "rgba(86,184,165,0.3)"} idle="var(--color-line)" innerClassName="bg-[var(--color-panel)]">
                  <div className="p-4">
                    <span className="flex items-center justify-between">
                      <span data-tip="A free painter that works over the internet. It needs no key and costs nothing." className="font-display text-[15px] text-cream">Free art (FLUX)</span>
                      <span data-tip="This painter is free and needs no key." className="rounded-md border border-moss/40 bg-moss/10 px-2 py-0.5 font-mono text-[9.5px] tracking-widest text-moss uppercase">free · no key</span>
                    </span>
                    <span className="mt-1.5 block text-[12px] text-parch">Real AI pictures over the internet, free, unlimited-ish. A bit slow (5–40 seconds each) but costs nothing.</span>
                    <span className="mt-3 flex gap-1.5">
                      {["flux", "turbo"].map((m) => (
                        <button data-tip={`${`Draws with the free ${m} model on Pollinations.`}`} key={m} onClick={() => patch({ model: m })} className={`btn-press rounded-lg border px-2.5 py-1.5 font-mono text-[11px] ${setup.model === m ? "border-lagoon/60 bg-lagoon/12 text-lagoon" : "border-line text-parch hover:border-line2"}`}>
                          {m} {setup.model === m && "✓"}
                        </button>
                      ))}
                    </span>
                  </div>
                </BorderGlow>
                {/* google */}
                <BorderGlow radius={13} glow={chosenModel?.engine === "gemini" ? "color-mix(in srgb, var(--color-ember) 60%, transparent)" : "rgba(242,163,60,0.3)"} idle="var(--color-line)" innerClassName="bg-[var(--color-panel)]">
                  <div className="p-4">
                    <span className="flex items-center justify-between gap-2">
                      <span data-tip="Google's painter. A free key from Google gives you about 25 pictures a day." className="font-display text-[15px] text-cream">Google Imagen</span>
                      <span data-tip="A free key from Google gives you about 25 pictures a day." className="rounded-md border border-ember/40 bg-ember/10 px-2 py-0.5 font-mono text-[9.5px] tracking-widest text-ember uppercase">free key · ~25/day</span>
                    </span>
                    {geminiReady ? (
                      <>
                        <span data-tip="A Google key is already saved, so you are ready." className="mt-1.5 block text-[12px] text-moss">✓ a key is already saved in Settings</span>
                        <span className="mt-3 flex flex-wrap gap-1.5">
                          {MODELS.filter((m) => m.engine === "gemini").map((m) => (
                            <button data-tip={`${`Draws with ${m.id}, using the Google key you already saved.`}`} key={m.id} onClick={() => patch({ model: m.id })} className={`btn-press rounded-lg border px-2.5 py-1.5 font-mono text-[11px] ${setup.model === m.id ? "border-ember/60 bg-ember/12 text-ember" : "border-line text-parch hover:border-line2"}`}>
                              {m.id} {setup.model === m.id && "✓"}
                            </button>
                          ))}
                        </span>
                      </>
                    ) : (
                      <div className="mt-2.5 space-y-2">
                        <input data-tip="The web address of the Google picture service. The usual one is already filled in." value={geminiUrl} onChange={(e) => setGeminiUrl(e.target.value)} className={field + " !py-2 font-mono !text-[11px]"} placeholder="web address of the service" />
                        <input data-tip="Your Google key. It lets the forge ask Google to paint your pictures." value={geminiKey} onChange={(e) => setGeminiKey(e.target.value)} type="password" className={field + " !py-2 font-mono !text-[11px]"} placeholder="API key (free at aistudio.google.com)" />
                        <select data-tip="The Google model to paint with." value={geminiModel} onChange={(e) => setGeminiModel(e.target.value)} className={field + " !py-2 font-mono !text-[11px]"}>
                          {MODELS.filter((m) => m.engine === "gemini").map((m) => (
                            <option key={m.id} value={m.id}>{m.id} · {m.free}</option>
                          ))}
                        </select>
                        <Btn data-tip="Saves this key in Settings and picks Google as your painter." variant="primary" disabled={!geminiKey.trim()} onClick={applyGemini}>
                          Save &amp; pick this painter
                        </Btn>
                      </div>
                    )}
                  </div>
                </BorderGlow>
                {/* openai compatible */}
                <BorderGlow radius={13} glow={chosenModel?.engine === "openai" ? "rgba(177,140,224,0.6)" : "rgba(177,140,224,0.3)"} idle="var(--color-line)" innerClassName="bg-[var(--color-panel)]">
                  <div className="p-4">
                    <span className="flex items-center justify-between gap-2">
                      <span data-tip="Any painting service that works like OpenAI's. You bring your own key from them." className="font-display text-[15px] text-cream">Any OpenAI-style service</span>
                      <span data-tip="You need your own key. Using it may cost money on your account with them." className="rounded-md border border-potion/40 bg-potion/10 px-2 py-0.5 font-mono text-[9.5px] tracking-widest text-potion uppercase">your key</span>
                    </span>
                    {openaiReady ? (
                      <>
                        <span data-tip="The address and key are already saved in Settings, so you are ready." className="mt-1.5 block text-[12px] text-moss">✓ address + key already saved in Settings</span>
                        <input data-tip="The model to paint with. Leave it as it is to use the one saved in Settings." value={setup.model} onChange={(e) => patch({ model: e.target.value })} list="wiz-models" placeholder={`model — currently “${settings.openaiModel}”`} className={field + " mt-3 !py-2 font-mono !text-[11px]"} />
                        <datalist id="wiz-models">
                          {modelOptions.map((m) => (
                            <option key={m} value={m} />
                          ))}
                        </datalist>
                      </>
                    ) : (
                      <div className="mt-2.5 space-y-2">
                        <input data-tip="The web address of your OpenAI-style picture service." value={oaiUrl} onChange={(e) => setOaiUrl(e.target.value)} className={field + " !py-2 font-mono !text-[11px]"} placeholder="base url — https://api.openai.com/v1" />
                        <input data-tip="Your key for that service. It stays on this computer." value={oaiKey} onChange={(e) => setOaiKey(e.target.value)} type="password" className={field + " !py-2 font-mono !text-[11px]"} placeholder="API key" />
                        <input data-tip="The name of the model to paint with, like gpt-image-1." value={oaiModel} onChange={(e) => setOaiModel(e.target.value)} className={field + " !py-2 font-mono !text-[11px]"} placeholder="model — gpt-image-1, dall-e-3…" />
                        <Btn data-tip="Saves these details in Settings and picks this service as your painter." variant="primary" disabled={!oaiKey.trim()} onClick={applyOpenai}>
                          Save &amp; pick this painter
                        </Btn>
                      </div>
                    )}
                  </div>
                </BorderGlow>
              </div>
              <Explain>
                <span className="text-ember">Plain English:</span> the “practice forge” costs nothing and runs on your
                own machine. FLUX is real AI art that's also free. Google and OpenAI-style services need a key, but
                Google's is free to get. If you add several Google keys, the forge automatically switches to the next
                one when a key runs out for the day.
              </Explain>
            </div>
          )}

          {/* 5 · shape */}
          {show(5) && (
            <div className="rise-in max-w-2xl">
              <p className="text-[15px] leading-relaxed text-parch">
                What shape should the pictures be? One shape for everything looks tidy; “match the picture” picks a
                sensible shape per kind of picture.
              </p>
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {(["per-category", ...ASPECT_KEYS] as const).map((a) => {
                  const active = setup.aspect === a;
                  const dims = a === "per-category" ? null : ASPECTS[a as AspectKey];
                  return (
                    <BorderGlow key={a} radius={13} glow={active ? "rgba(86,184,165,0.6)" : "rgba(86,184,165,0.3)"} idle={active ? "rgba(86,184,165,0.5)" : "#3e2f21"} innerClassName={active ? "bg-[#1d2422]" : "bg-[var(--color-panel)]"}>
                      <button data-tip={`${a === "per-category" ? `Lets the forge pick the best shape for each kind of picture.` : `Makes every picture in this batch ${a} shaped.`}`} onClick={() => patch({ aspect: a })} className="btn-press flex w-full flex-col items-center p-4">
                        <span
                          className={`rounded-md border-2 ${active ? "border-lagoon" : "border-line2"}`}
                          style={
                            dims
                              ? { width: dims.w >= dims.h ? 64 : (64 * dims.w) / dims.h, height: dims.h >= dims.w ? 44 : (44 * dims.h) / dims.w }
                              : { width: 56, height: 40, borderStyle: "dashed" }
                          }
                        />
                        <span className={`mt-2.5 font-mono text-[12px] ${active ? "text-lagoon" : "text-parch"}`}>
                          {a === "per-category" ? "match the picture" : a}
                        </span>
                        <span className="mt-0.5 text-center text-[10.5px] text-dust">
                          {a === "per-category" ? "shops & events wide · items square · people 4:3" : dims ? `${dims.w} × ${dims.h}px` : ""}
                        </span>
                      </button>
                    </BorderGlow>
                  );
                })}
              </div>
              <Explain>
                <span className="text-lagoon">Plain English:</span> wide pictures are great for shop fronts and scenes,
                squares are perfect for item icons, tall ones suit phone screens. “Match the picture” does this thinking for you.
              </Explain>
            </div>
          )}

          {/* 6 · home */}
          {show(6) && (
            <div className="rise-in max-w-xl">
              <p className="text-[15px] leading-relaxed text-parch">
                Where should the finished picture files go? The forge sorts them into folders by what they are:{" "}
                <span data-tip="The folders your finished pictures are sorted into." className="font-mono text-cream">shops/ items/ events/ npcs/</span>.
              </p>
              <div className="mt-5">
                <BorderGlow radius={13} glow={setup.linkFolder ? "rgba(140,181,111,0.55)" : "rgba(140,181,111,0.3)"} idle={setup.linkFolder ? "rgba(140,181,111,0.45)" : "#3e2f21"} innerClassName={setup.linkFolder ? "bg-[#1f241b]" : "bg-[var(--color-panel)]"}>
                  <button data-tip={`${setup.linkFolder ? `Turn this off to skip saving into a folder.` : `Saves finished pictures into a folder on this computer as they are made.`}`} onClick={() => patch({ linkFolder: !setup.linkFolder })} className="btn-press w-full p-4 text-left">
                    <span className="flex items-center gap-3">
                      <IFolder size={20} className={setup.linkFolder ? "text-moss" : "text-dust"} />
                      <span className="flex-1">
                        <span className={`font-display text-[15px] ${setup.linkFolder ? "text-moss" : "text-cream"}`}>
                          Save into a folder on this computer
                        </span>
                        <span className="mt-0.5 block text-[12px] text-parch">
                          {folder.linked ? `Currently linked: ${folder.name}` : "You'll pick the folder on the next step — folders are created for you if missing."}
                        </span>
                      </span>
                      <span className={`flex h-6 w-11 items-center rounded-full border p-0.5 transition ${setup.linkFolder ? "justify-end border-moss/60 bg-moss/20" : "justify-start border-line2"}`}>
                        <span className={`h-5 w-5 rounded-full ${setup.linkFolder ? "bg-moss" : "bg-dust"}`} />
                      </span>
                    </span>
                  </button>
                </BorderGlow>
                {!fsSupported() && (
                  <p className="mt-3 flex items-start gap-2 rounded-lg border border-ember/35 bg-ember/6 px-3.5 py-2.5 text-[12.5px] text-parch">
                    <IAlert size={14} className="mt-0.5 shrink-0 text-ember" />
                    This browser can't link folders (needs Chrome or Edge). No problem — you can still download everything as one ZIP from the top bar.
                  </p>
                )}
              </div>
              <Explain>
                <span className="text-moss">Plain English:</span> every time a picture finishes, the forge quietly
                writes the file into your folder, already sorted. Turn this off if you'd rather download a ZIP at the end.
              </Explain>
            </div>
          )}

          {/* 7 · extras */}
          {show(7) && (
            <div className="rise-in max-w-xl space-y-4">
              <p className="text-[15px] leading-relaxed text-parch">Two small choices. You can skip both.</p>
              <div className={card}>
                <button data-tip="Remembers these choices as a recipe so you can start the next batch from them in one click." onClick={() => setWantSave(!wantSave)} className="btn-press flex w-full items-center gap-3 text-left">
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${wantSave ? "border-ember bg-ember text-[var(--color-on-accent)]" : "border-line2"}`}>
                    {wantSave && <ICheck size={11} />}
                  </span>
                  <span className="flex-1">
                    <span className="font-semibold text-cream">Save this setup as a recipe</span>
                    <span className="block text-[11.5px] text-dust">next batch you can start from these exact choices in one click</span>
                  </span>
                </button>
                {wantSave && (
                  <input data-tip="A name for your recipe so you can find it later." autoFocus value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="recipe name — e.g. Shop fronts, clay look" className={field + " mt-3"} />
                )}
              </div>
              <div className={card}>
                <button data-tip={`${setup.runAfter ? `Turn this off to look over the rows first.` : `Starts painting as soon as the batch is laid out.`}`} onClick={() => patch({ runAfter: !setup.runAfter })} className="btn-press flex w-full items-center gap-3 text-left">
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${setup.runAfter ? "border-ember bg-ember text-[var(--color-on-accent)]" : "border-line2"}`}>
                    {setup.runAfter && <ICheck size={11} />}
                  </span>
                  <span className="flex-1">
                    <span className="font-semibold text-cream">Start drawing right away</span>
                    <span className="block text-[11.5px] text-dust">otherwise you can review everything on the workbench first</span>
                  </span>
                </button>
              </div>
              <Explain>
                <span className="text-ember">Plain English:</span> a recipe is like saving your favorite sandwich order.
                And “start drawing” means the forge begins the moment you press the big green button — you can always
                stop it later.
              </Explain>
            </div>
          )}

          {/* 8 · review */}
          {show(8) && (
            <div className="rise-in">
              <div className="mb-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  { k: "batch", v: setup.name, tone: "text-cream" },
                  { k: "world", v: kind.id === "none" ? "generic · no flavor" : `${kind.label}${kind.tag ? ` · filenames get “${kind.tag}_”` : ""}`, tone: "text-potion" },
                  { k: "pictures", v: `${items.filter((i) => i.filename && i.prompt).length} in the list`, tone: "text-cream" },
                  { k: "look", v: styleDef?.name ?? setup.styleId, tone: "text-ember" },
                  { k: "painter", v: setup.model ? `${setup.model}` : "practice forge", tone: "text-lagoon" },
                  { k: "shape", v: setup.aspect === "per-category" ? "match the picture" : setup.aspect, tone: "text-cream" },
                ].map((s) => (
                  <div key={s.k} className={card}>
                    <p data-tip={`Your choice for ${s.k}.`} className="font-mono text-[9.5px] tracking-[0.22em] text-dust uppercase">{s.k}</p>
                    <p data-tip={`${s.k}: ${s.v}`} className={`mt-1 truncate font-display text-[15px] ${s.tone}`}>{s.v}</p>
                  </div>
                ))}
              </div>

              <div className="mb-2 flex items-center justify-between">
                <p className="font-mono text-[10px] tracking-[0.22em] text-dust uppercase">
                  every prompt — open one to read or edit it
                </p>
                <div className="flex gap-1.5">
                  <button data-tip="Opens or closes every prompt in the list at once." onClick={allOpen ? closeAll : openAll} className="btn-press rounded-md border border-line bg-panel/60 px-2.5 py-1 font-mono text-[10px] text-parch hover:border-ember/50 hover:text-ember">
                    {allOpen ? "close all" : "open all"}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                {items
                  .filter((i) => i.filename && i.prompt)
                  .map((item, i) => (
                    <AccordionItem
                      key={i}
                      i={i}
                      item={item}
                      kindTag={kind.tag}
                      open={!!openMap[i]}
                      onToggle={() => setOpenMap((m) => ({ ...m, [i]: !m[i] }))}
                      onPatch={(p) => {
                        const real = items.indexOf(item);
                        setItems(items.map((x, xi) => (xi === real ? { ...x, ...p } : x)));
                      }}
                    />
                  ))}
              </div>
              <Explain>
                <span className="text-moss">Heads-up:</span> the style block{styleDef ? ` (“…${styleDef.block.slice(-40)}”)` : ""}{" "}
                is added to each prompt automatically when the batch is arranged — that's what keeps the whole set looking like family.
              </Explain>
            </div>
          )}
        </div>

        {/* footer */}
        <footer className="mt-2 flex items-center gap-3 border-t border-line pt-4">
          <Btn data-tip={`${step === 0 ? `Leaves the wizard without making a batch.` : `Goes back one step. Your choices are kept.`}`} onClick={() => (step === 0 ? onExit() : setStep((s) => s - 1))}>{step === 0 ? "Cancel" : "← Back"}</Btn>
          {step < STEPS.length - 1 ? (
            <Btn data-tip="Goes to the next step. It stays grey until this step has what it needs." variant="primary" onClick={next} disabled={!canNext()}>
              {step === 0 ? `Next · ${items.filter((i) => i.filename && i.prompt).length} pictures →` : "Next →"}
            </Btn>
          ) : (
            <Btn data-tip="Lays all the pictures out as rows on the workbench so you can start painting."
              variant="moss"
              onClick={() => {
                const ready = items.map((i) => ({
                  ...i,
                  filename: autoFixFilename(i.filename, i.category ?? "image"),
                  prompt: i.prompt + (styleDef ? `, ${styleDef.block}` : ""),
                }));
                const allNames = ready.map((x) => ({ id: -1, filename: x.filename }));
                const bad = ready.filter((x) => validateFilename(x.filename, x.category ?? "image", allNames, -1).some((c) => !c.pass));
                if (bad.length > 0) {
                  pushToast("err", `${bad.length} filename${bad.length > 1 ? "s" : ""} still break the rules — the forge auto-fixed them for you.`);
                }
                onFinish(setup, ready, wantSave ? saveName.trim() : null);
              }}
            >
              <IPlay size={13} /> Arrange {items.filter((i) => i.filename && i.prompt).length} pictures
            </Btn>
          )}
          <span data-tip="A short reminder of what this step does." className="ml-auto hidden font-mono text-[10.5px] text-dust sm:block">{STEPS[step].short}</span>
        </footer>
      </div>
    </div>
  );
}
