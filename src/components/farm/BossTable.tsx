"use client";

import { useState, type FocusEvent } from "react";
import { orderBosses, type BossOrder } from "../../core/farm/farmSpeed";
import { compact } from "../../lib/format";
import { MAX_MINUTES_PER_RUN, type BossRow } from "../../lib/farmContract";
import { DataTable, type Column, type TableSort } from "../ui/DataTable";
import { EmptyState } from "../ui/EmptyState";
import { ItemArt } from "../ui/ItemArt";
import { PriceChip } from "../ui/PriceChip";
import { BOUND_PREFIX, EntryCell, FloorCell, NetCell } from "./bossCells";
import { deleteSpeed, putSpeed, useRowSaves, type RowSaves } from "./farmSpeedApi";
import { fmtDivHour, fmtOneIn, fmtPct } from "./farmView";
import { SpeedInput } from "./SpeedInput";

/** A computed Divine sum where 0 means "nothing priced lands here", not a free item. */
function SumCell({ div, exPerDiv, none }: { div: number; exPerDiv: number | null; none: string }) {
  if (div > 0) return <PriceChip div={div} exPerDiv={exPerDiv} />;
  return (
    <span className="text-neutral-500" title={none}>
      —
    </span>
  );
}

function LoseCell({ r }: { r: BossRow }) {
  if (r.pLosingRun == null) {
    const why = r.entryComplete ? "no drop that could cover the entry has a sourced rate" : "entry partly unpriced — cannot tell what a kill must cover";
    return (
      <span className="text-neutral-500" title={why}>
        —
      </span>
    );
  }
  const caveat = r.losingRunUnknownRates > 0 ? ` — ${r.losingRunUnknownRates} covering drop(s) have no known rate and count as never dropping` : "";
  return (
    <span className="tabular-nums text-neutral-200" title={`chance a kill drops nothing worth the uncovered entry (independent rolls)${caveat}`}>
      {fmtPct(r.pLosingRun)}
      {caveat && <span className="text-neutral-400">*</span>}
    </span>
  );
}

/** The viewer's net per hour; its bound follows the net's (a per-kill lower bound is a per-hour one). */
function DivHourCell({ r, exPerDiv }: { r: BossRow; exPerDiv: number | null }) {
  if (r.yourMinutes == null) {
    return (
      <span className="text-neutral-500" title="enter your minutes per kill to see your Div/hour">
        —
      </span>
    );
  }
  if (r.divPerHourBound === "unknown" || r.divPerHour == null) {
    return (
      <span className="text-neutral-400" title="net per kill unknown (entry partly unpriced and some drops unrated) — no honest Div/hour">
        ?
      </span>
    );
  }
  const bound = r.divPerHourBound ?? "exact";
  const unsure = bound === "lower" && r.divPerHour < 0;
  const tone = unsure ? "text-neutral-300" : r.divPerHour < 0 ? "text-bad" : "text-accent";
  const why = unsure ? "lower bound — unrated drops may cover it, not a sure loss" : bound === "upper" ? "upper bound — part of the entry is unpriced" : bound === "lower" ? "lower bound — some drops are left out" : "";
  return (
    <span className={`font-semibold tabular-nums ${tone}`} title={`net per kill × 60 ÷ ${r.yourMinutes} min${why ? ` — ${why}` : ""}`}>
      {BOUND_PREFIX[bound]}
      {fmtDivHour(r.divPerHour, exPerDiv, true)}
    </span>
  );
}

type SaveMinutes = (bossId: string, minutes: number | null) => void;

function speedColumns(exPerDiv: number | null, save: SaveMinutes, status: RowSaves["status"]): Column<BossRow>[] {
  return [
    {
      key: "pace",
      header: "Your pace",
      tip: "your minutes per kill — the whole cycle, from using the entry to loot picked up. Enter or click away saves, empty clears. Private to you.",
      cell: (r) => (
        <SpeedInput value={r.yourMinutes} onCommit={(m) => save(r.id, m)} label={`Your minutes per ${r.name} kill`} unit="min" max={MAX_MINUTES_PER_RUN} save={status(r.id)} />
      ),
    },
    {
      key: "divh",
      header: "Your Div/h",
      align: "right",
      sortable: true,
      tip: "net per kill × 60 ÷ your minutes per kill. ≥ / ≤ carry the net's bound, ? = net unknown. Empty until you enter your pace.",
      cell: (r) => <DivHourCell r={r} exPerDiv={exPerDiv} />,
    },
  ];
}

/** The row's own keyboard target: the row itself stays a plain row because it holds an input. */
function BossNameCell({ r, selected, onSelect }: { r: BossRow; selected: boolean; onSelect: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(r.id)}
      aria-pressed={selected}
      aria-label={`${r.name} — show loot table`}
      title={r.mechanic}
      className="flex items-center gap-2 rounded text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
    >
      <ItemArt src={r.icon} size={6} />
      <span className="font-medium text-neutral-100">{r.name}</span>
    </button>
  );
}

