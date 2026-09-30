"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { assertOk, describeError, warnOnFailure } from "../../../lib/clientWarn";
import { marketPricesResponseSchema, type MarketPriceItem, type MarketPricesResponse } from "../../../lib/marketPricesContract";
import { marketUniquesResponseSchema, type MarketUniquesResponse } from "../../../lib/marketUniquesContract";
import { useVisiblePoll } from "../../../lib/useVisiblePoll";
import { WatchlistResponseSchema, inLeague } from "../../../lib/watchlistContract";
import { watchPayload } from "./pricesView";

// poe.ninja refreshes hourly and the exchange digest hourly; five minutes catches either promptly.
const POLL_MS = 5 * 60_000;
const ROUTE = "/api/market/prices";
const UNIQUES_ROUTE = "/api/market/prices/uniques";
const WATCH_ROUTE = "/api/watchlist";
/** DiscoverTable and the flip card listen for this to refresh their own watch state. */
const WATCH_EVENT = "watchlist-changed";

export function useMarketPrices() {
  const [data, setData] = useState<MarketPricesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    fetch(ROUTE, { cache: "no-store" })
      .then(async (r) => {
        setData(marketPricesResponseSchema.parse(await assertOk(r, ROUTE).json()));
        setError(null);
      })
      .catch((e: unknown) => {
        warnOnFailure("[market] prices")(e);
        setError(describeError(e));
      });
  }, []);
  useVisiblePoll(load, POLL_MS);
  return { data, error };
}

const routeError = z.object({ error: z.string() });

/** The route answers a failure with `{ error }`; carry that text to the pane instead of a bare status. */
async function readUniques(r: Response): Promise<MarketUniquesResponse> {
  const body: unknown = await r.json();
  if (!r.ok) {
    const e = routeError.safeParse(body);
    throw new Error(`${UNIQUES_ROUTE} → HTTP ${r.status}${e.success ? `: ${e.data.error}` : ""}`);
  }
  return marketUniquesResponseSchema.parse(body);
}

/**
 * The UNIQUES group, polled apart so a poe2scout outage never takes the exchange table down.
 * Nothing is fetched until `wanted` first turns true (a unique category or a search is on screen):
 * a cold demand cache costs a full scout fill, which an exchange-only visit should not trigger.
 * Once requested it keeps polling, so going back and forth does not reload from scratch.
 */
export function useMarketUniques(wanted: boolean) {
  const [data, setData] = useState<MarketUniquesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requested, setRequested] = useState(wanted);
  useEffect(() => {
    if (wanted) setRequested(true);
  }, [wanted]);
  const load = useCallback(() => {
    if (!requested) return;
    fetch(UNIQUES_ROUTE, { cache: "no-store" })
      .then(async (r) => {
        setData(await readUniques(r));
        setError(null);
      })
      .catch((e: unknown) => {
        warnOnFailure("[market] uniques")(e);
        setError(describeError(e));
      });
  }, [requested]);
  // Wanted at mount: useVisiblePoll's first run loads. Wanted later: that run was a no-op, so load here.
  const wantedAtMount = useRef(wanted);
  useEffect(() => {
    if (requested && !wantedAtMount.current) load();
  }, [requested, load]);
  useVisiblePoll(load, POLL_MS);
  return { data, error, requested };
}

async function sendWatch(method: "POST" | "DELETE", body: unknown): Promise<void> {
  const r = await fetch(WATCH_ROUTE, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  assertOk(r, `${method} ${WATCH_ROUTE}`);
}

/** Ids watched in the league you are viewing (a row watched elsewhere belongs to that market). */
export function useWatched() {
  const [watched, setWatched] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    fetch(WATCH_ROUTE, { cache: "no-store" })
      .then(async (r) => WatchlistResponseSchema.parse(await assertOk(r, WATCH_ROUTE).json()))
      .then((d) => setWatched(new Set(d.watchlist.filter((w) => w.active === 1 && inLeague(w, d.league)).map((w) => w.item_id))))
      .catch((e: unknown) => {
        warnOnFailure("[market] watchlist")(e);
        setError(describeError(e));
      });
  }, []);
  useEffect(() => {
    load();
    window.addEventListener(WATCH_EVENT, load);
    return () => window.removeEventListener(WATCH_EVENT, load);
  }, [load]);
  const toggle = useCallback(
    (item: MarketPriceItem) => {
      const request = watched.has(item.itemId)
        ? sendWatch("DELETE", { itemId: item.itemId })
        : sendWatch("POST", watchPayload(item));
      request
        .then(() => {
          setError(null);
          window.dispatchEvent(new Event(WATCH_EVENT));
        })
        .catch((e: unknown) => {
          warnOnFailure("[market] watch toggle")(e);
          setError(describeError(e));
        });
    },
    [watched],
  );
  return { watched, toggle, error };
}
