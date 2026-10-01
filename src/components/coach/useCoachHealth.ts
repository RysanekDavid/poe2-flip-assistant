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

/** What a member sees while Coach is down: the operator detail is only actionable on the server. */
export const COACH_OFFLINE_NOTICE = "Coach is offline — try again later.";

/** Why the composer is locked. `operator` (the owner) gets the server-side cause; members get one plain line. */
export function coachAvailability(health: CoachHealth | null, failed: boolean, operator: boolean): CoachAvailability {
  const down = (reason: string): CoachAvailability => ({ ready: false, reason: operator ? reason : COACH_OFFLINE_NOTICE });
  if (failed) return down("The local Coach service is not running.");
  if (!health) return { ready: false, reason: "Checking Coach service readiness…" };
  if (!health.model_configured) return down("Configure the isolated Coach process environment, then restart Coach.");
  if (health.agent_ready === false) return down("Coach failed to initialize; check the Coach service log.");
  if (!health.item_data_ready) return down("The local PoE2 item catalog is missing or invalid.");
  if (!health.knowledge_ready) return down("The Coach knowledge base is unavailable.");
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
  // readiness does not depend on who is asking, only the wording does
  const ready = coachAvailability(health, healthError, false).ready;

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
