"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, MonitorUp, Volume2 } from "lucide-react";
import { notifyPermission, playChime, requestNotifyPermission } from "./browserNotify";

export type NotifyPermission = NotificationPermission | "unsupported";

/**
 * Browser notification permission, re-read whenever the window regains focus — the user changes
 * it in the browser's site settings, which fires no event on the page.
 */
export function useNotifyPermission(): [NotifyPermission, () => void] {
  const [perm, setPerm] = useState<NotifyPermission>("default");
  useEffect(() => {
    const read = (): void => setPerm(notifyPermission());
    read();
    window.addEventListener("focus", read);
    return () => window.removeEventListener("focus", read);
  }, []);
  const request = useCallback(() => {
    requestNotifyPermission()
      .then(setPerm)
      .catch((e: unknown) => console.error("[alerts] notification permission request failed", e));
  }, []);
  return [perm, request];
}

const DENIED_HELP =
  "Blocked for this site. Click the icon left of the address bar → Site settings → Notifications → Allow, then reload. " +
  "On Windows also check Settings → System → Notifications: your browser must be On and Do not disturb off.";

function PermissionState({ perm, request }: { perm: NotifyPermission; request: () => void }) {
  if (perm === "unsupported") return <span className="text-xs text-neutral-500">this browser has no desktop notifications</span>;
  if (perm === "granted") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-good" title="popups follow the per-type switches below">
        <BellRing className="h-3.5 w-3.5" /> allowed
      </span>
    );
  }
  if (perm === "denied") return <span className="text-xs text-bad" title={DENIED_HELP}>blocked by the browser</span>;
  return (
    <button onClick={request} className="inline-flex items-center gap-1.5 rounded-md border border-sky-600 px-2.5 py-1 text-xs text-sky-200 hover:bg-sky-950/40">
      <MonitorUp className="h-3.5 w-3.5" /> Enable desktop notifications
    </button>
  );
}

/**
 * Desktop popup permission + a test. The test is a user gesture, so it also unlocks audio for the
 * chime (browsers refuse sound until the page has been interacted with).
 */
export function DesktopNotifyControl({ perm, request }: { perm: NotifyPermission; request: () => void }) {
  const test = (): void => {
    playChime();
    if (perm === "granted") {
      new Notification("PoE2 Flip — test", { body: "Desktop popups work. Snipes will look like this.", tag: "poe2flip-test" });
    }
  };
  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
      <header className="mb-2 flex items-center gap-2">
        <MonitorUp className="h-5 w-5 text-sky-400" />
        <h2 className="text-base font-semibold">Desktop popups</h2>
        <span className="ml-auto">
          <PermissionState perm={perm} request={request} />
        </span>
      </header>
      {perm === "denied" && <p className="mb-2 text-xs leading-relaxed text-neutral-400">{DENIED_HELP}</p>}
      <button
        onClick={test}
        className="inline-flex items-center gap-1.5 rounded-md border border-neutral-700 px-2.5 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
        title="play the chime and, if allowed, show a test popup — the poll keeps running in a background tab"
      >
        <Volume2 className="h-3.5 w-3.5" /> Test sound + popup
      </button>
    </section>
  );
}
