"use client";

import { useEffect } from "react";
import { Button } from "./Button";

/** A paste settles for this long before it is read — typing into the box must not fire per key. */
const AUTO_READ_MS = 400;

/**
 * Reads the box by itself once a pasted item settles (text with a `Rarity:` line that differs from
 * the last read); the Read button stays for re-reads.
 */
export function usePasteAutoRead(text: string, read: (t: string) => Promise<void>, lastRead: { current: string | null }): void {
  useEffect(() => {
    const trimmed = text.trim();
    if (!/^Rarity:/m.test(trimmed) || trimmed === lastRead.current?.trim()) return;
    const t = window.setTimeout(() => void read(text), AUTO_READ_MS);
    return () => window.clearTimeout(t);
  }, [text, read, lastRead]);
}

interface PasteBoxProps {
  text: string;
  setText: (t: string) => void;
  busy: boolean;
  onRead: () => void;
  /** Shrinks the box once a result is showing below it. */
  compact: boolean;
  maxLength: number;
  /** Optional "Try sample item" button. */
  sample?: string;
  readLabel?: string;
}

/** Ctrl+C item text in, one Read button out; Ctrl+Enter reads too. */
export function PasteBox({ text, setText, busy, onRead, compact, maxLength, sample, readLabel = "Read item" }: PasteBoxProps) {
  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) onRead();
        }}
        maxLength={maxLength}
        spellCheck={false}
        aria-label="Item text (Ctrl+C in game)"
        placeholder="Hover an item in game, press Ctrl+C (Ctrl+Alt+C adds exact affix headers) and paste here — it reads itself."
        className={`${compact ? "h-24" : "h-40"} w-full resize-y rounded-md border border-line bg-neutral-950 p-2 font-mono text-xs text-neutral-100 placeholder:text-neutral-500`}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" onClick={onRead} disabled={busy || text.trim() === ""} title="Ctrl+Enter">
          {busy ? "reading…" : readLabel}
        </Button>
        {sample != null && (
          <Button size="sm" onClick={() => setText(sample)}>
            Try sample item
          </Button>
        )}
      </div>
    </div>
  );
}
