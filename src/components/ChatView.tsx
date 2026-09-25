/**
 * One picture at a time, by talking.
 *
 * The manifest is the right tool for a hundred pictures and the wrong one for
 * your first. This is the front door: say what you want, get asked at most a
 * couple of questions, and end up with a picture — plus a button to drop it
 * into the manifest when one turns into forty.
 *
 * It does NOT generate anything itself. It produces a validated plan and hands
 * it to the queue that already exists, which is how it inherits the paid
 * confirmation dialog, key rotation, cooldowns, folder saving and the manifest
 * without reimplementing any of them. A second generation path would be a
 * second place for money to leak.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ForgeSettings } from "../lib/providers";
import { scribeChat } from "../lib/providers";
import { CHAT_SYSTEM } from "../lib/appFacts";
import { filterModels, listChatModels, probeChatModels } from "../lib/visionEngine";
import { manifestDigest, modelListForPrompt, parseReply, styleListForPrompt, usableModels, type ChatPlan, type EditPreview, type RowEdit } from "../lib/chatPlan";
import { styleById } from "../lib/styleCatalogue";
import { MODELS } from "../lib/engines.mjs";
import type { ManifestRow, Toast } from "../types";
import { Btn, IAlert, IPlay, ISparkle, ITrash } from "./ui";
import { Stagger, type MotionLevel } from "./motion";
import {
  groupChats,
  loadChats,
  newChatId,
  saveChats,
  titleFrom,
  type Conversation,
} from "../lib/chatStore";

import type { StoredTurn as Turn } from "../lib/chatStore";

/**
 * The kinds of thing worth asking for, shown rather than hidden in a menu.
 *
 * Written as the request a person would actually type, so pressing one both
 * starts the job AND teaches what this box accepts. Nothing is sent until
 * Send is pressed, so the wording stays yours to change.
 */
const STARTERS: { label: string; seed: string; hint: string }[] = [
  {
    label: "A picture",
    seed: "I want one picture: ",
    hint: "One picture, start to finish — it helps you choose a look and an engine",
  },
  {
    label: "A whole set",
    seed: "I want a set of pictures, all matching: ",
    hint: "Many pictures at once, written into the manifest for you to check before running",
  },
  {
    label: "Something animated",
    seed: "I want something animated: ",
    hint: "A character that moves or talks, an animated icon, or a GIF from a picture",
  },
  {
    label: "Fix what I have",
    seed: "Look at my manifest and ",
    hint: "Rewrite prompts, fix filenames, change styles on rows you already have",
  },
];

const OPENERS = [
  "a cosy village bakery at dawn",
  "a rain-slick neon noodle stall",
  "a worn leather-bound spellbook on a desk",
  "how do I get a free engine working?",
];

