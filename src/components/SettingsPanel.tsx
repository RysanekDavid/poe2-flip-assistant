"use client";

import { useEffect, useState } from "react";
import { KeyRound, Loader2, Check, ShieldCheck, ShieldAlert, ExternalLink, Lock } from "lucide-react";

interface PoeStatus {
  connected: boolean;
  contact: string;
  account: string;
}

/**
 * Per-user trade2 connection. Each user pastes their OWN POESESSID (their pathofexile.com
 * session cookie) — it is stored encrypted server-side and used only for that user's live
 * searches. Read-only: the app never buys or whispers automatically.
 */
export function SettingsPanel() {
  const [status, setStatus] = useState<PoeStatus | null>(null);
  const [poesessid, setPoesessid] = useState("");
  const [contact, setContact] = useState("");
  const [account, setAccount] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    fetch("/api/settings/poe")
      .then((r) => r.json())
      .then((d: PoeStatus) => {
        setStatus(d);
        setContact(d.contact ?? "");
        setAccount(d.account ?? "");
      })
      .catch(() => setError("failed to load settings"));

  useEffect(() => {
    load();
  }, []);

  async function save(clear = false): Promise<void> {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/settings/poe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          poesessid: clear ? "" : poesessid.trim(),
          contact: contact.trim(),
          account: account.trim(),
          disconnect: clear,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "save failed");
      setStatus(d);
      setPoesessid("");
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
      <header className="mb-3 flex flex-wrap items-center gap-2.5">
        <KeyRound className="h-5 w-5 text-sky-400" />
        <h2 className="text-lg font-semibold">Trade Connection</h2>
        {status &&
          (status.connected ? (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-950/40 px-2.5 py-1 text-xs text-emerald-400">
              <ShieldCheck className="h-4 w-4" /> connected
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-950/40 px-2.5 py-1 text-xs text-amber-400">
              <ShieldAlert className="h-4 w-4" /> not connected
            </span>
          ))}
      </header>

      <p className="mb-4 max-w-2xl text-sm text-neutral-500">
        Paste your own <span className="font-mono text-neutral-300">POESESSID</span> cookie so live trade searches run on
        your account. Stored <span className="text-neutral-300">encrypted</span>, never shown again, never used to buy —
        read-only price-checks only. Cookies expire; if searches start failing, paste a fresh one.
      </p>

      <div className="grid max-w-2xl gap-4">
        <label className="grid gap-1.5">
          <span className="text-sm font-medium text-neutral-400">
            POESESSID {status?.connected && <span className="text-neutral-600">— a value is saved; leave blank to keep it</span>}
          </span>
          <input
            type="password"
            value={poesessid}
            onChange={(e) => setPoesessid(e.target.value)}
            placeholder={status?.connected ? "•••••••• (saved)" : "32-char hex from your browser cookies"}
            autoComplete="off"
            className="rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 font-mono text-neutral-200 outline-none focus:border-sky-500"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5">
            <span className="text-sm font-medium text-neutral-400">Contact email (optional)</span>
            <input
              type="email"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="you@example.com — identifies the tool to GGG"
              className="rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-200 outline-none focus:border-sky-500"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-sm font-medium text-neutral-400">Account name (optional)</span>
            <input
              type="text"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              placeholder="Name#1234 — for reading your own stash"
              className="rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-200 outline-none focus:border-sky-500"
            />
          </label>
        </div>

        {error && <p className="text-sm text-bad">{error}</p>}

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => save(false)}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white transition active:scale-[0.98] disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
            {saved ? "saved" : "save"}
          </button>
          {status?.connected && (
            <button
              onClick={() => save(true)}
              disabled={saving}
              className="rounded-md border border-neutral-700 px-3 py-2 text-sm text-neutral-400 hover:border-bad hover:text-bad disabled:opacity-40"
            >
              disconnect
            </button>
          )}
        </div>
      </div>

      <details className="mt-5 max-w-2xl text-sm text-neutral-500">
        <summary className="cursor-pointer text-neutral-400 hover:text-neutral-200">How do I find my POESESSID?</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>
            Log in at{" "}
            <a
              href="https://www.pathofexile.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 text-sky-400 hover:text-sky-300"
            >
              pathofexile.com <ExternalLink className="h-3 w-3" />
            </a>
            .
          </li>
          <li>Open dev tools (F12) → Application → Cookies → pathofexile.com.</li>
          <li>
            Copy the value of <span className="font-mono text-neutral-300">POESESSID</span> and paste it above.
          </li>
        </ol>
        <p className="mt-2 text-xs text-neutral-600">
          Treat it like a password — it grants access to your account session. Logging out of the site invalidates it.
        </p>
      </details>
      <ChangePassword />
    </section>
  );
}

/** Change the logged-in user's password (verifies the current one server-side). */
function ChangePassword() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    setError(null);
    setDone(false);
    if (next.length < 8) return setError("new password must be at least 8 characters");
    if (next !== confirm) return setError("new passwords don't match");
    setSaving(true);
    try {
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current, next }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "change failed");
      setCurrent("");
      setNext("");
      setConfirm("");
      setDone(true);
      window.setTimeout(() => setDone(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-8 max-w-2xl border-t border-neutral-800 pt-6">
      <header className="mb-3 flex items-center gap-2.5">
        <Lock className="h-4 w-4 text-neutral-400" />
        <h3 className="text-base font-semibold">Change password</h3>
      </header>
      <div className="grid gap-4">
        <label className="grid gap-1.5">
          <span className="text-sm font-medium text-neutral-400">Current password</span>
          <input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
            className="rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-200 outline-none focus:border-sky-500"
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5">
            <span className="text-sm font-medium text-neutral-400">New password (min 8)</span>
            <input
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
              className="rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-200 outline-none focus:border-sky-500"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-sm font-medium text-neutral-400">Confirm new password</span>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              className="rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-200 outline-none focus:border-sky-500"
            />
          </label>
        </div>
        {error && <p className="text-sm text-bad">{error}</p>}
        <div>
          <button
            onClick={submit}
            disabled={saving || !current || !next}
            className="inline-flex items-center gap-2 rounded-md bg-neutral-700 px-4 py-2 text-sm font-medium text-white transition active:scale-[0.98] hover:bg-neutral-600 disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : done ? <Check className="h-4 w-4" /> : null}
            {done ? "changed" : "change password"}
          </button>
        </div>
      </div>
    </div>
  );
}
