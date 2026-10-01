"use client";

import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import type { BossRow } from "../../lib/farmContract";
import { DataTable, detailRowId, type Column } from "../ui/DataTable";
import { EmptyState } from "../ui/EmptyState";
import { BossNameCell, EntryCell, NetCell } from "./bossCells";
import { RiskCell } from "./bossRisk";

interface ColumnCtx {
  exPerDiv: number | null;
  expandedId: string | null;
  onToggle: (id: string) => void;
}

// A 1% width shrinks an auto-layout column to its content, so Entry cost sits right beside Boss
// and the slack goes to the numeric columns.
const SHRINK = "1%";
const DETAIL_PREFIX = "boss-detail";

// Five columns: floor/chase ride under Net, chase odds under Risk, and liquidity is a thin-market
// mark on Entry. No Div/hour column: it would need the player's own pace, and hand-typed paces
// were dropped (nobody keeps one up by hand).
function columns({ exPerDiv, expandedId, onToggle }: ColumnCtx): Column<BossRow>[] {
  return [
    { key: "boss", header: "Boss", width: SHRINK, cell: (r) => <BossNameCell r={r} expanded={r.id === expandedId} detailId={detailRowId(DETAIL_PREFIX, r.id)} onToggle={onToggle} /> },
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
      key: "open",
      header: "",
      width: "2rem",
      cell: (r) => <ChevronRight aria-hidden className={`h-4 w-4 text-neutral-500 transition-transform ${r.id === expandedId ? "rotate-90" : ""}`} />,
    },
  ];
}

interface Props {
  /** Board order: the server's net ranking (farmBoard.ts). */
  bosses: BossRow[];
  /** The boss whose detail is open under its row; null = all closed. */
  expandedId: string | null;
  onToggle: (id: string) => void;
  renderDetail: (bossId: string) => ReactNode;
  exPerDiv: number | null;
}

/** Pinnacle bosses by net per kill; a row opens its entry and drops under it. */
export function BossTable({ bosses, expandedId, onToggle, renderDetail, exPerDiv }: Props) {
  return (
    // phones scroll the columns in their own box, where a shell-offset sticky head would float over
    // the rows, so it goes static there; from md up the page scrolls and the head stays sticky.
    // `relative` makes the box the containing block of the rows' sr-only (absolute) text, which
    // otherwise escapes the scroll clip and widens the whole page on a phone.
    <div className="relative min-w-0 max-md:overflow-x-auto max-md:[&_th]:static">
      <DataTable
        columns={columns({ exPerDiv, expandedId, onToggle })}
        rows={bosses}
        rowKey={(r) => r.id}
        onRowClick={(r) => onToggle(r.id)}
        expandedKey={expandedId ?? undefined}
        detailIdPrefix={DETAIL_PREFIX}
        renderExpanded={(r) => renderDetail(r.id)}
        interactiveCells
        tall
        emptyState={<EmptyState icon={null} sentence="No boss data — the curated loot tables did not load." />}
      />
    </div>
  );
}
