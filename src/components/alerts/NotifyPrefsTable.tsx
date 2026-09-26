"use client";

import type { PrefRow } from "../../core/notify/prefs";
import { typeTone } from "./AlertBits";

const TYPE_HINT: Record<PrefRow["type"], string> = {
  SNIPE: "underpriced listing (autosnipe or your snipe hunts) — time-sensitive",
  CRAFT_MARGIN: "a craft recipe's expected value clears its margin",
  SPREAD: "a watched exchange flip clears your threshold",
  CRAFT_BASE: "new listings for your craft-base hunts",
  RESELL: "new listings for your resell hunts",
  LEAGUE: "a new league started / the default league switched",
  TREND: "a watched item's trend state changed",
  SPIKE: "a watched item is spiking",
};

function Toggle({ on, label, onChange }: { on: boolean; label: string; onChange: (on: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={label}
      onClick={() => onChange(!on)}
      className={`relative h-5 w-9 rounded-full border transition-colors ${on ? "border-emerald-500/60 bg-emerald-600/70" : "border-neutral-700 bg-neutral-800"}`}
    >
      <span className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-neutral-100 transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
    </button>
  );
}

/** Per-type routing: which alert types go to Discord and which show in the ticker/badge. */
export function NotifyPrefsTable({
  prefs,
  webhookSet,
  onChange,
}: {
  prefs: PrefRow[];
  webhookSet: boolean;
  onChange: (type: PrefRow["type"], change: { discord?: boolean; ticker?: boolean }) => void;
}) {
  return (
    <table className="w-full max-w-2xl text-sm">
      <thead>
        <tr className="text-left text-xs uppercase tracking-wider text-neutral-500">
          <th className="py-1 font-medium">Alert type</th>
          <th className="py-1 text-center font-medium" title={webhookSet ? "send to your Discord webhook" : "save a webhook first"}>
            Discord
          </th>
          <th className="py-1 text-center font-medium" title="show in the Exchange ticker and the bell badge">
            Ticker
          </th>
        </tr>
      </thead>
      <tbody>
        {prefs.map((p) => (
          <tr key={p.type} className="border-t border-neutral-800/70">
            <td className="py-1.5" title={TYPE_HINT[p.type]}>
              <span className={`font-semibold ${typeTone(p.type)}`}>{p.type}</span>
            </td>
            <td className={`py-1.5 text-center ${webhookSet ? "" : "opacity-40"}`}>
              <Toggle on={p.discord} label={`${p.type} to Discord`} onChange={(on) => onChange(p.type, { discord: on })} />
            </td>
            <td className="py-1.5 text-center">
              <Toggle on={p.ticker} label={`${p.type} in the ticker`} onChange={(on) => onChange(p.type, { ticker: on })} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
