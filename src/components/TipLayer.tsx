// ---------------------------------------------------------------------------
// The hover help, for the whole window — THE SAME FILE in both forges (Video
// Forge src/components/ui/TipLayer.tsx, Image Forge src/components/TipLayer.tsx).
// Change one, copy it to the other.
//
// Ak, 13 Oct 2026: every choice on every page gets a bubble explaining it like
// to a five-year-old; it goes in front of EVERYTHING in the app (only the
// cursor is above it); a long explanation is two sentences and a link to the
// docs; no click is naked.
//
// How a control asks for one:
//   data-tip="Two short sentences at most."
//   data-tip-more="https://…"        optional: the "More about this" link
//   title="…"                         also works: it is turned into a bubble
//                                     (and the browser's own grey one is
//                                     switched off) the first time it is hovered
// The nearest element up the tree that has one wins, so a wrapper can explain
// everything inside it.
//
// The bubble is fixed to the window and drawn last in <body>, so no scrolling
// panel can clip it and no dialog can cover it. It waits a moment before
// showing, and stays while the pointer moves into it — so its link can be
// clicked.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface Tip {
  text: string;
  more: string | null;
  left: number;
  top: number;
  above: boolean;
}

const SHOW_AFTER_MS = 280;
const HIDE_AFTER_MS = 160;
const WIDTH = 300;

/** The explanation an element carries, moving a title= into data-tip once. */
function tipOf(el: Element): string | null {
  const t = el.getAttribute("title");
  if (t && !el.hasAttribute("data-tip")) {
    el.setAttribute("data-tip", t);
    el.removeAttribute("title");
  } else if (t) {
    el.removeAttribute("title");
  }
  return el.getAttribute("data-tip");
}

export function TipLayer() {
  const [tip, setTip] = useState<Tip | null>(null);
  const overBubble = useRef(false);
  // Once one bubble is up, moving to the next control shows its bubble at once.
  const showing = useRef(false);
  showing.current = tip !== null;
  useEffect(() => {
    let current: Element | null = null;
    let showTimer = 0;
    let hideTimer = 0;
    const hideSoon = () => {
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => {
        if (overBubble.current) return;
        current = null;
        setTip(null);
      }, HIDE_AFTER_MS);
    };
    const over = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (target?.closest?.(".forge-tip")) return; // inside the bubble itself
      const el = target?.closest?.("[data-tip],[title]") ?? null;
      if (el === current) return;
      current = el;
      window.clearTimeout(showTimer);
      const text = el ? tipOf(el) : null;
      if (!el || !text) return hideSoon();
      window.clearTimeout(hideTimer);
      showTimer = window.setTimeout(() => {
        if (current !== el) return;
        const r = el.getBoundingClientRect();
        const above = window.innerHeight - r.bottom < 160;
        setTip({
          text,
          more: el.getAttribute("data-tip-more") ?? el.closest("[data-tip-more]")?.getAttribute("data-tip-more") ?? null,
          left: Math.min(Math.max(8, r.left), window.innerWidth - WIDTH - 8),
          top: above ? r.top - 6 : r.bottom + 6,
          above,
        });
      }, showing.current ? 60 : SHOW_AFTER_MS);
    };
    const hideNow = () => {
      window.clearTimeout(showTimer);
      current = null;
      overBubble.current = false;
      setTip(null);
    };
    document.addEventListener("mouseover", over);
    document.addEventListener("mousedown", (e) => {
      if (!(e.target as Element | null)?.closest?.(".forge-tip")) hideNow();
    });
    window.addEventListener("scroll", hideNow, true);
    window.addEventListener("blur", hideNow);
    return () => {
      document.removeEventListener("mouseover", over);
      window.removeEventListener("scroll", hideNow, true);
      window.removeEventListener("blur", hideNow);
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!tip) return null;
  return createPortal(
    <div
      className="forge-tip"
      role="tooltip"
      onMouseEnter={() => (overBubble.current = true)}
      onMouseLeave={() => {
        overBubble.current = false;
        setTip(null);
      }}
      style={{
        position: "fixed",
        zIndex: 2147483647,
        left: tip.left,
        top: tip.top,
        maxWidth: WIDTH,
        transform: tip.above ? "translateY(-100%)" : undefined,
        pointerEvents: tip.more ? "auto" : "none",
      }}
    >
      {tip.text}
      {tip.more && (
        <a href={tip.more} target="_blank" rel="noreferrer" className="forge-tip-more" data-tip="Opens the guide at the part about this.">
          More about this ↗
        </a>
      )}
    </div>,
    document.body
  );
}
