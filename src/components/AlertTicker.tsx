"use client";

import { useEffect, useState } from "react";
import { Bell, BellRing, Copy, Check } from "lucide-react";
import { useAlerts, requestNotifyPermission } from "../lib/useAlerts";

const TYPE_TONE: Record<string, string> = {
  SPREAD: "text-good",
  SPIKE: "text-warn",
  VOLUME: "text-sky-300",
  TREND: "text-amber-300",
  TREND_REVERSAL: "text-bad",
  SNIPE: "text-orange-400",
  CRAFT_BASE: "text-orange-400",
  RESELL: "text-orange-400",
};

/** Live alert strip for the Exchange tab. Owns browser notifications (notify=true) and a
 *  one-click bell to enable them. Shows the newest few alerts inline so you don't have to
 *  open the TopBar popover while flipping. */
export function AlertTicker() {
  const { alerts, unseen, markAllSeen } = useAlerts(true);
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");
  const [copied, setCopied] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) setPerm(Notification.permission);
    else setPerm("unsupported");
  }, []);

  const enable = async () => setPerm(await requestNotifyPermission());
  const copyWhisper = (id: number, whisper: string) => {
    navigator.clipboard?.writeText(whisper).then(() => {
      setCopied(id);
      window.setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500);
    });
  };

  const recent = alerts.slice(0, 3);

  return (
    <section data-tour="alerts" className="rounded-lg border border-neutral-800 bg-neutral-900/50 px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          {unseen > 0 ? <BellRing className="h-4 w-4 text-amber-300" /> : <Bell className="h-4 w-4 text-neutral-400" />}
          Alerts
          {unseen > 0 && <span className="rounded-full bg-amber-500 px-1.5 text-xs font-bold text-neutral-950">{unseen}</span>}
        </span>

        {recent.length === 0 ? (
          <span className="text-xs text-neutral-500">none yet — fires when a watched REAL spread clears its threshold, or a trend flips</span>
        ) : (
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {recent.map((a) => (
              <span key={a.id} className={`flex items-center gap-1 truncate ${a.seen === 0 ? "" : "opacity-60"}`}>
                <span className={`font-semibold ${TYPE_TONE[a.type] ?? "text-neutral-300"}`}>{a.type}</span>
                <span className="text-neutral-200">{a.item_name ?? a.item_id}</span>
                <span className="truncate text-neutral-500">{a.message}</span>
                {a.whisper && (
                  <button
                    onClick={() => copyWhisper(a.id, a.whisper!)}
                    title="copy in-game whisper"
                    className="inline-flex items-center gap-0.5 rounded border border-neutral-700 px-1 py-0.5 text-[10px] text-neutral-400 hover:border-orange-500 hover:text-orange-300"
                  >
                    {copied === a.id ? <Check className="h-3 w-3 text-good" /> : <Copy className="h-3 w-3" />}
                    {copied === a.id ? "copied" : "whisper"}
                  </button>
                )}
                {a.link && (
                  <a href={a.link} target="_blank" rel="noopener noreferrer" className="text-[10px] text-sky-400 hover:text-sky-300">
                    open
                  </a>
                )}
              </span>
            ))}
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          {unseen > 0 && (
            <button onClick={markAllSeen} className="text-xs text-neutral-400 hover:text-neutral-100">
              clear
            </button>
          )}
          {perm === "granted" ? (
            <span className="flex items-center gap-1 text-xs text-good" title="browser notifications on">
              <BellRing className="h-3.5 w-3.5" /> on
            </span>
          ) : perm === "unsupported" ? null : (
            <button onClick={enable} className="flex items-center gap-1 rounded border border-neutral-700 px-2 py-0.5 text-xs hover:border-sky-500" title="pop a browser notification on new alerts (works with the game in the foreground)">
              <Bell className="h-3.5 w-3.5" /> enable
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
