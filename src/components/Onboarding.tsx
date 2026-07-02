"use client";

import { useCallback, useEffect, useState } from "react";
import { Compass, Flame, Wallet, ShieldAlert, X } from "lucide-react";
import "driver.js/dist/driver.css";

const INTRO_VERSION = "v1"; // bump to re-show the welcome to everyone after a big change

interface Me {
  id: number;
  name: string;
  role: string;
}

const TOUR_STEPS = [
  {
    element: '[data-tour="tabs"]',
    popover: {
      title: "Three areas",
      description:
        "Currency Exchange = in-game Ange flips. Web Market = trade-site tools (uniques, craft, snipe). Wealth = your net worth over time.",
    },
  },
  {
    element: '[data-tour="farm"]',
    popover: {
      title: "What to farm now",
      description: "In-game activities ranked by how hard their drop basket is pumping. HOT = grind it and sell into the spike.",
    },
  },
  {
    element: '[data-tour="alerts"]',
    popover: {
      title: "Live alerts",
      description: "Fires when a watched spread or price spike clears its threshold. Click the bell to also get browser notifications.",
    },
  },
  {
    element: '[data-tour="account"]',
    popover: {
      title: "Your account",
      description: "Market data is shared by everyone here, but your Wealth and Flip log are private to you. Reopen this guide anytime via 'Guide'.",
    },
  },
];

/** First-run welcome + a driver.js tour. Per-user (localStorage), re-openable via the 'open-guide' event. */
export function Onboarding() {
  const [user, setUser] = useState<Me | null>(null);
  const [open, setOpen] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d: { user: Me | null }) => {
        if (!d.user) return;
        setUser(d.user);
        if (!localStorage.getItem(`poe2flip_intro_${INTRO_VERSION}_${d.user.id}`)) setOpen(true);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("open-guide", onOpen);
    return () => window.removeEventListener("open-guide", onOpen);
  }, []);

  const dismiss = useCallback(() => {
    setOpen(false);
    if (user) localStorage.setItem(`poe2flip_intro_${INTRO_VERSION}_${user.id}`, "1");
  }, [user]);

  const startTour = useCallback(async () => {
    dismiss();
    const { driver } = await import("driver.js");
    driver({ showProgress: true, popoverClass: "poe2-tour", steps: TOUR_STEPS }).drive();
  }, [dismiss]);

  return (
    <>
      {/* dark theme for the driver.js popover */}
      <style>{`
        .poe2-tour.driver-popover{background:#171717;color:#e5e5e5;border:1px solid #404040;border-radius:.5rem;}
        .poe2-tour .driver-popover-title{color:#fafafa;font-size:1rem;}
        .poe2-tour .driver-popover-description{color:#a3a3a3;}
        .poe2-tour .driver-popover-progress-text{color:#737373;}
        .poe2-tour button.driver-popover-next-btn,.poe2-tour button.driver-popover-prev-btn{background:#262626;color:#e5e5e5;text-shadow:none;border:1px solid #404040;border-radius:.375rem;}
        .poe2-tour .driver-popover-close-btn{color:#a3a3a3;}
        .poe2-tour .driver-popover-arrow-side-left.driver-popover-arrow{border-left-color:#171717;}
        .poe2-tour .driver-popover-arrow-side-right.driver-popover-arrow{border-right-color:#171717;}
        .poe2-tour .driver-popover-arrow-side-top.driver-popover-arrow{border-top-color:#171717;}
        .poe2-tour .driver-popover-arrow-side-bottom.driver-popover-arrow{border-bottom-color:#171717;}
      `}</style>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={dismiss}>
          <div
            className="w-full max-w-lg space-y-4 rounded-xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold">Welcome{user ? `, ${user.name}` : ""} 👋</h2>
                <p className="text-sm text-neutral-500">PoE2 Flip Assistant — quick orientation</p>
              </div>
              <button onClick={dismiss} className="text-neutral-500 hover:text-neutral-200">
                <X className="h-5 w-5" />
              </button>
            </div>

            <ul className="space-y-2 text-sm">
              <li className="flex gap-2.5">
                <Compass className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
                <span><b>Currency Exchange & Web Market</b> are shared market intelligence — same prices, charts and farm advice for everyone.</span>
              </li>
              <li className="flex gap-2.5">
                <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                <span><b>Wealth & Flip log are yours alone</b> — your net worth and trades are private to your account.</span>
              </li>
              <li className="flex gap-2.5">
                <Flame className="mt-0.5 h-4 w-4 shrink-0 text-orange-400" />
                <span><b>What to farm now</b> tells you which in-game activity is spiking, so you grind the right thing.</span>
              </li>
            </ul>

            <div className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-3">
              <button
                onClick={() => setShowSecret((v) => !v)}
                className="flex w-full items-center justify-between text-sm font-medium text-neutral-300"
              >
                <span className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-amber-400" /> Tracking your stash & snipes (POESESSID)
                </span>
                <span className="text-neutral-500">{showSecret ? "−" : "+"}</span>
              </button>
              {showSecret && (
                <div className="mt-2 space-y-2 text-xs text-neutral-400">
                  <p>
                    Reading your own stash and running live snipes needs your <b>POESESSID</b> (your pathofexile.com
                    session cookie), connected once in <b>Settings</b>:
                  </p>
                  <ol className="list-decimal space-y-1 pl-4">
                    <li>Log in at <span className="text-neutral-300">pathofexile.com</span> in your browser.</li>
                    <li>Press F12 → <span className="text-neutral-300">Application → Cookies</span> → the pathofexile.com entry.</li>
                    <li>Copy the value of <span className="text-neutral-300">POESESSID</span> into <span className="text-neutral-300">Settings → Trade Connection</span>.</li>
                  </ol>
                  <p className="rounded border border-amber-500/30 bg-amber-500/5 p-2 text-amber-300/90">
                    ⚠️ POESESSID is a session key with full access to your account — treat it like a password. It&apos;s
                    stored encrypted, used read-only for your own searches, and never shown again. Don&apos;t paste it
                    anywhere else.
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button onClick={dismiss} className="rounded-md px-3 py-2 text-sm text-neutral-400 hover:text-neutral-100">
                Got it
              </button>
              <button
                onClick={startTour}
                className="rounded-md bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-500"
              >
                Take the tour
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
