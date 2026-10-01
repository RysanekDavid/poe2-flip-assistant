"use client";

import { useCallback, useEffect, useState } from "react";
import { BookOpen, Compass, Flame, Wallet, ShieldAlert, X } from "lucide-react";
import type { NavMode } from "../lib/navMode";
import { useNavMode } from "./shell/NavModeProvider";
import { useTabRoute } from "./shell/useTabRoute";
import { stepTour, tourStepsFor } from "./onboardingTour";
import "driver.js/dist/driver.css";

const INTRO_VERSION = "v2"; // bump to re-show the welcome to everyone after a big change

function AdvancedBullets() {
  return (
    <ul className="space-y-2 text-sm">
      <li className="flex gap-2.5">
        <Compass className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
        <span><b>Flips, Trade & Farm</b> are shared market intelligence — same prices, charts and farm advice for everyone.</span>
      </li>
      <li className="flex gap-2.5">
        <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
        <span><b>Wealth & Flip log are yours alone</b> — your net worth and trades are private to your account.</span>
      </li>
      <li className="flex gap-2.5">
        <Flame className="mt-0.5 h-4 w-4 shrink-0 text-orange-400" />
        <span><b>Farm</b> tells you which in-game activity is spiking, so you grind the right thing.</span>
      </li>
    </ul>
  );
}

function BeginnerBullets() {
  return (
    <ul className="space-y-2 text-sm">
      <li className="flex gap-2.5">
        <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
        <span><b>Learn</b> — type any item to see what it does, what it is worth and where to sell it; then follow the atlas checklist.</span>
      </li>
      <li className="flex gap-2.5">
        <Flame className="mt-0.5 h-4 w-4 shrink-0 text-orange-400" />
        <span><b>Farm</b> — what to run for your budget. <b>Trade</b> — paste a drop to price it.</span>
      </li>
      <li className="flex gap-2.5">
        <Compass className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
        <span>Trading tools stay hidden until you want them: <b>Settings › Mode</b>.</span>
      </li>
    </ul>
  );
}

/** How to connect POESESSID — advanced mode only (beginner mode hides the features that need it). */
function PoesessidHelp() {
  const [showSecret, setShowSecret] = useState(false);
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-3">
      <button onClick={() => setShowSecret((v) => !v)} className="flex w-full items-center justify-between text-sm font-medium text-neutral-300">
        <span className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-amber-400" /> Tracking your stash & snipes (POESESSID)
        </span>
        <span className="text-neutral-500">{showSecret ? "−" : "+"}</span>
      </button>
      {showSecret && (
        <div className="mt-2 space-y-2 text-xs text-neutral-400">
          <p>
            Reading your own stash and running live snipes needs your <b>POESESSID</b> (your pathofexile.com session cookie),
            connected once in <b>Settings</b>:
          </p>
          <ol className="list-decimal space-y-1 pl-4">
            <li>Log in at <span className="text-neutral-300">pathofexile.com</span> in your browser.</li>
            <li>Press F12 → <span className="text-neutral-300">Application → Cookies</span> → the pathofexile.com entry.</li>
            <li>Copy the value of <span className="text-neutral-300">POESESSID</span> into <span className="text-neutral-300">Settings → Trade Connection</span>.</li>
          </ol>
          <p className="rounded border border-amber-500/30 bg-amber-500/5 p-2 text-amber-300/90">
            ⚠️ POESESSID is a session key with full access to your account — treat it like a password. It&apos;s stored encrypted,
            used read-only for your own searches, and never shown again. Don&apos;t paste it anywhere else.
          </p>
        </div>
      )}
    </div>
  );
}

interface WelcomeProps {
  name: string;
  mode: NavMode;
  onDismiss: () => void;
  onTour: () => void;
}

function Welcome({ name, mode, onDismiss, onTour }: WelcomeProps) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={onDismiss}>
      <div className="w-full max-w-lg space-y-4 rounded-xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold">Welcome, {name} 👋</h2>
            <p className="text-sm text-neutral-500">PoE2 Coach — quick orientation</p>
          </div>
          <button onClick={onDismiss} aria-label="Close" className="text-neutral-500 hover:text-neutral-200">
            <X className="h-5 w-5" />
          </button>
        </div>
        {mode === "beginner" ? <BeginnerBullets /> : <AdvancedBullets />}
        {mode === "advanced" && <PoesessidHelp />}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button onClick={onDismiss} className="rounded-md px-3 py-2 text-sm text-neutral-400 hover:text-neutral-100">
            Got it
          </button>
          <button onClick={onTour} className="rounded-md bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-500">
            Take the tour
          </button>
        </div>
      </div>
    </div>
  );
}

/** First-run welcome + a driver.js tour of the tabs this user's nav mode shows. Per-user (localStorage), re-openable via 'open-guide'. */
export function Onboarding() {
  const { me, mode } = useNavMode();
  const introKey = `poe2flip_intro_${INTRO_VERSION}_${me.id}`;
  const [open, setOpen] = useState(false);
  const { go } = useTabRoute();

  useEffect(() => {
    if (!localStorage.getItem(introKey)) setOpen(true);
  }, [introKey]);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("open-guide", onOpen);
    return () => window.removeEventListener("open-guide", onOpen);
  }, []);

  const dismiss = useCallback(() => {
    setOpen(false);
    localStorage.setItem(introKey, "1");
  }, [introKey]);

  const startTour = useCallback(async () => {
    dismiss();
    const steps = tourStepsFor(mode);
    const { driver } = await import("driver.js");
    const tour = driver({
      showProgress: true,
      popoverClass: "poe2-tour",
      steps: steps.map((s) => ({ element: s.element, popover: { title: s.title, description: s.description } })),
      // Steps live on different tabs: switch tab first, then highlight (see onboardingTour.ts).
      onNextClick: () => stepTour(tour, 1, go, steps),
      onPrevClick: () => stepTour(tour, -1, go, steps),
    });
    tour.drive();
  }, [dismiss, go, mode]);

  if (!open) return null;
  return <Welcome name={me.name} mode={mode} onDismiss={dismiss} onTour={() => void startTour()} />;
}
