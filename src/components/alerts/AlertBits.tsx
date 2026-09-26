"use client";

import { useState } from "react";
import { Bell, BellOff, Check, Copy } from "lucide-react";
import type { Alert } from "../../lib/alertCenter";
import { isNotifyType } from "../../core/notify/prefs";

export const TYPE_TONE: Record<string, string> = {
  SPREAD: "text-good",
  SPIKE: "text-warn",
  VOLUME: "text-sky-300",
  TREND: "text-amber-300",
  TREND_REVERSAL: "text-bad",
  SNIPE: "text-orange-400",
  CRAFT_BASE: "text-orange-400",
  CRAFT_MARGIN: "text-amber-400",
  RESELL: "text-orange-400",
  LEAGUE: "text-amber-200",
};

export function typeTone(type: string): string {
  return TYPE_TONE[type] ?? "text-neutral-300";
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
          className="inline-flex items-center gap-0.5 rounded border border-neutral-700 px-1 py-0.5 text-[10px] text-neutral-400 hover:border-orange-500 hover:text-orange-300"
        >
          {copied ? <Check className="h-3 w-3 text-good" /> : <Copy className="h-3 w-3" />}
          {copied ? "copied" : "whisper"}
        </button>
      )}
      {alert.link && (
        <a href={alert.link} target="_blank" rel="noopener noreferrer" className="text-[10px] text-sky-400 hover:text-sky-300">
          open
        </a>
      )}
    </>
  );
}

export function LeagueTag({ league }: { league: string | null }) {
  if (!league) return null;
  return (
    <span className="rounded bg-neutral-800 px-1 text-[10px] font-normal text-sky-300" title="found in this league, not the one you are viewing">
      {league}
    </span>
  );
}

/** Per-type mute toggle (ticker preference). Legacy types outside the routing table cannot be muted. */
export function MuteToggle({ type, muted, onToggle }: { type: string; muted: boolean; onToggle: (muted: boolean) => void }) {
  if (!isNotifyType(type)) return null;
  return (
    <button
      onClick={() => onToggle(!muted)}
      title={muted ? `unmute ${type} — show it in the ticker and badge again` : `mute ${type} — hide it from the ticker and badge (Discord routing is set in Settings)`}
      aria-label={muted ? `unmute ${type}` : `mute ${type}`}
      className="rounded p-0.5 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
    >
      {muted ? <BellOff className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
    </button>
  );
}
