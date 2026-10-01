"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, LogOut } from "lucide-react";
import { BellIcon, XIcon } from "./ui/icons";
import { useNavMode } from "./shell/NavModeProvider";
import { badgeText } from "./shell/headerText";
import { TabArt } from "./shell/TabArt";
import { tabClickHandler } from "./shell/TabNav";
import { TAB_ICONS } from "./shell/tabIcons";
import { tabRouteHref } from "./shell/tabRegistry";
import { useTabRoute } from "./shell/useTabRoute";
import { AlertsPanel } from "./AlertFeed";
import { assertOk, warnOnFailure } from "../lib/clientWarn";
import { useAlertCenter } from "./alerts/AlertsContext";

const DIVINE_ART =
  "https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lNb2RWYWx1ZXMiLCJzY2FsZSI6MSwicmVhbG0iOiJwb2UyIn1d/2986e220b3/CurrencyModValues.png";

/** The bell popover's header: the full Alerts page (feed + where alerts are delivered) is one click on. */
function AlertsPopoverHead({ onClose }: { onClose: () => void }) {
  const click = tabClickHandler(useTabRoute().go);
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h3 className="text-base font-semibold">Alerts</h3>
      <span className="flex items-center gap-3">
        <a
          href={tabRouteHref({ tab: "alerts", tool: null })}
          onClick={(e) => {
            onClose();
            click(e, "alerts");
          }}
          className="text-sm text-info hover:underline"
        >
          All alerts &amp; delivery →
        </a>
        <button onClick={onClose} aria-label="Close alerts" className="text-neutral-400 hover:text-neutral-200">
          <XIcon className="h-4 w-4" />
        </button>
      </span>
    </div>
  );
}

/**
 * Header toolbar — Alerts bell (popover; its link opens the Alerts page) and the profile box with
 * net worth, Settings, Guide and Sign out. Alerts and Settings left the tab strip on 2026-10-01.
 */
export function TopBar() {
  const [open, setOpen] = useState(false);
  const { tab } = useTabRoute();
  // badge = unseen alerts you can act on (snipe, craft margin, spread) — info types stay in the feed
  const { actionable } = useAlertCenter();

  return (
    <div className="relative flex items-center gap-3">
      <span data-tour="alerts">
        <IconButton label="Alerts" square active={open || tab === "alerts"} badge={actionable} onClick={() => setOpen((o) => !o)}>
          <BellIcon className="h-5 w-5 text-amber-300" />
        </IconButton>
      </span>
      <UserMenu />

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-30 mt-2 w-[420px] max-w-[92vw] rounded-lg border border-neutral-800 bg-neutral-900 p-4 shadow-2xl">
            <AlertsPopoverHead onClose={() => setOpen(false)} />
            <AlertsPanel onNavigate={() => setOpen(false)} />
          </div>
        </>
      )}
    </div>
  );
}

/** The profile box's way into Settings (it left the tab strip): owner art, framed while Settings is open. */
function SettingsLink() {
  const { tab, go } = useTabRoute();
  const click = tabClickHandler(go);
  const active = tab === "settings";
  return (
    <a
      href={tabRouteHref({ tab: "settings", tool: "account" })}
      onClick={(e) => click(e, "settings")}
      title="Settings — account, trade connection, notifications, Beginner/Advanced"
      aria-label="Settings"
      aria-current={active ? "page" : undefined}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors ${
        active ? "border-amber-400/70 bg-neutral-800" : "border-neutral-700 bg-neutral-800/40 hover:border-amber-400/60"
      }`}
    >
      <TabArt src={TAB_ICONS.settings} className="h-7 w-7 object-contain" />
    </a>
  );
}

/** Global net worth next to the profile — the latest Stash snapshot, always in sight. */
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
      title="net worth (latest Stash snapshot) · 24h change — details in Stash › Net worth"
      className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-gradient-to-b from-amber-950/50 to-neutral-900 px-2 py-1 shadow-sm"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- poecdn currency art */}
      <img src={DIVINE_ART} alt="Divine Orb" className="h-5 w-5 object-contain" />
      <span className="flex flex-col leading-tight">
        <span className="text-xs font-medium uppercase tracking-wider text-amber-500/80">net worth</span>
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

/**
 * Current user + logout. Mirrors who owns the private data shown on the page. The name comes from
 * NavModeProvider's single /api/auth/me read, which also bounces a revoked session to /login.
 */
function UserMenu() {
  const router = useRouter();
  const { name } = useNavMode().me;

  async function logout(): Promise<void> {
    // Leave for /login either way, but a failed logout may have left the session cookie set.
    await fetch("/api/auth/logout", { method: "POST" })
      .then((r) => assertOk(r, "/api/auth/logout"))
      .catch((error: unknown) => console.error("[auth] logout request failed — session may still be active", error));
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="relative flex items-center gap-3 rounded-lg border border-neutral-800 px-3 py-1.5" data-tour="account">
      {/* fieldset-style legend sitting on the border */}
      <span className="absolute -top-2 left-2.5 bg-neutral-950 px-1.5 text-xs font-medium uppercase tracking-widest text-neutral-500">
        profile
      </span>
      {/* phones: the net worth lives one tap away in Stash; the name and actions must fit */}
      <span className="hidden md:contents">
        <WealthChip />
      </span>
      <span
        title="signed-in account"
        className="bg-gradient-to-b from-amber-100 to-amber-300 bg-clip-text text-base font-semibold tracking-wide text-transparent"
      >
        {name}
      </span>
      <SettingsLink />
      {/* compact action stack to the right of the nick */}
      <div className="flex flex-col gap-1">
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("open-guide"))}
          title="open the setup guide / tour"
          className="inline-flex items-center gap-1 rounded border border-neutral-700 bg-neutral-800/40 px-2 py-0.5 text-xs font-medium text-neutral-300 transition hover:border-amber-400/60 hover:text-amber-200"
        >
          <BookOpen className="h-3 w-3" />
          <span className="max-md:sr-only">Guide</span>
        </button>
        <button
          onClick={logout}
          title="sign out"
          className="inline-flex items-center gap-1 rounded border border-red-900/60 bg-red-950/30 px-2 py-0.5 text-xs font-medium text-red-300 transition hover:border-red-500/70 hover:bg-red-900/40 hover:text-red-200"
        >
          <LogOut className="h-3 w-3" />
          <span className="max-md:sr-only">Sign out</span>
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
        <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-bad px-1 text-xs font-semibold tabular-nums text-white">
          {badgeText(badge)}
        </span>
      )}
    </button>
  );
}
