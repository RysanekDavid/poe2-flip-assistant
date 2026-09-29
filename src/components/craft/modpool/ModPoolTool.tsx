"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  modPoolCatalogSchema,
  modPoolResponseSchema,
  type ModPoolQuery,
  type ModPoolResponse,
  type ModPoolRow,
  type PoolClassView,
} from "../../../lib/tools/modPoolContract";
import { Panel } from "../../ui/Panel";
import { useCountdown } from "../../ui/useCountdown";
import { BasePicker } from "./BasePicker";
import { ModPoolTable } from "./ModPoolTable";
import { requestJson } from "../moves/craftMovesClient";
import { fetchFamilyValue, poolUrl, rowKeyOf, type LiveState } from "./modPoolClient";

type Load<T> = { kind: "loading" } | { kind: "error"; error: string } | { kind: "done"; data: T };
/** A new read keeps the previous table on screen instead of blanking it on every ilvl keystroke. */
type PoolLoad = Load<ModPoolResponse> | { kind: "refreshing"; data: ModPoolResponse };

const DEFAULT_CLASS = "Rings";
const DEFAULT_ILVL = 82;
/** Typing an item level fires one read per settled value, not one per keystroke. */
const READ_DEBOUNCE_MS = 300;

function initialQuery(classes: PoolClassView[]): ModPoolQuery | null {
  const cls = classes.find((c) => c.itemClass === DEFAULT_CLASS) ?? classes[0];
  const base = cls?.bases[0];
  return cls && base ? { itemClass: cls.itemClass, base: base.name, ilvl: DEFAULT_ILVL, rarity: "Rare" } : null;
}

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

function useCatalog(): Load<PoolClassView[]> {
  const [state, setState] = useState<Load<PoolClassView[]>>({ kind: "loading" });
  useEffect(() => {
    let live = true;
    requestJson("/api/tools/mod-pool", { method: "GET" }, modPoolCatalogSchema)
      .then((r) => live && setState(r.ok ? { kind: "done", data: r.data.classes } : { kind: "error", error: r.error }))
      .catch((e: unknown) => {
        console.error("[mod-pool] catalog read failed", e);
        if (live) setState({ kind: "error", error: errText(e) });
      });
    return () => {
      live = false;
    };
  }, []);
  return state;
}

function usePool(query: ModPoolQuery | null): PoolLoad | null {
  const [state, setState] = useState<PoolLoad | null>(null);
  const seq = useRef(0);
  useEffect(() => {
    if (!query) return;
    const mine = ++seq.current;
    setState((s) => (s?.kind === "done" || s?.kind === "refreshing" ? { kind: "refreshing", data: s.data } : { kind: "loading" }));
    const t = setTimeout(() => {
      requestJson(poolUrl(query), { method: "GET" }, modPoolResponseSchema)
        .then((r) => {
          if (mine === seq.current) setState(r.ok ? { kind: "done", data: r.data } : { kind: "error", error: r.error });
        })
        .catch((e: unknown) => {
          console.error("[mod-pool] pool read failed", e);
          if (mine === seq.current) setState({ kind: "error", error: errText(e) });
        });
    }, READ_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);
  return state;
}

/** Coverage, said plainly: how many families the book can speak for on this base. */
function CoverageLine({ pool }: { pool: ModPoolResponse }) {
  const c = pool.coverage;
  return (
    <p className="text-xs text-neutral-400" title={`${c.resolved} of ${c.families} families resolve to a trade2 stat; ${pool.baseline.samples} modded asks on record for this base`}>
      book: {c.withSamples} of {c.families} families have samples · asks for items carrying the mod on this base, not the mod&apos;s own price ·{" "}
      {pool.league} · data {pool.patch.data}
      {pool.ambiguous && <span className="text-amber-300"> · shared base name: pool is a best guess</span>}
    </p>
  );
}

function useLiveValues(pool: ModPoolResponse | null) {
  const [live, setLive] = useState<Map<string, LiveState>>(new Map());
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const wait = useCountdown(retryAt);
  // a different base or item level is a different search: drop the previous one's clicks
  const poolKey = pool ? `${pool.base}@${pool.ilvl}` : null;
  const current = useRef(poolKey);
  useEffect(() => {
    current.current = poolKey;
    setLive(new Map());
  }, [poolKey]);
  // one request at a time across every row: a burst of clicks would only queue into the 429/503
  const [busy, setBusy] = useState(false);
  const onValue = useCallback(
    async (row: ModPoolRow): Promise<void> => {
      if (!pool) return;
      const key = rowKeyOf(row);
      const askedFor = current.current;
      setBusy(true);
      setLive((m) => new Map(m).set(key, { kind: "loading" }));
      const statId = row.search?.statId ?? undefined;
      const next = await fetchFamilyValue({ itemClass: pool.itemClass, base: pool.base, ilvl: pool.ilvl, family: row.family, side: row.side, statId });
      setBusy(false);
      if (next.kind === "error" && next.retryAt != null) setRetryAt(next.retryAt);
      // the answer belongs to the base it was asked for; a switch meanwhile must not paint it elsewhere
      if (askedFor === current.current) setLive((m) => new Map(m).set(key, next));
    },
    [pool],
  );
  return { live, wait, busy, onValue };
}

function PoolView({ pool }: { pool: ModPoolResponse }) {
  const { live, wait, busy, onValue } = useLiveValues(pool);
  return (
    <div className="space-y-2">
      <CoverageLine pool={pool} />
      {pool.bookError && (
        <p role="alert" className="text-sm text-amber-300" title={pool.bookError}>
          trade2 stat catalog unreachable — gates shown, book and live values unavailable
        </p>
      )}
      {/* no overflow wrapper: it becomes the sticky header's scroll box and pins the header mid-table */}
      <ModPoolTable pool={pool} live={live} wait={wait} busy={busy} onValue={(r) => void onValue(r)} />

    </div>
  );
}

/** Pick a base: every family it rolls at your item level, its gates and floors, book + live signals. */
export function ModPoolTool() {
  const catalog = useCatalog();
  const [query, setQuery] = useState<ModPoolQuery | null>(null);
  useEffect(() => {
    if (catalog.kind === "done") setQuery((q) => q ?? initialQuery(catalog.data));
  }, [catalog]);
  const pool = usePool(query);

  if (catalog.kind === "loading") return <p className="text-sm text-neutral-400">loading bases…</p>;
  if (catalog.kind === "error") return <p role="alert" className="text-sm text-bad">{catalog.error}</p>;
  return (
    <Panel>
      <div className="space-y-4">
        {query && <BasePicker classes={catalog.data} value={query} onChange={setQuery} />}
        {pool?.kind === "loading" && <p className="text-sm text-neutral-400">reading the pool…</p>}
        {pool?.kind === "error" && <p role="alert" className="text-sm text-bad">{pool.error}</p>}
        {pool?.kind === "refreshing" && <p className="text-xs text-neutral-500">updating…</p>}
        {(pool?.kind === "done" || pool?.kind === "refreshing") && <PoolView pool={pool.data} />}
      </div>
    </Panel>
  );
}
