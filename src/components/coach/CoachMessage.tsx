"use client";

import Image from "next/image";
import { ChevronDown, ExternalLink } from "lucide-react";
import iconCoach from "../../assets/Coach.png";
import type { CoachSource } from "../../lib/coachContract";
import { CoachMarkdown } from "./CoachMarkdown";
import type { CoachMessage as Message } from "./useCoachSession";

const SOURCE_LABELS = {
  market: "Market DB",
  live: "Live",
  knowledge: "Knowledge",
  web: "Web",
} as const satisfies Record<CoachSource["type"], string>;

const TOOL_LABELS: Record<string, string> = {
  analyze_market_history: "Market history",
  fetch_live_prices: "Current prices",
  retrieve_knowledge: "Knowledge base",
  search_recent_poe2: "Recent web",
};

export function CoachMessage({ message }: { message: Message }) {
  if (message.role === "assistant") return <AssistantMessage message={message} />;
  return <UserMessage message={message} />;
}

function AssistantMessage({ message }: { message: Message }) {
  return (
    <article data-coach-message-id={message.id} className="mx-auto flex w-full max-w-5xl items-start gap-3">
      <div className="mt-6 grid h-9 w-9 shrink-0 place-items-center rounded-full border border-amber-500/25 bg-neutral-900 shadow-[0_0_20px_rgba(245,158,11,0.08)]">
        <Image src={iconCoach} alt="" className="h-7 w-7 object-contain" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex items-baseline gap-2 px-1">
          <span className="font-['Palatino_Linotype','Book_Antiqua',serif] text-sm font-semibold tracking-wide text-amber-100">Coach</span>
          <span className="text-[10px] uppercase tracking-[0.14em] text-neutral-600">verified answer</span>
        </div>
        <div className="overflow-hidden rounded-xl rounded-tl-sm border border-neutral-800 bg-gradient-to-br from-neutral-900/95 to-neutral-950/95 px-5 py-4 shadow-lg shadow-black/10">
          <CoachMarkdown content={message.content} sources={message.sources} />
          <Evidence tools={message.toolsUsed} sources={message.sources} />
        </div>
      </div>
    </article>
  );
}

function UserMessage({ message }: { message: Message }) {
  return (
    <article data-coach-message-id={message.id} className="mx-auto flex w-full max-w-5xl items-start justify-end gap-3">
      <div className="max-w-3xl min-w-0">
        <div className="mb-1.5 px-1 text-right text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-600">You</div>
        <div className="rounded-xl rounded-tr-sm border border-amber-500/20 bg-amber-950/20 px-4 py-3">
          <CoachMarkdown content={message.content} sources={[]} />
        </div>
      </div>
      <div className="mt-6 grid h-9 w-9 shrink-0 place-items-center rounded-full border border-neutral-700 bg-neutral-900 text-[10px] font-bold tracking-wider text-neutral-400">
        TY
      </div>
    </article>
  );
}

function Evidence({ tools, sources }: { tools: string[]; sources: CoachSource[] }) {
  if (tools.length === 0 && sources.length === 0) return null;
  return (
    <details open className="group mt-5 border-t border-dashed border-neutral-800 pt-3">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500 hover:text-neutral-300">
        <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
        Evidence
        <span className="font-normal normal-case tracking-normal text-neutral-600">
          {sources.length} sources · {tools.length} tools
        </span>
      </summary>
      <div className="mt-3 space-y-3">
        {tools.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tools.map((tool) => (
              <span key={tool} className="rounded-full border border-neutral-700 bg-neutral-950/70 px-2.5 py-1 text-[10px] text-neutral-400">
                {TOOL_LABELS[tool] ?? tool}
              </span>
            ))}
          </div>
        )}
        {sources.length > 0 && <SourceList sources={sources} />}
      </div>
    </details>
  );
}

function SourceList({ sources }: { sources: CoachSource[] }) {
  return (
    <ol className="grid gap-2 sm:grid-cols-2">
      {sources.map((source, index) => (
        <li
          key={source.id}
          id={`coach-source-${source.id}`}
          className="flex min-w-0 items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-950/55 px-2.5 py-2 target:border-amber-500/50"
        >
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-amber-500/30 text-[10px] font-semibold text-amber-300">
            {index + 1}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[9px] uppercase tracking-wider text-neutral-600">{SOURCE_LABELS[source.type]}</div>
            <div className="truncate text-[11px] text-neutral-300" title={source.title}>{source.title}</div>
          </div>
          {source.url && (
            <a
              href={source.url}
              target="_blank"
              rel="noreferrer"
              title="Open source"
              className="shrink-0 rounded p-1 text-neutral-600 hover:bg-neutral-800 hover:text-amber-300"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </li>
      ))}
    </ol>
  );
}
