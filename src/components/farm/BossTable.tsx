"use client";

import { useState, type FocusEvent, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { orderBosses, type BossOrder } from "../../core/farm/farmSpeed";
import type { BossRow } from "../../lib/farmContract";
import { DataTable, type Column, type TableSort } from "../ui/DataTable";
import { EmptyState } from "../ui/EmptyState";
import { BossNameCell, EntryCell, NetCell } from "./bossCells";
import { PaceCell, RiskCell } from "./bossRiskPace";
import { deleteSpeed, putSpeed, useRowSaves, type RowSaves } from "./farmSpeedApi";

type SaveMinutes = (bossId: string, minutes: number | null) => void;

interface ColumnCtx {
  exPerDiv: number | null;
  expandedId: string | null;
  onToggle: (id: string) => void;
  save: SaveMinutes;
  status: RowSaves["status"];
}

// A 1% width shrinks an auto-layout column to its content, so Entry cost sits right beside Boss
// and the slack goes to the numeric columns.
const SHRINK = "1%";

// Six columns so the board fits a 1280 px screen: floor/chase ride under Net, chase odds under
// Risk, liquidity is a thin-market mark on Entry, and pace + Div/h share one cell.
function columns({ exPerDiv, expandedId, onToggle, save, status }: ColumnCtx): Column<BossRow>[] {
  return [
    { key: "boss", header: "Boss", width: SHRINK, cell: (r) => <BossNameCell r={r} expanded={r.id === expandedId} onToggle={onToggle} /> },
    {
      key: "entry",
      header: "Entry cost",
      width: SHRINK,
      tip: "consumed per attempt — the cheaper of buying or crafting each item at today's prices. Hover for the breakdown; a drop mark = thin market, hard to buy in.",
      cell: (r) => <EntryCell r={r} exPerDiv={exPerDiv} />,
    },
    {
      key: "net",
      header: "Net / kill",
      align: "right",
      tip: "expected loot − entry per kill over priced drops with a sourced rate. ≥ = lower bound (some drops have no rate — a negative one is not a sure loss); ≤ = upper bound (entry partly unpriced). Under it: floor = priced loot on most kills (guaranteed or 1 in 10 or better), chase = EV of rarer drops. Hover any number for its sources.",
      cell: (r) => <NetCell r={r} exPerDiv={exPerDiv} />,
    },
    {
      key: "risk",
      header: "Risk",
      align: "right",
      tip: "chance one kill does not pay for its entry; dotted = a caveat (covering drops without a rate, data weaker than confirmed, or an entry cost not modelled) — hover it. Under it: kills per rare drop of any kind.",
      cell: (r) => <RiskCell r={r} />,
    },
    {
      key: "divh",
      header: "Your Div/h",
      align: "right",
      sortable: true,
      tip: "type your minutes per kill (the whole cycle, entry to loot picked up; private to you): net per kill × 60 ÷ your minutes. ≥ / ≤ carry the net's bound, ? = net unknown.",
      cell: (r) => <PaceCell r={r} exPerDiv={exPerDiv} onCommit={(m) => save(r.id, m)} save={status(r.id)} />,
    },
    {
      key: "open",
      header: "",
      width: "2rem",
      cell: (r) => <ChevronRight aria-hidden className={`h-4 w-4 text-neutral-500 transition-transform ${r.id === expandedId ? "rotate-90" : ""}`} />,
    },
  ];
}

interface Props {
  bosses: BossRow[];
  /** The boss whose detail is open under its row; null = all closed. */
  expandedId: string | null;
  onToggle: (id: string) => void;
  renderDetail: (bossId: string) => ReactNode;
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

/** Pinnacle bosses by net per kill (or by the viewer's Div/hour); a row opens its entry and drops under it. */
export function BossTable({ bosses, expandedId, onToggle, renderDetail, exPerDiv, onSpeedSaved }: Props) {
  const { order, sort } = useDivHourSort();
  // inputs stay enabled while a save is in flight: disabling them would steal focus from the next field
  const saves = useRowSaves(onSpeedSaved);
  const save: SaveMinutes = (bossId, minutes) =>
    saves.run(bossId, () => (minutes == null ? deleteSpeed({ kind: "boss", key: bossId }) : putSpeed({ kind: "boss", key: bossId, minutesPerRun: minutes })));
  const freeze = useFocusFreeze();
  const rows = orderBosses(bosses, order, freeze.frozen);
  return (
    <div className="grid gap-1.5" {...freeze.handlers(rows.map((r) => r.id))}>
      <SaveFailures failures={saves.failures} bosses={bosses} />
      <DataTable
        columns={columns({ exPerDiv, expandedId, onToggle, save, status: saves.status })}
        rows={rows}
        rowKey={(r) => r.id}
        onRowClick={(r) => onToggle(r.id)}
        expandedKey={expandedId ?? undefined}
        renderExpanded={(r) => renderDetail(r.id)}
        sort={sort}
        interactiveCells
        tall
        emptyState={<EmptyState icon={null} sentence="No boss data — the curated loot tables did not load." />}
      />
    </div>
  );
}
