"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, LogOut } from "lucide-react";
import { z } from "zod";
import { BellIcon, XIcon } from "./ui/icons";
import { AlertsPanel } from "./AlertFeed";
import { assertOk, warnOnFailure } from "../lib/clientWarn";
import { useAlertCenter } from "./alerts/AlertsContext";

const DIVINE_ART =
  "https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lNb2RWYWx1ZXMiLCJzY2FsZSI6MSwicmVhbG0iOiJwb2UyIn1d/2986e220b3/CurrencyModValues.png";

/** Header toolbar — net-worth chip, Alerts popover, user menu. (The old swap/treasury popover is
 *  gone: rates + converter live in the header strip, holdings live in the Wealth tab.) */
export function TopBar() {
  const [open, setOpen] = useState(false);
  // badge = unseen alerts of unmuted types, from the page's single shared alert poll
  const { unseen: unread } = useAlertCenter();

  return (
    <div className="relative flex items-center gap-3">
      <IconButton label="Alerts" square active={open} badge={unread} onClick={() => setOpen((o) => !o)}>
        <BellIcon className="h-5 w-5 text-amber-300" />
      </IconButton>
      <UserMenu />

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-30 mt-2 w-[420px] max-w-[92vw] rounded-lg border border-neutral-800 bg-neutral-900 p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold">Alerts</h3>
              <button onClick={() => setOpen(false)} className="text-neutral-500 hover:text-neutral-200">
                <XIcon className="h-4 w-4" />
              </button>
            </div>
            <AlertsPanel />
          </div>
        </>
      )}
    </div>
  );
}

/** Global net worth next to the profile — the latest Wealth snapshot, always in sight. */
function WealthChip() {
  const [data, setData] = useState<{ netWorthDiv: number | null; change24hPct: number | null } | null>(null);

  useEffect(() => {
    const load = () =>
      fetch("/api/balance/summary")
        .then((r) => assertOk(r, "/api/balance/summary").json())
        .then(setData)
        .catch(warnOnFailure("[topbar] net-worth chip"));
    load();
    const id = setInterval(load, 120_000);
    return () => clearInterval(id);
  }, []);

  if (data?.netWorthDiv == null) return null;
  const chg = data.change24hPct;
  return (
    <span
      title="net worth (latest Wealth snapshot) · 24h change — details in the Wealth tab"
      className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-gradient-to-b from-amber-950/50 to-neutral-900 px-2 py-1 shadow-sm"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- poecdn currency art */}
      <img src={DIVINE_ART} alt="Divine Orb" className="h-5 w-5 object-contain" />
      <span className="flex flex-col leading-tight">
        <span className="text-[9px] font-medium uppercase tracking-wider text-amber-500/80">net worth</span>
        <span className="text-xs font-semibold tabular-nums text-amber-100">
          {Math.round(data.netWorthDiv).toLocaleString("en")}
          {chg != null && (
            <span className={`ml-1 font-normal ${chg >= 0 ? "text-good" : "text-bad"}`}>
              {chg >= 0 ? "+" : ""}
              {chg.toFixed(1)}%
            </span>
          )}
        </span>
      </span>
    </span>
  );
}

const MeResponse = z.object({ user: z.object({ name: z.string() }).nullable() });

/** Signed-in account name; bounces to /login when the session no longer resolves. */
function useSignedInName(): string | null {
  const router = useRouter();
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then(async (r) => {
        if (!r.ok) throw new Error(`/api/auth/me → ${r.status}`);
        return MeResponse.parse(await r.json());
      })
      .then(({ user }) => {
        // Session revoked elsewhere ("log out everywhere", password change): /me already cleared
        // the cookie, so leave the private dashboard instead of rendering it anonymous.
        if (user === null) {
          router.replace("/login");
          return;
        }
        setName(user.name);
      })
      .catch((error: unknown) => console.error("[auth] could not load the current user", error));
  }, [router]);
  return name;
}

/** Current user + logout. Mirrors who owns the private data shown on the page. */
function UserMenu() {
  const router = useRouter();
  const name = useSignedInName();

  async function logout(): Promise<void> {
    // Leave for /login either way, but a failed logout may have left the session cookie set.
    await fetch("/api/auth/logout", { method: "POST" })
      .then((r) => assertOk(r, "/api/auth/logout"))
      .catch((error: unknown) => console.error("[auth] logout request failed — session may still be active", error));
    router.replace("/login");
    router.refresh();
  }

  if (!name) return null;
  return (
    <div className="relative flex items-center gap-3 rounded-lg border border-neutral-800 px-3 py-1.5" data-tour="account">
      {/* fieldset-style legend sitting on the border */}
      <span className="absolute -top-2 left-2.5 bg-neutral-950 px-1.5 text-[9px] font-medium uppercase tracking-widest text-neutral-500">
        profile
      </span>
      <WealthChip />
      <span
        title="signed-in account"
        className="bg-gradient-to-b from-amber-100 to-amber-300 bg-clip-text text-base font-semibold tracking-wide text-transparent"
      >
        {name}
      </span>
      {/* compact action stack to the right of the nick */}
      <div className="flex flex-col gap-1">
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("open-guide"))}
          title="open the setup guide / tour"
          className="inline-flex items-center gap-1 rounded border border-neutral-700 bg-neutral-800/40 px-2 py-0.5 text-[11px] font-medium text-neutral-300 transition hover:border-amber-400/60 hover:text-amber-200"
        >
          <BookOpen className="h-3 w-3" /> Guide
        </button>
        <button
          onClick={logout}
          title="sign out"
          className="inline-flex items-center gap-1 rounded border border-red-900/60 bg-red-950/30 px-2 py-0.5 text-[11px] font-medium text-red-300 transition hover:border-red-500/70 hover:bg-red-900/40 hover:text-red-200"
        >
          <LogOut className="h-3 w-3" /> Sign out
        </button>
      </div>
    </div>
  );
}

function IconButton({
  children,
  label,
  active,
  badge,
  square,
  onClick,
}: {
  children: ReactNode;
  label: string;
  active: boolean;
  badge?: number;
  square?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`relative flex h-9 items-center justify-center rounded-lg border p-2 shadow-sm transition-all active:scale-95 ${
        square ? "aspect-square" : ""
      } ${
        active
          ? "border-amber-400/70 bg-neutral-800 text-neutral-100 ring-1 ring-amber-400/30"
          : "border-neutral-600 bg-neutral-800/40 text-neutral-300 hover:border-amber-400/60 hover:bg-neutral-800 hover:text-neutral-100"
      }`}
    >
      {children}
      {badge != null && badge > 0 && (
        <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-bad px-1 text-[11px] font-semibold text-white">
          {badge}
        </span>
      )}
    </button>
  );
}
