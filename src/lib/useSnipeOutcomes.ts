"use client";

import { useCallback, useState } from "react";
import { fetchSnipeOutcomes, type SnipeOutcomesResponse } from "./snipeOutcomeContract";
import { useVisiblePoll } from "./useVisiblePoll";

// checkpoints land every 30 min at most; 5 min keeps a fresh chip without hammering the route
const POLL_MS = 5 * 60_000;

/** Snipe outcome checkpoints + per-archetype hit rates, refreshed while the tab is visible. */
export function useSnipeOutcomes(): { data: SnipeOutcomesResponse | null; error: string | null } {
  const [data, setData] = useState<SnipeOutcomesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    fetchSnipeOutcomes()
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[snipe-outcomes] load failed", e);
        setError(msg);
      });
  }, []);
  useVisiblePoll(load, POLL_MS);
  return { data, error };
}
