"use client";

import { useEffect, useState } from "react";
import { Crosshair, ExternalLink, TrendingUp, ChevronDown, Loader2 } from "lucide-react";
import { ItemArt } from "./ui/ItemArt";
import { EmptyState } from "./ui/EmptyState";
import { InfoTip } from "./ui/Tooltip";

interface Target {
  name: string;
  type: string;
  icon: string | null;
  valueDiv: number;
  quantity: number;
  sellThrough: number; // avg share of listings gone per scrape (0..1) — a proxy, not sales
  momentumPct: number;
  reason: string;
}

interface ListingRow {
  price: { amount: number; currency: string } | null;
  account: string;
  online: boolean;
  indexed: string | null;
  mods: string[];
}
interface ListingsResp {
  total: number;
  searchUrl: string;
  listings: ListingRow[];
  error?: string;
}

const fmt = (n: number, d = 0): string => n.toLocaleString("en", { maximumFractionDigits: d });
const price = (p: ListingRow["price"]): string => (p ? `${fmt(p.amount, 2)} ${p.currency}` : "—");

const ABOUT =
  "Auto-picked valuable, medium-volume uniques (bots own the rest). Open a target to load its cheapest live listings; " +
  "one far under the Div value is a snipe — open the search and buy it yourself. Needs your POESESSID (Settings).";

function useTargets(): { targets: Target[] | null; error: string | null } {
  const [targets, setTargets] = useState<Target[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const load = () =>
      fetch("/api/snipe/targets")
        .then(async (r) => {
          const d = (await r.json()) as { targets?: Target[]; error?: string };
          if (!r.ok || d.error) throw new Error(d.error ?? `/api/snipe/targets → ${r.status}`);
          setTargets(d.targets ?? []);
          setError(null);
        })
        .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    load();
    const id = setInterval(load, 5 * 60_000);
    return () => clearInterval(id);
  }, []);
  return { targets, error };
}

/**
 * Snipe Targets — auto-picked valuable, medium-volume items (no manual entry). Open a card to
 * pull its live cheapest listings into the app; its trade-site link is a working id-based search
 * (the site ignores `?q=`).
 */
export function SnipeTargets() {
  const { targets, error } = useTargets();
  return (
    <section className="rounded-lg border border-line bg-neutral-900/50 p-4">
      <header className="mb-3 flex items-center gap-2">
        <Crosshair aria-hidden className="h-4 w-4 text-neutral-400" />
        <h3 className="text-lg font-semibold text-neutral-100">Snipe targets</h3>
        <InfoTip tip={ABOUT} label="About snipe targets" side="bottom" />
      </header>
      {error ? (
        <p role="alert" className="py-2 text-sm text-bad">{error}</p>
      ) : targets == null ? (
        <p className="py-2 text-sm text-neutral-400">loading…</p>
      ) : targets.length === 0 ? (
        <EmptyState icon={<Crosshair className="h-5 w-5" />} sentence="No medium-volume targets right now — the value band finds none in this market." />
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {targets.map((t) => <TargetCard key={t.name} t={t} />)}
        </div>
      )}
    </section>
  );
}

function Listings({ data }: { data: ListingsResp }) {
  if (data.error) return <p className="py-2 text-xs text-warn">{data.error}</p>;
  if (data.listings.length === 0) return <p className="py-2 text-xs text-neutral-400">no live listings found</p>;
  return (
    <>
      <ul className="space-y-1.5">
        {data.listings.slice(0, 5).map((l, i) => (
          <li key={i} className="text-xs">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-semibold tabular-nums text-neutral-100">{price(l.price)}</span>
              <span className="truncate text-neutral-400">{l.account}{l.online ? " · online" : ""}</span>
            </div>
            {l.mods.length > 0 && <div className="mt-0.5 truncate text-xs text-neutral-400">{l.mods.join(" · ")}</div>}
          </li>
        ))}
      </ul>
      {data.searchUrl && (
        <a href={data.searchUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300">
          open on trade site ({fmt(data.total)} listed) <ExternalLink aria-hidden className="h-3 w-3" />
        </a>
      )}
    </>
  );
}

function useListings(name: string) {
  const [data, setData] = useState<ListingsResp | null>(null);
  const [loading, setLoading] = useState(false);
  const fetchOnce = () => {
    if (data || loading) return;
    setLoading(true);
    fetch(`/api/snipe/listings?name=${encodeURIComponent(name)}`)
      .then(async (r) => {
        const d = (await r.json()) as ListingsResp;
        setData(r.ok ? d : { ...d, error: d.error ?? `listings failed (${r.status})` });
      })
      .catch((e: unknown) => setData({ total: 0, searchUrl: "", listings: [], error: `listings failed: ${e instanceof Error ? e.message : String(e)}` }))
      .finally(() => setLoading(false));
  };
  return { data, loading, fetchOnce };
}

function TargetCard({ t }: { t: Target }) {
  const [open, setOpen] = useState(false);
  const { data, loading, fetchOnce } = useListings(t.name);
  const toggle = () => {
    if (!open) fetchOnce();
    setOpen(!open);
  };
  return (
    <div className="rounded-lg border border-line bg-neutral-950/40 transition-colors hover:border-amber-400/40">
      <button type="button" onClick={toggle} aria-expanded={open} className="group flex w-full items-start gap-3 p-3 text-left">
        <ItemArt src={t.icon} size={12} />
        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-2">
            <span className="truncate font-semibold text-neutral-100">{t.name}</span>
            <ChevronDown aria-hidden className={`h-4 w-4 shrink-0 text-neutral-400 transition-transform group-hover:text-amber-300 ${open ? "rotate-180" : ""}`} />
          </span>
          <span className="mt-1 flex items-baseline gap-1.5">
            <span className="text-lg font-bold tabular-nums text-neutral-100">{fmt(t.valueDiv, 1)}</span>
            <span className="text-xs text-neutral-400">Div value</span>
            {t.momentumPct > 5 && (
              <span className="ml-auto flex items-center gap-0.5 text-xs text-good">
                <TrendingUp aria-hidden className="h-3 w-3" />
                {fmt(t.momentumPct)}%
              </span>
            )}
          </span>
          <span className="mt-1 block text-xs text-neutral-400" title="average share of listings gone between poe2scout scrapes — a sell-through proxy, not sales">
            {t.quantity} listed · ~{fmt(t.sellThrough * 100)}% sell-through
          </span>
        </span>
      </button>
      {open && (
        <div className="border-t border-line p-3 pt-2">
          {loading || !data ? (
            <p className="flex items-center gap-1.5 py-2 text-xs text-neutral-400"><Loader2 aria-hidden className="h-3 w-3 animate-spin" /> loading live listings…</p>
          ) : (
            <Listings data={data} />
          )}
        </div>
      )}
    </div>
  );
}