export default function ChatView({
  settings,
  rows,
  motion,
  onForge,
  onAddRows,
  onEditRows,
  onOpenSettings,
  seed,
  onSeedUsed,
  pushToast,
}: {
  settings: ForgeSettings;
  rows: ManifestRow[];
  motion: MotionLevel;
  /** adds a row and runs it; resolves with the row id */
  onForge: (plan: ChatPlan) => Promise<number | null>;
  /** puts a whole list into the manifest without running it; returns how many */
  onAddRows: (plans: ChatPlan[]) => Promise<number>;
  /** applies changes to rows that already exist; returns how many changed */
  onEditRows: (edits: RowEdit[]) => Promise<number>;
  onOpenSettings: () => void;
  /** a request handed in from elsewhere, e.g. "improve row 4" */
  seed?: string;
  onSeedUsed?: () => void;
  pushToast: (kind: Toast["kind"], msg: string) => void;
}) {
  const [chats, setChats] = useState<Conversation[]>(() => loadChats());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [groupBy, setGroupBy] = useState<"date" | "model">("date");
  // Which text model answers. Stored per conversation, which is what makes
  // "group by model" in the sidebar mean anything.
  const [chatModel, setChatModel] = useState(settings.scribe.model);
  const [modelChoices, setModelChoices] = useState<string[]>([]);
  // "" means let the chat choose. Anything else overrides it, for when you
  // already know which engine you want and would rather not argue about it.
  const [imageModel, setImageModel] = useState("");
  /** Models confirmed to answer, once you ask. null = not checked yet. */
  const [working, setWorking] = useState<string[] | null>(null);
  const [probing, setProbing] = useState<{ done: number; total: number } | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  /**
   * The id of the conversation being written to, tracked synchronously.
   *
   * State is not enough here: the first message creates a conversation and the
   * reply arrives before React has committed setActiveId, so both writes read
   * activeId as null and each created its own conversation — one holding the
   * question, one holding the answer. A ref settles immediately.
   */
  const writingTo = useRef<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [forging, setForging] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const ready = Boolean(settings.scribe.key.trim());
  const active = chats.find((c) => c.id === activeId) ?? null;
  // Selecting from the sidebar, or starting fresh, must move the write target
  // too — otherwise the next message lands in the previous conversation.
  useEffect(() => {
    writingTo.current = activeId;
  }, [activeId]);
  const turns: Turn[] = active?.turns ?? [];

  // Written on every change rather than on unmount: a browser tab that is
  // closed mid-conversation should not lose it.
  useEffect(() => saveChats(chats), [chats]);

  // Ask the endpoint what it actually has, rather than shipping a list that
  // goes stale. Failing is fine — the configured model still works.
  useEffect(() => {
    let alive = true;
    if (!settings.scribe.key.trim()) return;
    void listChatModels(settings.scribe).then((r) => {
      if (!alive) return;
      // Endpoints list everything they serve, including things that cannot
      // hold a conversation at all. Offering an embedding model as a chat
      // model is a guaranteed confusing failure.
      //
      // This used to be a regex over the model name. It is now the
      // provider's own answer where the provider gives one, falling back to
      // reading the name only where it does not — see filterModels.
      if (r.ok) setModelChoices(filterModels(r.models).map((m) => m.id));
    });
    return () => {
      alive = false;
    };
  }, [settings.scribe]);

  useEffect(() => setChatModel(settings.scribe.model), [settings.scribe.model]);

  /**
   * Grow the box with the text, up to half the panel. Past that it scrolls:
   * an input that eats the conversation it belongs to is worse than one that
   * is slightly too small.
   */
  const resize = useCallback(() => {
    const ta = taRef.current;
    if (!ta) return;
    const cap = Math.max(96, Math.round((shellRef.current?.clientHeight ?? 600) * 0.5));
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, cap)}px`;
    ta.style.overflowY = ta.scrollHeight > cap ? "auto" : "hidden";
  }, []);

  useEffect(resize, [draft, resize]);

  // Something elsewhere in the app asked the chat to look at a row. Start a
  // fresh conversation with the request written out, but do not send it — the
  // wording is still theirs to change.
  useEffect(() => {
    if (!seed) return;
    writingTo.current = null;
    setActiveId(null);
    setDraft(seed);
    onSeedUsed?.();
    setTimeout(() => taRef.current?.focus(), 0);
  }, [seed, onSeedUsed]);

  /** Update the open conversation, creating one on the first thing said. */
  const writeTurns = useCallback(
    (make: (prev: Turn[]) => Turn[], firstSaid?: string) => {
      const id = writingTo.current ?? newChatId();
      writingTo.current = id;
      setChats((prev) => {
        const now = Date.now();
        const existing = prev.find((c) => c.id === id);
        if (!existing) {
          const created: Conversation = {
            id,
            title: titleFrom(firstSaid ?? ""),
            model: chatModel || settings.scribe.model || "unknown model",
            createdAt: now,
            updatedAt: now,
            turns: make([]),
          };
          setActiveId(id);
          return [created, ...prev];
        }
        return prev.map((c) =>
          c.id === existing.id ? { ...c, updatedAt: now, turns: make(c.turns) } : c
        );
      });
    },
    [chatModel, settings.scribe.model]
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: motion === "off" ? "auto" : "smooth", block: "end" });
  }, [turns, motion]);

  const send = useCallback(
    async (text: string) => {
      const said = text.trim();
      if (!said || busy) return;
      setDraft("");
      const history: Turn[] = [...turns, { who: "you", text: said }];
      writeTurns(() => history, said);
      setBusy(true);
      try {
        // The whole conversation goes each time. These are short exchanges and
        // a model that forgets what you asked two lines ago is worse than
        // useless for this.
        const transcript = history
          .map((t) => `${t.who === "you" ? "User" : "You"}: ${t.text}`)
          .join("\n\n");
        // The manifest goes with the request, so the chat can change rows
        // that already exist rather than only inventing new ones.
        const reply = await scribeChat(
          { ...settings.scribe, model: chatModel || settings.scribe.model },
          `${CHAT_SYSTEM(styleListForPrompt(), modelListForPrompt())}

THE MANIFEST RIGHT NOW
${manifestDigest(rows)}`,
          transcript
        );
        const parsed = parseReply(reply, settings, rows);
        // An explicit choice in the dropdown beats whatever the chat picked.
        const forced = (p: ChatPlan): ChatPlan => (imageModel ? { ...p, model: imageModel } : p);
        const plan = parsed.plan ? forced(parsed.plan) : null;
        const newRows = parsed.rows ? parsed.rows.map(forced) : null;
        writeTurns((prev) => [
          ...prev,
          {
            who: "forge",
            text: parsed.say || "…",
            plan,
            rows: newRows,
            edits: parsed.edits,
            previews: parsed.previews,
            corrections: parsed.corrections,
          },
        ]);
      } catch (e) {
        const why = (e as { message?: string })?.message ?? "it did not answer";
        writeTurns((prev) => [
          ...prev,
          { who: "forge", text: `I could not reach the text model — ${why}. Check Settings → Text engines.` },
        ]);
      } finally {
        setBusy(false);
      }
    },
    [busy, settings, turns, writeTurns, chatModel, imageModel, rows]
  );

  const forge = useCallback(
    async (plan: ChatPlan, turnIndex: number) => {
      setForging(true);
      try {
        const id = await onForge(plan);
        if (id !== null) {
          writeTurns((prev) => prev.map((t, i) => (i === turnIndex ? { ...t, rowId: id } : t)));
        }
      } catch (e) {
        pushToast("err", (e as { message?: string })?.message ?? "could not make that picture");
      } finally {
        setForging(false);
      }
    },
    [onForge, pushToast, writeTurns]
  );

  /** Start a new conversation, optionally with the request already begun. */
  const startFresh = useCallback((seed: string) => {
    writingTo.current = null;
    setActiveId(null);
    setDraft(seed);
    // Put the cursor where they will carry on typing.
    setTimeout(() => {
      const ta = taRef.current;
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    }, 0);
  }, []);

  const checkModels = useCallback(async () => {
    const list = modelChoices.length > 0 ? modelChoices : [settings.scribe.model].filter(Boolean);
    setProbing({ done: 0, total: list.length });
    const results = await probeChatModels(settings.scribe, list, (done, total) => setProbing({ done, total }));
    const ok = results.filter((r) => r.ok).map((r) => r.model);
    setWorking(ok);
    setProbing(null);
    if (ok.length > 0 && !ok.includes(chatModel)) setChatModel(ok[0]);
    pushToast(
      ok.length > 0 ? "ok" : "err",
      ok.length > 0
        ? `${ok.length} of ${list.length} models answered. The list now shows only those.`
        : "None of them answered. Check the key in Settings → Text engines."
    );
  }, [modelChoices, settings.scribe, chatModel, pushToast]);

  const applyEdits = useCallback(
    async (edits: RowEdit[], turnIndex: number) => {
      setForging(true);
      try {
        const n = await onEditRows(edits);
        writeTurns((prev) => prev.map((t, i) => (i === turnIndex ? { ...t, editsApplied: true } : t)));
        pushToast("ok", `${n} row${n === 1 ? "" : "s"} changed.`);
      } catch (e) {
        pushToast("err", (e as { message?: string })?.message ?? "could not change those rows");
      } finally {
        setForging(false);
      }
    },
    [onEditRows, pushToast, writeTurns]
  );

  const addMany = useCallback(
    async (plans: ChatPlan[], turnIndex: number) => {
      setForging(true);
      try {
        const n = await onAddRows(plans);
        writeTurns((prev) => prev.map((t, i) => (i === turnIndex ? { ...t, addedCount: n } : t)));
        pushToast("ok", `${n} row${n > 1 ? "s" : ""} added to the manifest. Press Run queue when you are ready.`);
      } catch (e) {
        pushToast("err", (e as { message?: string })?.message ?? "could not add those");
      } finally {
        setForging(false);
      }
    },
    [onAddRows, pushToast, writeTurns]
  );

  if (!ready) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <h1 className="font-display text-3xl text-cream">Chat</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-parch">
          Describe a picture in your own words and this will help you choose a look, write the prompt, pick an engine
          and make it — one at a time. It can also answer questions about the app.
        </p>
        <div className="mt-5 rounded-xl border border-ember/40 bg-ember/10 p-4">
          <p className="text-[13px] text-cream">It needs a text model first.</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-parch">
            One free Mistral key covers writing, code and vision: add it once under Your accounts in Text engines,
            then pick a model for each job. The Start screen works without one.
          </p>
          <Btn variant="primary" className="mt-3" onClick={onOpenSettings}>
            Open Text engines
          </Btn>
        </div>
      </div>
    );
  }

  const groups = groupChats(chats, groupBy);

  return (
    <div className="flex h-full">
      {/* The list on the left, in the shape everyone already knows. */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-coal/50 md:flex">
        <div className="border-b border-line p-3">
          {/*
            One big button and four small ones, rather than a menu.
            A dropdown hides its own contents until you know to look, and the
            whole point of these is to show someone who has just arrived what
            this thing can be asked for. Each one starts a chat and puts the
            request in the box; it is not sent until you press Send, so you can
            still change it.
          */}
          <Btn
            variant="primary"
            className="w-full justify-center"
            onClick={() => startFresh("")}
          >
            <ISparkle size={12} /> New chat
          </Btn>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {STARTERS.map((st) => (
              <button
                key={st.label}
                onClick={() => startFresh(st.seed)}
                title={st.hint}
                className="rounded-lg border border-line bg-panel/50 px-2 py-1.5 text-left text-[11.5px] leading-tight text-parch transition hover:border-ember/50 hover:text-cream"
              >
                {st.label}
              </button>
            ))}
          </div>
          <div className="mt-2 flex gap-1">
            {(["date", "model"] as const).map((g) => (
              <button
                key={g}
                onClick={() => setGroupBy(g)}
                className={`flex-1 rounded-lg border px-2 py-1 font-mono text-[10px] tracking-wide uppercase transition ${
                  groupBy === g ? "border-ember/60 bg-ember/15 text-cream" : "border-line text-dust hover:text-parch"
                }`}
              >
                by {g}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {groups.length === 0 && <p className="px-1 py-2 text-[11.5px] text-dust">Nothing yet.</p>}
          {groups.map((g) => (
            <div key={g.label} className="mb-3">
              <p className="px-1.5 pb-1 font-mono text-[9.5px] tracking-[0.18em] text-dust uppercase">{g.label}</p>
              {g.items.map((c) => (
                <div key={c.id} className="group relative">
                  <button
                    onClick={() => {
                      writingTo.current = c.id;
                      setActiveId(c.id);
                    }}
                    className={`w-full truncate rounded-lg px-2 py-1.5 pr-7 text-left text-[12.5px] transition ${
                      c.id === activeId ? "bg-raise text-cream" : "text-parch hover:bg-raise/50 hover:text-cream"
                    }`}
                    title={c.title}
                  >
                    {c.title}
                  </button>
                  <button
                    onClick={() => {
                      setChats((prev) => prev.filter((x) => x.id !== c.id));
                      if (activeId === c.id) {
                        writingTo.current = null;
                        setActiveId(null);
                      }
                    }}
                    title="Delete this chat"
                    aria-label={`Delete ${c.title}`}
                    className="absolute top-1/2 right-1 -translate-y-1/2 rounded p-1 text-dust opacity-0 transition group-hover:opacity-100 hover:text-rust focus:opacity-100"
                  >
                    <ITrash size={11} />
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      </aside>

      <div ref={shellRef} className="mx-auto flex h-full min-w-0 max-w-3xl flex-1 flex-col p-6">
      <div className="mb-3">
        <h1 className="font-display text-2xl text-cream">{active ? active.title : "Chat"}</h1>
        <p className="mt-1 text-[12.5px] text-dust">
          One picture at a time. Ask about the app too — it answers from the manual, and says so when it does not know.
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {turns.length === 0 && (
          <Stagger level={motion} className="space-y-2">
            {OPENERS.map((o) => (
              <button
                key={o}
                onClick={() => void send(o)}
                className="w-full rounded-xl border border-line bg-panel/50 p-3 text-left text-[13px] text-parch transition hover:border-ember/50 hover:text-cream"
              >
                {o}
              </button>
            ))}
          </Stagger>
        )}

        {turns.map((t, i) => {
          const row = t.rowId !== undefined ? rows.find((r) => r.id === t.rowId) : undefined;
          return (
            <div key={i} className={t.who === "you" ? "flex justify-end" : ""}>
              <div
                className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap ${
                  t.who === "you" ? "bg-raise text-cream" : "border border-line bg-panel/60 text-parch"
                }`}
              >
                {t.text}

                {t.corrections && t.corrections.length > 0 && (
                  <div className="mt-2 rounded-lg border border-ember/40 bg-ember/10 p-2">
                    {t.corrections.map((c) => (
                      <p key={c} className="flex gap-1.5 text-[11.5px] text-parch">
                        <IAlert size={12} className="mt-0.5 shrink-0 text-ember" />
                        {c}
                      </p>
                    ))}
                  </div>
                )}

                {t.plan && (
                  <ProposalCard
                    plan={t.plan}
                    row={row}
                    busy={forging}
                    onForge={() => void forge(t.plan!, i)}
                  />
                )}

                {t.previews && t.previews.length > 0 && (
                  <EditCard
                    previews={t.previews}
                    applied={t.editsApplied}
                    busy={forging}
                    onApply={() => void applyEdits(t.edits!, i)}
                  />
                )}

                {t.rows && t.rows.length > 0 && (
                  <BatchCard
                    rows={t.rows}
                    added={t.addedCount}
                    busy={forging}
                    onAdd={() => void addMany(t.rows!, i)}
                  />
                )}
              </div>
            </div>
          );
        })}

        {busy && <p className="font-mono text-[11.5px] text-dust">thinking…</p>}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft);
        }}
        className="mt-3 rounded-xl border border-line bg-[var(--color-field)] p-2"
      >
        <textarea
          ref={taRef}
          rows={3}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter makes a new line — the convention
            // everywhere, and the reason this is a textarea at all.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(draft);
            }
          }}
          placeholder="describe a picture, or ask about the app…&#10;Enter to send · Shift+Enter for a new line"
          className="block w-full resize-none bg-transparent px-1.5 py-1 text-[13.5px] leading-relaxed text-cream placeholder:text-dust/60 focus:outline-none"
        />
        <div className="mt-1.5 flex items-center gap-2 border-t border-line/60 pt-1.5">
          <label className="sr-only" htmlFor="chat-model">
            Which model answers
          </label>
          <select
            id="chat-model"
            value={chatModel}
            onChange={(e) => setChatModel(e.target.value)}
            title="Which text model answers. Switching starts the next chat on it."
            className="min-w-0 flex-1 truncate rounded-lg border border-line bg-panel/60 px-2 py-1.5 font-mono text-[11px] text-parch"
          >
            {(working ?? (modelChoices.length > 0 ? modelChoices : [settings.scribe.model].filter(Boolean))).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="image-model">
            Which engine paints
          </label>
          <select
            id="image-model"
            value={imageModel}
            onChange={(e) => setImageModel(e.target.value)}
            title="Which engine paints the picture. Leave on “chat decides” and it will pick one that suits the style, preferring free."
            className="min-w-0 flex-1 truncate rounded-lg border border-line bg-panel/60 px-2 py-1.5 font-mono text-[11px] text-parch"
          >
            <option value="">Auto image engine</option>
            {usableModels(settings).map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} {m.priceUsd ? `· $${m.priceUsd.toFixed(3)}` : "· free"}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void checkModels()}
            disabled={!!probing}
            title={
              working
                ? `Showing the ${working.length} models that answered. Press again to re-check.`
                : "Say hi to every model on this endpoint and keep only the ones that answer. An endpoint lists what it SERVES, not what your key may use."
            }
            className="shrink-0 rounded-lg border border-line bg-panel/60 px-2 py-1.5 font-mono text-[10px] text-dust transition hover:text-cream disabled:opacity-50"
          >
            {probing ? `${probing.done}/${probing.total}` : working ? `${working.length} work` : "check"}
          </button>
          <Btn variant="primary" disabled={busy || !draft.trim()}>
            <ISparkle size={13} /> Send
          </Btn>
        </div>
      </form>
      </div>
    </div>
  );
}

