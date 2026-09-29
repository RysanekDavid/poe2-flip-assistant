"use client";

import { useCallback, useEffect, useState } from "react";
import { repriceResponseSchema, sellResponseSchema, type SellResponse } from "../../lib/wealthContract";
import { postJson } from "./useBalance";

/** Wealth › Sell data (/api/wealth/sell) and the queued reprice check (/api/wealth/reprice). */
export function useSell(reloadKey: number): {
  data: SellResponse | null;
  error: string | null;
  repriceError: string | null;
  requesting: boolean;
  requestReprice: () => void;
} {
  const [data, setData] = useState<SellResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [repriceError, setRepriceError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);

  const load = useCallback(() => {
    fetch("/api/wealth/sell")
      .then(async (r) => {
        const body: unknown = await r.json();
        if (!r.ok) {
          const msg = typeof body === "object" && body !== null && "error" in body ? String((body as { error: unknown }).error) : null;
          throw new Error(msg ?? `sell plan failed (${r.status})`);
        }
        return sellResponseSchema.parse(body);
      })
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  const requestReprice = useCallback(() => {
    setRequesting(true);
    setRepriceError(null);
    postJson("/api/wealth/reprice", repriceResponseSchema)
      .then(load)
      .catch((e: unknown) => setRepriceError(e instanceof Error ? e.message : String(e)))
      .finally(() => setRequesting(false));
  }, [load]);

  // A queued check finishes in the poller within a few minutes; pick its comps up without a reload.
  const queued = data?.reprice.state === "queued" || data?.reprice.state === "running";
  useEffect(() => {
    if (!queued) return;
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, [queued, load]);

  return { data, error, repriceError, requesting, requestReprice };
}
