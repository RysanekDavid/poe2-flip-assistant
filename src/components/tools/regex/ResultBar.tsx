"use client";

import { useState, type ReactNode } from "react";
import { Check, Copy, SearchCode, TriangleAlert } from "lucide-react";
import { Button } from "../../ui/Button";
import { Tooltip } from "../../ui/Tooltip";

export interface ResultString {
  text: string;
  chars: number;
}

export interface ResultWarning {
  code: string;
  label: string;
  detail: string;
}

/** Copies text; a refused clipboard (permissions, insecure origin) is shown, not swallowed. */
export function CopyButton({ text, label = "Copy", variant = "primary" }: { text: string; label?: string; variant?: "primary" | "secondary" }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = () => {
    navigator.clipboard
      .writeText(text)
      .then(() => setState("copied"))
      .catch((e: unknown) => {
        console.error("[tools/regex] clipboard write failed", e);
        setState("failed");
      })
      .finally(() => window.setTimeout(() => setState("idle"), 1600));
  };
  return (
    <Button variant={variant} size="md" onClick={copy} title="copy, then paste into the in-game stash search (Ctrl+F)">
      {state === "copied" ? <Check aria-hidden className="h-4 w-4" /> : <Copy aria-hidden className="h-4 w-4" />}
      {state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : label}
    </Button>
  );
}

function StringRow({ s, index, total, maxChars, onExplain }: { s: ResultString; index: number; total: number; maxChars: number; onExplain?: (text: string) => void }) {
  const over = s.chars > maxChars;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {total > 1 && <span className="text-xs tabular-nums text-neutral-400">#{index + 1}</span>}
      <code className="min-w-0 flex-1 break-all rounded-md border border-line bg-neutral-950 px-2.5 py-1.5 font-mono text-sm text-amber-200">{s.text}</code>
      <span className={`w-16 text-right text-xs tabular-nums ${over ? "font-semibold text-bad" : "text-neutral-400"}`} title="characters used / stash-search limit">
        {s.chars}/{maxChars}
      </span>
      {onExplain && (
        <Button variant="ghost" size="md" aria-label={`explain string ${index + 1}`} title="show what this string matches" onClick={() => onExplain(s.text)}>
          <SearchCode aria-hidden className="h-4 w-4" />
        </Button>
      )}
      <CopyButton text={s.text} />
    </div>
  );
}

export function WarningChips({ warnings }: { warnings: readonly ResultWarning[] }) {
  if (warnings.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="warnings">
      {warnings.map((w) => (
        <li key={w.code}>
          <Tooltip tip={w.detail} side="bottom">
            <span className="inline-flex items-center gap-1 rounded bg-warn/15 px-2 py-0.5 text-xs font-semibold text-warn">
              <TriangleAlert aria-hidden className="h-3.5 w-3.5" /> {w.label}
            </span>
          </Tooltip>
        </li>
      ))}
    </ul>
  );
}

interface ResultBarProps {
  strings: readonly ResultString[];
  warnings: readonly ResultWarning[];
  /** Why there is no string (shown instead of the rows). */
  reason: string | null;
  /** A failure (network, composer bug) — shown in red above everything else. */
  error?: string | null;
  maxChars: number;
  busy?: boolean;
  /** Share / trade / reset buttons. */
  actions?: ReactNode;
  onExplain?: (text: string) => void;
}

/**
 * The pinned result: stays under the shell header while the mod list scrolls, so the string, its
 * length and Copy are always one glance away (poeregex.cz's layout, which the owner prefers).
 */
export function ResultBar({ strings, warnings, reason, error = null, maxChars, busy = false, actions, onExplain }: ResultBarProps) {
  return (
    <section
      aria-label="search strings"
      aria-busy={busy}
      className="sticky top-[var(--shell-h,0px)] z-30 flex flex-col gap-2 rounded-lg border border-amber-500/25 bg-neutral-950/95 p-3 shadow-lg backdrop-blur"
    >
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
      {strings.length > 0 ? (
        strings.map((s, i) => <StringRow key={`${i}:${s.text}`} s={s} index={i} total={strings.length} maxChars={maxChars} onExplain={onExplain} />)
      ) : (
        <p className="text-sm text-neutral-400">{reason ?? "building…"}</p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <WarningChips warnings={warnings} />
        {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </section>
  );
}
