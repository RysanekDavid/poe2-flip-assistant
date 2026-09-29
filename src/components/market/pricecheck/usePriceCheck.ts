"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  priceCheckLiveResponseSchema,
  priceCheckResponseSchema,
  type PriceCheckLiveResponse,
  type PriceCheckResponse,
} from "../../../lib/priceCheckContract";
import { postJson } from "../../craft/moves/craftMovesClient";

export type CheckView =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; error: string }
  | { kind: "done"; text: string; seq: number; r: PriceCheckResponse };

export type LiveView =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "done"; v: PriceCheckLiveResponse }
  | { kind: "error"; error: string; retryAt: number | null };

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** The base check (no trade2 budget). A newer paste supersedes an in-flight read. */
export function usePriceCheck() {
  const [view, setView] = useState<CheckView>({ kind: "idle" });
  const seq = useRef(0);
  const lastRead = useRef<string | null>(null);
  const read = useCallback(async (text: string): Promise<void> => {
    lastRead.current = text;
    const mine = ++seq.current;
    setView({ kind: "loading" });
    try {
      const r = await postJson("/api/pricecheck", { text }, priceCheckResponseSchema);
      if (mine !== seq.current) return;
      setView(r.ok ? { kind: "done", text, seq: mine, r: r.data } : { kind: "error", error: r.error });
    } catch (e: unknown) {
      console.error("[pricecheck] read failed", e);
      if (mine === seq.current) setView({ kind: "error", error: errText(e) });
    }
  }, []);
  return { view, read, lastRead };
}

/** The live value: one trade2 search + one fetch, only when the button is clicked. Resets per paste. */
export function useLiveValue(text: string) {
  const [live, setLive] = useState<LiveView>({ kind: "idle" });
  useEffect(() => setLive({ kind: "idle" }), [text]);
  const run = useCallback(async (): Promise<void> => {
    setLive({ kind: "loading" });
    try {
      const r = await postJson("/api/pricecheck/live", { text }, priceCheckLiveResponseSchema);
      if (r.ok) setLive({ kind: "done", v: r.data });
      else setLive({ kind: "error", error: r.error, retryAt: r.retryAfterSec != null ? Date.now() + r.retryAfterSec * 1000 : null });
    } catch (e: unknown) {
      console.error("[pricecheck] live value failed", e);
      setLive({ kind: "error", error: errText(e), retryAt: null });
    }
  }, [text]);
  return { live, run };
}
