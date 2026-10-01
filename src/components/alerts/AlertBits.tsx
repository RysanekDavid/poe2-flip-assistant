"use client";

import { useState } from "react";
import { Bell, BellOff, Check, Copy } from "lucide-react";
import type { Alert } from "../../lib/alertCenter";
import { isNotifyType } from "../../core/notify/prefs";
import { alertTypeLabel } from "../../lib/alertLabels";

interface TypeChipStyle {
  text: string;
  border: string;
}

/**
 * One colour per type from the semantic tokens (good/info/warn/bad) plus orange, so types stop
 * blurring together. Amber is left to primary actions and the unseen highlight; information-only
 * types (league, patch, legacy rows) stay neutral.
 */
const TYPE_CHIP: Record<string, TypeChipStyle> = {
  SNIPE: { text: "text-good", border: "border-good/40" },
  CRAFT_MARGIN: { text: "text-orange-300", border: "border-orange-400/40" },
  SPREAD: { text: "text-info", border: "border-info/40" },
  TREND: { text: "text-warn", border: "border-warn/40" },
  SPIKE: { text: "text-bad", border: "border-bad/40" },
};
const NEUTRAL_CHIP: TypeChipStyle = { text: "text-neutral-300", border: "border-neutral-700" };

export function typeChip(type: string): TypeChipStyle {
  return TYPE_CHIP[type] ?? NEUTRAL_CHIP;
}

export function typeTone(type: string): string {
  return typeChip(type).text;
}

/** Copy-whisper + trade-link actions for one alert. */
export function AlertActions({ alert }: { alert: Alert }) {
  const [copied, setCopied] = useState(false);
  const copy = (whisper: string) => {
    navigator.clipboard
      .writeText(whisper)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      })
      .catch((e: unknown) => console.error("[alerts] copying the whisper failed", e));
  };
  return (
    <>
      {alert.whisper && (
        <button
          onClick={() => copy(alert.whisper ?? "")}
          title="copy in-game whisper"
          className="inline-flex items-center gap-0.5 rounded border border-neutral-700 px-1 py-0.5 text-xs text-neutral-400 hover:border-orange-500 hover:text-orange-300"
        >
          {copied ? <Check className="h-3 w-3 text-good" /> : <Copy className="h-3 w-3" />}
          {copied ? "copied" : "whisper"}
        </button>
      )}
      {alert.link && (
        <a href={alert.link} target="_blank" rel="noopener noreferrer" className="text-xs text-sky-400 hover:text-sky-300">
          open
        </a>
      )}
    </>
  );
}

export function LeagueTag({ league }: { league: string | null }) {
  if (!league) return null;
  return (
    <span className="rounded bg-neutral-800 px-1 text-xs font-normal text-sky-300" title="found in this league, not the one you are viewing">
      {league}
    </span>
  );
}

/** Per-type mute toggle (ticker preference). Legacy types outside the routing table cannot be muted. */
export function MuteToggle({ type, muted, onToggle }: { type: string; muted: boolean; onToggle: (muted: boolean) => void }) {
  if (!isNotifyType(type)) return null;
  const name = alertTypeLabel(type);
  return (
    <button
      onClick={() => onToggle(!muted)}
      title={muted ? `unmute ${name} — show it in the feed and badge again` : `mute ${name} — hide it from the feed and badge (sound, popup and Discord are set on the Alerts page)`}
      aria-label={muted ? `unmute ${name}` : `mute ${name}`}
      className="rounded p-0.5 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
    >
      {muted ? <BellOff className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
    </button>
  );
}
