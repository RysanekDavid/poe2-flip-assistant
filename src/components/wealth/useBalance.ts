"use client";

import { useCallback, useEffect, useState } from "react";

export type Source = "trade" | "stash" | "ocr" | "manual";

export interface Snapshot {
  id: number;
  divine: number;
  exalted: number;
  chaos: number;
  other_div: number;
  net_worth_div: number;
  source: Source;
  note: string | null;
  fetched_at: string;
  listed_seen: number | null;
  listed_total: number | null;
  gear_at_ask_div: number | null;
}

export interface Stats {
  latest: Snapshot | null;
  first: Snapshot | null;
  change24hPct: number | null;
  change7dPct: number | null;
  changeAllPct: number | null;
  count: number;
}

export interface Pnl {
  points: { t: string; cum: number }[];
  total: number;
  last7d: number;
  last24h: number;
  count: number;
}

export interface TabRow {
  tab: string;
  divine: number;
  exalted: number;
  chaos: number;
  other_div: number;
  value_div: number;
  items: number;
  unpriced: number;
}

export interface TabSeriesPoint {
  tab: string;
  fetched_at: string;
  value_div: number;
}

interface BalanceResp {
  computedLeague?: string;
  balances?: Snapshot[];
  stats?: Stats;
  pnl?: Pnl;
  stashEnabled?: boolean;
  tabs?: TabRow[];
  tabSeries?: TabSeriesPoint[];
  error?: string;
}

export interface BalanceData {
  league: string | null;
  series: Snapshot[]; // oldest → newest for the chart
  stats: Stats | null;
  pnl: Pnl | null;
  stashEnabled: boolean;
  tabs: TabRow[];
  tabSeries: TabSeriesPoint[];
}

const EMPTY: BalanceData = { league: null, series: [], stats: null, pnl: null, stashEnabled: false, tabs: [], tabSeries: [] };

/** POST JSON and throw the server's `error` on a non-2xx — callers render it, never swallow it. */
export async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const d = (await res.json()) as T & { error?: string };
  if (!res.ok || d.error) throw new Error(d.error ?? `request failed (${res.status})`);
  return d;
}

/** Wealth-tab data: /api/balance, with a visible error instead of a silently empty panel. */
export function useBalance(): { data: BalanceData; error: string | null; load: () => void } {
  const [data, setData] = useState<BalanceData>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/balance")
      .then(async (r) => {
        const d = (await r.json()) as BalanceResp;
        if (!r.ok || d.error) throw new Error(d.error ?? `wealth data failed (${r.status})`);
        return d;
      })
      .then((d) => {
        setData({
          league: d.computedLeague ?? null,
          series: (d.balances ?? []).slice().reverse(),
          stats: d.stats ?? null,
          pnl: d.pnl ?? null,
          stashEnabled: d.stashEnabled ?? false,
          tabs: d.tabs ?? [],
          tabSeries: d.tabSeries ?? [],
        });
        setError(null);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { data, error, load };
}
