import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AspectKey, Category, ManifestRow, Toast } from "../types";
import { renderPreview } from "../lib/preview";
import { CRIER_CALLS, FOLK, HAPPENINGS, SHOPS, START_COINS, WARES, type Folk, type Happening, type Shop, type Ware } from "./data";
import { BorderGlow, StarField } from "../components/effects";
import { Btn, IX, useRevealObserver } from "../components/ui";

/* ---------------- art — the same plates the forge strikes ---------------- */

const artCache = new Map<string, string>();
function art(o: { filename: string; category: Category; aspect: AspectKey; seed: number }): string {
  if (!artCache.has(o.filename)) {
    const row: ManifestRow = {
      id: 0,
      filename: o.filename,
      prompt: "",
      category: o.category,
      item_id: "",
      shop_id: "",
      event_id: "",
      style: "claymation",
      aspect_ratio: o.aspect,
      seed: o.seed,
      model: "",
      status: "done",
      error: "",
      generated_at: "",
      imported_attachment_id: "",
    };
    artCache.set(o.filename, renderPreview(row));
  }
  return artCache.get(o.filename)!;
}

function Plate({ o, className = "", rounded = true }: { o: { filename: string; category: Category; aspect: AspectKey; seed: number }; className?: string; rounded?: boolean }) {
  const svg = useMemo(() => art(o), [o.filename, o.category, o.aspect, o.seed]);
  return (
    <div className={`relative overflow-hidden ${rounded ? "rounded-xl" : ""} ${className}`} dangerouslySetInnerHTML={{ __html: svg }} />
  );
}

/* ---------------- persistence ---------------- */

interface Saved {
  coins: number;
  satchel: { wareId: string; paid: number; at: string }[];
  stock: Record<string, number>;
  haggled: Record<string, number>;
  rep: Record<string, number>;
  greetIdx: Record<string, number>;
  watched: Record<string, number>;
}

const LS = "emberfair-v1";
function loadSaved(): Saved {
  try {
    const raw = localStorage.getItem(LS);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Saved>;
      return {
        coins: p.coins ?? START_COINS,
        satchel: p.satchel ?? [],
        stock: p.stock ?? {},
        haggled: p.haggled ?? {},
        rep: p.rep ?? {},
        greetIdx: p.greetIdx ?? {},
        watched: p.watched ?? {},
      };
    }
  } catch { /* fresh purse */ }
  return { coins: START_COINS, satchel: [], stock: {}, haggled: {}, rep: {}, greetIdx: {}, watched: {} };
}

/* ---------------- small pieces ---------------- */

const Coin = ({ size = 13, className = "" }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
    <circle cx="12" cy="12" r="9" fill="#f2a33c" stroke="#8a5a17" strokeWidth="2" />
    <circle cx="12" cy="12" r="4.5" fill="none" stroke="#8a5a17" strokeWidth="1.6" />
  </svg>
);

const Bag = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M6 8h12l-1 12H7L6 8Z" />
    <path d="M9 8V6a3 3 0 0 1 6 0v2" />
  </svg>
);

const LanternGlyph = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M9 3h6M12 3v2M8 8a4 4 0 0 1 8 0v6a4 4 0 0 1-8 0V8Z" />
    <path d="M12 9.5v3M10 18h4l-.5 3h-3L10 18Z" />
  </svg>
);

function SignHeading({ kicker, title, note }: { kicker: string; title: string; note?: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="font-mono text-[10.5px] tracking-[0.3em] text-ember uppercase">⚜ {kicker}</p>
        <h2 className="mt-1.5 font-display text-3xl tracking-wide text-cream sm:text-4xl">{title}</h2>
      </div>
      {note && <p className="max-w-xs text-right font-mono text-[11px] leading-relaxed text-dust">{note}</p>}
    </div>
  );
}

const RARITY: Record<Ware["rarity"], { label: string; chip: string }> = {
  common: { label: "common", chip: "border-line2 bg-panel2/60 text-dust" },
  fine: { label: "fine", chip: "border-lagoon/40 bg-lagoon/10 text-lagoon" },
  rare: { label: "rare", chip: "border-potion/45 bg-potion/10 text-potion" },
};

/* ---------------- the square (opening scene) ---------------- */

