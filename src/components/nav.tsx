/**
 * The main navigation.
 *
 * What was here before: four dropdowns covering ten views, with Settings
 * appearing twice — once as a dropdown of nine sections and again as a button
 * beside it. Nothing was visible until you clicked, and the two Settings
 * routes went to different places.
 *
 * The structural fix matters more than the animation:
 *
 *   · five destinations in a pill row, always visible
 *   · Settings is a utility, not a destination — it is an icon on the right,
 *     once, and its nine sections live in its own sidebar where there is room
 *     to label them
 *   · the two groups that genuinely need explaining (Wizards, Library) open a
 *     card panel, because their items were always title-plus-description and
 *     a cramped dropdown was the wrong shape for that
 *
 * Then the motion: an indicator that slides between pills rather than
 * appearing under the new one. It is measured from the live DOM, so it stays
 * correct when labels change length or the row wraps — and it is skipped
 * entirely when motion is reduced, landing on the finished position at once.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { shouldSkipMotion, type MotionLevel } from "./motion";

/* ---------------- pill row ---------------- */

export interface PillItem {
  id: string;
  label: string;
  /** shown as a small count on the pill */
  badge?: string;
  /**
   * True when clicking opens a panel rather than going somewhere.
   *
   * Some of these open a list and some are a destination, and there was no way
   * to tell which without clicking. A chevron on the ones that open is the
   * convention everywhere; the important part is that it is present on all of
   * them or none, never some.
   */
  opens?: boolean;
}

export function PillNav({
  items,
  activeId,
  onPick,
  level = "full",
}: {
  items: PillItem[];
  activeId: string;
  onPick: (id: string) => void;
  level?: MotionLevel;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ left: number; width: number } | null>(null);
  const [ready, setReady] = useState(false);

  const measure = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const el = wrap.querySelector<HTMLElement>(`[data-pill="${CSS.escape(activeId)}"]`);
    if (!el) {
      setBox(null);
      return;
    }
    setBox({ left: el.offsetLeft, width: el.offsetWidth });
  }, [activeId]);

  // Measured before paint so the indicator never flashes at the wrong width.
  useLayoutEffect(measure, [measure, items]);

  useEffect(() => {
    // The first placement should not animate in from zero.
    const t = setTimeout(() => setReady(true), 60);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    if (wrapRef.current) ro.observe(wrapRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  const still = shouldSkipMotion(level);

  return (
    <div ref={wrapRef} className="relative flex items-center gap-0.5 rounded-xl border border-line bg-[var(--color-field)]/70 p-1">
      {box && (
        <span
          aria-hidden
          className="absolute top-1 bottom-1 rounded-lg bg-raise"
          style={{
            left: box.left,
            width: box.width,
            transition: still || !ready ? "none" : "left 0.34s cubic-bezier(0.22, 1, 0.36, 1), width 0.34s cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        />
      )}
      {items.map((it) => {
        const active = it.id === activeId;
        return (
          <button data-tip={it.opens ? `Opens the ${it.label} menu.` : `Goes to ${it.label}.`}
            key={it.id}
            data-pill={it.id}
            onClick={() => onPick(it.id)}
            aria-current={active ? "page" : undefined}
            className={`relative z-10 rounded-lg px-3 py-1.5 text-[13px] whitespace-nowrap transition-colors ${
              active ? "text-cream" : "text-dust hover:text-parch"
            }`}
          >
            {it.label}
            {it.badge && (
              <span className="ml-1.5 rounded-full bg-ember/20 px-1.5 font-mono text-[9.5px] text-ember">{it.badge}</span>
            )}
            {it.opens && (
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                className={`ml-1 inline-block h-2.5 w-2.5 opacity-60 transition-transform ${active ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------- card panel ---------------- */

export interface NavCard {
  id: string;
  title: string;
  hint?: string;
  icon: ReactNode;
  badge?: string;
  onPick: () => void;
}

/**
 * A panel of labelled cards, for the groups whose items need a sentence to
 * explain them. Closes on Escape and on a click outside, because a panel you
 * cannot dismiss with the keyboard is a trap.
 */
export function CardPanel({
  cards,
  onClose,
  level = "full",
}: {
  cards: NavCard[];
  onClose: () => void;
  level?: MotionLevel;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const still = shouldSkipMotion(level);

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const away = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("keydown", key);
    // A frame late, so the click that opened this does not immediately close it.
    const t = setTimeout(() => document.addEventListener("mousedown", away), 0);
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("mousedown", away);
      clearTimeout(t);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      className={`absolute top-full left-0 z-50 mt-2 w-[min(30rem,calc(100vw-2rem))] rounded-xl border border-line bg-panel p-2 shadow-2xl ${
        still ? "" : "stagger-in"
      }`}
    >
      <div className="grid gap-1 sm:grid-cols-2">
        {cards.map((c, i) => (
          <button data-tip={c.hint ? `${c.title}: ${c.hint}` : `Opens ${c.title}.`}
            key={c.id}
            role="menuitem"
            onClick={() => {
              c.onPick();
              onClose();
            }}
            style={still ? undefined : { animationDelay: `${Math.min(i, 6) * 35}ms` }}
            className={`group flex items-start gap-2.5 rounded-lg border border-transparent p-2.5 text-left transition hover:border-line2 hover:bg-raise/60 ${
              still ? "" : "stagger-in"
            }`}
          >
            <span className="mt-0.5 shrink-0 text-dust transition-colors group-hover:text-ember">{c.icon}</span>
            <span className="min-w-0">
              <span className="flex items-center gap-1.5">
                <span className="text-[13px] text-cream">{c.title}</span>
                {c.badge && (
                  <span className="rounded-full bg-ember/20 px-1.5 font-mono text-[9.5px] text-ember">{c.badge}</span>
                )}
              </span>
              {c.hint && <span className="mt-0.5 block text-[11.5px] leading-snug text-dust">{c.hint}</span>}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