/**
 * What would change, before it changes.
 *
 * The Scribe used to do this one row at a time behind a button whose label
 * was the word "scribe". The important part is not that it is now in the chat
 * — it is that a rewrite of eleven prompts is shown as eleven before-and-
 * afters and applied on a button, rather than happening and being discovered.
 */
function EditCard({
  previews,
  applied,
  busy,
  onApply,
}: {
  previews: EditPreview[];
  applied?: boolean;
  busy: boolean;
  onApply: () => void;
}) {
  const total = previews.reduce((n, p) => n + p.changes.length, 0);
  return (
    <div className="mt-2.5 rounded-xl border border-potion/40 bg-potion/5 p-3">
      <p className="text-[12.5px] text-cream">
        {total} change{total === 1 ? "" : "s"} across {previews.length} row{previews.length === 1 ? "" : "s"}
      </p>
      <div className="mt-2 max-h-72 space-y-2 overflow-y-auto">
        {previews.map((p) => (
          <div key={p.id} className="rounded-lg border border-line bg-[var(--color-field)]/70 p-2">
            <p className="font-mono text-[10.5px] text-dust">
              #{p.id} {p.filename}
            </p>
            {p.changes.map((c) => (
              <div key={c.field} className="mt-1">
                <p className="font-mono text-[9.5px] tracking-wide text-dust uppercase">{c.field}</p>
                <p className="text-[11.5px] leading-snug text-rust/90 line-through decoration-rust/40">
                  {c.from || "(empty)"}
                </p>
                <p className="text-[11.5px] leading-snug text-moss">{c.to}</p>
              </div>
            ))}
          </div>
        ))}
      </div>
      {applied ? (
        <p className="mt-2 font-mono text-[10.5px] text-moss">✓ applied to the manifest</p>
      ) : (
        <Btn className="mt-2.5" disabled={busy} onClick={onApply}>
          {busy ? "changing…" : `Apply ${total === 1 ? "this change" : "these changes"}`}
        </Btn>
      )}
    </div>
  );
}

