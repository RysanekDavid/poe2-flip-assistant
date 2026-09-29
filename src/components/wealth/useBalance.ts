"use client";

import { useCallback, useEffect, useState } from "react";
import type { ZodType } from "zod";
import { balanceResponseSchema, type BalanceResponse } from "../../lib/balanceContract";

export type { BalanceSourceId as Source, Pnl, Session, Snapshot, Stats, TabRow, TabSeriesPoint } from "../../lib/balanceContract";

export interface BalanceData extends Omit<BalanceResponse, "balances"> {
  /** Oldest → newest, for the chart. */
  series: BalanceResponse["balances"];
}

function errorOf(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("error" in body)) return null;
  const { error } = body as { error: unknown };
  return typeof error === "string" ? error : null;
}

/** POST JSON, throw the server's `error` on a non-2xx, and parse the body — callers render the error. */
export async function postJson<T>(url: string, schema: ZodType<T>, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data: unknown = await res.json();
  if (!res.ok) throw new Error(errorOf(data) ?? `request failed (${res.status})`);
  return schema.parse(data);
}

/** Wealth › Net worth data: /api/balance, with a visible error instead of a silently empty panel. */
export function useBalance(reloadKey: number): { data: BalanceData | null; error: string | null; load: () => void } {
  const [data, setData] = useState<BalanceData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/balance")
      .then(async (r) => {
        const body: unknown = await r.json();
        if (!r.ok) throw new Error(errorOf(body) ?? `wealth data failed (${r.status})`);
        return balanceResponseSchema.parse(body);
      })
      .then(({ balances, ...rest }) => {
        setData({ ...rest, series: balances.slice().reverse() });
        setError(null);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  return { data, error, load };
}
