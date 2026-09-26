"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, MessageSquare, Send, Trash2, TriangleAlert } from "lucide-react";
import { fetchNotifySettings, postNotifySettings, type NotifySettings } from "../lib/notifySettings";
import { NotifyPrefsTable } from "./alerts/NotifyPrefsTable";
import { announceAlertsChanged } from "./alerts/AlertsContext";

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

type Run = (body: unknown, done?: string) => Promise<boolean>;

function WebhookForm({ view, busy, run }: { view: NotifySettings; busy: boolean; run: Run }) {
  const [url, setUrl] = useState("");
  const hook = view.webhook;
  return (
    <div className="grid max-w-2xl gap-2">
      <label className="grid gap-1.5">
        <span className="text-sm font-medium text-neutral-400">
          Discord webhook URL{" "}
          {hook.state === "set" && <span className="font-mono text-neutral-600">— saved: {hook.masked}</span>}
          {hook.state === "unreadable" && <span className="text-bad">— saved value can no longer be decrypted, paste it again</span>}
        </span>
        <input
          type="password"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://discord.com/api/webhooks/…  (channel → Edit → Integrations → Webhooks → Copy URL)"
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

/**
 * Settings → Notifications. Discord is the channel that reaches a player whose game is
 * fullscreen (browser notifications don't). The webhook is stored encrypted and only ever shown
 * masked; alerts are batched (≤1 message per 30 s, up to 10 alerts each).
 */
export function NotificationsSettings() {
  const [view, setView] = useState<NotifySettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchNotifySettings()
      .then(setView)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  useEffect(load, [load]);

  const run = useCallback<Run>((body, done) => {
    setBusy(true);
    setError(null);
    setInfo(null);
    return postNotifySettings(body)
      .then((v) => {
        setView(v);
        if (done) setInfo(done);
        announceAlertsChanged(); // ticker mutes live in the same table
        return true;
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
        return false;
      })
      .finally(() => setBusy(false));
  }, []);

  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
      <header className="mb-3 flex flex-wrap items-center gap-2.5">
        <MessageSquare className="h-5 w-5 text-indigo-400" />
        <h2 className="text-lg font-semibold">Notifications</h2>
        {busy && <Loader2 className="h-4 w-4 animate-spin text-neutral-500" />}
        {info && <span className="text-xs text-good">{info}</span>}
        {error && <span className="text-xs text-bad">{error}</span>}
      </header>
      {view && (
        <div className="grid gap-4">
          <WebhookForm view={view} busy={busy} run={run} />
          {view.webhook.state !== "none" && <DeliveryStatus view={view} />}
          <NotifyPrefsTable
            prefs={view.prefs}
            webhookSet={view.webhook.state === "set"}
            onChange={(type, change) => void run({ action: "pref", type, ...change })}
          />
          <label className="flex items-center gap-2 text-sm text-neutral-300" title="one Discord message a day: counts per type + the best snipes, craft margins and spreads">
            <input type="checkbox" checked={view.digest} disabled={busy} onChange={(e) => void run({ action: "digest", enabled: e.target.checked })} />
            Daily digest to Discord
          </label>
        </div>
      )}
    </section>
  );
}
