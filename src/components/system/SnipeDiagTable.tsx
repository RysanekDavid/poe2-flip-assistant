"use client";

import { Loader2, Play, Radar } from "lucide-react";
import { fmtDivOrEx } from "../../lib/format";
import { parseScanReport, type SnipeDiag, type SnipeScanStatus } from "../../lib/snipeScanContract";
import { useSnipeOutcomes } from "../../lib/useSnipeOutcomes";
import { ageLabel } from "../alerts/SnipeCardView";
import { Button } from "../ui/Button";
import { DataTable, type Column } from "../ui/DataTable";
import { EmptyState } from "../ui/EmptyState";
import { SnipeHitRates } from "./SnipeHitRates";
import { scanBlocker, useSnipeScanner } from "./useSnipeScanner";

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
  const { report, error } = parseScanReport(status.lastReport);
  if (error) return <p role="alert" className="text-xs text-warn">{error}</p>;
  if (!report) return <EmptyState icon={<Radar className="h-5 w-5" />} sentence="No auto-snipe scan has reported yet." />;
  return (
    <>
      <p className="mb-2 text-xs text-neutral-400">
        searched {report.searched}/{report.profiles} archetypes · valued {report.valuations}/{report.maxValuations} ·{" "}
        {report.findings.length} snipe(s) · {report.nearMisses?.length ?? 0} near-miss(es) kept
        {report.errors.length > 0 && <span className="text-warn"> · {report.errors.length} error(s)</span>}
      </p>
      <DataTable
        columns={diagColumns(report.exaltPerDivine)}
        rows={report.diags ?? []}
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

function StatusLine({ status }: { status: SnipeScanStatus }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 text-xs text-neutral-400">
      <span>{status.enabled ? `scans every ${status.intervalMin}m` : "manual scans only"}</span>
      <span aria-hidden>·</span>
      <span className={status.live ? "text-good" : "text-warn"}>{status.live ? "trade connected" : "not connected — add your POESESSID in Settings"}</span>
      {status.lastScanAt && (
        <>
          <span aria-hidden>·</span>
          <span title={`${status.lastScanAt} UTC`}>last scan {ageLabel(status.lastScanAt)} ago</span>
        </>
      )}
    </span>
  );
}

/**
 * Owner diagnostics for the auto-snipe scanner, kept off the player-facing Market tab: its status,
 * a manual scan, the alert hit rates and the last scan's per-archetype yield.
 */
export function SnipeDiagTable() {
  const { status, scanning, notice, scanNow } = useSnipeScanner();
  const outcomes = useSnipeOutcomes();
  const blocker = scanBlocker(status);
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 className="text-sm font-semibold text-neutral-200">Auto-snipe scan</h3>
        {status && <StatusLine status={status} />}
        <Button size="sm" className="ml-auto" onClick={scanNow} disabled={scanning || blocker != null} title={blocker ?? "queue one scan now"}>
          {scanning ? <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" /> : <Play aria-hidden className="h-3.5 w-3.5" />}
          {scanning ? "scan queued…" : "Scan now"}
        </Button>
      </div>
      {notice && <p role="alert" className="rounded border border-warn/40 bg-warn/10 px-2 py-1 text-xs text-warn">{notice}</p>}
      {outcomes.data && <SnipeHitRates data={outcomes.data} />}
      {outcomes.error && <p className="text-xs text-warn">alert outcomes unavailable: {outcomes.error}</p>}
      {!status && !notice && <p className="text-xs text-neutral-400">loading…</p>}
      {status && <DiagBody status={status} />}
    </div>
  );
}
