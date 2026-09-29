"use client";

import { useCallback, useRef, useState } from "react";
import { ExternalLink, Loader2, Play, Radar, TriangleAlert } from "lucide-react";
import { fetchSnipeScanStatus, findingCard, type SnipeScanReport, type SnipeScanStatus } from "../lib/snipeScanContract";
import { useVisiblePoll } from "../lib/useVisiblePoll";
import { SnipeCardView, ageLabel } from "./alerts/SnipeCardView";
import { Button } from "./ui/Button";
import { EmptyState } from "./ui/EmptyState";

// A scan is paced by the shared trade2 budget: ~6 searches × 36s + ~8 fetches × 21.6s ≈ 3–6 min,
// plus craft-margin legs interleaving on the same queue. 15 min is the point where "slow" means "broken".
const SCAN_WAIT_TIMEOUT_MS = 15 * 60_000;
const POLL_MS = 10_000;

const stampOf = (s: SnipeScanStatus | null): string => `${s?.lastScanAt ?? ""}|${s?.failedAt ?? ""}`;

/**
 * Scanner status + a queued manual scan. The poller runs the scan (it owns the trade2 limiter);
 * this only queues it and waits until a new report — or a new failure — lands.
 */
function useSnipeScanner() {
  const [status, setStatus] = useState<SnipeScanStatus | null>(null);
  const [scanning, setScanning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const waiting = useRef<{ from: string; at: number } | null>(null);
  const load = useCallback(() => {
    fetchSnipeScanStatus()
      .then((s) => {
        setStatus(s);
        const w = waiting.current;
        if (w && !s.pending && stampOf(s) !== w.from) {
          waiting.current = null;
          setScanning(false);
        } else if (w && Date.now() - w.at > SCAN_WAIT_TIMEOUT_MS) {
          waiting.current = null;
          setScanning(false);
          setNotice("the scan did not report back within 15 min — is the poller running? check its log");
        }
      })
      .catch((e: unknown) => setNotice(`scanner status unavailable: ${e instanceof Error ? e.message : String(e)}`));
  }, []);
  useVisiblePoll(load, POLL_MS);
  const scanNow = () => {
    if (scanning) return;
    setScanning(true);
    setNotice(null);
    fetch("/api/snipe/scan", { method: "POST" })
      .then(async (r) => {
        const b = (await r.json()) as { queued?: boolean; error?: string };
        if (!b.queued) throw new Error(b.error ?? `scan was not queued (${r.status})`);
        waiting.current = { from: stampOf(status), at: Date.now() };
      })
      .catch((e: unknown) => {
        setScanning(false);
        setNotice(`scan failed: ${e instanceof Error ? e.message : String(e)}`);
      });
  };
  return { status, scanning, notice: notice ?? status?.lastError ?? null, scanNow };
}

function StatusLine({ status }: { status: SnipeScanStatus }) {
  const found = status.lastReport?.findings.length ?? 0;
  return (
    <span className="flex flex-wrap items-center gap-x-2 text-xs text-neutral-400">
      <span>{status.enabled ? `scans every ${status.intervalMin}m` : "manual scans only"}</span>
      <span aria-hidden>·</span>
      <span className={status.live ? "text-good" : "text-warn"}>{status.live ? "trade connected" : "not connected — add your POESESSID in Settings"}</span>
      {status.lastScanAt && (
        <>
          <span aria-hidden>·</span>
          <span title={`${status.lastScanAt} UTC`}>last scan {ageLabel(status.lastScanAt)} ago · {found} snipe{found === 1 ? "" : "s"}</span>
        </>
      )}
    </span>
  );
}

function Findings({ report, at }: { report: SnipeScanReport; at: string | null }) {
  if (report.findings.length === 0) {
    return <EmptyState icon={<Radar className="h-5 w-5" />} sentence="The last scan found nothing priced under its value — new snipes also arrive as alerts." />;
  }
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
      {report.findings.map((f) => {
        const card = findingCard(f);
        if (card.ok) return <SnipeCardView key={f.listingId} alert={{ seen: 1, created_at: at ?? "", foreign_league: null }} card={card.card} />;
        return (
          <p key={f.listingId} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm text-neutral-300">
            <TriangleAlert aria-hidden className="h-4 w-4 shrink-0 text-warn" />
            <span className="min-w-0 truncate" title={card.error}>{f.itemName || f.baseType} — {Math.round(f.marginPct)}% under value</span>
            <a href={f.searchUrl} target="_blank" rel="noopener noreferrer" aria-label="open the comparable search" className="ml-auto text-sky-400 hover:text-sky-300">
              <ExternalLink aria-hidden className="h-4 w-4" />
            </a>
          </p>
        );
      })}
    </div>
  );
}

/** Market tab: the auto-snipe scanner's state, a manual scan, and what the last scan found. */
export function AutoSnipeBar() {
  const { status, scanning, notice, scanNow } = useSnipeScanner();
  return (
    <section className="rounded-lg border border-line bg-neutral-900/50 p-4">
      <header className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 className="text-lg font-semibold text-neutral-100">Snipes</h3>
        {status && <StatusLine status={status} />}
        <Button size="sm" className="ml-auto" onClick={scanNow} disabled={scanning || !status?.live} title={status?.live ? "queue one scan now" : "needs your POESESSID (Settings)"}>
          {scanning ? <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" /> : <Play aria-hidden className="h-3.5 w-3.5" />}
          {scanning ? "scan queued…" : "Scan now"}
        </Button>
      </header>
      {notice && <p role="alert" className="mb-3 rounded border border-warn/40 bg-warn/10 px-2 py-1 text-sm text-warn">{notice}</p>}
      {status?.lastReport ? (
        <Findings report={status.lastReport} at={status.lastScanAt} />
      ) : (
        status && <EmptyState icon={<Radar className="h-5 w-5" />} sentence="No scan has run yet — Scan now, or wait for the scheduled scan." />
      )}
    </section>
  );
}
