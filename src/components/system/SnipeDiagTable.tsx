"use client";

import { useCallback, useState } from "react";
import { Radar } from "lucide-react";
import { fmtDivOrEx } from "../../lib/format";
import { fetchSnipeScanStatus, type SnipeDiag, type SnipeScanStatus } from "../../lib/snipeScanContract";
import { useVisiblePoll } from "../../lib/useVisiblePoll";
import { DataTable, type Column } from "../ui/DataTable";
import { EmptyState } from "../ui/EmptyState";

const POLL_MS = 60_000;
const int = (n: number): string => n.toLocaleString("en", { maximumFractionDigits: 0 });

function diagColumns(exPerDiv: number): Column<SnipeDiag>[] {
  return [
    { key: "label", header: "Archetype", cell: (d) => <span title={d.note || undefined}>{d.label}</span> },
    {
      key: "total",
      header: "Listed",
      tip: "live listings the archetype search reports (10,000+ = the search is too broad)",
      align: "right",
      cell: (d) => <span className={`tabular-nums ${d.total >= 10000 ? "text-warn" : ""}`}>{int(d.total)}{d.total >= 10000 ? "+" : ""}</span>,
    },
    { key: "candidates", header: "Candidates", tip: "cheap real listings put forward for valuation", align: "right", cell: (d) => <span className="tabular-nums">{d.candidates}</span> },
    { key: "verified", header: "Valued", tip: "per-item comparable searches spent", align: "right", cell: (d) => <span className="tabular-nums">{d.verified}</span> },
    { key: "snipes", header: "Snipes", align: "right", cell: (d) => <span className={`tabular-nums ${d.snipes ? "font-semibold text-good" : ""}`}>{d.snipes}</span> },
    { key: "floorDiv", header: "Floor", tip: "archetype reference price — diagnostic only, not what snipes are valued on", align: "right", cell: (d) => <span className="tabular-nums text-neutral-400">{fmtDivOrEx(d.floorDiv, exPerDiv)}</span> },
  ];
}

/** The last scan's budget line and per-archetype yield: what the scanner searched, valued and found. */
function DiagBody({ status }: { status: SnipeScanStatus }) {
  const report = status.lastReport;
  if (!report) return <EmptyState icon={<Radar className="h-5 w-5" />} sentence="No auto-snipe scan has reported yet." />;
  return (
    <>
      <p className="mb-2 text-xs text-neutral-400">
        searched {report.searched}/{report.profiles} archetypes · valued {report.valuations}/{report.maxValuations} ·{" "}
        {report.findings.length} snipe(s)
        {report.errors.length > 0 && <span className="text-warn"> · {report.errors.length} error(s)</span>}
      </p>
      <DataTable
        columns={diagColumns(report.exaltPerDivine)}
        rows={report.diags}
        rowKey={(d) => d.key}
        emptyState={<p className="text-xs text-neutral-400">The last scan recorded no archetype diagnostics.</p>}
      />
      {report.errors.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-warn">
          {report.errors.map((e) => <li key={`${e.profile}|${e.error}`}>{e.profile}: {e.error}</li>)}
        </ul>
      )}
    </>
  );
}

/** Owner diagnostics for the auto-snipe scanner, moved off the player-facing Market tab. */
export function SnipeDiagTable() {
  const [status, setStatus] = useState<SnipeScanStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    fetchSnipeScanStatus()
      .then((s) => {
        setStatus(s);
        setError(null);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  useVisiblePoll(load, POLL_MS);

  return (
    <div>
      <h3 className="mb-1 text-sm font-semibold text-neutral-200">Auto-snipe scan</h3>
      {error && <p role="alert" className="text-xs text-bad">scan diagnostics unavailable — {error}</p>}
      {!status && !error && <p className="text-xs text-neutral-400">loading…</p>}
      {status && <DiagBody status={status} />}
    </div>
  );
}
