"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogOut } from "lucide-react";

/** Revoke every session of this account (all browsers/devices), then land on the login page. */
export function LogoutEverywhere() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function revoke(): Promise<void> {
    if (!window.confirm("Log out of this account on every device, including this one?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/logout-all", { method: "POST" });
      if (!res.ok) throw new Error(`logout failed (${res.status})`);
      router.replace("/login");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="mt-8 max-w-2xl border-t border-neutral-800 pt-6">
      <header className="mb-3 flex items-center gap-2.5">
        <LogOut className="h-4 w-4 text-neutral-400" />
        <h3 className="text-base font-semibold">Sessions</h3>
      </header>
      <p className="mb-3 text-sm text-neutral-500">
        Signs out every browser that is logged in as you. Changing your password does this too.
      </p>
      {error && <p className="mb-3 text-sm text-bad">{error}</p>}
      <button
        onClick={revoke}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-md bg-neutral-700 px-4 py-2 text-sm font-medium text-white transition active:scale-[0.98] hover:bg-neutral-600 disabled:opacity-40"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        log out everywhere
      </button>
    </div>
  );
}
