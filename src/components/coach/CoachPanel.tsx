"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import Image from "next/image";
import { LoaderCircle, RotateCcw } from "lucide-react";
import iconCoach from "../../assets/Coach.png";
import { fetchCoachHealth, type CoachHealth } from "./api";
import { CoachComposer } from "./CoachComposer";
import { CoachHistorySidebar } from "./CoachHistorySidebar";
import { CoachMessage } from "./CoachMessage";
import { useCoachSession } from "./useCoachSession";

const PROMPTS = [
  {
    eyebrow: "DEMO",
    prompt: "On a desecrated Time-Lost jewel, when should I use Omen of Light versus Omen of Sinistral Annulment? Use only verified knowledge-base evidence; do not discuss drop sources or current prices.",
  },
  { eyebrow: "MARKET", prompt: "Show observed Divine Orb market history, its timestamp, and the main limitation." },
  { eyebrow: "ITEM", prompt: "Paste an item's complete in-game clipboard text here for deterministic inspection." },
] as const;

export function CoachPanel({ active }: { active: boolean }) {
  // Keep the editorial type treatment scoped to Coach; the data-heavy dashboard stays compact.
  const session = useCoachSession();
  const { health, healthError } = useCoachHealth(active);
  const scrollRef = useRef<HTMLDivElement>(null);
  const availability = coachAvailability(health, healthError);
  useCoachScroll(active, scrollRef, session.messages.at(-1)?.id ?? null, session.isLoading);

  return (
    <section className={`${active ? "flex" : "hidden"} h-[calc(100vh-225px)] min-h-[620px] flex-col overflow-hidden rounded-xl border border-neutral-800 bg-[radial-gradient(circle_at_top,rgba(120,83,22,0.08),transparent_38%)] font-['Segoe_UI_Variable','Segoe_UI',sans-serif] shadow-2xl shadow-black/20`}>
      <CoachHeader
        health={health}
        healthError={healthError}
        onReset={session.newChat}
      />

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <CoachHistorySidebar
          conversations={session.conversations}
          activeId={session.conversationId}
          disabled={session.isLoading || session.isHistoryLoading}
          onDelete={session.remove}
          onNew={session.newChat}
          onOpen={session.open}
          onRename={session.rename}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div ref={scrollRef} className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-6 sm:px-6">
        {session.messages.length === 0 ? (
          <EmptyCoach
            disabled={!availability.ready}
            onPrompt={session.send}
            webReady={health?.web_search_ready === true}
          />
        ) : null}
        {session.messages.map((message) => <CoachMessage key={message.id} message={message} />)}
        {session.isLoading && (
          <div className="mx-auto flex w-full max-w-5xl items-center gap-3 pl-12 text-xs text-neutral-500">
            <LoaderCircle className="h-4 w-4 animate-spin text-amber-500/70" />
            Checking market data and verifying sources…
          </div>
        )}
          </div>

          <CoachComposer
            disabled={!session.ready || session.isLoading || !availability.ready}
            error={session.error}
            notice={availability.reason}
            onSend={session.send}
            onRecover={session.recover}
          />
        </div>
      </div>
    </section>
  );
}

function useCoachHealth(active: boolean) {
  const [health, setHealth] = useState<CoachHealth | null>(null);
  const [healthError, setHealthError] = useState(false);
  const checkedRef = useRef(false);

  useEffect(() => {
    if (!active || checkedRef.current) return;
    checkedRef.current = true;
    fetchCoachHealth()
      .then((result) => setHealth(result))
      .catch(() => setHealthError(true));
  }, [active]);

  return { health, healthError };
}

function useCoachScroll(
  active: boolean,
  scrollRef: RefObject<HTMLDivElement | null>,
  latestMessageId: string | null,
  isLoading: boolean,
) {
  useEffect(() => {
    const container = scrollRef.current;
    if (!active || !container) return;
    if (isLoading) {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
      return;
    }
    if (!latestMessageId) return;
    const message = container.querySelector<HTMLElement>(
      `[data-coach-message-id="${latestMessageId}"]`,
    );
    if (message) {
      container.scrollTo({ top: message.offsetTop - container.offsetTop - 8, behavior: "smooth" });
    }
  }, [active, isLoading, latestMessageId, scrollRef]);
}

function CoachHeader({ health, healthError, onReset }: {
  health: CoachHealth | null;
  healthError: boolean;
  onReset: () => void;
}) {
  return (
    <header className="flex items-center justify-between border-b border-neutral-800 bg-neutral-950/75 px-5 py-3.5 backdrop-blur">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-lg border border-amber-500/20 bg-amber-950/10">
          <Image src={iconCoach} alt="" className="h-8 w-8 object-contain" />
        </div>
        <div>
          <h2 className="font-['Palatino_Linotype','Book_Antiqua',serif] text-lg font-semibold tracking-wide text-neutral-100">PoE2 Coach</h2>
          <p className="text-[11px] text-neutral-500">
            market · craft · evidence-linked knowledge base
            {health?.web_search_ready ? " · recent web" : ""}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Health health={health} failed={healthError} />
        <button onClick={onReset} className="inline-flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-200">
          <RotateCcw className="h-3.5 w-3.5" /> new chat
        </button>
      </div>
    </header>
  );
}

