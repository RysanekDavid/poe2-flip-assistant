"use client";

import { timestampAgeMs } from "../../lib/sqliteTime";
import { StaleBadge } from "../ui/StaleBadge";
import { InfoTip } from "../ui/Tooltip";
import type { RecipeView } from "./craftView";

/** A scan older than this reads amber: the recipe is still listed, but on yesterday's market. */
const SCAN_WARN_MIN = 24 * 60;

// rankGate (core/craftValuation.ts) words its freshness reasons for logs; the player only needs to
// know the numbers are old and that a rescan is coming — the badge and cadence say exactly that.
const STALE_REASON = /^(legacy valuation|stale:)/;

export function splitGateReasons(reasons: readonly string[]): { stale: boolean; other: string[] } {
  return { stale: reasons.some((r) => STALE_REASON.test(r)), other: reasons.filter((r) => !STALE_REASON.test(r)) };
}

export function scanAgeMin(scannedAt: string | null): number | null {
  return scannedAt == null ? null : timestampAgeMs(scannedAt) / 60_000;
}

/**
 * Why a priced recipe is not ranked or alerted, in player terms: an age badge + the rescan cadence
 * for old/legacy scans, and the remaining sample-depth reasons behind one ⓘ.
 */
export function GateNote({ r, intervalMin }: { r: RecipeView; intervalMin: number }) {
  if (r.gate.ok) return null;
  const { stale, other } = splitGateReasons(r.gate.reasons);
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-xs text-neutral-400">
      {stale && (
        <>
          <StaleBadge ageMin={scanAgeMin(r.scannedAt)} warnAfterMin={SCAN_WARN_MIN} />
          <span>rescans every {intervalMin} min</span>
        </>
      )}
      {other.length > 0 && (
        <span className="inline-flex items-center gap-1">
          not ranked yet
          <InfoTip tip={other.join(" · ")} label="Why this recipe is not ranked" />
        </span>
      )}
    </span>
  );
}
