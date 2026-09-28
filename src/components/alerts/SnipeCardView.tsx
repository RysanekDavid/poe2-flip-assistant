"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, Info, Search } from "lucide-react";
import type { Alert } from "../../lib/alertCenter";
import type { CardModKind, SnipeCard } from "../../lib/snipeCard";
import { tradeCurrencyArt } from "../../lib/currencyArt";
import { fmtDivOrEx } from "../../lib/format";
import { LeagueTag } from "./AlertBits";

/** In-game item-frame palette: header band + name colour by rarity. */
const RARE_TONE = { band: "border-[#6b5a24] from-[#352b10] to-[#140f05]", name: "text-[#ffff77]" };
const RARITY: Record<string, { band: string; name: string }> = {
  unique: { band: "border-[#8a4b1f] from-[#3b200f] to-[#140b05]", name: "text-[#af6025]" },
  rare: RARE_TONE,
  magic: { band: "border-[#3c3c7a] from-[#1c1c3a] to-[#0b0b18]", name: "text-[#8888ff]" },
  normal: { band: "border-neutral-600 from-neutral-800 to-neutral-950", name: "text-[#c8c8c8]" },
};

const MOD_TONE: Record<CardModKind, { cls: string; hint: string }> = {
  implicit: { cls: "text-[#8888ff]", hint: "implicit" },
  enchant: { cls: "text-[#b4b4ff]", hint: "enchant" },
  rune: { cls: "text-[#b4b4ff]", hint: "rune / socketed" },
  fractured: { cls: "text-[#a29162]", hint: "fractured — cannot be changed" },
  explicit: { cls: "text-[#8888ff]", hint: "explicit" },
  crafted: { cls: "text-[#b4b4ff]", hint: "crafted" },
  desecrated: { cls: "text-[#c9a0ff]", hint: "desecrated" },
};

