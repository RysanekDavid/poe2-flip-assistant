"use client";

import type { BookMissing, ModLiveValue, ModPoolResponse, ModPoolRow } from "../../../lib/tools/modPoolContract";
import { Button } from "../../ui/Button";
import { DataTable, type Column } from "../../ui/DataTable";
import { EmptyState } from "../../ui/EmptyState";
import { PriceChip } from "../../ui/PriceChip";
import { rowKeyOf, type LiveState } from "./modPoolClient";

const MISSING_TEXT: Record<BookMissing, string> = {
  "no-tier": "no tier of this family rolls at this item level",
  unresolved: "this line has no trade2 stat, so neither the book nor a search can price it",
  "not-signed": "the book never records this stat on its own (its pseudo total is missing from the trade catalog)",
  unavailable: "the trade2 stat catalog is unreachable right now",
};

interface Props {
  pool: ModPoolResponse;
  live: ReadonlyMap<string, LiveState>;
  /** Seconds left on a 503 cool-down (the budget is shared, so it blocks every row). */
  wait: number;
  onValue: (row: ModPoolRow) => void;
}

function FamilyCell({ r }: { r: ModPoolRow }) {
  const text = r.search?.line ?? r.best.text.split("\n")[0] ?? r.family;
  return (
    <span className="inline-flex items-center gap-1" title={`${r.family} — best tier: ${r.best.text.split("\n").join(" / ")}`}>
      {text}
      {r.search?.partial && (
        <span className="rounded bg-neutral-800 px-1 text-xs text-amber-300" title={`hybrid: ${r.search.lines} lines, searched and signed on the first line only`}>
          partial
        </span>
      )}
      {r.kbRow && (
        <span className="rounded border border-emerald-900 px-1 text-xs text-emerald-400" title={`cross-checked against KB §3: ${r.kbRow}`}>
          KB
        </span>
      )}
    </span>
  );
}

function TopCell({ r, ilvl }: { r: ModPoolRow; ilvl: number }) {
  const top = r.topReachable;
  if (!top) return <span className="text-neutral-500" title={`the lowest tier needs item level above ${ilvl}`}>—</span>;
  const capped = top.rank < r.tiers;
  const title = capped ? `${top.text} — the best tier needs item level ${r.best.level}` : `${top.text} — the best tier`;
  return (
    <span className={`tabular-nums ${capped ? "text-amber-400" : "text-neutral-200"}`} title={title}>
      T{top.rank}/{r.tiers} <span className="text-xs text-neutral-500">lvl {top.level}</span>
    </span>
  );
}

function FloorsCell({ r }: { r: ModPoolRow }) {
  if (r.floors.length === 0) return <span className="text-xs text-neutral-500" title="no verified currency floor for this rarity">none</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {r.floors.map((f) => (
        <span
          key={f.currency}
          title={
            f.softFloor
              ? `${f.currency}: every reachable tier is below ${f.floor} — the soft floor still rolls the top reachable tier`
              : `${f.currency}: cannot roll tiers below modifier level ${f.floor} (${f.cutTiers} of ${r.reachable} reachable tiers cut)`
          }
          className={`rounded px-1 text-xs tabular-nums ${f.softFloor ? "bg-amber-950/60 text-amber-400" : f.cutTiers > 0 ? "bg-neutral-800 text-neutral-300" : "text-neutral-500"}`}
        >
          {f.currency.split(" ")[0]} ≥{f.floor}: {f.softFloor ? "soft" : `−${f.cutTiers}`}
        </span>
      ))}
    </span>
  );
}

function BookCell({ r, ex }: { r: ModPoolRow; ex: number | null }) {
  if (!r.book) {
    const why = r.bookMissing ? MISSING_TEXT[r.bookMissing] : "no book signal";
    return <span className="text-neutral-500" title={why}>—</span>;
  }
  const b = r.book;
  if (b.samples === 0) return <span className="text-neutral-500" title="no recorded asks for this stat on this base yet">—</span>;
  const via = b.viaPseudo ? " · signed under its pseudo total (e.g. total elemental resistance), shared with sibling mods" : "";
  return (
    <span className="inline-flex items-center gap-1.5" title={`trimmed median of ${b.samples} recorded asks${via}`}>
      <PriceChip div={b.valueDiv} exPerDiv={ex} source="book" />
      <span className="text-xs tabular-nums text-neutral-500">n{b.samples}</span>
      {b.upliftPct != null && (
        <span className={`text-xs tabular-nums ${b.upliftPct > 0 ? "text-emerald-400" : "text-neutral-400"}`} title="vs the base-wide book median">
          {b.upliftPct > 0 ? "+" : ""}
          {b.upliftPct}%
        </span>
      )}
      {b.viaPseudo && <span className="text-xs text-neutral-500">Σ</span>}
    </span>
  );
}

