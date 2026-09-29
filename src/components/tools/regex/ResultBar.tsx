"use client";

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Check, Copy, TriangleAlert } from "lucide-react";
import { Tooltip } from "../../ui/Tooltip";
import { writeClipboard } from "./clipboard";
import { CRITICAL_CODES, criticalFirst, type SentencePart } from "./describe";
import { BIG_BUTTON, ResetButton } from "./ResultActions";

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
function CopyButton({ text, which }: { text: string; which: number | null }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const empty = text.length === 0;
  const copy = () => {
    writeClipboard(text)
      .then(() => setState("copied"))
      .catch((e: unknown) => {
        console.error("[tools/regex] clipboard write failed", e);
        setState("failed");
      })
      .finally(() => window.setTimeout(() => setState("idle"), 1600));
  };
  const tone = empty ? "cursor-not-allowed bg-amber-400/10 text-amber-200/70" : "bg-amber-400 text-neutral-950 hover:bg-amber-300";
  return (
    <button type="button" onClick={copy} disabled={empty} title="copy, then paste into the in-game stash search (Ctrl+F)" className={`${BIG_BUTTON} w-24 text-base font-semibold sm:w-36 ${tone}`}>
      {state === "copied" ? <Check aria-hidden className="h-5 w-5" /> : <Copy aria-hidden className="h-5 w-5" />}
      {/* the visible label is the accessible name, so "Copied" / "Failed" is announced as it changes */}
      <span aria-live="polite">{state === "copied" ? "Copied" : state === "failed" ? "Failed" : "Copy"}</span>
      {which !== null && <span className="sr-only">string {which}</span>}
    </button>
  );
}

// A click anywhere on the string selects all of it, so a manual Ctrl+C also takes the whole thing.
function selectAll(e: MouseEvent<HTMLElement>): void {
  window.getSelection()?.selectAllChildren(e.currentTarget);
}

const BOX = "min-h-16 min-w-0 flex-1 break-all rounded-md border border-line bg-neutral-950 px-3 py-2 font-mono text-base";

function StringRow({ s, index, total }: { s: ResultString; index: number; total: number }) {
  return (
    <div className="flex gap-2">
      <code onClick={selectAll} className={`${BOX} cursor-text text-amber-200`}>
        {total > 1 && <span className="mr-2 select-none font-sans text-xs text-neutral-400">#{index + 1}</span>}
        {s.text}
      </code>
      <CopyButton text={s.text} which={total > 1 ? index + 1 : null} />
    </div>
  );
}

/** Characters used against the stash-search cap; the longest string counts when there are several. */
function CharMeter({ used, max }: { used: number; max: number }) {
  const over = used > max;
  const pct = max > 0 ? Math.min(100, (used / max) * 100) : 0;
  return (
    <span className="inline-flex items-center gap-2" title="characters used / stash-search limit">
      <span role="meter" aria-label="characters used" aria-valuemin={0} aria-valuemax={max} aria-valuenow={used} className="h-1 w-[120px] overflow-hidden rounded-full bg-neutral-800">
        <span className={`block h-full rounded-full ${over ? "bg-bad" : "bg-amber-400"}`} style={{ width: `${pct}%` }} />
      </span>
      <span className={`font-mono text-xs tabular-nums ${over ? "font-semibold text-bad" : "text-neutral-400"}`}>
        {used} / {max}
      </span>
    </span>
  );
}

/** Every composer note behind one pill; it turns red and names the problem when one is critical. */
function NotesPill({ warnings }: { warnings: readonly ResultWarning[] }) {
  if (warnings.length === 0) return null;
  const sorted = criticalFirst(warnings);
  const critical = sorted[0] && CRITICAL_CODES.has(sorted[0].code) ? sorted[0] : null;
  const tip = (
    <ul className="flex flex-col gap-1">
      {sorted.map((w) => (
        <li key={w.code}>
          <span className={`font-semibold ${CRITICAL_CODES.has(w.code) ? "text-bad" : "text-warn"}`}>{w.label}</span> — {w.detail}
        </li>
      ))}
    </ul>
  );
  const more = critical ? warnings.length - 1 : warnings.length;
  const label = critical ? `${critical.label}${more > 0 ? ` +${more}` : ""}` : `${warnings.length} ${warnings.length === 1 ? "note" : "notes"}`;
  return (
    <Tooltip tip={tip} side="bottom" align="end">
      <span className={`inline-flex shrink-0 items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold ${critical ? "bg-bad/15 text-red-200" : "bg-warn/15 text-warn"}`}>
        <TriangleAlert aria-hidden className="h-3.5 w-3.5" /> {label}
      </span>
    </Tooltip>
  );
}

function Sentence({ parts }: { parts: readonly SentencePart[] }) {
  return (
    <p className="min-w-0 flex-1 text-sm text-neutral-400">
      {parts.map((p, i) => (typeof p === "string" ? <span key={i}>{p}</span> : <strong key={i} className="font-semibold text-neutral-200">{p.strong}</strong>))}
    </p>
  );
}

const BAND_HEIGHT_VAR = "--regex-band-h";

/**
 * Publishes the pinned band's height (0 while it is not sticky, i.e. on phones) so content that
 * scrolls into view, like the explain drawer, can clear it however many strings it holds.
 */
function useBandHeightVar() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty(BAND_HEIGHT_VAR, getComputedStyle(el).position === "sticky" ? `${el.offsetHeight}px` : "0px");
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.removeProperty(BAND_HEIGHT_VAR);
    };
  }, []);
  return ref;
}