function NightSquare({ onEnter, onEvents }: { onEnter: (id: string) => void; onEvents: () => void }) {
  return (
    <section className="relative min-h-[560px] overflow-hidden border-b border-line bg-gradient-to-b from-[#10101d] via-[#171423] to-ink">
      <StarField className="absolute inset-0" density={70} />
      {/* moon */}
      <div className="absolute right-[12%] top-10 h-16 w-16 rounded-full bg-[#f4e8d4] opacity-80 shadow-[0_0_60px_18px_rgba(244,232,212,0.25)]" style={{ boxShadow: "0 0 60px 18px rgba(244,232,212,0.22), inset -10px -6px 0 rgba(151,135,109,0.35)" }} />

      {/* rooftops */}
      <svg className="absolute inset-x-0 bottom-[240px] w-full" viewBox="0 0 1200 140" preserveAspectRatio="none" style={{ height: 140 }}>
        <path d="M0 140V80l60-40 60 40v12l40-26 50 34v20l50-50 60 50v20H0Z" fill="#141019" />
        <path d="M280 140V70l70-44 70 44v70Z" fill="#171320" />
        <path d="M430 140V96l46-30 46 30v44Z" fill="#120f18" />
        <path d="M560 140V60l80-52 80 52v80Z" fill="#161220" />
        <path d="M760 140V84l56-38 56 38v56Z" fill="#131019" />
        <path d="M900 140V66l70-46 70 46v74Z" fill="#171321" />
        <path d="M1080 140V90l60-40 60 40v50Z" fill="#120f18" />
        {/* lit windows */}
        {[[90, 96], [330, 92], [352, 92], [612, 84], [636, 84], [952, 90], [1116, 104]].map(([x, y], i) => (
          <rect key={i} x={x} y={y} width="10" height="13" rx="1.5" fill="#f2a33c" opacity="0.75" className="flicker-win" style={{ animationDelay: `${i * 1.3}s` }} />
        ))}
        {/* chimneys + smoke */}
        <rect x="598" y="20" width="14" height="30" fill="#161220" />
        <rect x="938" y="28" width="12" height="26" fill="#171321" />
        <circle cx="605" cy="12" r="5" fill="#cdbc9f" opacity="0.14" className="smoke" />
        <circle cx="610" cy="2" r="7" fill="#cdbc9f" opacity="0.1" className="smoke" style={{ animationDelay: "2.2s" }} />
        <circle cx="944" cy="20" r="5" fill="#cdbc9f" opacity="0.12" className="smoke" style={{ animationDelay: "1.1s" }} />
      </svg>

      {/* lantern string */}
      <svg className="absolute inset-x-0 top-16 w-full" viewBox="0 0 1200 90" preserveAspectRatio="none" style={{ height: 90 }}>
        <path d="M0 10 Q300 70 600 22 T1200 18" fill="none" stroke="#3e2f21" strokeWidth="2" />
        {[110, 260, 420, 580, 740, 900, 1060].map((x, i) => {
          const y = 10 + Math.sin((x / 1200) * Math.PI) * 34 + (i % 2) * 4;
          return (
            <g key={x} className="sway" style={{ transformOrigin: `${x}px ${y}px`, animationDelay: `${i * 0.7}s` }}>
              <line x1={x} y1={y} x2={x} y2={y + 14} stroke="#3e2f21" strokeWidth="2" />
              <rect x={x - 7} y={y + 14} width="14" height="18" rx="4" fill="#2d2218" stroke="#57432c" />
              <circle cx={x} cy={y + 23} r="4.5" fill="#f2a33c" className="flicker-lamp" style={{ animationDelay: `${i * 0.9}s` }} />
              <circle cx={x} cy={y + 23} r="11" fill="#f2a33c" opacity="0.14" className="flicker-lamp" style={{ animationDelay: `${i * 0.9}s` }} />
            </g>
          );
        })}
      </svg>

      {/* stall row */}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-center gap-3 px-4 sm:gap-5 sm:px-10">
        {SHOPS.map((s, i) => (
          <button
            key={s.id}
            onClick={() => onEnter(s.id)}
            title={`Enter ${s.sign}`}
            className="btn-press group relative hidden w-[190px] shrink-0 sm:block"
            style={{ marginBottom: i % 2 ? 14 : 0 }}
          >
            <svg viewBox="0 0 190 150" className="w-full drop-shadow-[0_18px_24px_rgba(0,0,0,0.5)]">
              <rect x="12" y="52" width="166" height="98" rx="4" fill="#241b14" stroke="#3e2f21" />
              <rect x="78" y="92" width="34" height="58" rx="2" fill="#17120e" stroke="#3e2f21" />
              <rect x="26" y="70" width="36" height="30" rx="2" fill="#f2a33c" opacity="0.5" className="flicker-win" style={{ animationDelay: `${i * 1.7}s` }} />
              <rect x="128" y="70" width="36" height="30" rx="2" fill="#f2a33c" opacity="0.36" className="flicker-win" style={{ animationDelay: `${i * 1.1 + 0.5}s` }} />
              {/* awning */}
              <g className="awning-tilt" style={{ transformOrigin: "95px 34px" }}>
                <path d="M4 34h182v22c-9 8-21 8-30 0-9 8-21 8-30 0-9 8-21 8-30 0-9 8-21 8-30 0-9 8-21 8-30 0-9 8-21 8-30 0V34Z" fill={s.stripe[0]} />
                <path d="M4 34h182v9H4Z" fill={s.stripe[1]} opacity="0.85" />
                {[34, 64, 94, 124, 154].map((x) => (
                  <path key={x} d={`M${x} 34h30v22c-9 8-21 8-30 0V34Z`} fill={s.stripe[1]} opacity="0.55" />
                ))}
              </g>
              {/* hanging sign */}
              <g className="sway" style={{ transformOrigin: "95px 0px", animationDelay: `${i * 0.9}s` }}>
                <line x1="70" y1="0" x2="70" y2="12" stroke="#57432c" strokeWidth="2" />
                <line x1="120" y1="0" x2="120" y2="12" stroke="#57432c" strokeWidth="2" />
                <rect x="52" y="12" width="86" height="20" rx="3" fill="#2d2218" stroke="#57432c" />
                <text x="95" y="26" textAnchor="middle" fontSize="9" fill="#f4e8d4" fontFamily="Alfa Slab One, serif">{s.name.toUpperCase()}</text>
              </g>
            </svg>
            <span className="pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 rounded-md border border-ember/50 bg-coal px-2 py-0.5 font-mono text-[9px] tracking-wider text-ember uppercase opacity-0 shadow-lg transition-opacity duration-200 group-hover:opacity-100">
              step inside
            </span>
          </button>
        ))}
      </div>

      {/* crier's board */}
      <button data-tip="Opens the list of what is happening at the market tonight." onClick={onEvents} className="btn-press absolute bottom-8 right-5 hidden w-[240px] -rotate-2 rounded-md border-2 border-[#57432c] bg-[#2d2218] p-3.5 text-left shadow-[0_20px_40px_rgba(0,0,0,0.55)] transition-transform duration-300 hover:rotate-0 lg:block">
        <p className="border-b border-[#57432c] pb-1.5 text-center font-display text-[13px] tracking-[0.18em] text-parch">TONIGHT IN LANTERNROW</p>
        <ul className="mt-2.5 space-y-1.5">
          {HAPPENINGS.slice(0, 3).map((h) => (
            <li key={h.id} className="flex items-start gap-2 text-[11px] leading-snug text-parch">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: h.live ? "#e2593f" : "#97876d" }} />
              {h.title}
            </li>
          ))}
        </ul>
        <p className="mt-2.5 text-center font-mono text-[9px] tracking-[0.2em] text-dust uppercase">nailed by order of the watch</p>
      </button>

      {/* signage */}
      <div className="relative z-10 mx-auto flex max-w-6xl flex-col items-start px-6 pb-64 pt-24 sm:pb-60 sm:pt-28">
        <div className="sway-slow rounded-lg border-2 border-[#57432c] bg-coal/90 px-6 py-4 shadow-[0_24px_60px_rgba(0,0,0,0.6)]" style={{ transformOrigin: "50% -60px" }}>
          <p className="font-mono text-[10px] tracking-[0.42em] text-ember uppercase">the night market of lanternrow</p>
          <h1 className="mt-1 font-display text-4xl tracking-wide text-cream sm:text-6xl">
            EMBER<span className="text-ember">FAIR</span>
          </h1>
        </div>
        <p className="mt-5 max-w-md text-[14.5px] leading-relaxed text-parch">
          The lamps are lit, the stalls are open, and somewhere a goat is winning. Spend coin, hear news, meet the folk
          who keep this place gloriously unsensible.
        </p>
        <div className="mt-5 flex flex-wrap gap-2.5">
          <Btn data-tip="Scrolls down to the shops." variant="primary" onClick={() => document.getElementById("stalls")?.scrollIntoView({ behavior: "smooth" })}>
            Browse the stalls
          </Btn>
          <Btn data-tip="Opens the list of what is happening at the market tonight." onClick={onEvents}>What's on tonight</Btn>
        </div>
      </div>
    </section>
  );
}

