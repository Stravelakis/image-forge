import { useEffect, useRef, useState } from "react";
import type { Category, Toast } from "../types";
import { CATEGORIES, CATEGORY_META, KINDS, kindById } from "../types";
import type { ForgeSettings } from "../lib/providers";
import { SCRIBE_SYSTEMS, scribeChat } from "../lib/providers";
import { autoFixFilename } from "../lib/validate";
import type { FactoryItem } from "../lib/batches";
import { generateIdeas } from "../lib/batches";
import { downloadCsv } from "../lib/csv";
import { Btn, CatChip, ICheck, IPlus, IRetry, ITrash, IUpload, IWand, IX } from "./ui";

const field = "w-full rounded-lg border border-line bg-[var(--color-field)] px-2.5 py-1.5 text-[12px] text-cream placeholder:text-dust/50";

export default function PromptFactory({
  settings,
  styleId,
  styleBlock,
  items,
  setItems,
  pushToast,
  world,
  onWorld,
}: {
  /** When given, the world is the caller's (the wizard's), not the factory's own. */
  world?: string;
  onWorld?: (id: string) => void;
  settings: ForgeSettings;
  styleId: string;
  /** null = keep prompts style-free (wizard adds the style later) */
  styleBlock: string | null;
  items: FactoryItem[];
  setItems: (items: FactoryItem[]) => void;
  pushToast: (kind: Toast["kind"], msg: string) => void;
}) {
  const [mode, setMode] = useState<"write" | "paste" | "file">("write");
  const [theme, setTheme] = useState("");
  const [count, setCount] = useState(8);
  const [ownKind, setOwnKind] = useState("none");
  const kindId = world ?? ownKind;
  const setKindId = (id: string) => (onWorld ? onWorld(id) : setOwnKind(id));
  const [pasteText, setPasteText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const kind = kindById(kindId);
  const prevKindNeg = useRef(kind.negative);

  // when the world changes, refresh auto negatives that were never edited
  useEffect(() => {
    if (prevKindNeg.current !== kind.negative) {
      setItems(
        items.map((i) =>
          !i.negative_prompt || i.negative_prompt === prevKindNeg.current ? { ...i, negative_prompt: kind.negative } : i
        )
      );
      prevKindNeg.current = kind.negative;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kindId]);

  const patch = (idx: number, p: Partial<FactoryItem>) =>
    setItems(items.map((x, i) => (i === idx ? { ...x, ...p } : x)));

  const addManual = () =>
    setItems([
      ...items,
      {
        filename: `item_${kind.tag ? kind.tag + "_" : ""}new_${items.length + 1}.png`,
        prompt: "",
        negative_prompt: kind.negative,
        category: "image",
      },
    ]);

  const remove = (idx: number) => setItems(items.filter((_, i) => i !== idx));

  const runAi = async () => {
    setBusy(true);
    setError("");
    const sys = SCRIBE_SYSTEMS.factory(kind.flavor, kind.negative, kind.tag, styleBlock, settings.metaPrompts.factory);
    const user = `Theme: ${theme.trim() || "assorted"}\nCount: ${count}`;
    try {
      const out = await scribeChat(settings.scribe, sys, user);
      const jsonText = out.replace(/^```(?:json)?/i, "").replace(/```$/g, "").trim();
      const start = jsonText.indexOf("{");
      const parsed = JSON.parse(jsonText.slice(start)) as {
        rows?: { prompt?: string; filename?: string; negative_prompt?: string; category?: string }[];
      };
      if (!Array.isArray(parsed.rows) || parsed.rows.length === 0) throw new Error("the model returned no rows");
      const next: FactoryItem[] = parsed.rows.map((r, i) => {
        const cat = (CATEGORIES as string[]).includes(r.category ?? "") ? (r.category as Category) : "image";
        const rawName = (r.filename || "").trim() || `${cat}_idea_${i + 1}.png`;
        return {
          filename: autoFixFilename(rawName, cat),
          prompt: (r.prompt || "").trim(),
          negative_prompt: (r.negative_prompt || "").trim() || kind.negative,
          category: cat,
        };
      });
      setItems(next);
      pushToast("ok", `The scribe drafted ${next.length} rich ideas${kind.id !== "none" ? ` for the ${kind.label} world` : ""}.`);
    } catch (e) {
      const msg = (e as { message?: string })?.message ?? "request failed";
      if (/key|scribe|401|fetch/i.test(msg)) {
        setError("The text engine refused — falling back to the offline idea mill.");
        setItems(generateIdeas(theme, count, kindId));
      } else {
        setError(`Could not read that answer (${msg.slice(0, 90)}). Falling back to the offline idea mill.`);
        setItems(generateIdeas(theme, count, kindId));
      }
    } finally {
      setBusy(false);
    }
  };

  const runOffline = () => {
    setItems(generateIdeas(theme, count, kindId));
    pushToast("info", `Idea mill produced ${count} drafts — edit anything you like.`);
  };

  const parsePaste = () => {
    const lines = pasteText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return;
    const next: FactoryItem[] = lines.map((l, i) => {
      const bits = l.split(/\s*[|→]\s*/);
      let filename = "";
      let prompt = "";
      let negative: string | undefined = kind.negative;
      let category: Category = "image";
      if (bits.length >= 2) {
        filename = bits[0];
        prompt = bits[1];
        if (bits[2]) negative = bits[2];
      } else {
        prompt = l;
      }
      const m = filename.match(/^(shop|item|event|npc)_/);
      if (m) category = m[1] as Category;
      const tag = kind.tag ? `${kind.tag}_` : "";
      const slug =
        prompt
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, "")
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 3)
          .join("_") || `idea_${i + 1}`;
      return {
        filename: filename ? autoFixFilename(filename, category) : autoFixFilename(`${category}_${tag}${slug}.png`, category),
        prompt,
        negative_prompt: negative,
        category,
      };
    });
    setItems(next);
    pushToast("ok", `Parsed ${next.length} line${next.length > 1 ? "s" : ""}.`);
  };

  const onFile = async (f: File) => {
    const text = await f.text();
    const rows = text.split(/\r?\n/);
    const head = rows[0].toLowerCase();
    const isCsv = head.includes("filename") && head.includes("prompt");
    const body = isCsv ? rows.slice(1) : rows;
    const next: FactoryItem[] = [];
    for (const line of body) {
      if (!line.trim()) continue;
      if (isCsv) {
        const cells = line.split(",").map((c) => c.replace(/^"|"$/g, "").trim());
        const cat = (CATEGORIES as string[]).includes(cells[3] ?? "") ? (cells[3] as Category) : "image";
        next.push({ filename: cells[0] || "", prompt: cells[1] || "", negative_prompt: cells[2] || kind.negative, category: cat });
      } else {
        next.push({
          filename: autoFixFilename(`image_${kind.tag ? kind.tag + "_" : ""}imported_${next.length + 1}.png`, "image"),
          prompt: line.trim(),
          negative_prompt: kind.negative,
          category: "image",
        });
      }
    }
    setItems(next);
    pushToast("ok", `Loaded ${next.length} row${next.length > 1 ? "s" : ""} from ${f.name}.`);
  };

  const exportCsv = () => {
    const head = "filename,prompt,negative_prompt,category";
    const q = (s: string) => (/[,"]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s);
    const body = items.filter((i) => i.filename && i.prompt).map((i) => [q(i.filename), q(i.prompt), q(i.negative_prompt ?? ""), i.category ?? "image"].join(","));
    downloadCsv("factory-prompts.csv", [head, ...body].join("\n"));
  };

  // GOOGLE SHEETS: copied as tab-separated text, which a sheet splits into
  // columns on paste — no account link, no key (Ak, 13 Oct 2026).
  const copyForSheets = async () => {
    const t = (s: string) => s.replace(/[\t\r\n]+/g, " ");
    const rows = [["filename", "prompt", "negative_prompt", "category"], ...items.filter((i) => i.filename && i.prompt).map((i) => [t(i.filename), t(i.prompt), t(i.negative_prompt ?? ""), i.category ?? "image"])];
    try {
      await navigator.clipboard.writeText(rows.map((r) => r.join("\t")).join("\n"));
      pushToast("ok", `Copied ${rows.length - 1} rows. In Google Sheets, click cell A1 and paste (Ctrl+V).`);
    } catch {
      pushToast("err", "Could not copy — use Export CSV instead.");
    }
  };
  const exportXlsx = async () => {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.json_to_sheet(items.filter((i) => i.filename && i.prompt).map((i) => ({ filename: i.filename, prompt: i.prompt, negative_prompt: i.negative_prompt ?? "", category: i.category ?? "image" })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "prompts");
    XLSX.writeFile(wb, "factory-prompts.xlsx");
  };

  const valid = items.filter((i) => i.filename.trim() && i.prompt.trim()).length;

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <header className="mb-8">
        <p className="font-mono text-[11px] tracking-[0.28em] text-potion uppercase">the prompt factory</p>
        <h2 className="mt-2 font-display text-3xl text-cream">Make a huge list of pictures</h2>
        <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-parch">
          Tell the text engine what you need and it writes{" "}
          <span className="text-cream">rich prompts + automatic negative prompts</span> for you. No text engine? Paste a
          list, upload a CSV, or use the offline idea mill. Then hand the list to the wizard.
        </p>
      </header>

      {/* world */}
      <section className="mb-6">
        <p className="mb-2 font-mono text-[10px] tracking-[0.22em] text-dust uppercase">
          the world these pictures live in <span className="text-dust/60">· shapes the prompts, the negatives and the filenames</span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {KINDS.map((k) => (
            <button
              key={k.id}
              onClick={() => setKindId(k.id)}
              title={k.blurb}
              className={`btn-press rounded-lg border px-2.5 py-1.5 font-mono text-[11px] transition ${
                kindId === k.id ? "border-potion/60 bg-potion/12 text-potion" : "border-line bg-panel/50 text-parch hover:border-line2"
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>
        {kind.tag && (
          <p className="mt-2 font-mono text-[10.5px] text-dust">
            filenames will carry the tag <span className="text-potion">{kind.tag}_</span> — e.g.{" "}
            <span className="text-cream">item_{kind.tag}_healing_flask.png</span>
          </p>
        )}
      </section>

      {/* input modes */}
      <div className="mb-4 flex gap-1.5">
        {(
          [
            { id: "write", label: "✒ write with AI", },
            { id: "paste", label: "📋 paste a list" },
            { id: "file", label: "⇪ upload CSV / TXT" },
          ] as { id: typeof mode; label: string }[]
        ).map((m) => (
          <button data-tip={m.id === "write" ? "The AI writes a list of picture descriptions for you from a theme." : m.id === "paste" ? "Paste a list you already have and turn it into rows." : "Load a list from a CSV or TXT file (a plain spreadsheet or text file)."}
            key={m.id}
            onClick={() => setMode(m.id)}
            className={`btn-press rounded-lg border px-3.5 py-2 text-[12.5px] font-semibold transition ${
              mode === m.id ? "border-ember/60 bg-ember/12 text-ember" : "border-line bg-panel/50 text-parch hover:border-line2"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === "write" && (
        <div className="rise-in rounded-2xl border border-line bg-panel/50 p-5">
          <div className="grid gap-3 sm:grid-cols-[1fr_120px_auto]">
            <div>
              <label className="mb-1 block font-mono text-[10px] tracking-[0.2em] text-dust uppercase">theme</label>
              <input data-tip="What the pictures are about, for example a harbour district. The AI writes ideas that fit it." value={theme} onChange={(e) => setTheme(e.target.value)} placeholder={kind.id === "none" ? "e.g. a harbour district" : "e.g. the night market"} className={field} />
            </div>
            <div>
              <label className="mb-1 block font-mono text-[10px] tracking-[0.2em] text-dust uppercase">how many</label>
              <input data-tip="How many picture ideas to write, from 1 to 40." type="number" min={1} max={40} value={count} onChange={(e) => setCount(Math.max(1, Math.min(40, Number(e.target.value) || 1)))} className={field} />
            </div>
            <div className="flex items-end gap-2">
              <Btn data-tip="Your text AI writes the picture descriptions. It needs a text engine set up in Settings." variant="primary" onClick={runAi} disabled={busy || !settings.scribe.key.trim()}>
                <IWand size={13} /> {busy ? "writing…" : "Write prompts"}
              </Btn>
              <Btn onClick={runOffline} disabled={busy} title="no text engine needed">
                <IRetry size={13} /> idea mill
              </Btn>
            </div>
          </div>
          {!settings.scribe.key.trim() && (
            <p className="mt-3 rounded-lg border border-potion/30 bg-potion/6 px-3 py-2 text-[12px] text-parch">
              No text-engine key yet — set one in <span className="text-cream">Settings → Text engines</span>, or use the{" "}
              <span className="text-cream">idea mill</span> right now. It works offline.
            </p>
          )}
          {error && <p className="mt-3 rounded-lg border border-ember/35 bg-ember/8 px-3 py-2 text-[12px] text-ember">{error}</p>}
        </div>
      )}

      {mode === "paste" && (
        <div className="rise-in rounded-2xl border border-line bg-panel/50 p-5">
          <p className="mb-2 text-[12.5px] text-parch">
            One picture per line. Formats: <span className="font-mono text-[11px] text-cream">a healing potion</span> ·{" "}
            <span className="font-mono text-[11px] text-cream">item_potion.png | a healing potion | no text</span> ·{" "}
            <span className="font-mono text-[11px] text-cream">shop_forge.png → the forge at dawn → no smoke</span>
          </p>
          <textarea data-tip="Paste your list here, one picture per line. Put a bar between the file name, the description and what to avoid." value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={6} placeholder={"the forge at dawn\nitem_rope.png | fifty feet of hempen rope\nshop_tavern.png | a tavern called The Tipsy Griffin | no neon"} className={field + " resize-y font-mono text-[12px]"} />
          <div className="mt-3">
            <Btn data-tip="Turns each line you pasted into a row in the list below." variant="primary" onClick={parsePaste} disabled={!pasteText.trim()}>
              <ICheck size={13} /> Turn into rows
            </Btn>
          </div>
        </div>
      )}

      {mode === "file" && (
        <div className="rise-in rounded-2xl border border-dashed border-line2 bg-panel/30 p-8 text-center">
          <IUpload size={22} className="mx-auto text-dust" />
          <p className="mt-3 text-[13.5px] text-parch">
            A CSV with <span className="font-mono text-[11.5px] text-cream">filename, prompt, negative_prompt, category</span>{" "}
            — or a plain text file with one prompt per line.
          </p>
          <input ref={fileRef} type="file" accept=".csv,.txt,text/csv,text/plain" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          <div className="mt-4">
            <Btn data-tip="Pick a CSV or TXT file from your computer to load as a list." variant="primary" onClick={() => fileRef.current?.click()}>
              Choose file…
            </Btn>
          </div>
        </div>
      )}

      {/* the list */}
      {items.length > 0 && (
        <section className="mt-8">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-lg text-cream">
              The list <span className="font-mono text-[11px] text-moss">· {valid} ready</span>
            </h3>
            <div className="flex gap-2">
              <Btn data-tip="Adds one empty row to the list so you can type it in yourself." onClick={addManual}>
                <IPlus size={13} /> Add row
              </Btn>
              <Btn onClick={() => void copyForSheets()} disabled={valid === 0} title="Copy the list, then paste it into Google Sheets — the columns land in place">
                Copy for Google Sheets
              </Btn>
              <Btn data-tip="Saves this list as an Excel file you can open in a spreadsheet." onClick={() => void exportXlsx()} disabled={valid === 0}>
                Excel
              </Btn>
              <Btn data-tip="Saves this list as a CSV file, a simple table that any spreadsheet can open." onClick={exportCsv} disabled={valid === 0}>
                <IWand size={12} /> CSV
              </Btn>
            </div>
          </div>
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[780px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line bg-[var(--color-field)] font-mono text-[9.5px] tracking-[0.18em] text-dust uppercase">
                  <th className="px-3.5 py-2.5 font-medium w-[24%]">filename</th>
                  <th className="px-3.5 py-2.5 font-medium w-[8%]">cat</th>
                  <th className="px-3.5 py-2.5 font-medium w-[34%]">prompt</th>
                  <th className="px-3.5 py-2.5 font-medium w-[28%]">negative prompt</th>
                  <th className="px-3.5 py-2.5 font-medium w-[6%]"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => {
                  const cat: Category = it.category ?? "image";
                  return (
                    <tr key={i} className="border-b border-line/60 align-top transition-colors last:border-0 hover:bg-raise/30">
                      <td className="px-3.5 py-2.5">
                        <input data-tip="The file name this picture will be saved under." value={it.filename} onChange={(e) => patch(i, { filename: e.target.value })} className={field + " font-mono text-[11px]"} />
                      </td>
                      <td className="px-3.5 py-3">
                        <select data-tip="What kind of picture this is. Changing it also fixes the start of the file name to match." value={cat} onChange={(e) => patch(i, { category: e.target.value as Category, filename: autoFixFilename(it.filename, e.target.value as Category) })} className={field + " w-[92px] font-mono text-[11px]"}>
                          {CATEGORIES.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                        <div className="mt-1.5">
                          <CatChip category={cat} />
                        </div>
                      </td>
                      <td className="px-3.5 py-2.5">
                        <textarea data-tip="What this picture should show." value={it.prompt} onChange={(e) => patch(i, { prompt: e.target.value })} rows={2} className={field + " resize-y"} placeholder="what should the picture show…" />
                      </td>
                      <td className="px-3.5 py-2.5">
                        <textarea data-tip="Things this picture must not show. Leave it empty if there is nothing to avoid." value={it.negative_prompt ?? ""} onChange={(e) => patch(i, { negative_prompt: e.target.value || undefined })} rows={2} placeholder={kind.negative} className={field + " resize-y text-blood/80"} />
                      </td>
                      <td className="px-3.5 py-3">
                        <button onClick={() => remove(i)} className="btn-press rounded-md p-1.5 text-dust hover:bg-blood/15 hover:text-blood" title="remove">
                          <ITrash size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 font-mono text-[10.5px] text-dust">
            <IX size={0} className="hidden" /> auto negatives follow the world — editing a negative keeps your words
            {styleBlock ? ` · the “${styleId}” style block is appended when the batch is arranged` : " · the wizard appends the style block"}
          </p>
        </section>
      )}
    </div>
  );
}
