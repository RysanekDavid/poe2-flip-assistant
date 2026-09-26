"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { assertOk, describeError } from "../lib/clientWarn";
import { useVisiblePoll } from "../lib/useVisiblePoll";
import type { Hunt } from "./huntApi";

export interface Hit {
  id: number;
  hunt_id: number;
  item_name: string;
  base_type: string | null;
  price_amount: number;
  price_ccy: string;
  price_div: number | null; // null = ask currency outside the rates ladder
  margin_pct: number | null;
  account: string | null;
  whisper: string | null;
  listing_id: string | null;
  seller_online: number | null;
  listed_at: string | null;
  seen: number;
  found_at: string;
}

export interface HuntStatus {
  scannedHunts: number;
  last_scan_at: string | null;
  last_error: string | null;
  updated_at: string | null;
  liveEnabled: boolean;
  huntEnabled: boolean;
  scanSec: number;
}

/**
 * The poller only produces new hits once per scan lap (scanSec, longer when several hunts share
 * the trade2 budget), so polling faster than that re-downloads the same rows. Floor keeps a
 * misconfigured tiny HUNT_SCAN_SEC from turning the panel into a request loop.
 */
const MIN_POLL_SEC = 15;
const DEFAULT_POLL_SEC = 60;

type FeedSource = "hunts" | "hits" | "status";

function beep(): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const t = ctx.currentTime;
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.2, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(t + 0.24);
    osc.onended = () => ctx.close();
  } catch (error: unknown) {
    console.warn("[hunt] new-hit sound unavailable:", describeError(error));
  }
}

/** Per-source load errors, so one failing route neither hides nor clears another's message. */
function useFeedErrors(): { feedError: string | null; fail: (s: FeedSource, e: unknown) => void; clear: (s: FeedSource) => void } {
  const [errors, setErrors] = useState<Partial<Record<FeedSource, string>>>({});
  const fail = useCallback((source: FeedSource, error: unknown) => {
    console.warn(`[hunt] ${source} refresh failed:`, describeError(error));
    setErrors((prev) => ({ ...prev, [source]: describeError(error) }));
  }, []);
  const clear = useCallback((source: FeedSource) => {
    setErrors((prev) => {
      if (!(source in prev)) return prev;
      const next = { ...prev };
      delete next[source];
      return next;
    });
  }, []);
  const messages = Object.entries(errors).map(([source, message]) => `${source}: ${message}`);
  return { feedError: messages.length > 0 ? messages.join(" · ") : null, fail, clear };
}

/** Saved hunts, live hits and scan status, polled at the scan cadence while the tab is visible. */
export function useHuntFeed(soundOn: boolean, perHuntSound: Record<number, boolean>) {
  const [hunts, setHunts] = useState<Hunt[]>([]);
  const [liveEnabled, setLiveEnabled] = useState(true);
  const [hits, setHits] = useState<Hit[]>([]);
  const [status, setStatus] = useState<HuntStatus | null>(null);
  const [flashIds, setFlashIds] = useState<Set<number>>(new Set());
  const { feedError, fail, clear } = useFeedErrors();
  // ids of hits seen in the previous poll, to detect freshly-arrived ones
  const knownIds = useRef<Set<number>>(new Set());
  const firstHits = useRef(true);

  const loadHunts = useCallback(() => {
    fetch("/api/hunts")
      .then((r) => assertOk(r, "/api/hunts").json())
      .then((h) => {
        setHunts(h.hunts ?? []);
        setLiveEnabled(h.liveEnabled ?? false);
        clear("hunts");
      })
      .catch((e: unknown) => fail("hunts", e));
  }, [clear, fail]);

  const loadHits = useCallback(() => {
    fetch("/api/hunts/hits")
      .then((r) => assertOk(r, "/api/hunts/hits").json())
      .then((d: { hits?: Hit[] }) => {
        const next = d.hits ?? [];
        const fresh = next.filter((h) => !knownIds.current.has(h.id));
        if (firstHits.current) firstHits.current = false;
        else if (fresh.length > 0) {
          setFlashIds(new Set(fresh.map((h) => h.id)));
          window.setTimeout(() => setFlashIds(new Set()), 2500);
          if (soundOn || fresh.some((h) => perHuntSound[h.hunt_id])) beep();
        }
        knownIds.current = new Set(next.map((h) => h.id));
        setHits(next);
        clear("hits");
      })
      .catch((e: unknown) => fail("hits", e));
  }, [soundOn, perHuntSound, clear, fail]);

  const loadStatus = useCallback(() => {
    fetch("/api/hunts/status")
      .then((r) => assertOk(r, "/api/hunts/status").json())
      .then((s: HuntStatus) => {
        setStatus(s);
        clear("status");
      })
      .catch((e: unknown) => fail("status", e));
  }, [clear, fail]);

  const cadenceMs = Math.max(MIN_POLL_SEC, status?.scanSec ?? DEFAULT_POLL_SEC) * 1000;
  useVisiblePoll(loadStatus, cadenceMs);
  useVisiblePoll(loadHits, cadenceMs);
  useEffect(() => {
    loadHunts();
  }, [loadHunts]);

  return { hunts, liveEnabled, hits, status, flashIds, feedError, loadHunts, loadHits };
}
