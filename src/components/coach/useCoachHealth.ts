"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchCoachHealth, type CoachHealth } from "./api";

/** While Coach is unusable, re-check this often so a restarted service unlocks the composer. */
const UNAVAILABLE_RECHECK_MS = 60_000;

export type CoachAvailability =
  | { ready: true; reason: null }
  | { ready: false; reason: string };

export function coachAvailability(health: CoachHealth | null, failed: boolean): CoachAvailability {
  if (failed) return { ready: false, reason: "The local Coach service is not running." };
  if (!health) return { ready: false, reason: "Checking Coach service readiness…" };
  if (!health.model_configured) {
    return {
      ready: false,
      reason: "Configure the isolated Coach process environment, then restart Coach.",
    };
  }
  if (!health.item_data_ready) {
    return { ready: false, reason: "The local PoE2 item catalog is missing or invalid." };
  }
  if (!health.market_ready || !health.knowledge_ready) {
    return { ready: false, reason: "The market database or knowledge base is unavailable." };
  }
  return { ready: true, reason: null };
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
