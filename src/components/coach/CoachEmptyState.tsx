"use client";

import Image from "next/image";
import iconCoach from "../../assets/Coach.png";

/**
 * "send" cards run a turn immediately. "compose" cards only focus the composer with a hint:
 * their text is an instruction to the user, and sending it would bill a turn for nothing.
 */
type CoachSuggestion =
  | { kind: "send"; eyebrow: string; prompt: string }
  | { kind: "compose"; eyebrow: string; label: string; placeholder: string };

const SUGGESTIONS: readonly CoachSuggestion[] = [
  { kind: "send", eyebrow: "FLIPS", prompt: "What's flipping well right now in my league?" },
  {
    kind: "send",
    eyebrow: "MARKET",
    prompt: "How have Divine Orb, Exalted Orb and Chaos Orb moved this week in my league?",
  },
  {
    kind: "compose",
    eyebrow: "ITEM",
    label: "Check this item — paste its in-game text for a deterministic inspection.",
    placeholder: "Paste the item's complete in-game text (hover it in game, press Ctrl+C)…",
  },
];

export function CoachEmptyState({ disabled, onCompose, onPrompt, webReady }: {
  disabled: boolean;
  onCompose: (placeholder: string) => void;
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
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion.eyebrow}
            disabled={disabled}
            onClick={() => {
              if (suggestion.kind === "send") void onPrompt(suggestion.prompt);
              else onCompose(suggestion.placeholder);
            }}
            className="group rounded-xl border border-neutral-800 bg-neutral-900/45 px-4 py-4 text-left transition hover:-translate-y-0.5 hover:border-amber-500/25 hover:bg-neutral-900/80 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="text-[9px] font-semibold tracking-[0.18em] text-amber-500/55 group-hover:text-amber-400/75">{suggestion.eyebrow}</span>
            <span className="mt-2 block text-sm leading-6 text-neutral-400 group-hover:text-neutral-200">
              {suggestion.kind === "send" ? suggestion.prompt : suggestion.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
