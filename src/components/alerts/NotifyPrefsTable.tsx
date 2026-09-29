"use client";

import { TriangleAlert } from "lucide-react";
import { CHANNELS, type Channel, type ChannelPrefs, type PrefRow } from "../../core/notify/prefs";
import { ALERT_TYPE_LABEL, CHANNEL_LABEL } from "../../lib/alertLabels";
import { Toggle } from "../ui/Toggle";
import { InfoTip } from "../ui/Tooltip";
import { typeTone } from "./AlertBits";

const TYPE_HINT: Record<PrefRow["type"], string> = {
  SNIPE: "underpriced listing found by the autosnipe scanner — time-sensitive",
  CRAFT_MARGIN: "a craft recipe's expected value clears its margin",
  SPREAD: "a watched exchange flip clears your threshold",
  LEAGUE: "a new league started / the default league switched",
  TREND: "a watched item's trend state changed",
  SPIKE: "a watched item is spiking",
};

const CHANNEL_HINT: Record<Channel, string> = {
  ticker: "show it in the alert feed, the bell badge and the Exchange strip",
  sound: "chime when one arrives (this browser)",
  popup: "browser desktop notification — needs permission",
  discord: "send it to your Discord webhook (reaches a fullscreen game)",
};

function ChannelHeader({ channel, blocked }: { channel: Channel; blocked: string | undefined }) {
  return (
    <th scope="col" className="px-1 py-1 text-center font-medium">
      <span className="inline-flex items-center gap-1">
        {CHANNEL_LABEL[channel]}
        {blocked ? (
          <span title={`can't deliver right now: ${blocked} — your choice is kept for when it can`} role="img" aria-label={`${CHANNEL_LABEL[channel]} can't deliver right now: ${blocked}`}>
            <TriangleAlert aria-hidden className="h-3.5 w-3.5 text-warn" />
          </span>
        ) : (
          <InfoTip tip={CHANNEL_HINT[channel]} label={`About ${CHANNEL_LABEL[channel]}`} side="bottom" />
        )}
      </span>
    </th>
  );
}

/**
 * Per-type routing matrix: which alert types show in the feed, chime, pop a desktop notification
 * and go to Discord. A channel that cannot deliver right now (no webhook, popups blocked) is marked
 * in its header but stays editable, so the choice is ready once it can.
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
        <tr className="text-left text-xs text-neutral-400">
          <th scope="col" className="py-1 font-medium">Alert</th>
          {CHANNELS.map((c) => <ChannelHeader key={c} channel={c} blocked={dimmed[c]} />)}
        </tr>
      </thead>
      <tbody>
        {prefs.map((p) => (
          <tr key={p.type} className="border-t border-line/70">
            <th scope="row" className="py-1.5 text-left font-normal" title={TYPE_HINT[p.type]}>
              <span className={`text-sm font-semibold ${typeTone(p.type)}`}>{ALERT_TYPE_LABEL[p.type]}</span>
            </th>
            {CHANNELS.map((c) => (
              <td key={c} className="py-1.5 text-center">
                <Toggle hideLabel checked={p[c]} label={`${ALERT_TYPE_LABEL[p.type]} — ${CHANNEL_LABEL[c]}`} onChange={(on) => onChange(p.type, { [c]: on })} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
