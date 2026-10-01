"use client";

import { useSyncExternalStore } from "react";
import { netWorthSummarySchema, type NetWorthSummary } from "../../lib/balanceSummaryContract";
import { assertOk, describeError } from "../../lib/clientWarn";

export interface NetWorthState {
  data: NetWorthSummary | null;
  /** Why the last read failed; the previous data, if any, is kept beside it. */
  error: string | null;
  loaded: boolean;
}

const ROUTE = "/api/balance/summary";
const POLL_MS = 120_000;
const INITIAL: NetWorthState = { data: null, error: null, loaded: false };

/*
 * One poll for every reader (the header's net-worth chip and Home's stash card): a module-level
 * store that runs while anyone is subscribed, so a second reader never adds a second request.
 */
let state: NetWorthState = INITIAL;
let timer: number | null = null;
const listeners = new Set<() => void>();

function emit(next: NetWorthState): void {
  state = next;
  for (const listener of listeners) listener();
}

function load(): void {
  fetch(ROUTE, { cache: "no-store" })
    .then(async (r) => netWorthSummarySchema.parse(await assertOk(r, ROUTE).json()))
    .then((data) => emit({ data, error: null, loaded: true }))
    .catch((e: unknown) => {
      console.warn("[net-worth] summary read failed:", describeError(e));
      emit({ data: state.data, error: describeError(e), loaded: true });
    });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    load();
    timer = window.setInterval(load, POLL_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  };
}

/** The latest net-worth summary, shared by every component that shows it. */
export function useNetWorthSummary(): NetWorthState {
  return useSyncExternalStore(subscribe, () => state, () => INITIAL);
}
