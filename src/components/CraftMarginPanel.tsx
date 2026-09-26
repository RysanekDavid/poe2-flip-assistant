"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Gem, Sword, Diamond, Shield, Loader2, Play, ChevronDown, ChevronRight, Hammer, type LucideIcon } from "lucide-react";
import { Sparkline } from "./ui/Sparkline";
import { ComputedLeague } from "./ui/ComputedLeague";
import { MarginBreakdown } from "./craft/MarginBreakdown";
import { evLabel, type RecipeView } from "./craft/craftView";
import { loadSavedSession } from "./craft/CraftSessionWizard";
import { useCraftMargins, type MarginsResp } from "./craft/CraftMarginsContext";
import type { CraftDomain } from "../core/craftRecipes";

/** Each craft domain gets its own window — the procedures differ per item class. */
export const CRAFT_DOMAINS: Record<CraftDomain, { title: string; blurb: string; icon: LucideIcon; tint: string }> = {
  jewel: { title: "Jewel craft", blurb: "Time-Lost suffix pushes", icon: Gem, tint: "text-sky-400" },
  weapon: { title: "Weapon craft", blurb: "bows / spears / foci", icon: Sword, tint: "text-amber-400" },
  jewellery: { title: "Jewellery craft", blurb: "rings & amulets", icon: Diamond, tint: "text-fuchsia-400" },
  armour: { title: "Armour craft", blurb: "boots / body / helmets", icon: Shield, tint: "text-emerald-400" },
};

/** "3m ago" from a sqlite UTC timestamp ("YYYY-MM-DD HH:MM:SS") — normalize to UTC first. */
function scanAge(ts: string | null): string {
  if (!ts) return "never";
  const ms = Date.now() - new Date(ts.replace(" ", "T") + "Z").getTime();
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

/** EV rank: priced recipes by EV descending, unscanned ones last. */
function byEv(a: RecipeView, b: RecipeView): number {
  return (b.report?.evDiv ?? -Infinity) - (a.report?.evDiv ?? -Infinity);
}

const statusTone: Record<string, string> = {
  "missing-materials": "text-amber-500",
  "leg-failed": "text-bad",
};

/** Owner-only "queue refresh" (re-prices ALL domains on the poller). */
function RefreshButton({ onNotice, onError }: { onNotice: (s: string) => void; onError: (s: string) => void }) {
  const [refreshing, setRefreshing] = useState(false);
  const refreshNow = async (): Promise<void> => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const res = await fetch("/api/craft/margins", { method: "POST" });
      const d = (await res.json()) as { queued?: boolean; error?: string };
      if (!res.ok || d.error) onError(d.error ?? `refresh failed (${res.status})`);
      else onNotice("refresh queued — poller picks it up within ~20s");
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshing(false);
    }
  };
  return (
    <button
      onClick={() => void refreshNow()}
      disabled={refreshing}
      title="queue a full re-price on the poller (owner)"
      className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white transition active:scale-[0.98] disabled:opacity-40"
    >
      {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} queue refresh
    </button>
  );
}

function PanelHeader({ domain, data, count, refresh }: { domain: CraftDomain; data: MarginsResp | null; count: number; refresh: ReactNode }) {
  const meta = CRAFT_DOMAINS[domain];
  const DomainIcon = meta.icon;
  return (
    <header className="mb-3 flex flex-wrap items-center gap-2.5">
      <DomainIcon className={`h-5 w-5 ${meta.tint}`} />
      <h2 className="text-lg font-semibold">{meta.title}</h2>
      <span className="text-xs text-neutral-600">{meta.blurb}</span>
      {data && (
        <span className="flex items-center gap-1.5 text-xs">
          <span className={data.enabled ? "text-good" : "text-neutral-500"}>
            {data.enabled ? `auto · stalest every ${data.intervalMin}m` : "manual"}
          </span>
          <span className="text-neutral-700">·</span>
          <span className="text-neutral-500">
            {count} recipe{count === 1 ? "" : "s"}
          </span>
        </span>
      )}
      <ComputedLeague league={data?.computedLeague} />
      {refresh}
    </header>
  );
}

function EvCell({ r, ex }: { r: RecipeView; ex: number | null }) {
  const rep = r.report;
  const ok = rep?.status === "ok";
  return (
    <div className="text-right" title="expected profit per attempt at current prices: hit% × result price − base − materials">
      <div className="text-[10px] uppercase tracking-wide text-neutral-600">EV / attempt</div>
      <div className={`text-lg font-semibold tabular-nums ${rep && rep.evDiv >= 0 ? "text-emerald-400" : "text-bad"}`}>
        {ok ? evLabel(rep.evDiv, ex) : "—"}
      </div>
      <div className="text-xs tabular-nums text-neutral-500">
        {ok ? `${rep.marginPct.toFixed(0)}% margin` : ""}
        {ok && !r.gate.ok && (
          <span className="ml-1 text-amber-500" title={r.gate.reasons.join("\n")}>
            · low confidence
          </span>
        )}
      </div>
    </div>
  );
}

