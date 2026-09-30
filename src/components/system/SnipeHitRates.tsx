"use client";

import { Info } from "lucide-react";
import { fetchMethodCaveat, GONE_MEANING, type ProfileOutcomeStats, type SnipeOutcomesResponse } from "../../lib/snipeOutcomeContract";

const pctText = (p: number | null): string => (p == null ? "—" : `${Math.round(p)}%`);

function hitRateHint(p: ProfileOutcomeStats): string {
  const lines = [
    `gone <2h: ${pctText(p.gone2hPct)} of ${p.checked2h} checked at 2 h`,
    `gone <24h: ${pctText(p.gone24hPct)} · still listed at 24 h: ${pctText(p.listed24hPct)} (of ${p.decided24h})`,
    p.medianMarginGonePct != null || p.medianMarginListedPct != null
      ? `median alert margin: gone ${pctText(p.medianMarginGonePct)} vs still listed ${pctText(p.medianMarginListedPct)}`
      : null,
    p.errors > 0 ? `${p.errors} check(s) failed` : null,
    GONE_MEANING,
  ];
  return lines.filter((l): l is string => l != null).join("\n");
}

/**
 * Per-archetype hit rate of past snipe alerts: how often the listing was gone within 2 h. Owner
 * diagnostics (Settings › System). Neutral until the fetch method is verified; once it is known to
 * be broken its percentages are not shown at all.
 */
export function SnipeHitRates({ data }: { data: SnipeOutcomesResponse }) {
  const rows = data.profiles.filter((p) => p.checked2h > 0 || p.decided24h > 0);
  if (rows.length === 0 && data.pending === 0) return <p className="text-xs text-neutral-400">No alert outcomes checked yet.</p>;
  const caveat = fetchMethodCaveat(data.fetchMethod);
  const rateTone = data.fetchMethod === "verified" ? "text-neutral-200" : "text-neutral-400";
  const head = `alerts of the last ${data.windowDays} days in ${data.league}, re-checked 2 h and 24 h later\n${GONE_MEANING}${caveat ? `\n${caveat}` : ""}`;
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-400">
      <span className="flex items-center gap-1 font-medium text-neutral-300" title={head}>
        Alert outcomes{data.fetchMethod === "unverified" && <span className="font-normal text-neutral-500"> · unverified method</span>}
        <Info aria-hidden className="h-3.5 w-3.5 text-neutral-500" />
      </span>
      {data.fetchMethod === "broken" ? (
        <span className="text-warn" title={caveat ?? ""}>hit rates hidden — the re-fetch method proved unreliable; checks now re-search</span>
      ) : (
        rows.map((p) => (
          <span key={p.profile} title={`${hitRateHint(p)}${caveat ? `\n${caveat}` : ""}`}>
            {p.label} <span className={`tabular-nums ${rateTone}`}>{pctText(p.gone2hPct)}</span> gone &lt;2h
            <span className="text-neutral-500"> (n={p.checked2h})</span>
          </span>
        ))
      )}
      {data.pending > 0 && <span className="text-neutral-500">{data.pending} awaiting a check</span>}
    </p>
  );
}
