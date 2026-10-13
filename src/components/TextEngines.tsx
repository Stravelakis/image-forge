/**
 * Where the writing, code and vision models are set up.
 *
 * What this replaces: three boxes, the first styled unlike the other two, each
 * asking for its own address, key and model. Nothing showed which keys you
 * actually had, the same Mistral key had to be typed three times, and a banner
 * announced "all three set up on one key" whether or not that was true.
 *
 * The shape now matches how people think about it:
 *
 *   · one card at the top for the accounts — address and key, with presets for
 *     the ones worth knowing, a button to check the key and a button to fetch
 *     that account's model list
 *   · three identical cards below, one per job, each choosing from the models
 *     those accounts returned
 *
 * Each job is tested for the job it does. A model that answers is not
 * necessarily a model that can write code or look at a picture, and finding
 * that out later — in a broken vector, or lettering placed at random — is a
 * much worse way to learn it.
 */
import { useCallback, useState } from "react";
import type { ForgeSettings } from "../lib/providers";
import { filterModels, listChatModels, statesPricing, type ChatModel } from "../lib/visionEngine";
import { testCode, testConnection, testVision, type TestResult } from "../lib/testConnection";
import { Btn, IAlert, ICheck, IFlask, IQuill, ISparkle, ITrash } from "./ui";

type Provider = ForgeSettings["textProviders"][number];
type JobId = "scribe" | "coder" | "vision";

/** Accounts worth offering by name, so nobody has to look up a URL. */
const PRESETS: { label: string; base: string; note: string; free: boolean; keyUrl: string }[] = [
  { label: "Mistral", base: "https://api.mistral.ai/v1", note: "free tier, and it can do all three jobs", free: true, keyUrl: "https://console.mistral.ai/api-keys" },
  { label: "OpenAI", base: "https://api.openai.com/v1", note: "paid", free: false, keyUrl: "https://platform.openai.com/api-keys" },
  { label: "OpenRouter", base: "https://openrouter.ai/api/v1", note: "one key, hundreds of models — and the only one that publishes a price per model, so \"only free\" works properly here", free: false, keyUrl: "https://openrouter.ai/keys" },
  { label: "Google", base: "https://generativelanguage.googleapis.com/v1beta/openai", note: "Gemini and Gemma, via the OpenAI-shaped endpoint", free: false, keyUrl: "https://aistudio.google.com/apikey" },
  { label: "NVIDIA", base: "https://integrate.api.nvidia.com/v1", note: "free credits to start. Lists a model id and nothing else — no prices, no capabilities — so the filters below cannot narrow it", free: false, keyUrl: "https://build.nvidia.com/" },
  { label: "Your own machine", base: "http://localhost:8080/v1", note: "free, private, no internet", free: true, keyUrl: "" },
];

const JOBS: { id: JobId; title: string; what: string; icon: React.ReactNode; testLabel: string }[] = [
  { id: "scribe", title: "Writing", what: "Writes prompts, answers in the chat, names things.", icon: <IQuill size={15} />, testLabel: "Can it hold a conversation?" },
  { id: "coder", title: "Code", what: "Writes SVG and Lottie. Vectors are code, not pictures.", icon: <IFlask size={15} />, testLabel: "Can it write code?" },
  { id: "vision", title: "Vision", what: "Looks at a picture, to place lettering on it.", icon: <ISparkle size={15} />, testLabel: "Can it see a picture?" },
];

const field = "w-full rounded-lg border border-line bg-[var(--color-field)] px-3 py-2 text-[13px] text-cream placeholder:text-dust/60";

