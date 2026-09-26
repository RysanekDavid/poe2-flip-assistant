"use client";

/**
 * "computed in {league}" header chip. Shared-pipeline panels (craft margins, demand board, net
 * worth) are priced in the app default league, which can differ from the league the viewer picked
 * — the chip keeps a number from being silently read as belonging to the viewer's economy.
 */
export function ComputedLeague({ league }: { league: string | null | undefined }) {
  if (!league) return null;
  return (
    <span
      className="rounded bg-neutral-800/70 px-1.5 py-0.5 text-[11px] text-neutral-400"
      title="prices on this panel come from this league's market, regardless of the league you are viewing"
    >
      computed in <span className="font-medium text-neutral-300">{league}</span>
    </span>
  );
}
