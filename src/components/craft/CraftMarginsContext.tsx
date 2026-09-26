"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { RecipeView } from "./craftView";

/** The /api/craft/margins payload every Craft-tab panel renders from. */
export interface MarginsResp {
  enabled: boolean;
  computedLeague: string;
  intervalMin: number;
  canRefresh: boolean;
  exaltPerDivine: number | null;
  icons: Record<string, string>;
  recipes: RecipeView[];
  error?: string;
}

interface CraftMarginsState {
  data: MarginsResp | null;
  error: string | null;
  reload: () => void;
}

const CraftMarginsCtx = createContext<CraftMarginsState | null>(null);

const POLL_MS = 60_000;

/**
 * ONE poller for the whole Craft tab. Top picks + four domain windows each used to poll the same
 * endpoint every minute (5 identical requests); they now share this provider's single fetch.
 */
export function CraftMarginsProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<MarginsResp | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    fetch("/api/craft/margins")
      .then(async (response) => {
        const body = (await response.json()) as MarginsResp;
        if (!response.ok || body.error) throw new Error(body.error ?? `craft data failed (${response.status})`);
        return body;
      })
      .then((body) => {
        setData(body);
        setError(null);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    reload();
    const t = setInterval(reload, POLL_MS);
    return () => clearInterval(t);
  }, [reload]);

  const value = useMemo(() => ({ data, error, reload }), [data, error, reload]);
  return <CraftMarginsCtx.Provider value={value}>{children}</CraftMarginsCtx.Provider>;
}

/** Shared craft-margin data; throws when a panel is rendered outside the provider (a wiring bug
 *  that would otherwise show as a silently empty panel). */
export function useCraftMargins(): CraftMarginsState {
  const state = useContext(CraftMarginsCtx);
  if (!state) throw new Error("useCraftMargins must be used inside <CraftMarginsProvider>");
  return state;
}