/**
 * A whole list, when many were asked for at once.
 *
 * Deliberately does NOT run them. Forty pictures is exactly when you want to
 * read the list first, change your mind about three of them, and press Run
 * yourself — not discover afterwards what it decided to spend.
 */
function BatchCard({
  rows,
  added,
  busy,
  onAdd,
}: {
  rows: ChatPlan[];
  added?: number;
  busy: boolean;
  onAdd: () => void;
}) {
  const [open, setOpen] = useState(false);
  const model = MODELS.find((m) => m.id === rows[0]?.model);
  const each = model?.priceUsd ?? 0;
  const total = each * rows.length;

  return (
    <div className="mt-2.5 rounded-xl border border-line2 bg-[var(--color-field)]/70 p-3">
      <p className="text-[12.5px] text-cream">
        {rows.length} pictures{" "}
        <span className="text-dust">
          · {styleById(rows[0].style)?.name ?? rows[0].style} · {model?.label ?? rows[0].model}
        </span>
      </p>
      <p className="mt-1 text-[11.5px] text-dust">
        {total > 0 ? `About $${total.toFixed(2)} to make them all — you will be asked before anything is spent.` : "Free to make."}
      </p>

      <button onClick={() => setOpen((o) => !o)} className="mt-1.5 text-[11.5px] text-ember underline">
        {open ? "hide the list" : "read the list first"}
      </button>
      {open && (
        <ol className="mt-1.5 max-h-56 list-decimal overflow-y-auto pl-5 text-[11.5px] leading-relaxed text-dust">
          {rows.map((r, i) => (
            <li key={i}>{r.prompt}</li>
          ))}
        </ol>
      )}

      {added !== undefined ? (
        <p className="mt-2 font-mono text-[10.5px] text-moss">✓ {added} added to the manifest — press Run queue there</p>
      ) : (
        <Btn className="mt-2.5" disabled={busy} onClick={onAdd}>
          {busy ? "adding…" : "Add all to the manifest"}
        </Btn>
      )}
    </div>
  );
}