interface ResultBarProps {
  strings: readonly ResultString[];
  warnings: readonly ResultWarning[];
  /** Why there is no string (shown muted inside the empty box). */
  reason: string | null;
  /** A failure (network, composer bug) — shown in red above the strings. */
  error?: string | null;
  maxChars: number;
  busy?: boolean;
  /** What the selection lights up, in one plain sentence. */
  sentence: readonly SentencePart[];
  /** Small tools on the label row: Saved, Share, Explain, settings. */
  tools?: ReactNode;
  /** The trade-site button (pool tabs only). */
  trade?: ReactNode;
  onClear?: () => void;
}

/**
 * The pinned result band (poeregex.cz's layout, which the owner prefers): the string big and
 * monospace, Copy / Trade / Clear as one row of large buttons, the length against the cap, and one
 * sentence saying what the selection matches. Internals (tokens, notes) stay behind a pill or the
 * explain drawer.
 */
export function ResultBar({ strings, warnings, reason, error = null, maxChars, busy = false, sentence, tools, trade, onClear }: ResultBarProps) {
  const used = strings.reduce((n, s) => Math.max(n, s.chars), 0);
  const ref = useBandHeightVar();
  return (
    <section
      ref={ref}
      aria-label="search string"
      aria-busy={busy}
      className="z-30 flex flex-col gap-2.5 rounded-lg border border-line bg-neutral-950/95 p-3 shadow-lg backdrop-blur md:sticky md:top-[var(--shell-h,0px)]"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Search string</h3>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          {tools}
          <CharMeter used={used} max={maxChars} />
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
      <div className="flex flex-col gap-2 md:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {strings.length > 0 ? (
            strings.map((s, i) => <StringRow key={`${i}:${s.text}`} s={s} index={i} total={strings.length} />)
          ) : (
            <div className="flex gap-2">
              <p className={`${BOX} font-sans text-neutral-500`}>{reason ?? (error ? "No string until the problem above is fixed." : "building…")}</p>
              <CopyButton text="" which={null} />
            </div>
          )}
        </div>
        {(trade || onClear) && (
          <div className="flex gap-2">
            {trade}
            {onClear && <ResetButton onReset={onClear} />}
          </div>
        )}
      </div>
      <div className="flex items-start gap-3">
        <Sentence parts={sentence} />
        <NotesPill warnings={warnings} />
      </div>
    </section>
  );
}
