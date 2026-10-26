import { useMemo, useState } from "react";
import type { Category, ManifestRow, Status, Toast } from "../types";
import { ASPECTS, CATEGORIES, CATEGORY_META, KINDS, STATUSES, STATUS_META, STYLES, kindById } from "../types";
import type { ForgeSettings } from "../lib/providers";
import { SCRIBE_SYSTEMS, formatCountdown, scribeChat } from "../lib/providers";
import type { Batch, SavedSetup } from "../lib/batches";
import { BorderGlow } from "./effects";
import { Btn, CatChip, ICheck, IDownload, IHammer, IPlay, IRetry, ISearch, IStar, IThumbDown, IThumbUp, ITrash, IWand, IX, StatusChip } from "./ui";

const RatioThumb = ({ row, width = 150 }: { row: ManifestRow; width?: number }) => {
  const dims = ASPECTS[row.aspect_ratio];
  const h = Math.max(48, Math.round((width * dims.h) / dims.w));
  if (!row.preview)
    return (
      <div className="flex items-center justify-center rounded-lg border border-dashed border-line2 bg-[var(--color-field)]" style={{ width, height: h }}>
        <span data-tip="This row has no picture yet." className="font-mono text-[10px] text-dust">no plate yet</span>
      </div>
    );
  const isSvg = row.preview.trimStart().startsWith("<svg");
  return (
    <div className="thumb-zoom overflow-hidden rounded-lg border border-line" style={{ width, height: h }}>
      {isSvg ? (
        <div className="h-full w-full [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: row.preview }} />
      ) : (
        <img src={row.preview} alt={row.filename} className="h-full w-full object-cover" />
      )}
    </div>
  );
};

/* ---------------- images ---------------- */

