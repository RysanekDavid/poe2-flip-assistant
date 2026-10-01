"use client";

import { useState } from "react";
import { Check, Loader2, MessageSquare, RefreshCw, Send, SlidersHorizontal, Trash2, TriangleAlert } from "lucide-react";
import type { NotifySettings } from "../../lib/notifySettings";
import { Button } from "../ui/Button";
import { NotifyPrefsTable } from "./NotifyPrefsTable";
import type { NotifySettingsApi, Run } from "./useNotifySettings";

const INPUT = "rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 font-mono text-neutral-200 outline-none focus:border-sky-500";
const BTN = "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm disabled:opacity-40";

function ago(ms: number | null): string {
  if (ms == null) return "never";
  const min = Math.round((Date.now() - ms) / 60_000);
  if (min < 1) return "just now";
  if (min < 90) return `${min} min ago`;
  return `${Math.round(min / 60)} h ago`;
}

function DeliveryStatus({ view }: { view: NotifySettings }) {
  const s = view.status;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500">
      <span title="last message Discord accepted">last delivered: <span className="text-neutral-300">{ago(s.lastSentAt)}</span></span>
      {s.pending > 0 && <span title="waiting for the 30 s batching window or a retry">{s.pending} queued</span>}
      {s.lastError && (
        <span className="flex items-center gap-1 text-bad" title={`${s.failed7d} deliveries given up in the last 7 days`}>
          <TriangleAlert className="h-3.5 w-3.5" /> delivery failed {ago(s.lastErrorAt)}: {s.lastError}
        </span>
      )}
    </div>
  );
}

function WebhookForm({ view, busy, run }: { view: NotifySettings; busy: boolean; run: Run }) {
  const [url, setUrl] = useState("");
  const hook = view.webhook;
  return (
    <div className="grid gap-2">
      <label className="grid gap-1.5">
        <span className="text-sm font-medium text-neutral-400">
          Webhook URL{" "}
          {hook.state === "set" && <span className="font-mono text-neutral-600">— saved: {hook.masked}</span>}
          {hook.state === "unreadable" && <span className="text-bad">— saved value can no longer be decrypted, paste it again</span>}
        </span>
        <input
          type="password"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://discord.com/api/webhooks/…"
          title="Discord channel → Edit → Integrations → Webhooks → Copy URL"
          autoComplete="off"
          className={INPUT}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          disabled={busy || url.trim() === ""}
          onClick={() => {
            // keep the pasted URL in the field if the server rejected it, so it can be fixed
            void run({ action: "setWebhook", url: url.trim() }, "webhook saved — send a test").then((ok) => ok && setUrl(""));
          }}
          className={`${BTN} border-sky-600 text-sky-200 hover:bg-sky-950/40`}
        >
          <Check className="h-4 w-4" /> Save
        </button>
        <button disabled={busy || hook.state !== "set"} onClick={() => void run({ action: "test" }, "test sent — check the channel")} className={`${BTN} border-neutral-700 hover:border-emerald-500`}>
          <Send className="h-4 w-4" /> Send test
        </button>
        <button disabled={busy || hook.state === "none"} onClick={() => void run({ action: "clearWebhook" }, "webhook removed")} className={`${BTN} border-red-900/60 text-red-300 hover:bg-red-950/30`}>
          <Trash2 className="h-4 w-4" /> Clear
        </button>
      </div>
    </div>
  );
}

function DiscordBlock({ view, busy, run }: { view: NotifySettings; busy: boolean; run: Run }) {
  return (
    <div className="grid gap-3 border-t border-neutral-800 pt-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-neutral-300">
        <MessageSquare className="h-4 w-4 text-indigo-400" /> Discord
      </h3>
      <WebhookForm view={view} busy={busy} run={run} />
      {view.webhook.state !== "none" && <DeliveryStatus view={view} />}
      <label className="flex items-center gap-2 text-sm text-neutral-300" title="one Discord message a day: counts per type + the best snipes, craft margins and spreads">
        <input type="checkbox" checked={view.digest} disabled={busy} onChange={(e) => void run({ action: "digest", enabled: e.target.checked })} />
        Daily digest
      </label>
      <LiveBoardControls view={view} busy={busy} run={run} />
    </div>
  );
}

/** Opt-in live board: one Discord message, edited in place every interval, plus an on-demand refresh. */
function LiveBoardControls({ view, busy, run }: { view: NotifySettings; busy: boolean; run: Run }) {
  const board = view.board;
  const noHook = view.webhook.state !== "set";
  const every = board.intervalMin === 60 ? "hourly" : `every ${board.intervalMin} min`;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <label
        className="flex items-center gap-2 text-sm text-neutral-300"
        title={noHook ? "save a Discord webhook first" : "top exchange loops, best bosses + hot mechanics and net worth — one message kept up to date instead of new pings"}
      >
        <input
          type="checkbox"
          checked={board.enabled}
          disabled={busy || (noHook && !board.enabled)}
          onChange={(e) => void run({ action: "board", enabled: e.target.checked }, e.target.checked ? "live board on — it appears within a minute" : "live board off")}
        />
        Live board — one message, edited {every}
      </label>
      {board.enabled && (
        <>
          <Button
            size="sm"
            disabled={busy || noHook}
            onClick={() => void run({ action: "boardNow" }, (v) => (v.boardQueued ? "board refresh queued — updates within a minute" : "an update is already queued"))}
            className="hover:border-amber-400/70 hover:text-amber-200"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh now
          </Button>
          <span className="text-xs text-neutral-500" title={board.posted ? "the next update edits the existing message" : "the next update posts a new message"}>
            updated: <span className="text-neutral-300">{ago(board.updatedAt)}</span>
          </span>
        </>
      )}
    </div>
  );
}

/**
 * Alerts page → routing + Discord. The per-type matrix decides ticker / sound / desktop popup /
 * Discord; Discord is the channel that reaches a player whose game is fullscreen (browser popups
 * don't). The webhook is stored encrypted and only ever shown masked; alerts are batched (≤1
 * message per 30 s, up to 10 alerts each). `popupBlocked` dims the popup column with its reason.
 */
export function NotificationsSettings({ popupBlocked, settings }: { popupBlocked: string | null; settings: NotifySettingsApi }) {
  const { view, busy, error, info, run } = settings;
  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
      <header className="mb-3 flex flex-wrap items-center gap-2.5">
        <SlidersHorizontal className="h-5 w-5 text-amber-400" />
        <h2 className="text-base font-semibold">Routing</h2>
        {busy && <Loader2 className="h-4 w-4 animate-spin text-neutral-500" />}
        {info && <span className="text-xs text-good">{info}</span>}
        {error && <span className="text-xs text-bad">{error}</span>}
      </header>
      {view && (
        <div className="grid gap-5">
          <NotifyPrefsTable
            prefs={view.prefs}
            dimmed={{
              ...(popupBlocked ? { popup: popupBlocked } : {}),
              ...(view.webhook.state === "set" ? {} : { discord: "save a Discord webhook below first" }),
            }}
            onChange={(type, change) => void run({ action: "pref", type, ...change })}
          />
          <DiscordBlock view={view} busy={busy} run={run} />
        </div>
      )}
    </section>
  );
}