function columns(exPerDiv: number | null, selectedId: string | null, onSelect: (id: string) => void): Column<BossRow>[] {
  return [
    {
      key: "boss",
      header: "Boss",
      cell: (r) => <BossNameCell r={r} selected={r.id === selectedId} onSelect={onSelect} />,
    },
    { key: "entry", header: "Entry", align: "right", tip: "what one attempt consumes, at the cheaper of buying or crafting each item at today's exchange prices — hover for the breakdown", cell: (r) => <EntryCell r={r} exPerDiv={exPerDiv} /> },
    { key: "floor", header: "Floor", align: "right", tip: "priced loot that lands on most kills: guaranteed drops plus drops at 1 in 10 or better (a random pick from a pool counts at its cheapest member)", cell: (r) => <FloorCell r={r} exPerDiv={exPerDiv} /> },
    { key: "chase", header: "Chase", align: "right", tip: "priced EV of drops rarer than 1 in 10 — the lottery part of a kill", cell: (r) => <SumCell div={r.chaseDiv} exPerDiv={exPerDiv} none="no priced rare drop with a sourced rate" /> },
    { key: "net", header: "Net", align: "right", tip: "expected loot − entry per kill over priced drops with a sourced rate. ≥ = lower bound (some drops have no rate — a negative one is not a sure loss); ≤ = upper bound (entry partly unpriced). Hover a value for what EV leaves out and how its rates are sourced.", cell: (r) => <NetCell r={r} exPerDiv={exPerDiv} /> },
    { key: "oneIn", header: "Chase odds", align: "right", tip: "kills per rare (< 1 in 10) drop of any kind, from the sourced rates", cell: (r) => (r.chaseOneIn == null ? <span className="text-neutral-500">—</span> : <span className="tabular-nums">{fmtOneIn(r.chaseOneIn)}</span>) },
    { key: "lose", header: "P(lose)", align: "right", tip: "chance one kill does not pay for its entry; * = some covering drops have no known rate", cell: (r) => <LoseCell r={r} /> },
    { key: "liq", header: "Liquidity", align: "right", tip: "poe.ninja traded volume of the priciest entry item — how easily you can buy in", cell: (r) => (r.entryVolume == null ? <span className="text-neutral-500">—</span> : <span className="tabular-nums">{compact(r.entryVolume)}</span>) },
  ];
}

interface Props {
  bosses: BossRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  exPerDiv: number | null;
  /** After a pace is saved or cleared: reload, so Div/hour comes from the server. */
  onSpeedSaved: () => void;
}

/** Board order (the server's net ranking) until "Your Div/h" is clicked: desc → asc → board again. */
function useDivHourSort() {
  const [order, setOrder] = useState<BossOrder>({ key: "board" });
  const onSort = (key: string): void => {
    if (key !== "divh") throw new Error(`Farm bosses: unknown sort column ${key}`);
    setOrder((o) => (o.key !== "divh" ? { key, dir: "desc" } : o.dir === "desc" ? { key, dir: "asc" } : { key: "board" }));
  };
  const sort: TableSort = { key: order.key, dir: order.key === "divh" ? order.dir : "desc", onSort };
  return { order, sort };
}

const isInput = (t: EventTarget | null): boolean => t instanceof HTMLInputElement;

/**
 * Freeze the row order while any pace input has focus (orderBosses): a save reloads the board, and
 * a re-sort then would move the row being typed in. Tabbing input → input keeps the freeze.
 */
function useFocusFreeze() {
  const [frozen, setFrozen] = useState<readonly string[] | null>(null);
  const handlers = (shownIds: readonly string[]) => ({
    onFocus: (e: FocusEvent<HTMLDivElement>): void => {
      if (isInput(e.target)) setFrozen((f) => f ?? shownIds);
    },
    onBlur: (e: FocusEvent<HTMLDivElement>): void => {
      const next = e.relatedTarget;
      if (!(isInput(next) && next instanceof Node && e.currentTarget.contains(next))) setFrozen(null);
    },
  });
  return { frozen, handlers };
}

function SaveFailures({ failures, bosses }: { failures: RowSaves["failures"]; bosses: readonly BossRow[] }) {
  if (failures.length === 0) return null;
  const name = (id: string): string => bosses.find((b) => b.id === id)?.name ?? id;
  return (
    <p role="alert" className="text-sm text-bad">
      Pace not saved — {failures.map((f) => `${name(f.rowKey)}: ${f.error}`).join(" · ")}
    </p>
  );
}

/** Pinnacle bosses by net per kill (or by the viewer's Div/hour); a boss name opens its loot table below. */
export function BossTable({ bosses, selectedId, onSelect, exPerDiv, onSpeedSaved }: Props) {
  const { order, sort } = useDivHourSort();
  // inputs stay enabled while a save is in flight: disabling them would steal focus from the next field
  const saves = useRowSaves(onSpeedSaved);
  const save: SaveMinutes = (bossId, minutes) =>
    saves.run(bossId, () => (minutes == null ? deleteSpeed({ kind: "boss", key: bossId }) : putSpeed({ kind: "boss", key: bossId, minutesPerRun: minutes })));
  const freeze = useFocusFreeze();
  const rows = orderBosses(bosses, order, freeze.frozen);
  const base = columns(exPerDiv, selectedId, onSelect);
  const afterNet = base.findIndex((c) => c.key === "net") + 1;
  return (
    <div className="grid gap-1.5" {...freeze.handlers(rows.map((r) => r.id))}>
      <SaveFailures failures={saves.failures} bosses={bosses} />
      <DataTable
        columns={[...base.slice(0, afterNet), ...speedColumns(exPerDiv, save, saves.status), ...base.slice(afterNet)]}
        rows={rows}
        rowKey={(r) => r.id}
        onRowClick={(r) => onSelect(r.id)}
        selectedKey={selectedId ?? undefined}
        sort={sort}
        interactiveCells
        emptyState={<EmptyState icon={null} sentence="No boss data — the curated loot tables did not load." />}
      />
    </div>
  );
}
