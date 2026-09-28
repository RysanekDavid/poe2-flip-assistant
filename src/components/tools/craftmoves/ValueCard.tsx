"use client";

import { useEffect, useState } from "react";
import { priceLabel } from "../../craft/craftView";
import {
  craftValueResponseSchema,
  type CraftMovesResponse,
  type CraftValueResponse,
} from "../../../lib/tools/craftMovesContract";
import { postJson } from "./craftMovesClient";

type LiveState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "done"; v: CraftValueResponse }
  | { kind: "error"; error: string; retryAt: number | null };

/** Seconds until `retryAt`, ticking once a second while a 503 cool-down runs. */
function useCountdown(retryAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (retryAt == null) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [retryAt]);
  return retryAt == null ? 0 : Math.max(0, Math.ceil((retryAt - now) / 1000));
}

function BookLine({ book, error, ex }: { book: CraftMovesResponse["bookValue"]; error: string | null; ex: number | null }) {
  if (error) return <p className="text-xs text-amber-400" title={error}>price book unavailable — trade2 stat catalog unreachable</p>;
  if (!book) return <p className="text-xs text-neutral-500">price book covers rares only</p>;
  return (
    <p className="text-sm" title={`${book.resolvedMods} mods resolved to trade stats · trimmed median of recorded asks`}>
      <span className="text-neutral-500">book </span>
      <span className="tabular-nums text-neutral-200">{book.valueDiv == null ? "no reference" : priceLabel(book.valueDiv, ex)}</span>
      <span className="text-xs text-neutral-600"> · {book.samples} samples</span>
    </p>
  );
}

function LiveLine({ live, ex }: { live: CraftValueResponse; ex: number | null }) {
  return (
    <p className="text-sm" title={`${live.searchedStats} stats searched · ${live.dropped} bait asks trimmed · ${live.unrated} unrated`}>
      <span className="text-neutral-500">live </span>
      <span className="tabular-nums text-neutral-100">{live.valueDiv == null ? "no comparables" : priceLabel(live.valueDiv, ex)}</span>
      <span className="text-xs text-neutral-600"> · {live.samples} of {live.total} listed · </span>
      <a href={live.searchUrl} target="_blank" rel="noreferrer" className="text-xs text-sky-400 hover:underline">
        open search
      </a>
    </p>
  );
}

/** Book reference immediately (no trade2 budget); a live comparable value on demand (1 search). */
export function ValueCard({ text, book, bookError, ex }: { text: string; book: CraftMovesResponse["bookValue"]; bookError: string | null; ex: number | null }) {
  const [live, setLive] = useState<LiveState>({ kind: "idle" });
  const wait = useCountdown(live.kind === "error" ? live.retryAt : null);
  useEffect(() => setLive({ kind: "idle" }), [text]);

  const valueLive = async (): Promise<void> => {
    setLive({ kind: "loading" });
    try {
      const r = await postJson("/api/tools/craft-moves/value", { text }, craftValueResponseSchema);
      if (r.ok) setLive({ kind: "done", v: r.data });
      else setLive({ kind: "error", error: r.error, retryAt: r.retryAfterSec != null ? Date.now() + r.retryAfterSec * 1000 : null });
    } catch (e: unknown) {
      console.error("[craft-moves] live value failed", e);
      setLive({ kind: "error", error: e instanceof Error ? e.message : String(e), retryAt: null });
    }
  };

  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-3">
      <h3 className="text-sm font-semibold text-neutral-200">Value</h3>
      <div className="mt-1 space-y-1">
        <BookLine book={book} error={bookError} ex={ex} />
        {live.kind === "done" && <LiveLine live={live.v} ex={ex} />}
        {live.kind === "error" && <p className="text-xs text-red-400">{live.error}</p>}
      </div>
      <button
        onClick={() => void valueLive()}
        disabled={live.kind === "loading" || wait > 0}
        title="spends one trade2 search + one fetch with your own POESESSID"
        className="mt-2 rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:border-neutral-500 disabled:opacity-50"
      >
        {live.kind === "loading" ? "searching…" : wait > 0 ? `retry in ${wait}s` : "Value live (1 trade2 search)"}
      </button>
    </section>
  );
}
