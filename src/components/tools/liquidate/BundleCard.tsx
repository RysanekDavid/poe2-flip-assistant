"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import type { LiquidateBundle } from "../../../lib/tools/liquidateContract";
import { describeError } from "../../../lib/clientWarn";

type CopyState = "idle" | "copied" | { error: string };

/** Copies text to the clipboard; a refused clipboard is shown on the button, never swallowed. */
function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<CopyState>("idle");
  const copy = (): void => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setState("copied");
        window.setTimeout(() => setState("idle"), 1500);
      })
      .catch((e: unknown) => {
        console.error("[liquidate] clipboard write failed", e);
        setState({ error: describeError(e) });
      });
  };
  const failed = typeof state === "object";
  return (
    <button
      type="button"
      onClick={copy}
      title={failed ? `copy failed: ${state.error} — select the text and copy it by hand` : `copy ${label}`}
      className={`inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] ${
        failed ? "border-bad/60 text-bad" : "border-neutral-700 text-neutral-400 hover:border-orange-500 hover:text-orange-300"
      }`}
    >
      {state === "copied" ? <Check className="h-3 w-3 text-good" /> : <Copy className="h-3 w-3" />}
      {state === "copied" ? "copied" : failed ? "failed" : "copy"}
    </button>
  );
}

/** Copy-paste text for the trade rows: the WTS line and one stash-tab price note per item. */
export function BundleCard({ bundle }: { bundle: LiquidateBundle }) {
  if (bundle.notes.length === 0) return null;
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-orange-900/40 bg-neutral-950/60 p-3">
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-orange-200/90">Trade listing kit</h3>
        <span className="text-[11px] text-neutral-500" title="nothing is posted, listed or whispered for you — copy and paste it yourself">
          text only · you paste it
        </span>
      </header>
      {bundle.lines.map((line, i) => (
        <div key={line} className="flex items-start gap-2">
          <p className="min-w-0 flex-1 select-all break-words rounded bg-neutral-900 px-2 py-1.5 font-mono text-xs text-neutral-200"
            title={`trade-chat WTS line ${i + 1} of ${bundle.lines.length} — split to stay within the chat length`}>
            {line}
          </p>
          <CopyButton text={line} label={`WTS line ${i + 1}`} />
        </div>
      ))}
      <ul className="flex flex-col gap-1">
        {bundle.notes.map((n) => (
          <li key={n.name} className="flex items-center gap-2 text-xs">
            <span className="min-w-0 flex-1 truncate text-neutral-400" title={n.name}>{n.name}</span>
            <code className="select-all rounded bg-neutral-900 px-1.5 py-0.5 text-neutral-200" title="stash-tab price note (per unit)">{n.note}</code>
            <CopyButton text={n.note} label={`note for ${n.name}`} />
          </li>
        ))}
      </ul>
    </section>
  );
}