function CrierTicker() {
  const doubled = [...CRIER_CALLS, ...CRIER_CALLS];
  return (
    <div className="relative z-10 overflow-hidden border-b border-line bg-[#191310] py-2.5">
      <div className="ticker flex w-max items-center gap-10 whitespace-nowrap">
        {doubled.map((c, i) => (
          <span key={i} className="flex items-center gap-10 font-mono text-[11.5px] text-parch">
            <span className="text-ember">⚜</span> {c}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ---------------- cards & drawers ---------------- */

function StallCard({ shop, onEnter }: { shop: Shop; onEnter: () => void }) {
  return (
    <BorderGlow radius={14} glow="rgba(242,163,60,0.5)" idle="#3e2f21" innerClassName="bg-[#241b14]" className="h-full">
      <div className="flex h-full flex-col">
        <div className="scallop h-3.5" style={{ background: `repeating-linear-gradient(90deg, ${shop.stripe[0]} 0 14px, ${shop.stripe[1]} 14px 28px)` }} />
        <Plate o={{ filename: `shop_${shop.id}.png`, category: "image", aspect: "16:9", seed: shop.seed }} rounded={false} className="aspect-[16/9] border-b border-line" />
        <div className="flex flex-1 flex-col p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-display text-lg tracking-wide text-cream">{shop.sign}</h3>
            <span className="rounded-md border border-moss/35 bg-moss/8 px-2 py-0.5 font-mono text-[9px] tracking-wider text-moss uppercase">open</span>
          </div>
          <p className="mt-0.5 font-mono text-[10.5px] text-dust">kept by {shop.keeper} · {shop.hours}</p>
          <p className="mt-2.5 flex-1 text-[12.5px] leading-relaxed text-parch">{shop.blurb}</p>
          <div className="mt-3.5 flex items-center justify-between gap-2">
            {shop.forgeId && <span className="truncate font-mono text-[9.5px] text-dust/70" title="manifest row in the Image Forge">⚒ {shop.forgeId}</span>}
            <Btn data-tip="Walks into this shop so you can meet the keeper and see what it sells." variant="primary" className="shrink-0" onClick={onEnter}>Step inside →</Btn>
          </div>
        </div>
      </div>
    </BorderGlow>
  );
}

function ShopDrawer({ shop, haggled, onClose, onHaggle }: { shop: Shop; haggled: number; onClose: () => void; onHaggle: () => void }) {
  const wares = WARES.filter((w) => w.shopId === shop.id);
  return (
    <div data-tip="Click outside the shop to close it." className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
      <div data-tip="This shop and its wares. Click outside it to close." className="pop-in relative max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-line bg-coal shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="scallop sticky top-0 z-10 h-3.5" style={{ background: `repeating-linear-gradient(90deg, ${shop.stripe[0]} 0 14px, ${shop.stripe[1]} 14px 28px)` }} />
        <div className="flex items-start justify-between gap-4 px-6 pt-5">
          <div>
            <p className="font-mono text-[10px] tracking-[0.28em] text-ember uppercase">you duck under the awning</p>
            <h3 className="mt-1 font-display text-2xl tracking-wide text-cream">{shop.sign}</h3>
          </div>
          <button data-tip="Leaves the shop." onClick={onClose} className="btn-press rounded-lg border border-line p-2 text-dust hover:border-line2 hover:text-cream">
            <IX size={14} />
          </button>
        </div>
        <div className="mx-6 mt-4 rounded-xl border border-line bg-panel/60 px-4 py-3">
          <p className="text-[13px] italic leading-relaxed text-parch">“{shop.keeperLine}”</p>
          <p className="mt-1 text-right font-mono text-[10.5px] text-dust">— {shop.keeper}</p>
        </div>
        <div className="grid gap-3 p-6 sm:grid-cols-2">
          {wares.map((w) => (
            <WareCard key={w.id} ware={w} discount={haggled} compact />
          ))}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-line px-6 py-4">
          <p className="font-mono text-[10.5px] text-dust">
            {haggled > 0 ? `haggled ${haggled}% off everything — ${shop.keeper.split(" ")[0]}'s word on it` : "prices as painted on the sign"}
          </p>
          <Btn data-tip="Tries to haggle the prices down. Once a deal is struck, it is done for this shop." variant="ghost" disabled={haggled > 0} onClick={onHaggle}>
            {haggled > 0 ? "Deal struck" : "Try your luck — haggle"}
          </Btn>
        </div>
      </div>
    </div>
  );
}

function WareCard({ ware, discount, compact = false }: { ware: Ware; discount: number; compact?: boolean }) {
  const { buy, stockLeft } = useMarket();
  const price = Math.max(1, Math.round(ware.price * (1 - discount / 100)));
  const stock = stockLeft(ware.id) ?? ware.stock;
  const soldOut = stock <= 0;
  return (
    <BorderGlow radius={13} glow={soldOut ? "rgba(151,135,109,0.3)" : "rgba(86,184,165,0.45)"} idle="#3e2f21" innerClassName="bg-[#241b14]" className={compact ? "" : "h-full"}>
      <div className={`flex ${compact ? "items-center" : "flex-col"} gap-3.5 p-3.5`}>
        <Plate
          o={{ filename: `item_${ware.id}.png`, category: "svg", aspect: "1:1", seed: ware.seed }}
          className={`${compact ? "h-20 w-20 shrink-0" : "aspect-square w-full"} ${soldOut ? "opacity-40 grayscale" : ""}`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h4 className="truncate text-[13.5px] font-semibold text-cream">{ware.name}</h4>
            <span className={`shrink-0 rounded-md border px-1.5 py-0.5 font-mono text-[9px] tracking-wider uppercase ${RARITY[ware.rarity].chip}`}>{RARITY[ware.rarity].label}</span>
          </div>
          {!compact && <p className="mt-1.5 text-[12px] leading-relaxed text-parch">{ware.blurb}</p>}
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 font-display text-[15px] text-ember">
              <Coin /> {price} gp
              {discount > 0 && <span className="font-mono text-[9.5px] text-moss line-through decoration-moss/60">{ware.price}</span>}
            </span>
            {soldOut ? (
              <span className="font-mono text-[10px] tracking-wider text-dust uppercase">sold out</span>
            ) : (
              <button data-tip={`Buys ${ware.name} for ${price} gp from your purse. The coins are pretend, not real money.`}
                onClick={(e) => buy(ware, price, e.clientX, e.clientY)}
                className="btn-press rounded-lg border border-moss/45 bg-moss/12 px-2.5 py-1.5 text-[11.5px] font-semibold text-moss hover:bg-moss/25"
              >
                {compact ? "Buy" : "To the satchel"}
              </button>
            )}
          </div>
          {!compact && <p className="mt-1.5 font-mono text-[9.5px] text-dust">{stock} in stock · {ware.forgeId ? `⚒ ${ware.forgeId}` : `⚒ item_${ware.id}.png`}</p>}
        </div>
      </div>
    </BorderGlow>
  );
}

function HappeningCard({ h }: { h: Happening }) {
  const { watch, watched } = useMarket();
  const count = watched[h.id] ?? 0;
  return (
    <BorderGlow radius={14} glow={h.live ? "rgba(226,89,63,0.5)" : "rgba(242,163,60,0.4)"} idle="#3e2f21" innerClassName="bg-[#241b14]" className="h-full">
      <div className="flex h-full flex-col">
        <div className="relative">
          <Plate o={{ filename: `event_${h.id}.png`, category: "gif", aspect: "16:9", seed: h.seed }} rounded={false} className="aspect-[16/9] border-b border-line" />
          <span className={`absolute left-3 top-3 flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[9px] tracking-[0.18em] uppercase backdrop-blur ${h.live ? "border-blood/60 bg-blood/20 text-[#ffb3a3]" : "border-line2 bg-coal/80 text-parch"}`}>
            {h.live && <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-blood" />}
            {h.live ? "happening now" : h.time}
          </span>
        </div>
        <div className="flex flex-1 flex-col p-4">
          <h4 className="font-display text-lg tracking-wide text-cream">{h.title}</h4>
          <p className="mt-1.5 flex-1 text-[12.5px] leading-relaxed text-parch">{h.blurb}</p>
          <div className="mt-3.5 flex items-center justify-between">
            <span className="font-mono text-[10px] text-dust">{count > 0 ? `${count} gathering${count > 1 ? "s" : ""} · incl. you` : "be the first there"}</span>
            <Btn data-tip="Joins the crowd at this gathering." variant="ghost" onClick={(e: React.MouseEvent) => watch(h, e.clientX, e.clientY)}>
              Gather round
            </Btn>
          </div>
        </div>
      </div>
    </BorderGlow>
  );
}

function FolkCard({ f }: { f: Folk }) {
  const { greet, rep, greetIdx } = useMarket();
  const idx = greetIdx[f.id] ?? 0;
  const r = rep[f.id] ?? 0;
  return (
    <BorderGlow radius={14} glow="rgba(177,140,224,0.4)" idle="#3e2f21" innerClassName="bg-[#241b14]" className="h-full">
      <div className="flex h-full flex-col p-4">
        <div className="flex gap-3.5">
          <Plate o={{ filename: `npc_${f.id}.png`, category: "sheet", aspect: "1:1", seed: f.seed }} className="h-20 w-20 shrink-0 rounded-xl" />
          <div className="min-w-0">
            <h4 className="font-display text-[16px] tracking-wide text-cream">{f.name}</h4>
            <p className="font-mono text-[10px] text-dust">{f.role}</p>
            <p className="mt-1 font-mono text-[9.5px] text-potion">standing · {r}</p>
          </div>
        </div>
        <p key={idx} className="pop-in mt-3 flex-1 rounded-xl border border-line bg-[#191310] px-3.5 py-2.5 text-[12px] italic leading-relaxed text-parch">
          “{f.lines[idx % f.lines.length]}”
        </p>
        <div className="mt-3">
          <Btn data-tip="Chats with this character and raises your standing with them by 1." variant="ghost" className="w-full justify-center" onClick={(e: React.MouseEvent) => greet(f, e.clientX, e.clientY)}>
            {idx === 0 ? "Say hello" : "Talk more"} · +1 standing
          </Btn>
        </div>
      </div>
    </BorderGlow>
  );
}

/* ---------------- market context (state shared through a tiny hook) ---------------- */

interface MarketCtx {
  coins: number;
  satchel: Saved["satchel"];
  buy: (w: Ware, price: number, x: number, y: number) => void;
  stockLeft: (id: string) => number | undefined;
  watch: (h: Happening, x: number, y: number) => void;
  watched: Saved["watched"];
  greet: (f: Folk, x: number, y: number) => void;
  rep: Saved["rep"];
  greetIdx: Saved["greetIdx"];
}

let marketApi: MarketCtx | null = null;
function useMarket(): MarketCtx {
  if (!marketApi) throw new Error("market not ready");
  return marketApi;
}

/* ---------------- the app ---------------- */

export default function MarketApp({ onOpenForge }: { onOpenForge: () => void }) {
  const [saved, setSaved] = useState<Saved>(loadSaved);
  const [shopOpen, setShopOpen] = useState<string | null>(null);
  const [satchelOpen, setSatchelOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [bursts, setBursts] = useState<{ id: number; x: number; y: number; kind: "coin" | "spark" }[]>([]);
  const [floats, setFloats] = useState<{ id: number; x: number; y: number; text: string }[]>([]);
  const toastId = useRef(1);
  const ref = useRevealObserver<HTMLDivElement>();

  useEffect(() => {
    try {
      localStorage.setItem(LS, JSON.stringify(saved));
    } catch { /* purse stays in memory */ }
  }, [saved]);

  const pushToast = useCallback((kind: Toast["kind"], msg: string) => {
    const id = toastId.current++;
    setToasts((t) => [...t.slice(-3), { id, kind, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const spawnBurst = useCallback((x: number, y: number, kind: "coin" | "spark") => {
    const base = Date.now() + Math.random();
    const items = Array.from({ length: 7 }, (_, i) => ({ id: base + i, x, y, kind }));
    setBursts((b) => [...b, ...items]);
    setTimeout(() => setBursts((b) => b.filter((i) => !items.some((n) => n.id === i.id))), 900);
  }, []);

  const spawnFloat = useCallback((x: number, y: number, text: string) => {
    const id = Date.now() + Math.random();
    setFloats((f) => [...f, { id, x, y, text }]);
    setTimeout(() => setFloats((f) => f.filter((i) => i.id !== id)), 1200);
  }, []);

  const ctx: MarketCtx = {
    coins: saved.coins,
    satchel: saved.satchel,
    stockLeft: (id) => saved.stock[id],
    watched: saved.watched,
    rep: saved.rep,
    greetIdx: saved.greetIdx,
    buy: (w, price, x, y) => {
      const stock = saved.stock[w.id] ?? w.stock;
      if (stock <= 0) {
        pushToast("err", "Sold out — the shelf is bare.");
        return;
      }
      if (saved.coins < price) {
        pushToast("err", `Not enough coin — ${w.name} wants ${price} gp and your purse holds ${saved.coins}.`);
        spawnBurst(x, y, "spark");
        return;
      }
      setSaved((s) => ({
        ...s,
        coins: s.coins - price,
        stock: { ...s.stock, [w.id]: stock - 1 },
        satchel: [...s.satchel, { wareId: w.id, paid: price, at: new Date().toISOString() }],
      }));
      spawnBurst(x, y, "coin");
      pushToast("ok", `${w.name} is yours for ${price} gp.`);
    },
    watch: (h, x, y) => {
      setSaved((s) => ({ ...s, watched: { ...s.watched, [h.id]: (s.watched[h.id] ?? 0) + 1 } }));
      spawnBurst(x, y, "spark");
      pushToast("info", `You join the crowd at “${h.title}”.`);
    },
    greet: (f, x, y) => {
      setSaved((s) => ({
        ...s,
        greetIdx: { ...s.greetIdx, [f.id]: (s.greetIdx[f.id] ?? 0) + 1 },
        rep: { ...s.rep, [f.id]: (s.rep[f.id] ?? 0) + 1 },
      }));
      spawnFloat(x, y - 14, "+1 standing");
    },
  };
  marketApi = ctx;

  const haggle = (shop: Shop) => {
    const pct = 5 + Math.floor(Math.random() * 11);
    setSaved((s) => ({ ...s, haggled: { ...s.haggled, [shop.id]: pct } }));
    pushToast("ok", `${shop.haggleLine} (${pct}% off)`);
  };

  const activeShop = shopOpen ? SHOPS.find((s) => s.id === shopOpen) ?? null : null;
  const satchelWares = saved.satchel.map((p) => ({ p, ware: WARES.find((w) => w.id === p.wareId)! }));
  const spent = saved.satchel.reduce((a, p) => a + p.paid, 0);
  const looseWares = WARES.filter((w) => !["12", "13", "14"].includes(w.shopId) || w.rarity === "rare");

  return (
    <div ref={ref} className="grain relative h-full overflow-y-auto bg-ink text-cream">
      {/* header */}
      <header className="sticky top-0 z-30 border-b border-line bg-coal/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
          <span className="flex items-center gap-2.5">
            <span className="plaque flex h-9 w-9 items-center justify-center rounded-lg text-ember">
              <LanternGlyph size={19} />
            </span>
            <span>
              <span className="block font-display text-[16px] leading-none tracking-wide">EMBER<span className="text-ember">FAIR</span></span>
              <span className="mt-0.5 block font-mono text-[8.5px] tracking-[0.22em] text-dust uppercase">night market · lanternrow</span>
            </span>
          </span>
          <span className="hidden font-mono text-[10.5px] text-dust md:block">day VII of the Reed Moon · dusk</span>
          <div className="ml-auto flex items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-lg border border-ember/40 bg-ember/8 px-3 py-1.5 font-display text-[14px] text-ember" title="your purse">
              <Coin size={14} /> {saved.coins} gp
            </span>
            <button data-tip="Opens your satchel, where the things you bought are kept."
              onClick={() => setSatchelOpen(true)}
              className="btn-press relative flex items-center gap-2 rounded-lg border border-line bg-panel/70 px-3 py-1.5 text-[12.5px] text-parch hover:border-line2 hover:text-cream"
            >
              <Bag /> Satchel
              {saved.satchel.length > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-ember px-1 font-mono text-[9px] font-bold text-[#241503]">
                  {saved.satchel.length}
                </span>
              )}
            </button>
            <button
              onClick={onOpenForge}
              title="Open the Image Forge — where these pictures are made"
              className="btn-press flex items-center gap-1.5 rounded-lg border border-line bg-panel/70 px-3 py-1.5 font-mono text-[10.5px] tracking-wide text-parch uppercase hover:border-ember/50 hover:text-ember"
            >
              ⚒ backstage
            </button>
          </div>
        </div>
      </header>

      <NightSquare onEnter={(id) => setShopOpen(id)} onEvents={() => document.getElementById("happenings")?.scrollIntoView({ behavior: "smooth" })} />
      <CrierTicker />

      <main className="mx-auto max-w-6xl px-5 pb-24">
        {/* stalls */}
        <section id="stalls" className="reveal scroll-mt-20 pt-16">
          <SignHeading kicker="five awnings, five keepers" title="The Stalls" note="step inside to meet the keeper, haggle, and buy what they sell" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SHOPS.map((s) => (
              <StallCard key={s.id} shop={s} onEnter={() => setShopOpen(s.id)} />
            ))}
            <BorderGlow radius={14} glow="rgba(151,135,109,0.35)" idle="#3e2f21" innerClassName="bg-[#241b14]" className="flex h-full items-center justify-center">
              <div className="p-6 text-center">
                <p className="font-display text-lg tracking-wide text-dust">An empty stall…</p>
                <p className="mt-2 text-[12.5px] leading-relaxed text-dust/80">
                  …reserved for whoever the fair needs next. The wizard in the backstage can conjure its shopfront.
                </p>
                <Btn data-tip="Opens the Image Forge, where this shopfront can be made." variant="ghost" className="mt-4" onClick={onOpenForge}>Conjure it in the forge →</Btn>
              </div>
            </BorderGlow>
          </div>
        </section>

        {/* wares */}
        <section className="reveal pt-16">
          <SignHeading kicker="no keeper, no small talk" title="Loose Wares" note="the rare and the roaming — everything else lives inside its stall" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {looseWares.map((w) => (
              <WareCard key={w.id} ware={w} discount={saved.haggled[w.shopId] ?? 0} />
            ))}
          </div>
        </section>

        {/* happenings */}
        <section id="happenings" className="reveal scroll-mt-20 pt-16">
          <SignHeading kicker="the fair never sits still" title="Happenings Tonight" note="gather round and the fair notices — attendance is written down" />
          <div className="grid gap-4 sm:grid-cols-2">
            {HAPPENINGS.map((h) => (
              <HappeningCard key={h.id} h={h} />
            ))}
          </div>
        </section>

        {/* folk */}
        <section className="reveal pt-16">
          <SignHeading kicker="standing is earned, not bought" title="Folk of the Fair" note="every word you share raises your standing — it matters, eventually" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FOLK.map((f) => (
              <FolkCard key={f.id} f={f} />
            ))}
          </div>
        </section>

        <footer className="mt-20 border-t border-line pt-6 text-center">
          <p className="font-mono text-[10.5px] leading-relaxed text-dust">
            Emberfair · the night market of Lanternrow — every shopfront, icon and scene is a row in the{" "}
            <button data-tip="Opens the Image Forge, where every picture in this market is a row in the list." onClick={onOpenForge} className="text-ember underline decoration-ember/40 underline-offset-2">Image Forge manifest</button>.
            <br />
            coins, satchel and standing are kept in this browser's memory, like a good tab.
          </p>
        </footer>
      </main>

      {/* shop drawer */}
      {activeShop && (
        <ShopDrawer shop={activeShop} haggled={saved.haggled[activeShop.id] ?? 0} onClose={() => setShopOpen(null)} onHaggle={() => haggle(activeShop)} />
      )}

      {/* satchel drawer */}
      {satchelOpen && (
        <div data-tip="Click outside the satchel to close it." className="fixed inset-0 z-40 flex justify-end bg-black/60 backdrop-blur-sm" onClick={() => setSatchelOpen(false)}>
          <aside data-tip="Your satchel: everything you have bought. Click outside it to close." className="slide-in-right flex h-full w-[340px] flex-col border-l border-line bg-coal shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h3 className="flex items-center gap-2 font-display text-lg tracking-wide">
                <Bag size={16} /> Your satchel
              </h3>
              <button data-tip="Closes the satchel." onClick={() => setSatchelOpen(false)} className="btn-press rounded-lg border border-line p-1.5 text-dust hover:text-cream">
                <IX size={13} />
              </button>
            </div>
            <div className="flex items-center justify-between border-b border-line bg-panel/40 px-5 py-3">
              <span className="font-mono text-[11px] text-dust">purse</span>
              <span className="flex items-center gap-1.5 font-display text-[18px] text-ember">
                <Coin size={15} /> {saved.coins} gp
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {satchelWares.length === 0 ? (
                <p className="py-10 text-center text-[13px] leading-relaxed text-dust">
                  Empty as a promise.<br />The stalls can fix that.
                </p>
              ) : (
                <ul className="space-y-2">
                  {satchelWares.map(({ p, ware }, i) => (
                    <li key={i} className="rise-in flex items-center gap-3 rounded-xl border border-line bg-panel/50 p-2.5">
                      <Plate o={{ filename: `item_${ware.id}.png`, category: "svg", aspect: "1:1", seed: ware.seed }} className="h-12 w-12 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-semibold text-cream">{ware.name}</p>
                        <p className="font-mono text-[9.5px] text-dust">{new Date(p.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} · from {SHOPS.find((s) => s.id === ware.shopId)?.name ?? "the fair"}</p>
                      </div>
                      <span className="flex shrink-0 items-center gap-1 font-display text-[13px] text-ember">
                        <Coin size={11} /> {p.paid}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="border-t border-line px-5 py-4">
              <div className="flex justify-between font-mono text-[11px] text-dust">
                <span>{saved.satchel.length} treasure{satchelWares.length === 1 ? "" : "s"} carried</span>
                <span>{spent} gp spent tonight</span>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* coin bursts & floats */}
      {bursts.map((b, i) => (
        <span
          key={b.id}
          className="coin-fly pointer-events-none fixed z-[70]"
          style={{
            left: b.x,
            top: b.y,
            animationDelay: `${(i % 7) * 0.03}s`,
            ["--tx" as string]: `${Math.cos((i / 7) * Math.PI * 2) * (24 + (i % 3) * 14)}px`,
            ["--ty" as string]: `${-30 - ((i % 4) * 12)}px`,
          }}
        >
          {b.kind === "coin" ? <Coin size={11} /> : <span className="block h-1.5 w-1.5 rounded-full bg-ember shadow-[0_0_8px_rgba(242,163,60,0.9)]" />}
        </span>
      ))}
      {floats.map((f) => (
        <span key={f.id} className="float-up pointer-events-none fixed z-[70] font-mono text-[11px] font-semibold text-potion" style={{ left: f.x - 30, top: f.y }}>
          {f.text}
        </span>
      ))}

      {/* toasts */}
      <div className="pointer-events-none fixed bottom-5 left-1/2 z-[80] flex w-full max-w-md -translate-x-1/2 flex-col gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`rise-in pointer-events-auto rounded-xl border px-4 py-3 text-[12.5px] shadow-xl backdrop-blur ${
              t.kind === "ok" ? "border-moss/50 bg-[#1c2417]/95 text-moss" : t.kind === "err" ? "border-blood/50 bg-[#2a1713]/95 text-[#ffb3a3]" : "border-lagoon/50 bg-[#15201d]/95 text-lagoon"
            }`}
          >
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  );
}