function RecipeRow({ r, ex, open, onToggle, onOpen, icons, domain }: {
  r: RecipeView; ex: number | null; open: boolean; onToggle: () => void; onOpen: () => void; icons: Record<string, string>; domain: CraftDomain;
}) {
  const meta = CRAFT_DOMAINS[domain];
  const DomainIcon = meta.icon;
  const rep = r.report;
  const heroIcon = r.heroIcon ?? rep?.result?.icon ?? rep?.base?.icon ?? null;
  return (
    <div className="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950/40">
      <div onClick={onToggle} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-neutral-800/30">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-neutral-900">
          {heroIcon ? (
            // eslint-disable-next-line @next/next/no-img-element -- poecdn item art
            <img src={heroIcon} alt="" className="max-h-11 max-w-11 object-contain" />
          ) : (
            <DomainIcon className={`h-6 w-6 ${meta.tint} opacity-40`} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-neutral-100">{r.label}</div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-neutral-500">
            <span>hit {(r.hitRate * 100).toFixed(0)}%</span>
            <span className="text-neutral-700">·</span>
            <span>{scanAge(r.scannedAt)}</span>
            {rep && rep.status !== "ok" && <span className={statusTone[rep.status] ?? "text-bad"}>{rep.status.replace("-", " ")}</span>}
            {!rep && <span className="text-neutral-600">not scanned yet</span>}
          </div>
        </div>
        {r.evHistory.length >= 2 && (
          <span title="EV trend across the last scans">
            <Sparkline data={r.evHistory} />
          </span>
        )}
        <EvCell r={r} ex={ex} />
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpen(); // the session lives at the top of the card
          }}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-emerald-600/60 bg-gradient-to-b from-emerald-700 to-emerald-800 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:from-emerald-600 hover:to-emerald-700 active:scale-[0.98]"
          title="open the interactive craft guide — shopping list, step by step, result into P&L"
        >
          <Hammer className="h-4 w-4" /> Craft
        </button>
        {open ? <ChevronDown className="h-4 w-4 shrink-0 text-neutral-500" /> : <ChevronRight className="h-4 w-4 shrink-0 text-neutral-500" />}
      </div>
      {open && <MarginBreakdown r={r} ex={ex} icons={icons} />}
    </div>
  );
}

/** Expanded-card set; a craft session in progress re-expands its card after a refresh/alt-tab. */
function useOpenCards(domain: CraftDomain) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  useEffect(() => {
    const saved = loadSavedSession();
    if (saved && saved.domain === domain) setOpen((prev) => new Set(prev).add(saved.recipeKey));
  }, [domain]);
  const toggle = (key: string): void =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const add = (key: string): void => setOpen((prev) => new Set(prev).add(key));
  return { open, toggle, add };
}

/**
 * One craft domain's window: its recipes ranked by modelled EV per attempt, each expandable to the
 * full derivation + guide, each launchable as an interactive craft session. Read-only pricing; the
 * human crafts. `showRefresh` puts the owner's queue-refresh button on exactly one instance.
 */
export function CraftMarginPanel({ domain, showRefresh = false }: { domain: CraftDomain; showRefresh?: boolean }) {
  const { data, error } = useCraftMargins();
  const [notice, setNotice] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const cards = useOpenCards(domain);
  const ex = data?.exaltPerDivine ?? null;
  const recipes = (data?.recipes ?? []).filter((x) => x.domain === domain).sort(byEv);
  const refresh = showRefresh && data?.canRefresh ? <RefreshButton onNotice={setNotice} onError={setActionErr} /> : null;

  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
      <PanelHeader domain={domain} data={data} count={recipes.length} refresh={refresh} />
      {notice && <p className="mb-3 text-sm text-sky-400">{notice}</p>}
      {showRefresh && (
        <p className="mb-3 text-xs text-neutral-600">
          Modelled EV = <span className="text-neutral-400">curated hit rate × result (p30 of instant-buyout asks above a junk floor) − base (p25) − materials</span>.
          Asks are not sales. Only well-sampled recipes are ranked or alerted. Read-only — you craft manually.
        </p>
      )}
      {(error ?? actionErr) && <p className="text-sm text-bad">error: {error ?? actionErr}</p>}
      <div className="space-y-2">
        {recipes.map((r) => (
          <RecipeRow key={r.key} r={r} ex={ex} icons={data?.icons ?? {}} domain={domain} open={cards.open.has(r.key)} onToggle={() => cards.toggle(r.key)} onOpen={() => cards.add(r.key)} />
        ))}
        {recipes.length === 0 && !error && <p className="py-3 text-center text-sm text-neutral-500">no recipes in this domain yet</p>}
      </div>
    </section>
  );
}
