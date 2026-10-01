"use client";

import { parseSqliteTimestamp } from "../../lib/sqliteTime";
import { fmtAgeMin } from "./StaleBadge";

interface ProvenanceChipProps {
  /** What the column or panel shows: "Price", "Drop pool", "Drop rates". */
  label: string;
  /** Where it comes from, in words a player recognises: "poe.ninja (GGG exchange)", "game data". */
  source: string;
  /** SQLite or ISO time of the newest data; omitted for curated data with no fetch time. */
  at?: string | null;
  /** Past this age the chip turns amber (old data is a caveat, never red). */
  warnAfterMin?: number;
  /** Extra hover text: what is and is not covered. */
  title?: string;
}

/** "14:05" today, "29 Sep 14:05" otherwise — the wall-clock time a player can compare to their own. */
function clock(ms: number, nowMs: number): string {
  const d = new Date(ms);
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return new Date(nowMs).toDateString() === d.toDateString() ? time : `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} ${time}`;
}

/**
 * One provenance line per column or panel header — "Price · poe.ninja (GGG exchange) · 14:05" —
 * instead of a source link on every row. A missing fetch time says "no data yet" rather than hiding.
 */
export function ProvenanceChip({ label, source, at, warnAfterMin, title }: ProvenanceChipProps) {
  const nowMs = Date.now();
  const ms = at == null ? null : parseSqliteTimestamp(at);
  const ageMin = ms === null ? null : (nowMs - ms) / 60_000;
  const stale = ageMin !== null && warnAfterMin !== undefined && ageMin > warnAfterMin;
  const when = at === undefined ? null : ms === null ? "no data yet" : clock(ms, nowMs);
  const age = ageMin === null ? "" : `updated ${fmtAgeMin(ageMin)} ago${stale ? " — treat as stale" : ""}`;
  const hover = [title, age].filter((part) => part !== undefined && part !== "").join("\n");
  return (
    <span
      title={hover === "" ? undefined : hover}
      className={`inline-flex max-w-full flex-wrap items-center gap-x-1 rounded border px-1.5 text-xs ${stale ? "border-amber-400/40 text-amber-300" : "border-line text-neutral-400"}`}
    >
      <span className="text-neutral-300">{label}</span>· {source}
      {when && <span className="tabular-nums">· {when}</span>}
    </span>
  );
}