function EmptyCoach({ disabled, onPrompt, webReady }: {
  disabled: boolean;
  onPrompt: (prompt: string) => Promise<void>;
  webReady: boolean;
}) {
  return (
    <div className="mx-auto flex min-h-full max-w-4xl flex-col items-center justify-center py-10 text-center">
      <div className="mb-5 grid h-16 w-16 place-items-center rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-950/30 to-neutral-950 shadow-[0_0_35px_rgba(245,158,11,0.08)]">
        <Image src={iconCoach} alt="" className="h-12 w-12 object-contain" />
      </div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-amber-500/65">Market intelligence</div>
      <h3 className="mt-2 font-['Palatino_Linotype','Book_Antiqua',serif] text-2xl font-semibold tracking-wide text-neutral-100">
        Make decisions from data, not trade chat.
      </h3>
      <p className="mt-3 max-w-xl text-sm leading-6 text-neutral-500">
        Coach combines observed market history, locally polled poe.ninja data, and a curated knowledge base.
        {webReady ? " It checks recent web sources when needed." : ""}
      </p>
      <div className="mt-8 grid w-full gap-3 md:grid-cols-3">
        {PROMPTS.map(({ eyebrow, prompt }) => (
          <button
            key={prompt}
            disabled={disabled}
            onClick={() => void onPrompt(prompt)}
            className="group rounded-xl border border-neutral-800 bg-neutral-900/45 px-4 py-4 text-left transition hover:-translate-y-0.5 hover:border-amber-500/25 hover:bg-neutral-900/80 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="text-[9px] font-semibold tracking-[0.18em] text-amber-500/55 group-hover:text-amber-400/75">{eyebrow}</span>
            <span className="mt-2 block text-sm leading-6 text-neutral-400 group-hover:text-neutral-200">{prompt}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Health({ health, failed }: { health: CoachHealth | null; failed: boolean }) {
  if (failed) {
    return <Status label="Coach unavailable" title="The local Coach service is not running." tone="error" />;
  }
  if (!health) return <Status label="checking…" title="Checking source readiness." tone="muted" />;
  if (!health.model_configured) {
    return <Status label="AI not configured" title="Configure the isolated Coach environment." tone="warning" />;
  }
  if (!health.item_data_ready) {
    return <Status label="item data missing" title="Run npm run sync:poe2-data and restart Coach." tone="error" />;
  }
  if (!health.market_ready || !health.knowledge_ready) {
    return <Status label="sources unavailable" title="The market database or knowledge base is unavailable." tone="error" />;
  }
  if (!health.recommendations_ready) {
    const title = health.patch_monitor_ready
      ? `${health.pending_patch_reviews} official patch review(s) are pending; Coach remains available with stale-recommendation warnings.`
      : "Official patch monitoring is missing or stale; Coach remains available, but recommendations may be stale.";
    return <Status label="patch review needed" title={title} tone="warning" />;
  }
  const title = health.web_search_ready
    ? "Local sources are ready and recent web is configured; the first chat verifies model connectivity."
    : "Local sources are ready; the first chat verifies model connectivity.";
  return <Status label="sources ready" title={title} tone="ready" />;
}

function coachAvailability(health: CoachHealth | null, failed: boolean) {
  if (failed) return { ready: false, reason: "The local Coach service is not running." } as const;
  if (!health) return { ready: false, reason: "Checking Coach service readiness…" } as const;
  if (!health.model_configured) {
    return {
      ready: false,
      reason: "Configure the isolated Coach process environment, then restart Coach.",
    } as const;
  }
  if (!health.item_data_ready) {
    return { ready: false, reason: "The local PoE2 item catalog is missing or invalid." } as const;
  }
  if (!health.market_ready || !health.knowledge_ready) {
    return { ready: false, reason: "The market database or knowledge base is unavailable." } as const;
  }
  return { ready: true, reason: null } as const;
}

const STATUS_TONES = {
  error: { wrapper: "border-red-900/60 bg-red-950/25 text-red-300", dot: "bg-red-400" },
  muted: { wrapper: "border-neutral-800 bg-neutral-900/50 text-neutral-500", dot: "bg-neutral-600" },
  ready: { wrapper: "border-emerald-900/60 bg-emerald-950/20 text-emerald-300", dot: "bg-emerald-400" },
  warning: { wrapper: "border-amber-900/60 bg-amber-950/20 text-amber-300", dot: "bg-amber-400" },
} as const;

function Status({ label, title, tone }: { label: string; title: string; tone: keyof typeof STATUS_TONES }) {
  const styles = STATUS_TONES[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] ${styles.wrapper}`} title={title}>
      <span className={`h-1.5 w-1.5 rounded-full ${styles.dot}`} />
      {label}
    </span>
  );
}
