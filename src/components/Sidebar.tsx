import type { Category, ManifestRow, Status } from "../types";
import { CATEGORIES, CATEGORY_META, STATUSES, STATUS_META } from "../types";
import { MODELS } from "../lib/providers";
import { BorderGlow } from "./effects";
import { Btn, CAT_ICON, IAlert, IAnvil, ICheck, IHammer, IPlay, IX } from "./ui";
import { CountUp, type MotionLevel } from "./motion";

export interface SidebarProps {
  rows: ManifestRow[];
  statusFilter: Status | "all";
  setStatusFilter: (s: Status | "all") => void;
  catFilter: Category | "all";
  setCatFilter: (c: Category | "all") => void;
  modelFilter: string;
  setModelFilter: (m: string) => void;
  styleLock: string;
  isRunning: boolean;
  onRun: () => void;
  onStop: () => void;
  drift: number;
  violations: number;
  onJumpSpec: () => void;
  motion: MotionLevel;
}

export default function Sidebar(p: SidebarProps) {
  const total = p.rows.length || 1;
  const counts = STATUSES.map((s) => ({ s, n: p.rows.filter((r) => r.status === s).length }));
  const pending = p.rows.filter((r) => r.status === "pending").length;
  const failed = p.rows.filter((r) => r.status === "failed").length;
  const generating = p.rows.filter((r) => r.status === "generating").length;
  const finished = p.rows.filter((r) => r.status === "done" || r.status === "imported").length;
  const queueLen = pending + failed;

  /** Which engines this manifest actually uses, commonest first. */
  const modelsUsed = (() => {
    const counts = new Map<string, number>();
    for (const r of p.rows) {
      const id = (r.model || "").trim() || "(default)";
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([id, n]) => ({ id, n, label: MODELS.find((m) => m.id === id)?.label ?? id }))
      .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
  })();

  return (
    <aside className="flex h-full w-[256px] shrink-0 flex-col gap-4 overflow-y-auto border-r border-line bg-coal/70 p-4">
      <section>
        <h3 data-tip="The big picture: how many pictures are waiting, made or failed. The bar shows the same in colours." className="mb-2.5 font-mono text-[10px] tracking-[0.22em] text-dust uppercase">Progress</h3>
        <div className="flex h-3 w-full overflow-hidden rounded-full border border-line bg-[var(--color-field)]">
          {counts
            .filter((c) => c.n > 0)
            .map((c) => (
              <div
                key={c.s}
                title={`${c.s}: ${c.n}`}
                className="h-full transition-all duration-700 ease-out"
                style={{ width: `${(c.n / total) * 100}%`, background: STATUS_META[c.s].hex }}
              />
            ))}
        </div>
        <ul className="mt-3 space-y-0.5">
          {counts.map(({ s, n }) => (
            <li key={s}>
              <button data-tip={`Shows only the rows that are ${s}. Click again to show all rows.`}
                onClick={() => p.setStatusFilter(p.statusFilter === s ? "all" : s)}
                className={`btn-press flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition ${
                  p.statusFilter === s ? "bg-raise text-cream" : "text-parch hover:bg-raise/50 hover:text-cream"
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${STATUS_META[s].dot} ${s === "generating" && n > 0 ? "pulse-dot" : ""}`} />
                <span className="flex-1 font-mono text-[12px]">{s}</span>
                <span className={`font-mono text-[12px] tabular-nums ${n > 0 ? "text-cream" : "text-dust/60"}`}>
                  <CountUp value={n} level={p.motion} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        {/* These were shop / item / event / npc, from the marketplace this
            began as. They now say what a row PRODUCES, which is the thing that
            actually varies and decides where the file lands. */}
        <h3 data-tip="How many pictures you have of each kind." className="mb-2.5 font-mono text-[10px] tracking-[0.22em] text-dust uppercase">What it makes</h3>
        <div className="grid grid-cols-2 gap-2">
          {CATEGORIES.map((c) => {
            const n = p.rows.filter((r) => r.category === c).length;
            const Ic = CAT_ICON[c];
            const active = p.catFilter === c;
            return (
              <button data-tip={`Shows only the ${c} rows. Click again to show all rows.`}
                key={c}
                onClick={() => p.setCatFilter(active ? "all" : c)}
                className={`btn-press flex items-center gap-2 rounded-lg border px-2.5 py-2 text-[12px] transition ${
                  active ? "border-ember/60 bg-ember/10 text-cream" : "border-line bg-panel2/50 text-parch hover:border-line2 hover:text-cream"
                }`}
              >
                <span style={{ color: CATEGORY_META[c].hex }}>
                  <Ic size={14} />
                </span>
                <span className="flex-1 truncate text-left font-mono" title={CATEGORY_META[c].hint}>
                  {c}
                </span>
                <span className="font-mono tabular-nums text-dust">{n}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Only worth showing once a manifest actually mixes engines. */}
      {modelsUsed.length > 1 && (
        <section>
          <h3 data-tip="Which painters made your pictures." className="mb-2.5 font-mono text-[10px] tracking-[0.22em] text-dust uppercase">Engine</h3>
          <div className="space-y-1">
            {modelsUsed.map(({ id, label, n }) => {
              const active = p.modelFilter === id;
              return (
                <button data-tip={`Shows only the rows made with ${label}. Click again to show all rows.`}
                  key={id}
                  onClick={() => p.setModelFilter(active ? "all" : id)}
                  className={`btn-press flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[12px] transition ${
                    active ? "border-ember/60 bg-ember/10 text-cream" : "border-line bg-panel2/50 text-parch hover:border-line2 hover:text-cream"
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate text-left font-mono text-[11px]">{label}</span>
                  <span className="font-mono tabular-nums text-dust">{n}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <BorderGlow radius={12} glow={p.isRunning ? "color-mix(in srgb, var(--color-ember) 60%, transparent)" : "color-mix(in srgb, var(--color-ember) 40%, transparent)"} idle="var(--color-line)" innerClassName="bg-[var(--color-panel)]">
        <div className="p-3.5">
          <div className="mb-2 flex items-center justify-between">
            <h3 data-tip="The line of pictures waiting to be made." className="font-mono text-[10px] tracking-[0.22em] text-dust uppercase">Generation queue</h3>
            <IHammer size={15} className={`text-ember ${p.isRunning ? "hammer-swing" : ""}`} />
          </div>
          <div className="mb-3 grid grid-cols-3 gap-2 text-center">
            {[
              { label: "queued", v: pending, cls: "text-parch" },
              { label: "failed", v: failed, cls: failed > 0 ? "text-blood" : "text-dust" },
              { label: "made", v: `${finished}/${p.rows.length}`, cls: "text-moss" },
            ].map((x) => (
              <div data-tip={({ queued: "Pictures waiting for their turn.", failed: "Pictures that did not work. The run button tries them again.", made: "Pictures finished, out of all of them." } as Record<string, string>)[x.label]} key={x.label} className="rounded-lg bg-[var(--color-field)] px-1 py-2">
                <div className={`font-display text-base leading-none ${x.cls}`}>{x.v}</div>
                <div className="mt-1 font-mono text-[9px] tracking-widest text-dust uppercase">{x.label}</div>
              </div>
            ))}
          </div>
          {p.isRunning ? (
            <div>
              <div className="stripes-live mb-2 h-2.5 rounded-full" />
              <button data-tip="Stops the queue. The picture being drawn right now may still finish."
                onClick={p.onStop}
                className="btn-press flex w-full items-center justify-center gap-2 rounded-lg border border-blood/40 bg-blood/10 py-2 text-[13px] font-semibold text-blood hover:bg-blood/20"
              >
                <IX size={13} /> Halt the forge
              </button>
              <p data-tip="What the forge is doing right now." className="mt-2 text-center font-mono text-[10px] text-dust">
                {generating > 0 ? "making the current picture…" : "starting…"}
              </p>
            </div>
          ) : (
            <div>
              <button data-tip="Starts making all the waiting pictures, one after another. You are asked first if any of them cost money."
                onClick={p.onRun}
                disabled={queueLen === 0}
                className={`btn-press flex w-full items-center justify-center gap-2 rounded-lg bg-ember py-2 text-[13px] font-semibold text-[var(--color-on-accent)] shadow-[0_2px_0_#8a5a17,0_10px_24px_rgba(242,163,60,0.2)] hover:bg-[var(--color-accent-lift)] disabled:cursor-not-allowed disabled:opacity-35 disabled:shadow-none ${
                  queueLen > 0 ? "breathe" : ""
                }`}
              >
                <IPlay size={13} /> Run queue · {queueLen}
              </button>
              <p data-tip="The run button will make the waiting pictures and try the failed ones again." className="mt-2 text-center font-mono text-[10px] text-dust">pending + failed rows</p>
            </div>
          )}
        </div>
      </BorderGlow>

      <section className="rounded-xl border border-line bg-panel/60 p-3.5">
        <h3 data-tip="A check that your pictures will look like they belong together and be saved safely." className="font-mono text-[10px] tracking-[0.22em] text-dust uppercase">Matching</h3>
        {/* Two ticks and the word "consistency" were reassuring without being
            informative. These now say what is being checked and over how many
            rows, so a tick means something you could verify yourself. */}
        <p data-tip="How many pictures were checked." className="mb-2.5 text-[10.5px] leading-snug text-dust/80">
          checked across all {p.rows.length} row{p.rows.length === 1 ? "" : "s"}
        </p>
        <div className="space-y-2.5">
          <div className="flex items-start gap-2.5">
            {p.drift === 0 ? <ICheck size={14} className="mt-0.5 shrink-0 text-moss" /> : <IAlert size={14} className="mt-0.5 shrink-0 text-ember" />}
            <p className="flex-1 text-[12px] leading-snug text-parch">
              {p.drift === 0 ? (
                <>
                  Every row asks for the same look —{" "}
                  <span data-tip="The look every picture is asked to have." className="font-mono text-moss">{p.styleLock}</span>. Mixed styles in one batch is the usual
                  reason a set looks wrong together.
                </>
              ) : (
                <><span data-tip="How many pictures ask for a different look than the rest." className="font-semibold text-ember">{p.drift} row{p.drift > 1 ? "s" : ""}</span> drift from “{p.styleLock}”</>
              )}
            </p>
          </div>
          <div className="flex items-start gap-2.5">
            {p.violations === 0 ? <ICheck size={14} className="mt-0.5 shrink-0 text-moss" /> : <IAlert size={14} className="mt-0.5 shrink-0 text-blood" />}
            <p className="flex-1 text-[12px] leading-snug text-parch">
              {p.violations === 0 ? (
                <>
                  Every filename passes the seven rules, so nothing will overwrite anything or land in the wrong
                  folder.
                </>
              ) : <><span data-tip="How many file names break the saving rules." className="font-semibold text-blood">{p.violations} filename{p.violations > 1 ? "s" : ""}</span> break the rules</>}
            </p>
          </div>
          {(p.drift > 0 || p.violations > 0) && (
            <Btn data-tip="Jumps to the page that lists the rows with problems and how to fix them." variant="subtle" className="w-full justify-center" onClick={p.onJumpSpec}>
              open rules &amp; fixes →
            </Btn>
          )}
        </div>
      </section>

      <a data-tip="Opens the Image Forge project page on GitHub in your web browser."
        href="https://github.com/Stravelakis/image-forge"
        target="_blank"
        rel="noreferrer"
        className="mt-auto flex items-center gap-2 rounded-lg border border-line px-2.5 py-2 text-[11px] text-dust transition hover:border-line2 hover:text-parch"
      >
        <IAnvil size={13} className="shrink-0" />
        <span className="min-w-0">
          <span className="block truncate text-parch">Image Forge</span>
          <span className="block truncate font-mono text-[9.5px]">Stravelakis/image-forge</span>
        </span>
      </a>
    </aside>
  );
}