/** Compact relative age: "4m", "3h", "2d". */
export function ageLabel(iso: string | null, nowMs: number = Date.now()): string {
  if (!iso) return "?";
  const t = Date.parse(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`);
  if (!Number.isFinite(t)) return "?";
  const min = Math.max(0, Math.round((nowMs - t) / 60_000));
  if (min < 60) return `${min}m`;
  if (min < 48 * 60) return `${Math.round(min / 60)}h`;
  return `${Math.round(min / 1440)}d`;
}

function valuationHint(card: SnipeCard): string {
  const v = card.valuation;
  const parts = [
    `median ask of ${v.samples} instant-buyout comparable${v.samples === 1 ? "" : "s"} (this listing excluded)`,
    v.dropped > 0 ? `${v.dropped} cheap outlier${v.dropped === 1 ? "" : "s"} trimmed as bait` : null,
    `${v.total} live listing${v.total === 1 ? "" : "s"} matched the search`,
    v.unrated > 0 ? `${v.unrated} priced in unrated currencies, ignored` : null,
    v.minDiv != null ? `cheapest comparable ${fmtDivOrEx(v.minDiv, card.exaltPerDivine)}` : null,
    v.broadened ? "distinctive-mod search was too thin → priced on pseudo totals only" : null,
    v.searchedMods.length > 0 ? `searched on: ${v.searchedMods.join(" · ")}` : null,
  ];
  return parts.filter((p): p is string => p != null).join("\n");
}

function Header({ card, alert }: { card: SnipeCard; alert: Alert }) {
  const tone = RARITY[(card.rarity ?? "").toLowerCase()] ?? RARE_TONE;
  return (
    <div className={`flex items-start gap-3 border-b bg-gradient-to-b px-3 py-2 ${tone.band}`}>
      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded border border-neutral-800 bg-black/50">
        {/* eslint-disable-next-line @next/next/no-img-element -- poecdn item art */}
        {card.icon ? <img src={card.icon} alt="" className="max-h-16 max-w-16 object-contain" /> : <span className="text-[10px] text-neutral-600">no art</span>}
      </div>
      <div className="min-w-0 flex-1">
        <div className={`truncate font-semibold ${tone.name}`} title={card.name}>{card.name}</div>
        {card.baseType !== card.name && <div className={`truncate text-sm opacity-80 ${tone.name}`}>{card.baseType}</div>}
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
          {card.itemLevel != null && <span className="rounded bg-black/40 px-1 text-neutral-300" title="item level">ilvl {card.itemLevel}</span>}
          {card.corrupted && <span className="rounded bg-red-950/60 px-1 text-[#d20000]">corrupted</span>}
          {card.desecrated && <span className="rounded bg-purple-950/60 px-1 text-[#c9a0ff]">desecrated</span>}
          <LeagueTag league={alert.foreign_league} />
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-2xl font-bold tabular-nums text-good" title="how far the ask sits under the estimated value">
          −{Math.round(card.marginPct)}%
        </div>
        <time className="text-[11px] text-neutral-500" title={`alert ${alert.created_at} UTC`}>{ageLabel(alert.created_at)} ago</time>
      </div>
    </div>
  );
}

function Mods({ card }: { card: SnipeCard }) {
  if (card.mods.length === 0) return <p className="px-3 py-2 text-xs text-neutral-600">no mod lines captured</p>;
  let prev: CardModKind | null = null;
  return (
    <ul className="space-y-0.5 px-3 py-2 text-center text-[13px] leading-snug">
      {card.mods.map((m, i) => {
        // a thin rule between tooltip blocks, like the in-game separator
        const split = prev != null && (prev === "implicit" || prev === "enchant" || prev === "rune") && m.kind !== prev;
        prev = m.kind;
        const tone = MOD_TONE[m.kind];
        return (
          <li key={i} title={tone.hint} className={`${tone.cls} ${split ? "mt-1 border-t border-neutral-800 pt-1" : ""}`}>
            {m.text}
          </li>
        );
      })}
    </ul>
  );
}

function Price({ card }: { card: SnipeCard }) {
  const ccy = tradeCurrencyArt(card.price.currency);
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="flex items-center gap-1 font-semibold tabular-nums text-neutral-100" title={`listed at ${card.price.amount} ${card.price.currency}`}>
        {card.price.amount}
        {/* eslint-disable-next-line @next/next/no-img-element -- poecdn currency art */}
        {ccy ? <img src={ccy.art} alt={ccy.label} title={ccy.label} className="h-5 w-5 object-contain" /> : <span className="text-neutral-400">{card.price.currency}</span>}
        <span className="font-normal text-neutral-500">≈ {fmtDivOrEx(card.priceDiv, card.exaltPerDivine)}</span>
      </span>
      <span className="flex items-center gap-1 text-neutral-300" title={valuationHint(card)}>
        worth ~{fmtDivOrEx(card.valueDiv, card.exaltPerDivine)}
        <Info className="h-3.5 w-3.5 text-neutral-500" />
      </span>
    </div>
  );
}

function Seller({ card }: { card: SnipeCard }) {
  const state = card.sellerOnline
    ? { dot: "bg-good", text: "online", hint: "seller was in-game when scanned" }
    : card.instantBuyout
      ? { dot: "bg-sky-400", text: "instant buyout", hint: "Merchant listing — buyable while the seller is offline" }
      : { dot: "bg-neutral-600", text: "offline", hint: "seller offline and not instant buyout" };
  return (
    <span className="flex items-center gap-2 text-[11px] text-neutral-400">
      <span className="flex items-center gap-1" title={state.hint}>
        <span className={`h-2 w-2 rounded-full ${state.dot}`} />
        {state.text}
      </span>
      <span title={card.listedAt ? `indexed ${card.listedAt}` : "listing age unknown"}>listed {ageLabel(card.listedAt)} ago</span>
    </span>
  );
}

function Actions({ card }: { card: SnipeCard }) {
  const [copied, setCopied] = useState(false);
  const copy = (whisper: string): void => {
    navigator.clipboard
      .writeText(whisper)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      })
      .catch((e: unknown) => console.error("[alerts] copying the whisper failed", e));
  };
  const btn = "inline-flex items-center gap-1 rounded border px-2 py-1 text-xs";
  return (
    <div className="flex items-center gap-1.5">
      {card.whisper && (
        <button onClick={() => copy(card.whisper ?? "")} title="copy the in-game whisper — paste it in chat yourself" className={`${btn} border-orange-700/70 text-orange-200 hover:bg-orange-950/40`}>
          {copied ? <Check className="h-3.5 w-3.5 text-good" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "copied" : "Copy whisper"}
        </button>
      )}
      <a href={card.tradeUrl} target="_blank" rel="noopener noreferrer" title="official trade site, filtered to this seller's copy of the item" className={`${btn} border-sky-800 text-sky-200 hover:bg-sky-950/40`}>
        <ExternalLink className="h-3.5 w-3.5" /> Open on trade
      </a>
      <a href={card.valuation.comparablesUrl} target="_blank" rel="noopener noreferrer" title="the comparable search the value came from" className={`${btn} border-neutral-700 text-neutral-400 hover:text-neutral-200`}>
        <Search className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}

/** A SNIPE alert as an item card: in-game style header, mod lines, price vs value, seller, actions. */
export function SnipeCardView({ alert, card }: { alert: Alert; card: SnipeCard }) {
  return (
    <article className={`overflow-hidden rounded-lg border bg-neutral-950/80 ${alert.seen === 0 ? "border-amber-500/50 shadow-[0_0_0_1px_rgba(245,158,11,0.15)]" : "border-neutral-800"}`}>
      <Header card={card} alert={alert} />
      <Mods card={card} />
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-800 bg-neutral-900/60 px-3 py-2">
        <div className="space-y-0.5">
          <Price card={card} />
          <Seller card={card} />
        </div>
        <Actions card={card} />
      </footer>
    </article>
  );
}
