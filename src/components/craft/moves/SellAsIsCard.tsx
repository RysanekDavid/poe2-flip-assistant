"use client";

import { useEffect, useState } from "react";
import { priceLabel } from "../craftView";
import {
  craftValueResponseSchema,
  type CraftMovesResponse,
  type CraftValueResponse,
} from "../../../lib/tools/craftMovesContract";
import { Button } from "../../ui/Button";
import { postJson } from "./craftMovesClient";

export type LiveState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "done"; v: CraftValueResponse }
  | { kind: "error"; error: string; retryAt: number | null };

/** Seconds until `retryAt`, ticking once a second while a 503 cool-down runs. */
export function useCountdown(retryAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (retryAt == null) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [retryAt]);
  return retryAt == null ? 0 : Math.max(0, Math.ceil((retryAt - now) / 1000));
}

/** One live comparable search (1 trade2 search + 1 fetch) for the item, or a move's outcome. */
export async function fetchLiveValue(text: string, targetLine?: string): Promise<LiveState> {
  try {
    const r = await postJson("/api/tools/craft-moves/value", { text, targetLine }, craftValueResponseSchema);
    if (r.ok) return { kind: "done", v: r.data };
    return { kind: "error", error: r.error, retryAt: r.retryAfterSec != null ? Date.now() + r.retryAfterSec * 1000 : null };
  } catch (e: unknown) {
    console.error("[craft-moves] live value failed", e);
    return { kind: "error", error: e instanceof Error ? e.message : String(e), retryAt: null };
  }
}

function BookLine({ book, error, ex }: { book: CraftMovesResponse["bookValue"]; error: string | null; ex: number | null }) {
  if (error) return <p className="text-sm text-amber-300" title={error}>price book unavailable — trade2 stat catalog unreachable</p>;
  if (!book) return <p className="text-sm text-neutral-400">the price book covers rares only</p>;
  return (
    <p className="text-sm" title={`${book.resolvedMods} mods resolved to trade stats · trimmed median of recorded asks`}>
      <span className="text-neutral-400">book </span>
      <span className="tabular-nums text-neutral-100">{book.valueDiv == null ? "no reference" : priceLabel(book.valueDiv, ex)}</span>
      <span className="text-xs text-neutral-500"> · {book.samples} samples</span>
    </p>
  );
}

function LiveLine({ live, ex }: { live: CraftValueResponse; ex: number | null }) {
  return (
    <p className="text-sm" title={`${live.searchedStats} stats searched · ${live.dropped} bait asks trimmed · ${live.unrated} unrated`}>
      <span className="text-neutral-400">live </span>
      <span className="tabular-nums text-neutral-100">{live.valueDiv == null ? "no comparables" : priceLabel(live.valueDiv, ex)}</span>
      <span className="text-xs text-neutral-500"> · {live.samples} of {live.total} listed · </span>
      <a href={live.searchUrl} target="_blank" rel="noreferrer" className="text-xs text-sky-400 hover:underline">
        open search
      </a>
    </p>
  );
}

interface Props {
  text: string;
  book: CraftMovesResponse["bookValue"];
  bookError: string | null;
  ex: number | null;
  /** The live as-is value once fetched (null again when the item changes) — move cards net it out. */
  onLive: (div: number | null) => void;
}

/** What the item is worth untouched: book reference at once (no budget), a live value on demand. */
export function SellAsIsCard({ text, book, bookError, ex, onLive }: Props) {
  const [live, setLive] = useState<LiveState>({ kind: "idle" });
  const wait = useCountdown(live.kind === "error" ? live.retryAt : null);
  useEffect(() => setLive({ kind: "idle" }), [text]);
  useEffect(() => onLive(live.kind === "done" ? live.v.valueDiv : null), [live, onLive]);

  const valueLive = async (): Promise<void> => {
    setLive({ kind: "loading" });
    setLive(await fetchLiveValue(text));
  };

  return (
    <section className="rounded-lg border border-line bg-neutral-950/60 p-3">
      <h3 className="text-sm font-semibold text-neutral-100">Sell as-is</h3>
      <div className="mt-1 space-y-1">
        <BookLine book={book} error={bookError} ex={ex} />
        {live.kind === "done" && <LiveLine live={live.v} ex={ex} />}
        {live.kind === "error" && <p className="text-sm text-bad">{live.error}</p>}
      </div>
      <Button
        size="sm"
        className="mt-2"
        onClick={() => void valueLive()}
        disabled={live.kind === "loading" || wait > 0}
        title="spends one trade2 search + one fetch with your own POESESSID"
      >
        {live.kind === "loading" ? "searching…" : wait > 0 ? `retry in ${wait}s` : "value live · 1 search"}
      </Button>
    </section>
  );
}
