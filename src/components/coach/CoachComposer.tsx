"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { Send } from "lucide-react";

interface CoachComposerProps {
  disabled: boolean;
  error: string | null;
  notice: string | null;
  onSend: (message: string) => Promise<void>;
}

export function CoachComposer({ disabled, error, notice, onSend }: CoachComposerProps) {
  const [value, setValue] = useState("");

  const submit = async (): Promise<void> => {
    const message = value.trim();
    if (!message || disabled) return;
    setValue("");
    await onSend(message);
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void submit();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <div className="border-t border-neutral-800 bg-neutral-950/90 px-4 py-3 backdrop-blur sm:px-6">
      <div className="mx-auto max-w-5xl">
        {error && <div role="alert" className="mb-2 rounded-lg border border-red-900/60 bg-red-950/25 px-3 py-2 text-xs text-red-300">{error}</div>}
        {notice && (
          <div role="status" className="mb-2 rounded-lg border border-amber-900/50 bg-amber-950/20 px-3 py-2 text-xs text-amber-300">
            {notice}
          </div>
        )}
        <form onSubmit={onSubmit} className="flex items-end gap-2 rounded-xl border border-neutral-700 bg-neutral-900/80 p-2 shadow-inner shadow-black/20 focus-within:border-amber-500/40">
          <textarea
            aria-label="Message PoE2 Coach"
            disabled={disabled}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={onKeyDown}
            maxLength={8_000}
            rows={2}
            placeholder="Ask about the market, farming, crafting, or paste an item…"
            className="min-h-12 flex-1 resize-y bg-transparent px-2 py-2 text-sm leading-6 text-neutral-100 outline-none placeholder:text-neutral-600 disabled:cursor-not-allowed disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={disabled || value.trim().length === 0}
            className="inline-flex h-11 shrink-0 items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-950/25 px-4 text-sm text-amber-100 transition hover:border-amber-500/50 hover:bg-amber-950/45 disabled:cursor-not-allowed disabled:opacity-35"
          >
            <Send className="h-4 w-4" /> Send
          </button>
        </form>
        <div className="mt-2 flex items-center justify-between px-1 text-[10px] text-neutral-600">
          <span>Enter to send · Shift+Enter for a new line</span>
          <span>AI guidance · you always confirm the trade</span>
        </div>
      </div>
    </div>
  );
}
