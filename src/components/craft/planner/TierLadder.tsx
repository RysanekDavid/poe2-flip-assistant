import type { PoolFamily } from "./plannerModel";

/**
 * A family's tiers, best first: "tier k of n · level L · roll range". Tier numbers count up in game
 * (the highest is the best) and are read differently across sites, so the level and the roll range
 * always sit next to them. Picking a tier sets the MINIMUM you accept — better tiers count too.
 * A tier above the item level stays pickable but says what it needs.
 */
export function TierLadder({ family, ilvl, current, onPick }: { family: PoolFamily; ilvl: number; current: string | null; onPick: (modId: string) => void }) {
  const n = family.tiers.length;
  const rows = family.tiers.map((t, i) => ({ t, k: i + 1 })).reverse();
  return (
    <ol aria-label="tiers, best first" className="space-y-0.5 px-2 pb-2 pl-7">
      {rows.map(({ t, k }) => {
        const short = t.level > ilvl;
        const on = t.modId === current;
        return (
          <li key={t.modId}>
            <button
              type="button"
              data-row
              aria-pressed={on}
              onClick={() => onPick(t.modId)}
              className={`flex w-full flex-wrap items-baseline gap-x-2 rounded px-2 py-1 text-left text-sm hover:bg-amber-950/30 focus-visible:outline focus-visible:outline-1 focus-visible:outline-amber-400 ${
                on ? "bg-amber-950/40 ring-1 ring-amber-500/50" : ""
              }`}
            >
              <span className="w-24 shrink-0 text-xs tabular-nums text-neutral-400">
                tier {k} of {n}
              </span>
              <span className="w-16 shrink-0 text-xs tabular-nums text-neutral-400">level {t.level}</span>
              <span className="min-w-0 flex-1 text-[#8888ff]">{t.text}</span>
              {short && <span className="text-xs text-amber-300">needs ilvl {t.level}</span>}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
