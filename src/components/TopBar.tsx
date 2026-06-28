"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { BellIcon, XIcon } from "./ui/icons";
import { TreasuryPanel } from "./TreasuryPanel";
import { AlertsPanel } from "./AlertFeed";
import swapOrbs from "../assets/swap_orbs.png";

type Panel = "swap" | "alerts";

/** Header toolbar — Swap Rates & Alerts live behind icon buttons, opening as popovers. */
export function TopBar() {
  const [open, setOpen] = useState<Panel | null>(null);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const load = () =>
      fetch("/api/alerts?unseen=1")
        .then((r) => r.json())
        .then((d) => setUnread((d.alerts ?? []).length))
        .catch(() => {});
    load();
    const id = setInterval(load, 30_000);
    const onChange = () => load();
    window.addEventListener("alerts-changed", onChange);
    return () => {
      clearInterval(id);
      window.removeEventListener("alerts-changed", onChange);
    };
  }, []);

  return (
    <div className="relative flex items-center gap-3">
      <IconButton label="Swap rates" active={open === "swap"} onClick={() => setOpen((o) => (o === "swap" ? null : "swap"))}>
        <Image src={swapOrbs} alt="" className="h-9 w-auto" priority />
      </IconButton>
      <IconButton label="Alerts" square active={open === "alerts"} badge={unread} onClick={() => setOpen((o) => (o === "alerts" ? null : "alerts"))}>
        <BellIcon className="h-8 w-8 text-amber-300" />
      </IconButton>
      <UserMenu />

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(null)} />
          <div className="absolute right-0 top-full z-30 mt-2 w-[420px] max-w-[92vw] rounded-lg border border-neutral-800 bg-neutral-900 p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold">{open === "swap" ? "Currency & Treasury" : "Alerts"}</h3>
              <button onClick={() => setOpen(null)} className="text-neutral-500 hover:text-neutral-200">
                <XIcon className="h-4 w-4" />
              </button>
            </div>
            {open === "swap" ? <TreasuryPanel /> : <AlertsPanel />}
          </div>
        </>
      )}
    </div>
  );
}

/** Current user + logout. Mirrors who owns the private data shown on the page. */
function UserMenu() {
  const router = useRouter();
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setName(d.user?.name ?? null))
      .catch(() => {});
  }, []);

  async function logout(): Promise<void> {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.replace("/login");
    router.refresh();
  }

  if (!name) return null;
  return (
    <div className="flex items-center gap-2 pl-1" data-tour="account">
      <button
        onClick={() => window.dispatchEvent(new CustomEvent("open-guide"))}
        title="open the setup guide / tour"
        className="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-400 hover:border-sky-500 hover:text-neutral-100"
      >
        Guide
      </button>
      <span className="text-sm text-neutral-400" title="signed-in account">
        {name}
      </span>
      <button
        onClick={logout}
        className="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-400 hover:border-neutral-500 hover:text-neutral-100"
      >
        Sign out
      </button>
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
      className={`relative flex h-[58px] items-center justify-center rounded-lg border p-3 shadow-sm transition-all active:scale-95 ${
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
