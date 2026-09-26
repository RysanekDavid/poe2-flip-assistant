"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchCoachHealth, type CoachHealth } from "./api";

/** While Coach is unusable, re-check this often so a restarted service unlocks the composer. */
const UNAVAILABLE_RECHECK_MS = 60_000;

/** `ready` unlocks the composer; a ready Coach may still carry a notice (e.g. stale prices). */
export type CoachAvailability =
  | { ready: true; reason: string | null }
  | { ready: false; reason: string };

const STALE_MARKET_NOTICE =
  "Market data is stale or unavailable — price answers may be missing; knowledge and item questions still work.";

export function coachAvailability(health: CoachHealth | null, failed: boolean): CoachAvailability {
  if (failed) return { ready: false, reason: "The local Coach service is not running." };
  if (!health) return { ready: false, reason: "Checking Coach service readiness…" };
  if (!health.model_configured) {
    return {
      ready: false,
      reason: "Configure the isolated Coach process environment, then restart Coach.",
    };
  }
  if (health.agent_ready === false) {
    return { ready: false, reason: "Coach failed to initialize; check the Coach service log." };
  }
  if (!health.item_data_ready) {
    return { ready: false, reason: "The local PoE2 item catalog is missing or invalid." };
  }
  if (!health.knowledge_ready) {
    return { ready: false, reason: "The Coach knowledge base is unavailable." };
  }
  // A poe.ninja outage or stopped poller must not lock out knowledge and item questions; the
  // market tools report their own gap per request.
  return { ready: true, reason: health.market_ready ? null : STALE_MARKET_NOTICE };
}

/**
 * Health is re-read on every tab activation and every minute while Coach is unavailable, so a
 * deploy or restart does not leave the panel locked until a full page reload.
 */
export function useCoachHealth(active: boolean) {
  const [health, setHealth] = useState<CoachHealth | null>(null);
  const [healthError, setHealthError] = useState(false);
  const ready = coachAvailability(health, healthError).ready;

  const check = useCallback(async (signal: AbortSignal): Promise<void> => {
    try {
      const result = await fetchCoachHealth(signal);
      setHealth(result);
      setHealthError(false);
    } catch (caught: unknown) {
      if (signal.aborted) return;
      console.warn("Coach health check failed", caught);
      setHealthError(true);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    void check(controller.signal);
    return () => controller.abort();
  }, [active, check]);

  useEffect(() => {
    if (!active || ready) return;
    const controller = new AbortController();
    const timer = window.setInterval(() => void check(controller.signal), UNAVAILABLE_RECHECK_MS);
    return () => {
      window.clearInterval(timer);
      controller.abort();
    };
  }, [active, check, ready]);

  return { health, healthError };
}
