"use client";

import { useCallback, useRef, useState } from "react";
import { ExternalLink, Info, Loader2, Play, Radar, TriangleAlert } from "lucide-react";
import { fetchSnipeScanStatus, findingCard, parseScanReport, type ParsedReport, type SnipeScanReport, type SnipeScanStatus } from "../lib/snipeScanContract";
import { useVisiblePoll } from "../lib/useVisiblePoll";
import { useSnipeOutcomes } from "../lib/useSnipeOutcomes";
import { fetchMethodCaveat, GONE_MEANING, type ProfileOutcomeStats, type SnipeOutcomesResponse } from "../lib/snipeOutcomeContract";
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

function StatusLine({ status, found }: { status: SnipeScanStatus; found: number | null }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 text-xs text-neutral-400">
      <span>{status.enabled ? `scans every ${status.intervalMin}m` : "manual scans only"}</span>
      <span aria-hidden>·</span>
      <span className={status.live ? "text-good" : "text-warn"}>{status.live ? "trade connected" : "not connected — add your POESESSID in Settings"}</span>
      {status.lastScanAt && (
        <>
          <span aria-hidden>·</span>
          <span title={`${status.lastScanAt} UTC`}>
            last scan {ageLabel(status.lastScanAt)} ago{found != null && ` · ${found} snipe${found === 1 ? "" : "s"}`}
          </span>
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

const pctText = (p: number | null): string => (p == null ? "—" : `${Math.round(p)}%`);

function hitRateHint(p: ProfileOutcomeStats): string {
  const lines = [
    `gone <2h: ${pctText(p.gone2hPct)} of ${p.checked2h} checked at 2 h`,
    `gone <24h: ${pctText(p.gone24hPct)} · still listed at 24 h: ${pctText(p.listed24hPct)} (of ${p.decided24h})`,
    p.medianMarginGonePct != null || p.medianMarginListedPct != null
      ? `median alert margin: gone ${pctText(p.medianMarginGonePct)} vs still listed ${pctText(p.medianMarginListedPct)}`
      : null,
    p.errors > 0 ? `${p.errors} check(s) failed` : null,
    GONE_MEANING,
  ];
  return lines.filter((l): l is string => l != null).join("\n");
}

/**
 * Per-archetype hit rate of past alerts: how often the listing was gone within 2 h. Neutral until
 * the fetch method is verified; once it is known to be broken its percentages are not shown at all.
 */
function HitRates({ data }: { data: SnipeOutcomesResponse }) {
  const rows = data.profiles.filter((p) => p.checked2h > 0 || p.decided24h > 0);
  if (rows.length === 0 && data.pending === 0) return null;
  const caveat = fetchMethodCaveat(data.fetchMethod);
  const rateTone = data.fetchMethod === "verified" ? "text-neutral-200" : "text-neutral-400";
  const head = `alerts of the last ${data.windowDays} days in ${data.league}, re-checked 2 h and 24 h later\n${GONE_MEANING}${caveat ? `\n${caveat}` : ""}`;
  return (
    <p className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-400">
      <span className="flex items-center gap-1 font-medium text-neutral-300" title={head}>
        Alert outcomes{data.fetchMethod === "unverified" && <span className="font-normal text-neutral-500"> · unverified method</span>}
        <Info aria-hidden className="h-3.5 w-3.5 text-neutral-500" />
      </span>
      {data.fetchMethod === "broken" ? (
        <span className="text-warn" title={caveat ?? ""}>hit rates hidden — the re-fetch method proved unreliable; checks now re-search</span>
      ) : (
        rows.map((p) => (
          <span key={p.profile} title={`${hitRateHint(p)}${caveat ? `\n${caveat}` : ""}`}>
            {p.label} <span className={`tabular-nums ${rateTone}`}>{pctText(p.gone2hPct)}</span> gone &lt;2h
            <span className="text-neutral-500"> (n={p.checked2h})</span>
          </span>
        ))
      )}
      {data.pending > 0 && <span className="text-neutral-500">{data.pending} awaiting a check</span>}
    </p>
  );
}

/** Why Scan now is unavailable, or null when it can run. */
function scanBlocker(status: SnipeScanStatus | null): string | null {
  if (!status) return "loading scanner status…";
  if (!status.canScan) return "scans spend the shared trade budget — only the owner can start one";
  if (!status.live) return "needs your POESESSID (Settings)";
  return null;
}

function ScanBody({ status, parsed }: { status: SnipeScanStatus; parsed: ParsedReport }) {
  // an unreadable report is reported by the notice above; the scanner itself stays usable
  if (parsed.error) return null;
  if (parsed.report) return <Findings report={parsed.report} at={status.lastScanAt} />;
  return <EmptyState icon={<Radar className="h-5 w-5" />} sentence="No scan has run yet — Scan now, or wait for the scheduled scan." />;
}

/** Market tab: the auto-snipe scanner's state, a manual scan, and what the last scan found. */
export function AutoSnipeBar() {
  const { status, scanning, notice, scanNow } = useSnipeScanner();
  const outcomes = useSnipeOutcomes();
  const parsed = parseScanReport(status?.lastReport);
  const blocker = scanBlocker(status);
  const banner = notice ?? parsed.error;
  return (
    <section className="rounded-lg border border-line bg-neutral-900/50 p-4">
      <header className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 className="text-lg font-semibold text-neutral-100">Snipes</h3>
        {status && <StatusLine status={status} found={parsed.report?.findings.length ?? null} />}
        <Button size="sm" className="ml-auto" onClick={scanNow} disabled={scanning || blocker != null} title={blocker ?? "queue one scan now"}>
          {scanning ? <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" /> : <Play aria-hidden className="h-3.5 w-3.5" />}
          {scanning ? "scan queued…" : "Scan now"}
        </Button>
      </header>
      {banner && <p role="alert" className="mb-3 rounded border border-warn/40 bg-warn/10 px-2 py-1 text-sm text-warn">{banner}</p>}
      {outcomes.data && <HitRates data={outcomes.data} />}
      {outcomes.error && <p className="mb-3 text-xs text-warn">alert outcomes unavailable: {outcomes.error}</p>}
      {status && <ScanBody status={status} parsed={parsed} />}
    </section>
  );
}
