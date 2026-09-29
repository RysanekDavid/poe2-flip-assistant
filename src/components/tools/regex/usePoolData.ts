"use client";

import { useEffect, useState } from "react";
import { RegexPoolSchema, VendorDataSchema, type PoolTab, type RegexPool, type VendorData } from "../../../core/tools/regex/pools/schema";

export type DataState<T> = { status: "loading" } | { status: "ready"; data: T } | { status: "error"; message: string };

/*
 * Dynamic imports: each dataset is its own chunk, downloaded only when its sub-tab opens. The
 * parsed object is cached per dataset because the composer memoizes its collision namespace on
 * object identity — reparsing on every tab switch would rebuild the trigram index each time.
 */
const POOL_LOADERS: Record<PoolTab, () => Promise<unknown>> = {
  waystone: () => import("../../../data/poe2/regex/waystone.json").then((m): unknown => m.default),
  tablet: () => import("../../../data/poe2/regex/tablet.json").then((m): unknown => m.default),
  relic: () => import("../../../data/poe2/regex/relic.json").then((m): unknown => m.default),
  jewel: () => import("../../../data/poe2/regex/jewel.json").then((m): unknown => m.default),
};
const loadVendor = (): Promise<unknown> => import("../../../data/poe2/regex/vendor.json").then((m): unknown => m.default);

const cache = new Map<string, Promise<unknown>>();

function cached<T>(key: string, load: () => Promise<unknown>, parse: (raw: unknown) => T): Promise<T> {
  let hit = cache.get(key);
  if (!hit) {
    hit = load().then(parse);
    // a failed load must be retryable on the next mount, not cached forever
    hit.catch((error: unknown) => {
      console.error(`[tools/regex] loading the ${key} dataset failed`, error);
      cache.delete(key);
    });
    cache.set(key, hit);
  }
  return hit as Promise<T>;
}

function useDataset<T>(key: string, load: () => Promise<T>): DataState<T> {
  const [state, setState] = useState<DataState<T>>({ status: "loading" });
  useEffect(() => {
    let live = true;
    setState({ status: "loading" });
    load()
      .then((data) => live && setState({ status: "ready", data }))
      .catch((e: unknown) => live && setState({ status: "error", message: e instanceof Error ? e.message : String(e) }));
    return () => {
      live = false;
    };
    // `load` is derived from `key`; keying on it alone keeps the effect from refiring every render
  }, [key]);
  return state;
}

/** A pool tab's static dataset, schema-checked after the lazy import (a stale file fails loudly). */
export function usePoolData(tab: PoolTab): DataState<RegexPool> {
  return useDataset(tab, () => cached(tab, POOL_LOADERS[tab], (raw) => RegexPoolSchema.parse(raw)));
}

export function useVendorData(): DataState<VendorData> {
  return useDataset("vendor", () => cached("vendor", loadVendor, (raw) => VendorDataSchema.parse(raw)));
}
