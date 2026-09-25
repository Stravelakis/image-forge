/**
 * The front door. One box, one number, one button.
 *
 * Everything else in the app — the spreadsheet, the filename rules, nine
 * sections of settings — is still there, one click deeper. This screen exists
 * so that a first-time visitor can make a set of pictures before meeting any
 * of it (HANDOFF §14.1).
 */
import { useMemo, useState } from "react";
import type { AspectKey, ManifestRow } from "../types";
import type { ForgeSettings } from "../lib/providers";
import { PROVIDER_META, resolveRoute, scribeChat } from "../lib/providers";
import { FREE_ENGINES } from "../lib/paidGuard";
import { STYLE_CATALOGUE } from "../lib/styleCatalogue";
import { MAX_START, countFromText, planStart } from "../lib/startPlan";
import { Btn, IHammer, Lightbox } from "./ui";

const SHAPES: { id: AspectKey; label: string }[] = [
  { id: "1:1", label: "Square" },
  { id: "16:9", label: "Wide" },
  { id: "9:16", label: "Tall" },
];

export default function StartView({
  settings,
  rows,
  isRunning,
  onMake,
  onOpenForge,
  onOpenSettings,
}: {
  settings: ForgeSettings;
  rows: ManifestRow[];
  isRunning: boolean;
  /** adds the rows and starts them; returns their ids */
  onMake: (prompts: string[], style: string, aspect: AspectKey) => Promise<number[]>;
  onOpenForge: () => void;
  onOpenSettings: () => void;
}) {
  const [text, setText] = useState("");
  const [count, setCount] = useState(6);
  const [countTouched, setCountTouched] = useState(false);
  const favourites = settings.favoriteStyles ?? [];
  const [style, setStyle] = useState<string>(favourites[0] ?? "");
  const [shape, setShape] = useState<AspectKey>("1:1");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [made, setMade] = useState<number[]>([]);
  const [zoom, setZoom] = useState<ManifestRow | null>(null);

  // The engine a blank row will use, said plainly: which, and whether it costs.
  const route = resolveRoute({ model: "" } as never, settings);
  const engineName = PROVIDER_META[route.engine as keyof typeof PROVIDER_META]?.name ?? String(route.engine);
  const free = FREE_ENGINES.has(String(route.engine));

  const styles = useMemo(() => {
    const byId = new Map(STYLE_CATALOGUE.map((s) => [s.id, s]));
    const starred = favourites.map((id) => byId.get(id)).filter(Boolean) as typeof STYLE_CATALOGUE;
    const rest = STYLE_CATALOGUE.filter((s) => !favourites.includes(s.id));
    return { starred, rest };
  }, [favourites]);

  const mine = made.map((id) => rows.find((r) => r.id === id)).filter(Boolean) as ManifestRow[];
  const doneCount = mine.filter((r) => r.status === "done").length;
  const failedCount = mine.filter((r) => r.status === "failed").length;

  const go = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    setNote("");
    const plan = await planStart(t, count, settings, (system, user) => scribeChat(settings.scribe, system, user));
    setNote(
      plan.how === "text-engine"
        ? `Your text engine wrote ${plan.prompts.length} different prompts.`
        : count > 1
          ? `Varied by framing${plan.note ? ` — ${plan.note}` : ""}. Set up a text engine in Settings for more varied sets.`
          : ""
    );
    const ids = await onMake(plan.prompts, style, shape);
    setMade(ids);
    setBusy(false);
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12">
      <h1 className="font-display text-[34px] leading-tight text-cream">What do you need?</h1>
      <p className="mt-2 text-[14px] text-parch">Describe it once. Say how many. Press the button.</p>

      <div className="mt-6 rounded-2xl border border-line bg-panel/60 p-5">
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            // "12 potion icons" fills in the number, unless it was set by hand.
            const n = countFromText(e.target.value);
            if (n && !countTouched) setCount(n);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void go();
          }}
          rows={3}
          autoFocus
          placeholder="12 potion bottle icons, cute, glowing"
          aria-label="What do you need?"
          className="w-full resize-y rounded-xl border border-line bg-[var(--color-field)] px-4 py-3 text-[16px] text-cream placeholder:text-dust/60"
        />

        <div className="mt-4 flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-[12px] text-dust">
            How many
            <input
              type="number"
              min={1}
              max={MAX_START}
              value={count}
              onChange={(e) => {
                setCountTouched(true);
                setCount(Math.max(1, Math.min(MAX_START, Number(e.target.value) || 1)));
              }}
              className="w-20 rounded-lg border border-line bg-[var(--color-field)] px-3 py-2 text-[14px] text-cream"
            />
          </label>

          <label className="flex min-w-[200px] flex-col gap-1 text-[12px] text-dust">
            Look
            <select
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              className="rounded-lg border border-line bg-[var(--color-field)] px-3 py-2 text-[14px] text-cream"
            >
              <option value="">No particular look</option>
              {styles.starred.length > 0 && (
                <optgroup label="★ Your favourites">
                  {styles.starred.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="All looks">
                {styles.rest.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>

          <div className="flex flex-col gap-1 text-[12px] text-dust">
            Shape
            <div className="flex gap-1">
              {SHAPES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setShape(s.id)}
                  aria-pressed={shape === s.id}
                  className={`btn-press rounded-lg border px-3 py-2 text-[13px] ${
                    shape === s.id ? "border-ember/60 bg-ember/15 text-cream" : "border-line text-parch hover:border-line2"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Btn variant="primary" onClick={() => void go()} disabled={!text.trim() || busy} className="!px-6 !py-3 !text-[15px]">
            <IHammer size={15} /> {busy ? "Planning…" : count === 1 ? "Make it" : `Make ${count}`}
          </Btn>
          <span className="text-[12.5px] text-dust">
            {free ? "free" : "costs money — you will be asked first"} · {engineName}
            {" · "}
            <button onClick={onOpenSettings} className="underline decoration-dust/40 underline-offset-2 hover:text-cream">
              change
            </button>
          </span>
        </div>
        {note && <p className="mt-3 text-[12.5px] text-parch">{note}</p>}
      </div>

      {mine.length > 0 && (
        <div className="mt-8">
          <p className="text-[13px] text-parch">
            {doneCount} of {mine.length} ready
            {failedCount > 0 ? ` · ${failedCount} did not work` : ""}
            {isRunning && doneCount + failedCount < mine.length ? " · working…" : ""}
          </p>
          <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4">
            {mine.map((r) => (
              <button
                key={r.id}
                onClick={() => r.preview && setZoom(r)}
                title={r.error || r.filename}
                className={`aspect-square overflow-hidden rounded-xl border ${
                  r.status === "failed" ? "border-blood/50" : "border-line"
                } bg-[var(--color-field)]`}
              >
                {r.preview && !r.preview.trimStart().startsWith("<svg") ? (
                  <img src={r.preview} alt={r.filename} className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-[11px] text-dust">
                    {r.status === "failed" ? "did not work" : r.status === "generating" ? "making…" : "waiting"}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="mt-10 text-[12.5px] text-dust">
        Want the full control — filenames, one row at a time, CSV?{" "}
        <button onClick={onOpenForge} className="text-parch underline decoration-dust/40 underline-offset-2 hover:text-cream">
          Open the spreadsheet →
        </button>
      </p>

      {zoom?.preview && <Lightbox src={zoom.preview} alt={zoom.filename} onClose={() => setZoom(null)} />}
    </div>
  );
}
