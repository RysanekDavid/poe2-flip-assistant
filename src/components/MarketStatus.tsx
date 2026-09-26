"use client";

import { useEffect, useState } from "react";
import { ArrowRightLeft } from "lucide-react";
import { fmtSmart } from "../lib/format";
import { assertOk, warnOnFailure } from "../lib/clientWarn";

type CcyKey = "div" | "ex" | "chaos";
const CCY_LABEL: Record<CcyKey, string> = { div: "Div", ex: "Ex", chaos: "Chaos" };

/** Inline converter: type an amount in any currency, the other two appear as chips. */
function Converter({ rates }: { rates: { exaltPerDivine: number; chaosPerDivine: number } }) {
  const [amount, setAmount] = useState("");
  const [ccy, setCcy] = useState<CcyKey>("ex");
  const n = Number(amount.replace(",", "."));
  const div = !Number.isFinite(n) || n <= 0 ? null : ccy === "div" ? n : ccy === "ex" ? n / rates.exaltPerDivine : n / rates.chaosPerDivine;
  const others = (["div", "ex", "chaos"] as CcyKey[]).filter((c) => c !== ccy);
  const valueIn = (c: CcyKey): number => (c === "div" ? div! : c === "ex" ? div! * rates.exaltPerDivine : div! * rates.chaosPerDivine);

  return (
    <span
      title="currency converter — uses the base rates shown in this strip"
      className="inline-flex items-center gap-2 rounded-md border border-amber-500/25 bg-neutral-900/80 py-1 pl-2 pr-1.5 text-sm shadow-sm"
    >
      <ArrowRightLeft className="h-3.5 w-3.5 shrink-0 text-amber-500/70" />
      <input
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="convert…"
        // width follows the typed value — a fixed width leaves an ugly gap after short numbers
        style={{ width: amount ? `${Math.max(2, amount.length + 1)}ch` : "9ch" }}
        className="bg-transparent tabular-nums text-neutral-100 outline-none placeholder:text-neutral-600"
      />
      <Ccy icon={CCY_ICON[ccy]} alt={CCY_LABEL[ccy]} />
      <select
        value={ccy}
        onChange={(e) => setCcy(e.target.value as CcyKey)}
        className="bg-transparent text-neutral-400 outline-none"
      >
        {(["div", "ex", "chaos"] as CcyKey[]).map((c) => (
          <option key={c} value={c} className="bg-neutral-900">
            {CCY_LABEL[c]}
          </option>
        ))}
      </select>
      {div != null && (
        <>
          <span className="text-neutral-600">=</span>
          {/* each converted currency in its own segment — readable at a glance */}
          {others.map((c) => (
            <span
              key={c}
              className="inline-flex items-center gap-1.5 rounded bg-neutral-800/80 px-2 py-1 tabular-nums text-neutral-100"
            >
              {fmtSmart(valueIn(c))}
              <Ccy icon={CCY_ICON[c]} alt={CCY_LABEL[c]} />
            </span>
          ))}
        </>
      )}
    </span>
  );
}

/** Where the displayed base rates came from — the app falls back down this list in order. */
type RatesSource = "cx" | "ninja" | "scout";

interface Health {
  ninjaFetchedAt: string | null; // sqlite UTC "YYYY-MM-DD HH:MM:SS"
  scoutFetchedAt: number | null; // ms epoch
  rates: { exaltPerDivine: number; chaosPerDivine: number } | null;
  ratesSource: RatesSource | null;
  ratesFetchedAt: string | null; // sqlite UTC, same shape as ninjaFetchedAt
}

const STALE_MIN = 120; // red warning past this — the numbers on screen can't be trusted anymore

const SOURCE_LABEL: Record<RatesSource, string> = {
  cx: "GGG exchange",
  ninja: "poe.ninja",
  scout: "poe2scout",
};

/** Minutes since a sqlite UTC timestamp ("YYYY-MM-DD HH:MM:SS"), which has no zone marker. */
function minutesSince(stamp: string | null, now: number): number | null {
  if (!stamp) return null;
  return Math.max(0, Math.round((now - new Date(stamp.replace(" ", "T") + "Z").getTime()) / 60000));
}

function ageLabel(mins: number | null): string {
  if (mins == null) return "age unknown";
  if (mins < 60) return `${mins}m old`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m old`;
}

/**
 * Source + age used to be a visible chip; users called it noise. It now rides in every rate
 * chip's tooltip instead — invisible until you ask, but a rate's origin stays auditable.
 */
function sourceNote(source: RatesSource | null, mins: number | null): string {
  return source ? ` · ${SOURCE_LABEL[source]}, ${ageLabel(mins)}` : "";
}

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
 * the inverse), plus which source produced them and how old it is. The loud red chip is still
 * reserved for stale ninja data (>2h) — the source chip is quiet because "GGG exchange, 20m
 * old" is context, not an alarm, but a rate whose origin is invisible is a rate you can't audit.
 */
export function MarketStatus() {
  const [health, setHealth] = useState<Health | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const load = () =>
      fetch("/api/health")
        .then((r) => assertOk(r, "/api/health").json())
        .then(setHealth)
        .catch(warnOnFailure("[market-status] health poll"));
    load();
    const poll = setInterval(load, 60_000);
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, []);

  if (!health) return null;

  const ninjaMins = minutesSince(health.ninjaFetchedAt, now);
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
          <RateChips
            rates={r}
            note={sourceNote(health.ratesSource, minutesSince(health.ratesFetchedAt, now))}
          />
          <Converter rates={r} />
        </>
      )}
    </div>
  );
}

/** The three base cross-rates, each hoverable for its inverse plus the rates' source and age. */
function RateChips({
  rates: r,
  note,
}: {
  rates: { exaltPerDivine: number; chaosPerDivine: number };
  note: string;
}) {
  return (
    <>
      <RateChip
        left={{ qty: "1", icon: CCY_ICON.div, alt: "Divine Orb" }}
        right={{ qty: fmtSmart(r.exaltPerDivine), icon: CCY_ICON.ex, alt: "Exalted Orb" }}
        inverse={`1 Ex = ${fmtSmart(1 / r.exaltPerDivine)} Div${note}`}
      />
      <RateChip
        left={{ qty: "1", icon: CCY_ICON.div, alt: "Divine Orb" }}
        right={{ qty: fmtSmart(r.chaosPerDivine), icon: CCY_ICON.chaos, alt: "Chaos Orb" }}
        inverse={`1 Ch = ${fmtSmart(1 / r.chaosPerDivine)} Div${note}`}
      />
      <RateChip
        left={{ qty: "1", icon: CCY_ICON.chaos, alt: "Chaos Orb" }}
        right={{ qty: fmtSmart(r.exaltPerDivine / r.chaosPerDivine), icon: CCY_ICON.ex, alt: "Exalted Orb" }}
        inverse={`1 Ex = ${fmtSmart(r.chaosPerDivine / r.exaltPerDivine)} Ch${note}`}
      />
    </>
  );
}
