"use client";

import { useEffect, useState } from "react";
import { Crosshair, ExternalLink, TrendingUp, ChevronDown, Loader2 } from "lucide-react";

interface Target {
  name: string;
  type: string;
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

/**
 * Snipe Targets — auto-picked valuable, medium-volume items (no manual entry). Click a card
 * to pull its live cheapest listings straight into the app (real price + mods), and the
 * "open on trade site" link is a working id-based search (the site ignores `?q=`).
 */
export function SnipeTargets() {
  const [targets, setTargets] = useState<Target[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = () =>
      fetch("/api/snipe/targets")
        .then((r) => r.json())
        .then((d) => {
          if (d.error) setError(d.error);
          else setTargets(d.targets ?? []);
        })
        .catch(() => setError("failed to load"));
    load();
    const id = setInterval(load, 5 * 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
      <header className="mb-2 flex flex-wrap items-baseline gap-2">
        <Crosshair className="h-4 w-4 self-center text-orange-400" />
        <h2 className="text-lg font-semibold">Snipe Targets</h2>
        <span className="text-xs text-neutral-500">auto-picked · valuable + medium-volume (bots own the rest)</span>
      </header>

      {error ? (
        <p className="py-4 text-sm text-neutral-500">{error}</p>
      ) : targets == null ? (
        <p className="py-4 text-sm text-neutral-600">loading…</p>
      ) : targets.length === 0 ? (
        <p className="py-4 text-sm text-neutral-500">no medium-volume targets right now — band may need tuning</p>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {targets.map((t) => (
            <TargetCard key={t.name} t={t} />
          ))}
        </div>
      )}
      <p className="mt-2 text-xs text-neutral-600">
        Click a target → live cheapest listings load here. If one sits far under the Div value it&apos;s a snipe — open
        the search and buy it manually. (Needs your POESESSID — connect it in Settings.)
      </p>
    </section>
  );
}

function TargetCard({ t }: { t: Target }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ListingsResp | null>(null);
  const [loading, setLoading] = useState(false);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !data && !loading) {
      setLoading(true);
      fetch(`/api/snipe/listings?name=${encodeURIComponent(t.name)}`)
        .then((r) => r.json())
        .then((d: ListingsResp) => setData(d))
        .catch(() => setData({ total: 0, searchUrl: "", listings: [], error: "failed to load" }))
        .finally(() => setLoading(false));
    }
  };

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 transition-colors hover:border-orange-500/40">
      <button onClick={toggle} className="group block w-full p-3 text-left">
        <div className="flex items-start justify-between gap-2">
          <span className="truncate font-semibold text-neutral-200">{t.name}</span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-neutral-600 transition-transform group-hover:text-orange-400 ${open ? "rotate-180" : ""}`}
          />
        </div>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-lg font-bold tabular-nums text-emerald-400">{fmt(t.valueDiv, 1)}</span>
          <span className="text-xs text-neutral-500">Div value</span>
          {t.momentumPct > 5 && (
            <span className="ml-auto flex items-center gap-0.5 text-xs text-good">
              <TrendingUp className="h-3 w-3" />
              {fmt(t.momentumPct)}%
            </span>
          )}
        </div>
        <div className="mt-1 text-xs text-neutral-600">
          {t.quantity} listed ·{" "}
          <span title="average share of listings gone between poe2scout scrapes — a sell-through proxy, not sales">
            ~{fmt(t.sellThrough * 100)}% sell-through
          </span>
        </div>
      </button>

      {open && (
        <div className="border-t border-neutral-800 p-3 pt-2">
          {loading ? (
            <p className="flex items-center gap-1.5 py-2 text-xs text-neutral-500">
              <Loader2 className="h-3 w-3 animate-spin" /> loading live listings…
            </p>
          ) : data?.error ? (
            <p className="py-2 text-xs text-amber-500">{data.error}</p>
          ) : data && data.listings.length > 0 ? (
            <>
              <ul className="space-y-1.5">
                {data.listings.slice(0, 5).map((l, i) => (
                  <li key={i} className="text-xs">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-semibold tabular-nums text-neutral-200">{price(l.price)}</span>
                      <span className="truncate text-neutral-600">
                        {l.account}
                        {l.online ? " · online" : ""}
                      </span>
                    </div>
                    {l.mods.length > 0 && (
                      <div className="mt-0.5 truncate text-[11px] text-neutral-500">{l.mods.join(" · ")}</div>
                    )}
                  </li>
                ))}
              </ul>
              {data.searchUrl && (
                <a
                  href={data.searchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300"
                >
                  open on trade site ({fmt(data.total)} listed) <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </>
          ) : (
            <p className="py-2 text-xs text-neutral-500">no live listings found</p>
          )}
        </div>
      )}
    </div>
  );
}