export function ImageLibrary({
  rows,
  batches,
  updateRow,
  onRedo,
  onMakeGif,
  onAddText,
}: {
  rows: ManifestRow[];
  batches: Batch[];
  updateRow: (id: number, patch: Partial<ManifestRow>) => void;
  onRedo: (ids: number[]) => void;
  /** offered only for finished pictures whose bytes we still hold */
  onMakeGif?: (row: ManifestRow) => void;
  onAddText?: (row: ManifestRow) => void;
}) {
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState<Category | "all">("all");
  const [status, setStatus] = useState<Status | "all">("all");
  const [rating, setRating] = useState<"all" | "like" | "dislike" | "none">("all");

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (cat !== "all" && r.category !== cat) return false;
      if (status !== "all" && r.status !== status) return false;
      if (rating === "like" && r.rating !== "like") return false;
      if (rating === "dislike" && r.rating !== "dislike") return false;
      if (rating === "none" && r.rating) return false;
      if (q && !r.filename.toLowerCase().includes(q) && !r.prompt.toLowerCase().includes(q) && !(r.note ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, cat, status, rating]);

  const batchName = (id: number) => batches.find((b) => b.rowIds.includes(id))?.name;
  const marked = rows.filter((r) => r.status === "failed" || ((r.note ?? "").trim() !== "" && (r.status === "done" || r.status === "imported")));
  const liked = rows.filter((r) => r.rating === "like").length;

  const sel = "rounded-lg border border-line bg-[var(--color-field)] px-2.5 py-2 font-mono text-[11px] text-cream";

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p data-tip="A small label: you are in the Library, where everything you keep lives." className="font-mono text-[11px] tracking-[0.28em] text-ember uppercase">library</p>
          <h2 data-tip="Every picture you have made or planned, in one place." className="mt-1 font-display text-3xl text-cream">Every picture</h2>
          <p className="mt-2 max-w-xl text-[13.5px] text-parch">
            Thumbs-up the keepers, thumbs-down the duds. Write a note about what should be better, mark it, and redo —
            your note becomes part of the new prompt automatically.
          </p>
        </div>
        <div className="flex gap-2">
          <Btn data-tip="Shows only the pictures you gave a thumbs-up. Click again to show everything." variant="ghost" onClick={() => setRating(rating === "like" ? "all" : "like")}>
            <IThumbUp size={13} /> liked · {liked}
          </Btn>
          <Btn data-tip="Paints again every picture you marked. Your notes are added to the new prompt." variant="moss" disabled={marked.length === 0} onClick={() => onRedo(marked.map((r) => r.id))}>
            <IRetry size={13} /> Redo marked · {marked.length}
          </Btn>
        </div>
      </header>

      {/* filters */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="relative">
          <ISearch size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-dust" />
          <input data-tip="Type a few letters to find pictures by name, prompt or note." value={search} onChange={(e) => setSearch(e.target.value)} placeholder="search names, prompts, notes…" className={sel + " w-[240px] !pl-8"} />
        </div>
        <select data-tip="Show only one kind of picture, like shops or items." value={cat} onChange={(e) => setCat(e.target.value as Category | "all")} className={sel}>
          <option value="all">all categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select data-tip="Show only pictures in one stage, like done or failed." value={status} onChange={(e) => setStatus(e.target.value as Status | "all")} className={sel}>
          <option value="all">all statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <div className="flex gap-1">
          {(
            [
              { id: "all", label: "all" },
              { id: "like", label: "▲ liked" },
              { id: "dislike", label: "▼ disliked" },
              { id: "none", label: "unrated" },
            ] as { id: typeof rating; label: string }[]
          ).map((r) => (
            <button data-tip={`${`Show ${r.label} pictures.`}`} key={r.id} onClick={() => setRating(r.id)} className={`btn-press rounded-lg border px-2.5 py-1.5 font-mono text-[10.5px] ${rating === r.id ? "border-ember/60 bg-ember/12 text-ember" : "border-line bg-panel/50 text-parch hover:border-line2"}`}>
              {r.label}
            </button>
          ))}
        </div>
        <span data-tip="How many pictures match your filters, out of all of them." className="ml-auto font-mono text-[10.5px] text-dust">{shown.length} of {rows.length}</span>
      </div>

      {shown.length === 0 ? (
        <p data-tip="Shown when there is nothing to display. Make some pictures, or change your filters." className="py-16 text-center font-display text-xl text-dust">
          {rows.length === 0 ? "Nothing here yet — the wizard fixes that." : "No pictures match those filters."}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {shown.map((r) => (
            <BorderGlow key={r.id} radius={14} glow={r.rating === "like" ? "rgba(140,181,111,0.5)" : "color-mix(in srgb, var(--color-ember) 45%, transparent)"} idle="var(--color-line)" innerClassName="bg-[var(--color-panel)]">
              <div className="p-3">
                <div className="relative flex justify-center">
                  <RatioThumb row={r} width={220} />
                  {/* rating overlay */}
                  <div className="absolute right-1.5 top-1.5 flex gap-1">
                    <button
                      onClick={() => updateRow(r.id, { rating: r.rating === "like" ? undefined : "like" })}
                      title="I like this one"
                      className={`btn-press rounded-md border p-1.5 backdrop-blur ${r.rating === "like" ? "border-moss/70 bg-moss/25 text-moss" : "border-line bg-[var(--color-field)]/80 text-dust hover:text-moss"}`}
                    >
                      <IThumbUp size={12} />
                    </button>
                    <button
                      onClick={() => updateRow(r.id, { rating: r.rating === "dislike" ? undefined : "dislike" })}
                      title="not good enough"
                      className={`btn-press rounded-md border p-1.5 backdrop-blur ${r.rating === "dislike" ? "border-blood/70 bg-blood/25 text-blood" : "border-line bg-[var(--color-field)]/80 text-dust hover:text-blood"}`}
                    >
                      <IThumbDown size={12} />
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <p data-tip="The file name of this picture." className="min-w-0 flex-1 truncate font-mono text-[11px] text-cream">{r.filename}</p>
                  <StatusChip status={r.status} />
                </div>
                <p className="mt-1 flex items-center gap-1.5 font-mono text-[9.5px] text-dust">
                  <CatChip category={r.category} />
                  {r.kind && r.kind !== "none" && <span data-tip="The special kind of picture this is, like an icon or a character." className="rounded border border-potion/30 px-1 py-px text-potion">{kindById(r.kind).tag || r.kind}</span>}
                  {batchName(r.id) ? <span className="truncate">· {batchName(r.id)}</span> : null}
                </p>
                <input data-tip="Write what should be better, like warmer light. It is added to the prompt when you redo this picture."
                  value={r.note ?? ""}
                  onChange={(e) => updateRow(r.id, { note: e.target.value || undefined })}
                  placeholder="✎ what should be better…"
                  className="mt-2 w-full rounded-lg border border-line bg-[var(--color-field)] px-2.5 py-1.5 text-[11.5px] text-cream placeholder:text-dust/50"
                />
                <div className="mt-2 flex gap-1.5">
                  {(r.status === "done" || r.status === "imported") && (
                    <Btn data-tip="Marks this picture as failed so it can be painted again." variant="danger" className="flex-1 justify-center !px-2 !py-1.5 !text-[11px]" onClick={() => updateRow(r.id, { status: "failed", error: "marked by hand", rating: undefined })}>
                      <IX size={11} /> Mark failed
                    </Btn>
                  )}
                  <Btn data-tip="Paints this picture again, using your note if you wrote one." variant="ghost" className="flex-1 justify-center !px-2 !py-1.5 !text-[11px]" onClick={() => onRedo([r.id])}>
                    <IHammer size={11} /> Redo
                  </Btn>
                  {onAddText && (r.status === "done" || r.status === "imported") && (
                    <Btn
                      variant="ghost"
                      className="flex-1 justify-center !px-2 !py-1.5 !text-[11px]"
                      onClick={() => onAddText(r)}
                      title="put real lettering on this picture"
                    >
                      T Text
                    </Btn>
                  )}
                  {onMakeGif && (r.status === "done" || r.status === "imported") && (
                    <Btn
                      variant="ghost"
                      className="flex-1 justify-center !px-2 !py-1.5 !text-[11px]"
                      onClick={() => onMakeGif(r)}
                      title="animate this picture into a looping GIF"
                    >
                      ▸ GIF
                    </Btn>
                  )}
                </div>
              </div>
            </BorderGlow>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- styles ---------------- */

export function StyleLibrary({
  settings,
  patchSettings,
  styleLock,
  setStyleLock,
  pushToast,
}: {
  settings: ForgeSettings;
  patchSettings: (p: Partial<ForgeSettings>) => void;
  styleLock: string;
  setStyleLock: (s: string) => void;
  pushToast: (kind: Toast["kind"], msg: string) => void;
}) {
  const [name, setName] = useState("");
  const [block, setBlock] = useState("");
  const [craft, setCraft] = useState("");
  const [crafting, setCrafting] = useState(false);
  const all = [
    ...STYLES,
    ...settings.customStyles.map((c) => ({ ...c, swatch: ["#f4e8d4", "#97876d", "#57432c"] as [string, string, string] })),
  ];

  /**
   * Starred styles come first, in the order they were starred.
   *
   * Not a group in the catalogue: a style belongs to one group by what it
   * looks like, and moving it into a "favourites" group would take it out of
   * the family it belongs to. This is a shortcut laid over the top — a
   * starred style appears at the front AND stays where it was, so nothing
   * ever goes missing because you starred it.
   */
  const favorites = settings.favoriteStyles;
  const starred = favorites
    .map((id) => all.find((s) => s.id === id))
    .filter((s): s is (typeof all)[number] => Boolean(s));
  const rest = all.filter((s) => !favorites.includes(s.id));

  const toggleFavorite = (id: string) =>
    patchSettings({
      favoriteStyles: favorites.includes(id) ? favorites.filter((f) => f !== id) : [id, ...favorites],
    });

  /** One card, drawn the same whether it sits in favourites or below. */
  const styleCard = (s: (typeof all)[number]) => {
    const active = styleLock === s.id;
    const starredHere = favorites.includes(s.id);
    return (
      <BorderGlow
        key={s.id}
        radius={14}
        glow={active ? "color-mix(in srgb, var(--color-ember) 60%, transparent)" : "color-mix(in srgb, var(--color-ember) 40%, transparent)"}
        idle={active ? "color-mix(in srgb, var(--color-ember) 50%, transparent)" : "var(--color-line)"}
        innerClassName={active ? "bg-[var(--color-panel2)]" : "bg-[var(--color-panel)]"}
      >
        <div className="p-4">
          <div className="flex items-center gap-3">
            <span className="flex overflow-hidden rounded-md border border-line">
              {s.swatch.map((c) => (
                <span key={c} className="h-5 w-5" style={{ background: c }} />
              ))}
            </span>
            <span data-tip="The name of this look." className="flex-1 font-display text-[15px] tracking-wide text-cream">{s.name}</span>
            {active && (
              <span data-tip="This look is locked in: it is added to every picture you make." className="rounded-md border border-ember/50 bg-ember/12 px-2 py-0.5 font-mono text-[9px] tracking-widest text-ember uppercase">
                locked
              </span>
            )}
            <button
              onClick={() => toggleFavorite(s.id)}
              aria-pressed={starredHere}
              title={starredHere ? "Remove from favourites" : "Keep this one at the top"}
              className={`btn-press shrink-0 rounded-md p-1 transition ${starredHere ? "text-ember" : "text-dust hover:text-parch"}`}
            >
              <IStar size={15} filled={starredHere} />
            </button>
          </div>
          <p data-tip="The words that get added to a picture description to give it this look." className="mt-2 font-mono text-[10.5px] leading-relaxed text-dust">{s.block}</p>
          <div className="mt-3 flex gap-2">
            <Btn data-tip={`${active ? `${s.name} is added to every prompt now.` : `Adds the ${s.name} look to every prompt so the whole batch matches.`}`} variant={active ? "ghost" : "primary"} className="!px-2.5 !py-1.5 !text-[11px]" onClick={() => setStyleLock(s.id)}>
              {active ? "locked ✓" : "Lock this style"}
            </Btn>
            {settings.customStyles.some((c) => c.id === s.id) && (
              <Btn data-tip="Deletes this style you added from the library."
                variant="danger"
                className="!px-2.5 !py-1.5 !text-[11px]"
                onClick={() =>
                  patchSettings({
                    customStyles: settings.customStyles.filter((c) => c.id !== s.id),
                    // A removed style must not linger as a favourite, or the
                    // favourites row silently shrinks with no explanation.
                    favoriteStyles: favorites.filter((f) => f !== s.id),
                  })
                }
              >
                <ITrash size={11} /> Remove
              </Btn>
            )}
          </div>
        </div>
      </BorderGlow>
    );
  };

  const addStyle = (id: string, sName: string, sBlock: string) => {
    patchSettings({ customStyles: [...settings.customStyles, { id, name: sName, block: sBlock }] });
    pushToast("ok", `Style “${sName}” added to the library.`);
  };

  const aiCraft = async () => {
    setCrafting(true);
    try {
      const out = await scribeChat(settings.scribe, SCRIBE_SYSTEMS.styleCrafter(settings.metaPrompts.stylePicker), craft);
      const parsed = JSON.parse(out.replace(/```(?:json)?/g, "").trim()) as { id?: string; name?: string; block?: string };
      if (!parsed.id || !parsed.block) throw new Error("incomplete answer");
      setName(parsed.name ?? parsed.id);
      setBlock(parsed.block);
      pushToast("ok", "The scribe drafted a style — tweak it, then add it.");
    } catch (e) {
      pushToast("err", `Couldn't craft a style (${(e as { message?: string }).message?.slice(0, 70) ?? "text engine unavailable"}).`);
    } finally {
      setCrafting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10">
      <header className="mb-6">
        <p data-tip="A small label: you are in the Library." className="font-mono text-[11px] tracking-[0.28em] text-ember uppercase">library</p>
        <h2 data-tip="The looks a picture can have, like clay, paper or shadow." className="mt-1 font-display text-3xl text-cream">Visual styles</h2>
        <p data-tip="A look is how a picture is made. The world it shows is a separate choice." className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-parch">
          A style is <em>how</em> a picture is made — clay, paper, shadow. The world (D&amp;D, cyberpunk, cozy…) is a
          separate choice in the wizard, so any style works with any world.
        </p>
        <div className="mt-4 rounded-xl border border-ember/30 bg-ember/6 px-4 py-3">
          <p className="text-[12.5px] leading-relaxed text-parch">
            <span data-tip="Locking a look makes every picture you make use it. You can change it any time." className="font-semibold text-ember">What does “Lock this style” do?</span> It makes one style the law
            of the land: the wizard pre-selects it, the scribe appends its words to every prompt it writes, and the
            workbench flags any picture that drifts away from it. Lock one per project and every picture stays in the
            same family. You can change the lock anytime — nothing gets re-drawn.
          </p>
        </div>
      </header>

      {starred.length > 0 && (
        <>
          <p data-tip="Looks you starred. They stay at the top." className="mb-2.5 font-mono text-[10.5px] tracking-[0.24em] text-ember uppercase">
            favourites <span className="text-dust">· {starred.length}</span>
          </p>
          <div className="mb-8 grid gap-3 sm:grid-cols-2">{starred.map(styleCard)}</div>
          <p data-tip="All the other looks." className="mb-2.5 font-mono text-[10.5px] tracking-[0.24em] text-dust uppercase">everything else</p>
        </>
      )}

      <div className="grid gap-3 sm:grid-cols-2">{rest.map(styleCard)}</div>

      <div className="mt-8 rounded-2xl border border-line bg-panel/50 p-5">
        <p data-tip="Make a new look of your own by describing it." className="font-display text-[15px] tracking-wide text-cream">Add your own style</p>
        <div className="mt-3 grid gap-3">
          <input data-tip="A name for your new style, like Ink and Wash." value={name} onChange={(e) => setName(e.target.value)} placeholder="name — e.g. Ink & Wash" className="w-full rounded-lg border border-line bg-[var(--color-field)] px-3 py-2.5 text-[13px] text-cream placeholder:text-dust/60" />
          <textarea data-tip="The words added to the end of every prompt to give pictures this look." value={block} onChange={(e) => setBlock(e.target.value)} rows={2} placeholder="the style block appended to every prompt — e.g. ink and brush wash style, muted earth tones…" className="w-full resize-y rounded-lg border border-line bg-[var(--color-field)] px-3 py-2.5 text-[12.5px] text-cream placeholder:text-dust/60" />
          <div className="flex flex-wrap gap-2">
            <Btn data-tip="Saves your new style to the library so you can use it."
              variant="primary"
              disabled={!name.trim() || !block.trim()}
              onClick={() => {
                const id = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
                addStyle(id || `custom-${Date.now()}`, name.trim(), block.trim());
                setName("");
                setBlock("");
              }}
            >
              <ICheck size={12} /> Add to the library
            </Btn>
          </div>
        </div>
        <div className="mt-4 border-t border-line pt-4">
          <p className="font-mono text-[10px] tracking-[0.2em] text-potion uppercase">or let the text model invent one</p>
          <div className="mt-2 flex gap-2">
            <input data-tip="Describe the look in plain words and the text model writes the style for you." value={craft} onChange={(e) => setCraft(e.target.value)} placeholder="describe the look — e.g. old woodblock prints with rough edges" className="min-w-0 flex-1 rounded-lg border border-line bg-[var(--color-field)] px-3 py-2.5 text-[12.5px] text-cream placeholder:text-dust/60" />
            <Btn data-tip="Asks your text model to turn your description into a ready style. It needs a text key in Settings." variant="ghost" onClick={aiCraft} disabled={crafting || !settings.scribe.key.trim() || !craft.trim()}>
              <IWand size={12} /> {crafting ? "crafting…" : "Craft with AI"}
            </Btn>
          </div>
          {!settings.scribe.key.trim() && (
            <p data-tip="Writing a look with AI needs a free text key. Add one in Settings, under Text engines." className="mt-2 text-[11px] text-dust">Needs a text-engine key — Settings → Text engines.</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- templates ---------------- */

export function TemplateLibrary({
  setups,
  onDelete,
  onUse,
  onUsePuppet,
}: {
  setups: SavedSetup[];
  onDelete: (id: string) => void;
  onUse: (t: SavedSetup) => void;
  onUsePuppet?: (t: SavedSetup) => void;
}) {
  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10">
      <header className="mb-6">
        <p data-tip="A small label: you are in the Library." className="font-mono text-[11px] tracking-[0.28em] text-ember uppercase">library</p>
        <h2 data-tip="Saved recipes you can use again, so a new batch starts with your favourite choices." className="mt-1 font-display text-3xl text-cream">Templates</h2>
        <p className="mt-2 max-w-xl text-[13.5px] text-parch">
          Starting points you saved: a picture setup (style, engine, shape) from the end of the wizard, or a puppet (description, style, engines) from the puppet maker. Use one and only what changes is left to fill in.
        </p>
      </header>
      {setups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line2 p-12 text-center">
          <IWand size={26} className="mx-auto text-dust" />
          <p data-tip="You have not saved a recipe yet. Save one from a batch you liked." className="mt-3 font-display text-xl text-cream">No templates yet.</p>
          <p className="mt-1 text-[13px] text-parch">Save one at the end of the picture wizard, or with “Save as template” in the puppet maker.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {setups.map((t) => (
            <BorderGlow key={t.id} radius={14} glow="rgba(177,140,224,0.45)" idle="var(--color-line)" innerClassName="bg-[var(--color-panel)]">
              <div className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <p data-tip="The name of this saved recipe." className="font-display text-[16px] tracking-wide text-cream">{t.name}</p>
                  <button data-tip={`${`Deletes the recipe ${t.name}.`}`} onClick={() => onDelete(t.id)} className="btn-press rounded-md p-1.5 text-dust hover:bg-blood/15 hover:text-blood">
                    <ITrash size={13} />
                  </button>
                </div>
                {t.type === "puppet" && t.puppet ? (
                  <p className="mt-1 text-[11.5px] text-dust">
                    <span data-tip="This recipe makes a puppet." className="text-potion">puppet</span> · {t.puppet.style} · {t.puppet.framing === "waist" ? "waist up" : "head"} · {t.puppet.description.slice(0, 80)}
                  </p>
                ) : (
                  <p className="mt-1 font-mono text-[10.5px] text-dust">
                    <span data-tip="This recipe makes a set of pictures. It remembers the look, painter and shape you chose." className="text-potion">pictures · {kindById(t.data.kind).label}</span> · {t.data.styleId} · {t.data.model || "practice forge"} · {t.data.aspect === "per-category" ? "mixed shapes" : t.data.aspect} · saved {new Date(t.createdAt).toLocaleDateString("en-GB")}
                  </p>
                )}
                <div className="mt-3">
                  {t.type === "puppet" ? (
                    <Btn data-tip="Starts making a puppet from this recipe." variant="primary" onClick={() => onUsePuppet?.(t)}>
                      <IPlay size={12} /> Make a puppet from this
                    </Btn>
                  ) : (
                    <Btn data-tip="Opens the wizard with this recipe's choices already filled in." variant="primary" onClick={() => onUse(t)}>
                      <IPlay size={12} /> Start wizard from here
                    </Btn>
                  )}
                </div>
              </div>
            </BorderGlow>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- batches ---------------- */

export function BatchLibrary({
  batches,
  rows,
  onOpen,
  onRerun,
  onDelete,
  onExport,
}: {
  batches: Batch[];
  rows: ManifestRow[];
  onOpen: (id: string) => void;
  onRerun: (id: string) => void;
  onDelete: (id: string) => void;
  onExport: (id: string) => void;
}) {
  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10">
      <header className="mb-6">
        <p data-tip="A small label: you are in the Library." className="font-mono text-[11px] tracking-[0.28em] text-ember uppercase">library</p>
        <h2 data-tip="Groups of pictures you made together, with how far each one got." className="mt-1 font-display text-3xl text-cream">Previous batches</h2>
        <p className="mt-2 max-w-xl text-[13.5px] text-parch">
          Every batch you arranged, with a live score and its first few pictures. Finished pictures show the real
          plate; waiting ones show a placeholder until the forge strikes.
        </p>
      </header>
      {batches.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line2 p-12 text-center">
          <p data-tip="You have not made a batch yet. Start one from the Wizards page." className="font-display text-xl text-cream">No batches yet.</p>
          <p className="mt-1 text-[13px] text-parch">The wizard arranges your first one in about two minutes.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {batches.map((b) => {
            const bRows = rows.filter((r) => b.rowIds.includes(r.id));
            const done = bRows.filter((r) => r.status === "done" || r.status === "imported").length;
            const failed = bRows.filter((r) => r.status === "failed").length;
            const cooling = bRows.filter((r) => r.retry_at && Date.parse(r.retry_at) > Date.now());
            return (
              <BorderGlow key={b.id} radius={14} glow="rgba(86,184,165,0.4)" idle="var(--color-line)" innerClassName="bg-[var(--color-panel)]">
                <div className="flex flex-wrap items-center gap-5 p-4">
                  {/* live preview strip */}
                  <div className="flex shrink-0 gap-1.5">
                    {bRows.slice(0, 4).map((r) => (
                      <RatioThumb key={r.id} row={r} width={62} />
                    ))}
                    {bRows.length === 0 && <span data-tip="The pictures in this batch were removed from your list." className="font-mono text-[10px] text-dust">rows deleted</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p data-tip="The name of this batch." className="font-display text-[16px] tracking-wide text-cream">{b.name}</p>
                    <p data-tip="When the batch was made and how many pictures it holds." className="mt-0.5 font-mono text-[10.5px] text-dust">
                      {new Date(b.createdAt).toLocaleString("en-GB")} · {bRows.length} pictures{b.setupName ? ` · recipe “${b.setupName}”` : ""}
                    </p>
                    <div className="mt-2 flex h-2 w-full max-w-xs overflow-hidden rounded-full bg-[var(--color-field)]">
                      {done > 0 && <div className="h-full bg-moss transition-all duration-700" style={{ width: `${(done / Math.max(bRows.length, 1)) * 100}%` }} />}
                      {failed > 0 && <div className="h-full bg-blood transition-all duration-700" style={{ width: `${(failed / Math.max(bRows.length, 1)) * 100}%` }} />}
                    </div>
                    <p data-tip="How many pictures in this batch are made, and how many did not work." className="mt-1 font-mono text-[10px] text-dust">
                      {done}/{bRows.length} struck{failed > 0 ? ` · ${failed} failed` : ""}
                      {cooling.length > 0 && cooling[0].retry_at ? ` · cooling ${formatCountdown(Date.parse(cooling[0].retry_at))}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Btn data-tip="Opens this batch's pictures on the workbench." onClick={() => onOpen(b.id)}>Open</Btn>
                    <Btn data-tip="Saves this batch's rows as a spreadsheet (CSV) file." variant="ghost" onClick={() => onExport(b.id)} disabled={bRows.length === 0}>
                      <IDownload size={12} /> Export CSV
                    </Btn>
                    <Btn data-tip="Paints again the pictures in this batch that failed or are still waiting." variant="ghost" onClick={() => onRerun(b.id)} disabled={!bRows.some((r) => r.status === "failed" || r.status === "pending")}>
                      <IRetry size={12} /> Rerun
                    </Btn>
                    <Btn data-tip="Deletes this batch from the history." variant="danger" onClick={() => onDelete(b.id)}>
                      <ITrash size={12} />
                    </Btn>
                  </div>
                </div>
              </BorderGlow>
            );
          })}
        </div>
      )}
      <p className="mt-4 font-mono text-[10.5px] text-dust/70">
        {Object.values(CATEGORY_META).map((c) => c.folder).join(" / ")} — plates are kept in this session's memory; link a
        folder or grab the ZIP so they live on disk too.
      </p>
    </div>
  );
}
