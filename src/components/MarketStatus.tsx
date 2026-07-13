"use client";

import { useEffect, useState } from "react";
import { fmtSmart } from "../lib/format";

interface Health {
  ninjaFetchedAt: string | null; // sqlite UTC "YYYY-MM-DD HH:MM:SS"
  scoutFetchedAt: number | null; // ms epoch
  rates: { exaltPerDivine: number; chaosPerDivine: number } | null;
}

const STALE_MIN = 120; // red warning past this — the numbers on screen can't be trusted anymore

// PoE2 currency art (poecdn) — the rate chips read like the in-game exchange.
const CCY_ICON = {
  div: "https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lNb2RWYWx1ZXMiLCJzY2FsZSI6MSwicmVhbG0iOiJwb2UyIn1d/2986e220b3/CurrencyModValues.png",
  ex: "https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lBZGRNb2RUb1JhcmUiLCJzY2FsZSI6MSwicmVhbG0iOiJwb2UyIn1d/ad7c366789/CurrencyAddModToRare.png",
  chaos: "https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lSZXJvbGxSYXJlIiwic2NhbGUiOjEsInJlYWxtIjoicG9lMiJ9XQ/c0ca392a78/CurrencyRerollRare.png",
} as const;

function Ccy({ icon, alt }: { icon: string; alt: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- poecdn currency art, fixed tiny size
  return <img src={icon} alt={alt} title={alt} className="h-6 w-6 shrink-0 object-contain" />;
}

/** "1 <div art> = 509 <ex art>" — both directions on hover (tooltip shows the inverse). */
function RateChip({
  left,
  right,
  inverse,
}: {
  left: { qty: string; icon: string; alt: string };
  right: { qty: string; icon: string; alt: string };
  inverse: string;
}) {
  return (
    <span
      title={inverse}
      className="inline-flex items-center gap-1 rounded-md border border-neutral-800 bg-neutral-900/80 px-2 py-1 tabular-nums text-neutral-300 shadow-sm"
    >
      {left.qty} <Ccy icon={left.icon} alt={left.alt} />
      <span className="text-neutral-600">=</span>
      {right.qty} <Ccy icon={right.icon} alt={right.alt} />
    </span>
  );
}

/**
 * Header rate strip: the three base cross-rates with currency art, both ways (hover a rate for
 * the inverse). Source freshness stays invisible until it matters — a red chip appears only
 * when ninja data goes stale (>2h), because stale prices are the one thing worth shouting about.
 */
export function MarketStatus() {
  const [health, setHealth] = useState<Health | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const load = () =>
      fetch("/api/health")
        .then((r) => r.json())
        .then(setHealth)
        .catch(() => {});
    load();
    const poll = setInterval(load, 60_000);
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, []);

  if (!health) return null;

  const ninjaMins = health.ninjaFetchedAt
    ? Math.max(0, Math.round((now - new Date(health.ninjaFetchedAt.replace(" ", "T") + "Z").getTime()) / 60000))
    : null;
  const ninjaStale = ninjaMins != null && ninjaMins >= STALE_MIN;
  const r = health.rates;

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      {ninjaStale && (
        <span
          title={`poe.ninja data is ${Math.floor(ninjaMins / 60)}h ${ninjaMins % 60}m old — don't trust the prices, check the poller`}
          className="inline-flex items-center gap-1 rounded-md bg-bad/15 px-2 py-1 font-semibold text-bad"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-bad" /> prices stale
        </span>
      )}
      {r && (
        <>
          <RateChip
            left={{ qty: "1", icon: CCY_ICON.div, alt: "Divine Orb" }}
            right={{ qty: fmtSmart(r.exaltPerDivine), icon: CCY_ICON.ex, alt: "Exalted Orb" }}
            inverse={`1 Ex = ${fmtSmart(1 / r.exaltPerDivine)} Div`}
          />
          <RateChip
            left={{ qty: "1", icon: CCY_ICON.div, alt: "Divine Orb" }}
            right={{ qty: fmtSmart(r.chaosPerDivine), icon: CCY_ICON.chaos, alt: "Chaos Orb" }}
            inverse={`1 Ch = ${fmtSmart(1 / r.chaosPerDivine)} Div`}
          />
          <RateChip
            left={{ qty: "1", icon: CCY_ICON.chaos, alt: "Chaos Orb" }}
            right={{ qty: fmtSmart(r.exaltPerDivine / r.chaosPerDivine), icon: CCY_ICON.ex, alt: "Exalted Orb" }}
            inverse={`1 Ex = ${fmtSmart(r.chaosPerDivine / r.exaltPerDivine)} Ch`}
          />
        </>
      )}
    </div>
  );
}
