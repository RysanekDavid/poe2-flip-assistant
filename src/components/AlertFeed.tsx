"use client";

import { useAlerts } from "../lib/useAlerts";

export function AlertsPanel() {
  const { alerts, unseen, markAllSeen } = useAlerts(false);

  return (
    <div>
      {unseen > 0 && (
        <button onClick={markAllSeen} className="mb-2 text-xs text-neutral-400 hover:text-neutral-100">
          mark all seen ({unseen})
        </button>
      )}
      <ul className="max-h-[60vh] space-y-1.5 overflow-y-auto">
        {alerts.map((a) => (
          <li key={a.id} className={`rounded px-2 py-1.5 text-sm ${a.seen === 0 ? "bg-neutral-800/60" : ""}`}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-semibold">
                {a.item_name ?? a.item_id}
                {a.foreign_league && <span className="ml-1.5 rounded bg-neutral-800 px-1 text-[10px] font-normal text-sky-300">{a.foreign_league}</span>}
              </span>
              <time className="shrink-0 text-xs text-neutral-500">{a.created_at.slice(5, 16)}</time>
            </div>
            <div className="text-neutral-300">{a.message}</div>
          </li>
        ))}
        {alerts.length === 0 && <li className="py-3 text-center text-neutral-500">no alerts yet</li>}
      </ul>
    </div>
  );
}
