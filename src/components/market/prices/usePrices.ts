"use client";

import { useCallback, useEffect, useState } from "react";
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

/** The UNIQUES group, polled apart so a poe2scout outage never takes the exchange table down. */
export function useMarketUniques() {
  const [data, setData] = useState<MarketUniquesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    fetch(UNIQUES_ROUTE, { cache: "no-store" })
      .then(async (r) => {
        setData(marketUniquesResponseSchema.parse(await assertOk(r, UNIQUES_ROUTE).json()));
        setError(null);
      })
      .catch((e: unknown) => {
        warnOnFailure("[market] uniques")(e);
        setError(describeError(e));
      });
  }, []);
  useVisiblePoll(load, POLL_MS);
  return { data, error };
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
