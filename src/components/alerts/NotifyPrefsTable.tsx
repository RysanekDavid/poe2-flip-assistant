"use client";

import type { ReactNode } from "react";
import { Bell, MessageSquare, MonitorUp, Volume2 } from "lucide-react";
import type { Channel, ChannelPrefs, PrefRow } from "../../core/notify/prefs";
import { typeTone } from "./AlertBits";

const TYPE_HINT: Record<PrefRow["type"], string> = {
  SNIPE: "underpriced listing found by the autosnipe scanner — time-sensitive",
  CRAFT_MARGIN: "a craft recipe's expected value clears its margin",
  SPREAD: "a watched exchange flip clears your threshold",
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

interface Column {
  channel: Channel;
  icon: ReactNode;
  title: string;
  label: (type: string) => string;
}

const COLUMNS: readonly Column[] = [
  { channel: "ticker", icon: <Bell className="h-4 w-4" />, title: "Ticker — show in the feed badge and the Exchange ticker", label: (t) => `${t} in the ticker` },
  { channel: "sound", icon: <Volume2 className="h-4 w-4" />, title: "Sound — chime when one arrives (this browser)", label: (t) => `${t} plays a sound` },
  { channel: "popup", icon: <MonitorUp className="h-4 w-4" />, title: "Desktop popup — browser notification, needs permission", label: (t) => `${t} raises a desktop popup` },
  { channel: "discord", icon: <MessageSquare className="h-4 w-4" />, title: "Discord — send to your webhook (reaches a fullscreen game)", label: (t) => `${t} to Discord` },
];

/**
 * Per-type routing matrix: which alert types show in the ticker, chime, pop a desktop
 * notification and go to Discord. A channel that cannot deliver right now (no webhook, popups
 * blocked) is dimmed but stays editable, so the choice is ready once it can.
 */
export function NotifyPrefsTable({
  prefs,
  dimmed,
  onChange,
}: {
  prefs: PrefRow[];
  dimmed: Partial<Record<Channel, string>>; // channel → why it cannot deliver right now
  onChange: (type: PrefRow["type"], change: Partial<ChannelPrefs>) => void;
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs uppercase tracking-wider text-neutral-500">
          <th className="py-1 font-medium">Type</th>
          {COLUMNS.map((c) => (
            <th key={c.channel} className={`py-1 font-medium ${dimmed[c.channel] ? "opacity-40" : ""}`} title={dimmed[c.channel] ?? c.title}>
              <span className="flex justify-center">{c.icon}</span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {prefs.map((p) => (
          <tr key={p.type} className="border-t border-neutral-800/70">
            <td className="py-1.5" title={TYPE_HINT[p.type]}>
              <span className={`text-xs font-semibold ${typeTone(p.type)}`}>{p.type}</span>
            </td>
            {COLUMNS.map((c) => (
              <td key={c.channel} className={`py-1.5 text-center ${dimmed[c.channel] ? "opacity-40" : ""}`}>
                <Toggle on={p[c.channel]} label={c.label(p.type)} onChange={(on) => onChange(p.type, { [c.channel]: on })} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