/** What it wants to make, shown before anything is spent. */
function ProposalCard({
  plan,
  row,
  busy,
  onForge,
}: {
  plan: ChatPlan;
  row?: ManifestRow;
  busy: boolean;
  onForge: () => void;
}) {
  const style = styleById(plan.style);
  const model = MODELS.find((m) => m.id === plan.model);
  const free = !model || model.priceUsd === 0 || model.priceUsd === null;

  return (
    <div className="mt-2.5 rounded-xl border border-line2 bg-[var(--color-field)]/70 p-3">
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="rounded-full border border-line px-2 py-0.5 text-parch">{style?.name ?? plan.style}</span>
        <span className="rounded-full border border-line px-2 py-0.5 text-parch">{plan.aspect}</span>
        <span className={`rounded-full border px-2 py-0.5 ${free ? "border-moss/50 text-moss" : "border-ember/50 text-ember"}`}>
          {model?.label ?? plan.model} · {free ? "free" : `$${model?.priceUsd?.toFixed(3)}`}
        </span>
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-dust italic">“{plan.prompt}”</p>

      {row?.status === "done" && row.preview ? (
        <div className="mt-2.5">
          {row.preview.trimStart().startsWith("<svg") ? (
            <div className="overflow-hidden rounded-lg border border-line" dangerouslySetInnerHTML={{ __html: row.preview }} />
          ) : (
            <img src={row.preview} alt={plan.prompt} className="develop w-full rounded-lg border border-line" />
          )}
          <p className="mt-1.5 font-mono text-[10.5px] text-moss">✓ made · it is row “{row.filename}” in the manifest</p>
        </div>
      ) : row?.status === "failed" ? (
        <p className="mt-2 text-[12px] text-rust">✗ {row.error || "it did not work"}</p>
      ) : row ? (
        <p className="mt-2 font-mono text-[11.5px] text-ember">forging…</p>
      ) : (
        <Btn variant="primary" className="mt-2.5" disabled={busy} onClick={onForge}>
          <IPlay size={12} /> {busy ? "forging…" : free ? "Make it — free" : "Make it"}
        </Btn>
      )}
    </div>
  );
}
