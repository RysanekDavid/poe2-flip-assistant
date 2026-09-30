"use client";

import { useCallback, useRef, useState } from "react";
import { fetchSnipeScanStatus, type SnipeScanStatus } from "../../lib/snipeScanContract";
import { useVisiblePoll } from "../../lib/useVisiblePoll";

// A scan is paced by the shared trade2 budget: ~6 searches × 36s + ~8 fetches × 21.6s ≈ 3–6 min,
// plus craft-margin legs interleaving on the same queue. 15 min is the point where "slow" means "broken".
const SCAN_WAIT_TIMEOUT_MS = 15 * 60_000;
const POLL_MS = 10_000;

const stampOf = (s: SnipeScanStatus | null): string => `${s?.lastScanAt ?? ""}|${s?.failedAt ?? ""}`;

/** Why Scan now is unavailable, or null when it can run. */
export function scanBlocker(status: SnipeScanStatus | null): string | null {
  if (!status) return "loading scanner status…";
  if (!status.canScan) return "scans spend the shared trade budget — only the owner can start one";
  if (!status.live) return "needs your POESESSID (Settings)";
  return null;
}

/**
 * Scanner status + a queued manual scan (owner diagnostics under Settings › System). The poller
 * runs the scan (it owns the trade2 limiter); this only queues it and waits until a new report — or
 * a new failure — lands.
 */
export function useSnipeScanner() {
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
