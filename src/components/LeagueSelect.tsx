"use client";

import { useCallback, useEffect, useState } from "react";
import { Globe } from "lucide-react";

/** GET /api/settings/league. `available` is empty (with a reason) when poe2scout is unreachable. */
interface LeagueSettings {
  league: string;
  default: string;
  /** false = following the app default, and moving with it whenever the owner changes it. */
  pinned: boolean;
  available: string[];
  availableError: string | null;
  polled: string[];
  canSetDefault: boolean;
}

/** `<option>` value for "follow the app default" — not a league name, so it cannot collide. */
const FOLLOW_DEFAULT = "";

/** Permanent and parallel leagues sink to the bottom — nobody flips in Standard by choice. */
const PERMANENT = /^(standard|hardcore)$/i;
const PARALLEL = /^(hc|ssf|ruthless)\s/i;

function rank(name: string): number {
  if (PERMANENT.test(name)) return 2;
  if (PARALLEL.test(name)) return 1;
  return 0;
}

/** Challenge leagues first, then HC/SSF/Ruthless variants, then Standard/Hardcore. */
export function orderLeagues(names: readonly string[], current: string): string[] {
  const all = names.includes(current) ? [...names] : [current, ...names];
  return all.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

function errorMessage(body: unknown, fallback: string): string {
  if (typeof body === "object" && body !== null && "error" in body) {
    const { error } = body as { error: unknown };
    if (typeof error === "string") return error;
  }
  return fallback;
}

/**
 * Header league picker — poe.ninja-style, always visible, and entirely personal: it changes
 * which market THIS account looks at and nothing else. The app default (what the poller and the
 * shared trade2 pipelines run under) moves from the banner, owner only.
 *
 * The first option follows the default instead of naming a league. It matters: a user who pins
 * this league by name would otherwise still be sitting in it next league, watching a dead market,
 * long after the owner moved everyone else on.
 *
 * After a successful switch the page is reloaded rather than nudged: every panel below fetches
 * its league-scoped data on mount, so leaving them showing the previous league's numbers under a
 * new label is the one outcome worse than a reload.
 */
export function LeagueSelect() {
  const [settings, setSettings] = useState<LeagueSettings | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/settings/league")
      .then(async (r) => {
        const body: unknown = await r.json().catch(() => null);
        if (!r.ok) throw new Error(errorMessage(body, `league settings failed (${r.status})`));
        return body as LeagueSettings;
      })
      .then((s) => setSettings(s))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(load, [load]);

  const switchTo = async (choice: string): Promise<void> => {
    if (!settings) return;
    const follow = choice === FOLLOW_DEFAULT;
    if (follow && !settings.pinned) return; // already following — no PUT, no reload
    if (!follow && choice === settings.league && settings.pinned) return;
    setPending(follow ? settings.default : choice);
    setError(null);
    try {
      await putLeague(follow ? null : choice);
      window.location.reload();
    } catch (e) {
      setPending(null); // revert: the <select> falls back to the stored setting
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  // A picker that can't load is a broken header, not an invisible one — say so.
  if (!settings) return error ? <Chip tone="bad" title={error} text="league unavailable" /> : null;

  return (
    <div className="flex items-center gap-2 text-xs">
      <Dropdown settings={settings} pending={pending} onPick={(l) => void switchTo(l)} />
      <StatusChip settings={settings} pending={pending} error={error} />
    </div>
  );
}

/** PUT the switch (null = follow the default); throws the server's own message verbatim. */
async function putLeague(league: string | null): Promise<void> {
  const res = await fetch("/api/settings/league", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ league }),
  });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new Error(errorMessage(body, `switch failed (${res.status})`));
}

function Dropdown({
  settings,
  pending,
  onPick,
}: {
  settings: LeagueSettings;
  pending: string | null;
  onPick: (league: string) => void;
}) {
  const options = orderLeagues(settings.available, settings.league);
  const selected = pending ?? (settings.pinned ? settings.league : FOLLOW_DEFAULT);
  return (
    <label
      title="which league you are viewing — your own setting, it changes nothing for anyone else"
      className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-neutral-900/80 py-1 pl-2 pr-1 shadow-sm"
    >
      <Globe className="h-3.5 w-3.5 shrink-0 text-amber-500/70" />
      <select
        value={selected}
        disabled={pending != null}
        onChange={(e) => onPick(e.target.value)}
        className="max-w-[220px] bg-transparent font-medium text-neutral-100 outline-none disabled:opacity-60"
      >
        <option value={FOLLOW_DEFAULT} className="bg-neutral-900">
          {settings.default} (default)
        </option>
        {options.map((name) => (
          <option key={name} value={name} className="bg-neutral-900">
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * One quiet chip: why the picker is stuck, or — the case people hit most — that the league they
 * just picked is not being collected yet. A league only enters the poller after it has been held
 * for five minutes, and "empty dashboard, no explanation" is exactly the kind of silence this app
 * is not allowed to have. The rates source and age live in the header strip next door.
 */
function StatusChip({
  settings,
  pending,
  error,
}: {
  settings: LeagueSettings;
  pending: string | null;
  error: string | null;
}) {
  if (error) return <Chip tone="bad" title={error} text="switch failed" />;
  if (pending) return <Chip tone="muted" title={`switching to ${pending}`} text="switching…" />;
  if (settings.availableError) {
    return <Chip tone="bad" title={settings.availableError} text="league list unavailable" />;
  }
  if (!settings.polled.some((l) => l.toLowerCase() === settings.league.toLowerCase())) {
    return (
      <Chip
        tone="muted"
        title="the poller picks a league up once it has been held for ~5 minutes — prices fill in after that"
        text="not collected yet"
      />
    );
  }
  return null;
}

function Chip({ tone, title, text }: { tone: "muted" | "bad"; title: string; text: string }) {
  const color = tone === "bad" ? "border-bad/40 text-bad" : "border-neutral-800 text-neutral-500";
  return (
    <span title={title} className={`rounded-md border bg-neutral-900/60 px-2 py-1 text-xs ${color}`}>
      {text}
    </span>
  );
}