function LiveValue({ v, ex, cached }: { v: ModLiveValue; ex: number | null; cached: boolean }) {
  const ageMin = Math.max(0, Math.round((Date.now() - v.checkedAt) / 60_000));
  return (
    <span className="inline-flex items-center gap-1.5" title={`${v.samples} comparables of ${v.total} listed${cached ? " · shared cache" : ""}`}>
      <PriceChip div={v.valueDiv} exPerDiv={ex} source="trade" ageMin={ageMin} />
      <span className="text-xs tabular-nums text-neutral-500">
        n{v.samples}/{v.total}
      </span>
    </span>
  );
}

function LiveCell({ r, state, ex, wait, onValue }: { r: ModPoolRow; state: LiveState | undefined; ex: number | null; wait: number; onValue: () => void }) {
  if (state?.kind === "done") return <LiveValue v={state.live} ex={ex} cached={state.cached} />;
  if (r.live) return <LiveValue v={r.live} ex={ex} cached />;
  if (!r.search?.statId) return <span className="text-neutral-500" title="no trade2 stat to search">—</span>;
  const loading = state?.kind === "loading";
  return (
    <span className="inline-flex items-center gap-1.5">
      <Button size="sm" onClick={onValue} disabled={loading || wait > 0} title="one trade2 search + one fetch with your POESESSID; the result is shared for everyone">
        {loading ? "searching…" : wait > 0 ? `retry in ${wait}s` : "value · 1 search"}
      </Button>
      {state?.kind === "error" && (
        <span className="max-w-[14rem] truncate text-xs text-bad" title={state.error}>
          {state.error}
        </span>
      )}
    </span>
  );
}

function columns({ pool, live, wait, onValue }: Props): Column<ModPoolRow>[] {
  const ex = pool.exaltPerDivine;
  return [
    { key: "side", header: "Side", width: "3rem", cell: (r) => <span className="text-xs uppercase text-neutral-500">{r.side === "prefix" ? "P" : "S"}</span> },
    { key: "family", header: "Family", wrap: true, tip: "the top reachable tier's text; hybrids are searched on their first line", cell: (r) => <FamilyCell r={r} /> },
    { key: "top", header: `Top @ ${pool.ilvl}`, tip: "best tier this item level reaches, of all tiers (higher = better)", cell: (r) => <TopCell r={r} ilvl={pool.ilvl} /> },
    { key: "floors", header: "Floors", tip: `tiers each verified currency cannot roll on a ${pool.rarity} item (KB §1); soft = the top reachable tier still rolls`, cell: (r) => <FloorsCell r={r} /> },
    { key: "book", header: "Book", tip: "recorded asks for rare items on this base carrying this stat (0 searches) — not the mod's own price", cell: (r) => <BookCell r={r} ex={ex} /> },
    {
      key: "live",
      header: "Live",
      tip: `one trade search on click: rare ${pool.base}, instant buyout, carrying this stat at ≥ the tier's lowest roll; shared for ${pool.cacheHours} h`,
      cell: (r) => <LiveCell r={r} state={live.get(rowKeyOf(r))} ex={ex} wait={wait} onValue={() => onValue(r)} />,
    },
    {
      key: "trade",
      header: "Trade",
      align: "right",
      cell: (r) =>
        r.tradeUrl ? (
          <a href={r.tradeUrl} target="_blank" rel="noreferrer" className="text-xs text-sky-400 hover:underline">
            open ↗
          </a>
        ) : (
          <span className="text-neutral-500">—</span>
        ),
    },
  ];
}

/** Side · Family · Top @ ilvl · Floors · Book · Live · trade link, prefixes then suffixes. */
export function ModPoolTable(props: Props) {
  return (
    <DataTable
      columns={columns(props)}
      rows={props.pool.rows}
      rowKey={rowKeyOf}
      interactiveCells
      emptyState={<EmptyState icon="∅" sentence={`${props.pool.base} rolls no prefix or suffix families in the catalog.`} />}
    />
  );
}