export default function TextEngines({
  settings,
  patchSettings,
}: {
  settings: ForgeSettings;
  patchSettings: (p: Partial<ForgeSettings>) => void;
}) {
  /** Models each account returned, keyed by provider id. Not persisted. */
  const [models, setModels] = useState<Record<string, ChatModel[]>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, TestResult>>({});
  /**
   * Hide models the provider said cost money.
   *
   * Deliberately does nothing to a provider that did not say. OpenRouter
   * prices all 427 of its models, so this genuinely narrows it to the free
   * ones; NVIDIA and Google disclose nothing, so their lists are untouched and
   * the card says so rather than implying the tick did something.
   */
  const [hidePaid, setHidePaid] = useState(false);

  const providers = settings.textProviders;
  const setProviders = (next: Provider[]) => patchSettings({ textProviders: next });

  const addProvider = (preset?: (typeof PRESETS)[number]) =>
    setProviders([
      ...providers,
      {
        id: `p${Date.now().toString(36)}`,
        label: preset?.label ?? "New account",
        base: preset?.base ?? "",
        key: "",
      },
    ]);

  const patchProvider = (id: string, patch: Partial<Provider>) =>
    setProviders(providers.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const loadModels = useCallback(
    async (p: Provider) => {
      setBusy(p.id);
      setNotes((n) => ({ ...n, [p.id]: "" }));
      const r = await listChatModels({ base: p.base, key: p.key, model: "" });
      if (r.ok) {
        setModels((m) => ({ ...m, [p.id]: r.models }));
        const free = r.models.filter((m) => m.free === true).length;
        setNotes((n) => ({
          ...n,
          [p.id]: statesPricing(r.models)
            ? `${r.models.length} models, ${free} of them free.`
            : `${r.models.length} models. This provider does not publish prices.`,
        }));
      } else {
        setNotes((n) => ({ ...n, [p.id]: r.problem }));
      }
      setBusy(null);
    },
    []
  );

  /** The models one account offers, after the filters that apply to it. */
  const shownFor = useCallback(
    (providerId: string, visionOnly = false) =>
      filterModels(models[providerId] ?? [], { freeOnly: hidePaid, visionOnly }),
    [models, hidePaid]
  );

  /**
   * Every model from every account, each listed once.
   *
   * Two accounts on the same provider used to mean every model appearing
   * twice, which made a long list twice as long and told you nothing: the
   * entries were identical. One entry now, remembering every account that can
   * serve it, so the engine still has an address and key to take.
   */
  const allModels = (() => {
    const byId = new Map<string, { model: string; providerIds: string[]; providerLabels: string[] }>();
    for (const p of providers) {
      for (const m of shownFor(p.id)) {
        const found = byId.get(m.id);
        if (found) {
          if (!found.providerIds.includes(p.id)) {
            found.providerIds.push(p.id);
            found.providerLabels.push(p.label);
          }
        } else {
          byId.set(m.id, { model: m.id, providerIds: [p.id], providerLabels: [p.label] });
        }
      }
    }
    return [...byId.values()];
  })();

  /** True when at least one loaded account actually publishes its prices. */
  const anyPricing = providers.some((p) => statesPricing(models[p.id] ?? []));
  /** Loaded accounts that say nothing about price, so "hide paid" cannot help. */
  const silentOnPricing = providers.filter((p) => (models[p.id] ?? []).length > 0 && !statesPricing(models[p.id] ?? []));

  const runTest = useCallback(
    async (job: JobId) => {
      setBusy(job);
      const engine = settings[job];
      const result =
        job === "vision" ? await testVision(engine) : job === "coder" ? await testCode(engine) : await testConnection("scribe", settings);
      setResults((r) => ({ ...r, [job]: result }));
      setBusy(null);
    },
    [settings]
  );

  return (
    <>
      {/* ---------- the accounts ---------- */}
      <div className="rounded-xl border border-line bg-panel/50 p-4">
        <p className="font-display text-[15px] tracking-wide text-cream">Your accounts</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-dust">
          The addresses and keys the three jobs below draw from. Enter an account once here, load its models, and every
          job can choose from them. One Mistral key can cover all three.
        </p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => addProvider(preset)}
              title={`${preset.note}${preset.keyUrl ? ` · key: ${preset.keyUrl}` : ""}`}
              className="rounded-lg border border-line px-2.5 py-1 text-[12px] text-dust transition hover:border-ember/50 hover:text-cream"
            >
              + {preset.label}
              {preset.free && <span className="ml-1.5 font-mono text-[9.5px] text-moss">free</span>}
            </button>
          ))}
          <button data-tip="Adds an empty account you fill in yourself, for a text service that is not in the list above."
            onClick={() => addProvider()}
            className="rounded-lg border border-dashed border-line px-2.5 py-1 text-[12px] text-dust transition hover:text-cream"
          >
            + something else
          </button>
        </div>

        {providers.length === 0 && (
          <p className="mt-3 rounded-lg border border-ember/40 bg-ember/10 p-3 text-[12.5px] text-parch">
            Nothing set up yet. <span className="text-cream">Mistral</span> is the quickest start — it is free and one
            key covers writing, code and vision.
          </p>
        )}

        <div className="mt-3 space-y-2">
          {providers.map((p) => (
            <div key={p.id} className="rounded-lg border border-line bg-[var(--color-field)] p-3">
              <div className="grid gap-2 sm:grid-cols-[140px_1fr_1fr]">
                <input data-tip="A name for this account, so you can tell it apart later."
                  value={p.label}
                  onChange={(e) => patchProvider(p.id, { label: e.target.value })}
                  placeholder="a name for it"
                  className={field}
                />
                <input data-tip="The web address of this text service. It usually ends in /v1."
                  value={p.base}
                  onChange={(e) => patchProvider(p.id, { base: e.target.value.trim() })}
                  placeholder="https://api.example.com/v1"
                  className={field}
                />
                <input data-tip="Your key for this service. It stays on this computer."
                  type="password"
                  value={p.key}
                  onChange={(e) => patchProvider(p.id, { key: e.target.value.trim() })}
                  placeholder="paste the key"
                  className={field}
                />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Btn data-tip="Asks this account which models it offers so you can pick one below." onClick={() => void loadModels(p)} disabled={busy === p.id || !p.base.trim()}>
                  {busy === p.id ? "asking…" : "Load its models"}
                </Btn>
                <button
                  onClick={() => setProviders(providers.filter((x) => x.id !== p.id))}
                  title="Remove this account"
                  className="rounded-lg p-1.5 text-dust transition hover:text-rust"
                >
                  <ITrash size={13} />
                </button>
                {models[p.id] && (
                  <span className="font-mono text-[10.5px] text-moss">
                    {shownFor(p.id).length} of {models[p.id].length} shown
                  </span>
                )}
                {notes[p.id] && !models[p.id] && <span className="text-[11.5px] text-rust">{notes[p.id]}</span>}
              </div>
            </div>
          ))}
        </div>

        {allModels.length > 0 && (
          <div className="mt-3 rounded-lg border border-line bg-[var(--color-field)] p-3">
            <label className="flex cursor-pointer items-center gap-2.5">
              <input data-tip="When on, the list shows only models that cost nothing. It needs the account to publish prices."
                type="checkbox"
                checked={hidePaid}
                onChange={(e) => setHidePaid(e.target.checked)}
                className="accent-[var(--color-ember)]"
                disabled={!anyPricing}
              />
              <span className="text-[12.5px] text-cream">
                Only show models that are free
                {!anyPricing && <span className="ml-1.5 text-dust">— nothing loaded here publishes prices</span>}
              </span>
            </label>
            {anyPricing && silentOnPricing.length > 0 && (
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-dust">
                This cannot narrow{" "}
                <span className="text-parch">{silentOnPricing.map((p) => p.label).join(", ")}</span> — those endpoints
                return a model id and nothing else, no price and no capabilities. Rather than hide models on a guess
                about their names, everything they list stays visible. Press a job's test button to find out what your
                key can actually reach.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ---------- the three jobs ---------- */}
      {JOBS.map((job) => {
        const engine = settings[job.id];
        // The vision card only offers models that can actually take a picture,
        // where the provider says. Picking a text-only model there fails at the
        // moment you need it, with an error about image parts that reads as a
        // bug in the app.
        const visionOnly = job.id === "vision";
        const offered = visionOnly
          ? allModels.filter((m) => m.providerIds.some((pid) => shownFor(pid, true).some((x) => x.id === m.model)))
          : allModels;
        const chosen = offered.find((m) => m.model === engine.model);
        const result = results[job.id];
        return (
          <div key={job.id} className="rounded-xl border border-line bg-panel/50 p-4">
            <p className="flex items-center gap-2 font-display text-[15px] tracking-wide text-cream">
              <span className="text-dust">{job.icon}</span>
              {job.title}
            </p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-dust">{job.what}</p>

            <div className="mt-3">
              <label className="mb-1.5 block font-mono text-[10px] tracking-[0.2em] text-dust uppercase">model</label>
              <select data-tip="Pick which model does this job. Load an account's models first to fill the list."
                value={engine.model}
                onChange={(e) => {
                  const picked = offered.find((m) => m.model === e.target.value);
                  // When two accounts both serve a model, the first is used.
                  const from = providers.find((p) => p.id === picked?.providerIds[0]);
                  // Take the account's address and key with the model, so the
                  // engine still works if that account is later removed.
                  patchSettings({
                    [job.id]: from
                      ? { base: from.base, key: from.key, model: e.target.value }
                      : { ...engine, model: e.target.value },
                  } as Partial<ForgeSettings>);
                  setResults((r) => ({ ...r, [job.id]: undefined as unknown as TestResult }));
                }}
                className={field}
              >
                {engine.model && !chosen && <option value={engine.model}>{engine.model} (already set)</option>}
                {offered.length === 0 && (
                  <option value="">
                    {allModels.length === 0 ? "load an account's models above first" : "none of the loaded models can do this"}
                  </option>
                )}
                {providers.map((p) => {
                  // A model served by more than one account is listed under the
                  // first that offers it, so it appears once rather than once
                  // per key.
                  const mine = offered.filter((m) => m.providerIds[0] === p.id);
                  return mine.length > 0 ? (
                    <optgroup key={p.id} label={p.label}>
                      {mine.map((m) => (
                        <option key={`${p.id}:${m.model}`} value={m.model}>
                          {m.model}
                          {m.providerLabels.length > 1 ? ` · also on ${m.providerLabels.slice(1).join(", ")}` : ""}
                        </option>
                      ))}
                    </optgroup>
                  ) : null;
                })}
              </select>
              {engine.key.trim() ? (
                <p className="mt-1.5 font-mono text-[10.5px] text-dust">
                  using {chosen?.providerLabels[0] ?? engine.base.replace(/^https?:\/\//, "")}
                </p>
              ) : (
                <p className="mt-1.5 text-[11.5px] text-ember">no key yet — pick a model from an account above</p>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Btn data-tip={`${`Sends a tiny test to this model to see if it can do this job: ${job.testLabel}`}`} onClick={() => void runTest(job.id)} disabled={busy === job.id || !engine.key.trim()}>
                {busy === job.id ? "trying…" : job.testLabel}
              </Btn>
              {result && (
                <span className={`flex items-center gap-1.5 text-[12px] ${result.ok ? "text-moss" : "text-rust"}`}>
                  {result.ok ? <ICheck size={13} /> : <IAlert size={13} />}
                  {result.message}
                </span>
              )}
            </div>
            {result?.detail && <p className="mt-1.5 text-[11.5px] leading-relaxed text-dust">{result.detail}</p>}
          </div>
        );
      })}
    </>
  );
}
