"use client";

import type { SellResponse, SellRow, SellVerdict } from "../../lib/wealthContract";
import { ItemArt } from "../ui/ItemArt";
import { PriceChip } from "../ui/PriceChip";
import { InfoTip } from "../ui/Tooltip";
import { CopyNote, SOURCE, VERDICT, VerdictChip, verdictAge } from "./sellVerdict";

/** Do-something-now first; unpriced rows have nothing to act on, so they come last and folded. */
const GROUP_ORDER: readonly SellVerdict[] = ["sell-cx", "list", "reprice", "hold"];

const GRID = "grid grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-3";

function SellCard({ row, exPerDiv }: { row: SellRow; exPerDiv: number }) {
  const age = verdictAge(row);
  return (
    <article className="flex flex-col gap-2 rounded-lg border border-line bg-neutral-900/60 p-3">
      <div className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2" title={row.tabs.length > 0 ? `tabs: ${row.tabs.join(", ")}` : undefined}>
          <ItemArt src={row.icon} size={8} />
          <span className="truncate font-medium text-neutral-100">{row.name}</span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-0.5" title="Whole stack, net of the exchange gold fee: a quick sale vs a patient one.">
          <span className="inline-flex items-center gap-1.5 text-xs text-neutral-400">
            get now <PriceChip div={row.fastTotalDiv} exPerDiv={exPerDiv} />
          </span>
          <span className="inline-flex items-center gap-1 text-xs text-neutral-400">
            patient <PriceChip div={row.patientTotalDiv} exPerDiv={exPerDiv} />
          </span>
        </span>
      </div>
      <ul className="space-y-1 text-xs text-neutral-400">
        <li className="tabular-nums">qty {row.qty.toLocaleString("en-US")}</li>
        <li className="flex flex-wrap items-center gap-x-1.5">
          value <PriceChip div={row.unitDiv} exPerDiv={exPerDiv} source={SOURCE[row.valueSource]} /> each
          {row.askDiv != null && (
            <>
              <span aria-hidden>·</span> your ask <PriceChip div={row.askDiv} exPerDiv={exPerDiv} source="manual" />
            </>
          )}
        </li>
        <li className="truncate text-neutral-300" title={`${row.reason} · ${row.routeReason}`}>
          {row.reason}
          {age && <span className="text-neutral-400"> · {age}</span>}
        </li>
      </ul>
      {row.note != null && (
        <div className="mt-auto flex justify-end">
          <CopyNote note={row.note} />
        </div>
      )}
    </article>
  );
}

/** `tip` off inside a <summary>, where a click on the ⓘ would also fold the group. */
function GroupHeading({ verdict, count, tip = true }: { verdict: SellVerdict; count: number; tip?: boolean }) {
  return (
    <span className="flex items-center gap-2 text-sm text-neutral-300" title={tip ? undefined : VERDICT[verdict].tip}>
      <VerdictChip v={verdict} />
      <span className="tabular-nums">{count}</span>
      {tip && <InfoTip tip={VERDICT[verdict].tip} label={`About ${VERDICT[verdict].label}`} />}
    </span>
  );
}

function Group({ verdict, rows, exPerDiv }: { verdict: SellVerdict; rows: SellRow[]; exPerDiv: number }) {
  return (
    <section aria-label={`${VERDICT[verdict].label}: ${rows.length}`} className="space-y-2">
      <GroupHeading verdict={verdict} count={rows.length} />
      <div className={GRID}>
        {rows.map((r) => (
          <SellCard key={r.name} row={r} exPerDiv={exPerDiv} />
        ))}
      </div>
    </section>
  );
}

/** Unpriced items: nothing to act on, so they stay folded and muted below the groups. */
function UnpricedGroup({ rows, exPerDiv }: { rows: SellRow[]; exPerDiv: number }) {
  return (
    <details className="group rounded-lg border border-line/70 bg-neutral-900/30 px-3 py-2 opacity-80">
      <summary className="flex cursor-pointer list-none items-center gap-2">
        <GroupHeading verdict="unpriced" count={rows.length} tip={false} />
        <span className="text-xs text-neutral-400 group-open:hidden">show</span>
      </summary>
      <div className={`${GRID} mt-2`}>
        {rows.map((r) => (
          <SellCard key={r.name} row={r} exPerDiv={exPerDiv} />
        ))}
      </div>
    </details>
  );
}

/** Stash › Sell as verdict cards: one group per verdict, in the order you would act on them. */
export function SellCards({ data }: { data: SellResponse }) {
  const exPerDiv = data.provenance.rates.exaltPerDivine;
  const of = (v: SellVerdict) => data.rows.filter((r) => r.verdict === v);
  const unpriced = of("unpriced");
  return (
    <div className="space-y-4">
      {GROUP_ORDER.map((v) => {
        const rows = of(v);
        return rows.length === 0 ? null : <Group key={v} verdict={v} rows={rows} exPerDiv={exPerDiv} />;
      })}
      {unpriced.length > 0 && <UnpricedGroup rows={unpriced} exPerDiv={exPerDiv} />}
    </div>
  );
}
