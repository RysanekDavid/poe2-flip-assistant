"use client";

import { useEffect, useState } from "react";
import { fmtSmart } from "../lib/format";

interface Health {
  ninjaFetchedAt: string | null; // sqlite UTC "YYYY-MM-DD HH:MM:SS"
  scoutFetchedAt: number | null; // ms epoch
  rates: { exaltPerDivine: number; chaosPerDivine: number } | null;
}

const STALE_MIN = 120; // red past this — the numbers on screen can't be trusted anymore

function ageLabel(mins: number): string {
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function AgeChip({ label, mins, hint }: { label: string; mins: number | null; hint: string }) {
  const stale = mins != null && mins >= STALE_MIN;
  return (
    <span
      title={mins == null ? `${hint} — not fetched yet` : stale ? `${hint} — STALE (${ageLabel(mins)} old), don't trust prices` : hint}
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 tabular-nums ${
        stale ? "bg-bad/15 font-semibold text-bad" : "bg-neutral-800/70 text-neutral-400"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${stale ? "bg-bad" : mins == null ? "bg-neutral-600" : "bg-good"}`} />
      {label} {mins == null ? "—" : ageLabel(mins)}
      {stale && " · STALE"}
    </span>
  );
}

/** Both directions on hover — the strip shows the readable one, the tooltip the inverse. */
function RateChip({ text, inverse }: { text: string; inverse: string }) {
  return (
    <span title={inverse} className="rounded bg-neutral-800/70 px-1.5 py-0.5 tabular-nums text-neutral-400">
      {text}
    </span>
  );
}

/**
 * Header status strip: how old each data source is (ninja = currency exchange,
 * scout = web-market uniques) + the three base cross-rates, ninja-style both ways
 * (hover a rate for the inverse). Red STALE chip past 2h — trust the numbers less.
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
  const scoutMins = health.scoutFetchedAt != null ? Math.max(0, Math.round((now - health.scoutFetchedAt) / 60000)) : null;
  const r = health.rates;

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <AgeChip label="ninja" mins={ninjaMins} hint="poe.ninja currency exchange — poller writes every 5 min, ninja itself updates ~hourly" />
      <AgeChip label="scout" mins={scoutMins} hint="poe2scout uniques (Web Market) — fetched on demand, cached 30 min" />
      {r && (
        <>
          <span className="text-neutral-700">·</span>
          <RateChip text={`1 Div = ${fmtSmart(r.exaltPerDivine)} Ex`} inverse={`1 Ex = ${fmtSmart(1 / r.exaltPerDivine)} Div`} />
          <RateChip text={`1 Div = ${fmtSmart(r.chaosPerDivine)} Ch`} inverse={`1 Ch = ${fmtSmart(1 / r.chaosPerDivine)} Div`} />
          <RateChip
            text={`1 Ch = ${fmtSmart(r.exaltPerDivine / r.chaosPerDivine)} Ex`}
            inverse={`1 Ex = ${fmtSmart(r.chaosPerDivine / r.exaltPerDivine)} Ch`}
          />
        </>
      )}
    </div>
  );
}
