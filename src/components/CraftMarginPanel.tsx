"use client";

import { useCallback, useEffect, useState } from "react";
import { Gem, Sword, Diamond, Shield, Loader2, Play, ChevronDown, ChevronRight, Hammer, type LucideIcon } from "lucide-react";
import { Sparkline } from "./ui/Sparkline";
import { MarginBreakdown, evLabel, type RecipeView } from "./craft/MarginBreakdown";
import { loadSavedSession } from "./craft/CraftSessionWizard";
import type { CraftDomain } from "../core/craftRecipes";

interface MarginsResp {
  enabled: boolean;
  intervalMin: number;
  canRefresh: boolean;
  exaltPerDivine: number | null;
  icons: Record<string, string>;
  recipes: RecipeView[];
  error?: string;
}

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
  const av = a.report?.evDiv ?? -Infinity;
  const bv = b.report?.evDiv ?? -Infinity;
  return bv - av;
}

const statusTone: Record<string, string> = {
  "missing-materials": "text-amber-500",
  "leg-failed": "text-bad",
};

/**
 * One craft domain's window: its recipes ranked by live EV per attempt (hitRate × result median −
 * base − materials), each expandable to the full derivation + guide, each launchable as an
 * interactive craft session. Read-only pricing; the human crafts. `showRefresh` puts the owner's
 * queue-refresh button on exactly one instance (the refresh re-prices ALL domains).
 */
export function CraftMarginPanel({ domain, showRefresh = false }: { domain: CraftDomain; showRefresh?: boolean }) {
  const [data, setData] = useState<MarginsResp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);

  // A craft session in progress survives a refresh/alt-tab — the owning domain window expands
  // its card again (the session lives inline at the top of the card).
  useEffect(() => {
    const saved = loadSavedSession();
    if (saved && saved.domain === domain) setOpen((prev) => new Set(prev).add(saved.recipeKey));
  }, [domain]);

  const load = useCallback(
    () =>
      fetch("/api/craft/margins")
        .then((r) => r.json())
        .then((d: MarginsResp) => (d.error ? setErr(d.error) : (setData(d), setErr(null))))
        .catch((e) => setErr(String(e))),
    [],
  );

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const refreshNow = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setErr(null);
    setNotice(null);
    try {
      const res = await fetch("/api/craft/margins", { method: "POST" });
      const d = (await res.json().catch(() => ({}))) as { queued?: boolean; error?: string };
      if (!res.ok || d.error) setErr(d.error ?? `refresh failed (${res.status})`);
      else setNotice("refresh queued — poller picks it up within ~20s");
    } catch (e) {
      setErr(String(e));
    } finally {
      setRefreshing(false);
    }
  };

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const ex = data?.exaltPerDivine ?? null;
  const icons = data?.icons ?? {};
  const meta = CRAFT_DOMAINS[domain];
  const DomainIcon = meta.icon;
  const recipes = (data?.recipes ?? []).filter((x) => x.domain === domain).sort(byEv);

  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
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
            <span className="text-neutral-500">{recipes.length} recipe{recipes.length === 1 ? "" : "s"}</span>
          </span>
        )}
        {showRefresh && data?.canRefresh && (
          <button
            onClick={refreshNow}
            disabled={refreshing}
            title="queue a full re-price on the poller (owner)"
            className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white transition active:scale-[0.98] disabled:opacity-40"
          >
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} queue refresh
          </button>
        )}
      </header>

      {notice && <p className="mb-3 text-sm text-sky-400">{notice}</p>}

      {showRefresh && (
        <p className="mb-3 text-xs text-neutral-600">
          EV per attempt = <span className="text-neutral-400">hit rate × result median − base − materials</span>. Result and
          base legs are live trade2 comparables; materials are priced free from poe.ninja. Read-only — you craft manually.
        </p>
      )}

      {err && <p className="text-sm text-bad">error: {err}</p>}

      <div className="space-y-2">
        {recipes.map((r) => {
          const rep = r.report;
          const isOpen = open.has(r.key);
          const evTone = rep && rep.evDiv >= 0 ? "text-emerald-400" : "text-bad";
          const heroIcon = r.heroIcon ?? rep?.result?.icon ?? rep?.base?.icon ?? null;
          return (
            <div key={r.key} className="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950/40">
              <div
                onClick={() => toggle(r.key)}
                className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-neutral-800/30"
              >
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
                    {rep && rep.status !== "ok" && (
                      <span className={statusTone[rep.status] ?? "text-bad"}>{rep.status.replace("-", " ")}</span>
                    )}
                    {!rep && <span className="text-neutral-600">not scanned yet</span>}
                  </div>
                </div>
                {r.evHistory.length >= 2 && (
                  <span title="EV trend across the last scans">
                    <Sparkline data={r.evHistory} />
                  </span>
                )}
                <div
                  className="text-right"
                  title="expected profit per attempt at current prices: hit% × result price − base − materials"
                >
                  <div className="text-[10px] uppercase tracking-wide text-neutral-600">EV / attempt</div>
                  <div className={`text-lg font-semibold tabular-nums ${evTone}`}>
                    {rep?.status === "ok" ? evLabel(rep.evDiv, ex) : "—"}
                  </div>
                  <div className="text-xs tabular-nums text-neutral-500">
                    {rep?.status === "ok" ? `${rep.marginPct.toFixed(0)}% margin` : ""}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen((prev) => new Set(prev).add(r.key)); // the session lives at the top of the card
                  }}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-emerald-600/60 bg-gradient-to-b from-emerald-700 to-emerald-800 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:from-emerald-600 hover:to-emerald-700 active:scale-[0.98]"
                  title="open the interactive craft guide — shopping list, step by step, result into P&L"
                >
                  <Hammer className="h-4 w-4" /> Craft
                </button>
                {isOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-neutral-500" /> : <ChevronRight className="h-4 w-4 shrink-0 text-neutral-500" />}
              </div>
              {isOpen && <MarginBreakdown r={r} ex={ex} icons={icons} />}
            </div>
          );
        })}
        {recipes.length === 0 && !err && (
          <p className="py-3 text-center text-sm text-neutral-500">no recipes in this domain yet</p>
        )}
      </div>

    </section>
  );
}
