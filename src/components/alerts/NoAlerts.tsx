"use client";

import { useTabRoute } from "../shell/useTabRoute";

/**
 * The empty alert feed says what fills it and how to start one, instead of "no alerts yet". Watching
 * an item happens in the Flips watchlist (an Advanced tool: a beginner lands there under its banner).
 */
export function NoAlerts({ onNavigate }: { onNavigate?: () => void }) {
  const { go } = useTabRoute();
  return (
    <p className="py-6 text-center text-sm text-neutral-400">
      No alerts yet. They arrive when a watched price spikes, a craft starts paying or a snipe appears —{" "}
      <button
        type="button"
        onClick={() => {
          onNavigate?.();
          go("flips");
        }}
        className="text-info hover:underline"
      >
        watch an item
      </button>
      .
    </p>
  );
}
