"use client";

import { useState } from "react";
import { compareDivPerHour } from "../../core/farm/farmSpeed";
import { fmtDiv } from "../../core/tools/bossEv/headline";
import { compact } from "../../lib/format";
import { MAX_MINUTES_PER_RUN, type BossRow } from "../../lib/farmContract";
import { DataTable, type Column, type SortDir } from "../ui/DataTable";
import { EmptyState } from "../ui/EmptyState";
import { ItemArt } from "../ui/ItemArt";
import { PriceChip } from "../ui/PriceChip";
import { deleteSpeed, putSpeed, useSpeedSave } from "./farmSpeedApi";
import { ConfidenceChip, fmtDivHour, fmtOneIn, fmtPct, TONE_CLASS, UnpricedChip } from "./farmView";
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

function EntryCell({ r, exPerDiv }: { r: BossRow; exPerDiv: number | null }) {
  if (r.entryComplete) return <PriceChip div={r.entryDiv} exPerDiv={exPerDiv} source="ninja" />;
  return (
    <span className="text-neutral-400" title="part of the entry is not on the exchange — the cost shown is a lower bound">
      {r.entryDiv > 0 ? `≥ ${fmtDiv(r.entryDiv, exPerDiv ?? 0)}` : "unpriced"}
    </span>
  );
}

const BOUND_PREFIX: Record<BossRow["netBound"], string> = { exact: "", lower: "≥ ", upper: "≤ ", unknown: "" };

function NetCell({ r, exPerDiv }: { r: BossRow; exPerDiv: number | null }) {
  const net = fmtDiv(r.netDiv, exPerDiv ?? 0, true);
  if (r.netBound === "unknown") {
    return (
      <span className="text-neutral-400" title="entry partly unpriced and some drops have no rate — net unknown">
        ?
      </span>
    );
  }
  // a negative LOWER bound is not a loss: drops without a sourced rate or price may cover it
  const unsure = r.netBound === "lower" && r.netDiv < 0;
  const title = unsure
    ? `rates unknown — lower bound: ${r.uncountedDrops} drop(s) without a sourced rate or price are not counted`
    : `${r.headline.text}\n${r.headline.title}`;
  return (
    <span className={`tabular-nums ${unsure ? "text-neutral-300" : TONE_CLASS[r.headline.tone]}`} title={title}>
      {BOUND_PREFIX[r.netBound]}
      {net}
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

function speedColumns(exPerDiv: number | null, save: SaveMinutes): Column<BossRow>[] {
  return [
    {
      key: "pace",
      header: "Your pace",
      tip: "your minutes per kill — the whole cycle, from using the entry to loot picked up. Enter or click away saves, empty clears. Private to you.",
      cell: (r) => (
        <SpeedInput key={String(r.yourMinutes)} value={r.yourMinutes} onCommit={(m) => save(r.id, m)} label={`Your minutes per ${r.name} kill`} unit="min" max={MAX_MINUTES_PER_RUN} />
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

function columns(exPerDiv: number | null): Column<BossRow>[] {
  return [
    {
      key: "boss",
      header: "Boss",
      cell: (r) => (
        <span className="flex items-center gap-2" title={r.mechanic}>
          <ItemArt src={r.icon} size={6} />
          <span className="font-medium text-neutral-100">{r.name}</span>
        </span>
      ),
    },
    { key: "entry", header: "Entry", align: "right", tip: "cheapest of buying the key or crafting it, at today's exchange prices", cell: (r) => <EntryCell r={r} exPerDiv={exPerDiv} /> },
    { key: "floor", header: "Floor", align: "right", tip: "priced loot that lands on most kills: guaranteed drops plus drops at 1 in 10 or better", cell: (r) => <SumCell div={r.floorDiv} exPerDiv={exPerDiv} none="no priced drop lands on most kills" /> },
    { key: "chase", header: "Chase", align: "right", tip: "priced EV of drops rarer than 1 in 10 — the lottery part of a kill", cell: (r) => <SumCell div={r.chaseDiv} exPerDiv={exPerDiv} none="no priced rare drop with a sourced rate" /> },
    { key: "net", header: "Net", align: "right", tip: "expected loot − entry per kill over priced drops with a sourced rate. ≥ = lower bound (some drops have no rate — a negative one is not a sure loss); ≤ = upper bound (entry partly unpriced)", cell: (r) => <NetCell r={r} exPerDiv={exPerDiv} /> },
    { key: "oneIn", header: "Chase odds", align: "right", tip: "kills per rare (< 1 in 10) drop of any kind, from the sourced rates", cell: (r) => (r.chaseOneIn == null ? <span className="text-neutral-500">—</span> : <span className="tabular-nums">{fmtOneIn(r.chaseOneIn)}</span>) },
    { key: "lose", header: "P(lose)", align: "right", tip: "chance one kill does not pay for its entry; * = some covering drops have no known rate", cell: (r) => <LoseCell r={r} /> },
    { key: "liq", header: "Liquidity", align: "right", tip: "poe.ninja traded volume of the priciest entry item — how easily you can buy in", cell: (r) => (r.entryVolume == null ? <span className="text-neutral-500">—</span> : <span className="tabular-nums">{compact(r.entryVolume)}</span>) },
    {
      key: "chips",
      header: "Data",
      cell: (r) => (
        <span className="flex items-center gap-1.5">
          <ConfidenceChip confidence={r.confidence} />
          <UnpricedChip names={r.unpriced} lineage={r.unpricedLineage} />
        </span>
      ),
    },
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

const BOARD = "board";

/** Board order (the server's net ranking) until "Your Div/h" is clicked: desc → asc → board again. */
function useDivHourSort() {
  const [sort, setSort] = useState<{ key: string; dir: SortDir }>({ key: BOARD, dir: "desc" });
  const onSort = (key: string): void => {
    if (key !== "divh") throw new Error(`Farm bosses: unknown sort column ${key}`);
    setSort((s) => (s.key !== "divh" ? { key, dir: "desc" } : s.dir === "desc" ? { key, dir: "asc" } : { key: BOARD, dir: "desc" }));
  };
  const order = (rows: BossRow[]): BossRow[] => (sort.key === "divh" ? [...rows].sort((a, b) => compareDivPerHour(a, b, sort.dir)) : rows);
  return { sort: { ...sort, onSort }, order };
}

/** Pinnacle bosses by net per kill (or by the viewer's Div/hour); a row opens its loot table below. */
export function BossTable({ bosses, selectedId, onSelect, exPerDiv, onSpeedSaved }: Props) {
  const { sort, order } = useDivHourSort();
  // inputs stay enabled while a save is in flight: disabling them would steal focus from the next field
  const { error, run } = useSpeedSave(onSpeedSaved);
  const save: SaveMinutes = (bossId, minutes) =>
    run(() => (minutes == null ? deleteSpeed({ kind: "boss", key: bossId }) : putSpeed({ kind: "boss", key: bossId, minutesPerRun: minutes })));
  const base = columns(exPerDiv);
  const afterNet = base.findIndex((c) => c.key === "net") + 1;
  return (
    <div className="grid gap-1.5">
      {error && <p role="alert" className="text-sm text-bad">Pace not saved — {error}</p>}
      <DataTable
        columns={[...base.slice(0, afterNet), ...speedColumns(exPerDiv, save), ...base.slice(afterNet)]}
        rows={order(bosses)}
        rowKey={(r) => r.id}
        onRowClick={(r) => onSelect(r.id)}
        selectedKey={selectedId ?? undefined}
        sort={sort}
        emptyState={<EmptyState icon={null} sentence="No boss data — the curated loot tables did not load." />}
      />
    </div>
  );
}
