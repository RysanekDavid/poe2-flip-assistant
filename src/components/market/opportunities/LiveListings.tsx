"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2, RotateCw } from "lucide-react";
import { tradeCurrencyArt } from "../../../lib/currencyArt";
import { listingsResponseSchema, type ListingsResponse, type LiveListing } from "../../../lib/opportunitiesContract";
import { requestJson } from "../../craft/moves/craftMovesClient";
import { useCountdown } from "../../ui/useCountdown";
import { ageSince } from "./opportunityFormat";

type State =
  | { kind: "loading" }
  | { kind: "done"; data: ListingsResponse }
  | { kind: "error"; error: string; retryAt: number | null };

function listingsUrl(name: string, base: string): string {
  const p = new URLSearchParams({ name });
  if (base !== "") p.set("base", base);
  return `/api/market/opportunities/listings?${p.toString()}`;
}

/** One search + fetch per open (a fresh cache hit is free); 429/503 come back with their wait. */
function useListings(name: string, base: string) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const load = useCallback(() => {
    setState({ kind: "loading" });
    requestJson(listingsUrl(name, base), { method: "GET" }, listingsResponseSchema)
      .then((r) => {
        if (r.ok) setState({ kind: "done", data: r.data });
        else setState({ kind: "error", error: r.error, retryAt: r.retryAfterSec != null ? Date.now() + r.retryAfterSec * 1000 : null });
      })
      .catch((e: unknown) => {
        console.error("[opportunities] live listings failed", e);
        setState({ kind: "error", error: e instanceof Error ? e.message : String(e), retryAt: null });
      });
  }, [name, base]);
  useEffect(load, [load]);
  return { state, retry: load };
}

function Price({ price }: { price: LiveListing["price"] }) {
  if (price === null) return <span className="text-neutral-500" title="no buyout price">—</span>;
  const art = tradeCurrencyArt(price.currency);
  return (
    <span className="inline-flex items-center gap-1 font-semibold tabular-nums text-neutral-100">
      {price.amount.toLocaleString("en", { maximumFractionDigits: 2 })}
      {/* eslint-disable-next-line @next/next/no-img-element -- poecdn currency art */}
      {art ? <img src={art.art} alt={art.label} title={art.label} className="h-4 w-4 object-contain" /> : <span className="text-neutral-400">{price.currency}</span>}
    </span>
  );
}

function Rows({ data }: { data: ListingsResponse }) {
  return (
    <div className="space-y-1.5">
      {data.listings.length === 0 ? (
        <p className="text-xs text-neutral-400">No live listings with a buyout price right now.</p>
      ) : (
        <ul className="grid gap-1">
          {data.listings.map((l, i) => (
            <li key={i} className="flex items-center justify-between gap-3 text-xs" title={l.mods.join("\n") || undefined}>
              <Price price={l.price} />
              <span className="min-w-0 truncate text-neutral-400">
                {l.account}
                {l.online ? " · online" : ""}
                {l.indexed ? ` · ${ageSince(l.indexed)} ago` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
      <a href={data.searchUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300">
        open on trade site ({data.total.toLocaleString("en")} listed) <ExternalLink aria-hidden className="h-3 w-3" />
      </a>
    </div>
  );
}

function ErrorLine({ error, retryAt, retry }: { error: string; retryAt: number | null; retry: () => void }) {
  const wait = useCountdown(retryAt);
  return (
    <p role="alert" className="flex flex-wrap items-center gap-2 text-xs text-warn">
      <span>{error}</span>
      {retryAt !== null && wait > 0 && <span className="tabular-nums text-neutral-300">retry in {wait} s</span>}
      {retryAt !== null && wait === 0 && (
        <button type="button" onClick={retry} className="inline-flex items-center gap-1 rounded border border-line px-1.5 py-0.5 text-neutral-200 hover:border-amber-400/60">
          <RotateCw aria-hidden className="h-3 w-3" /> retry
        </button>
      )}
    </p>
  );
}

/** The expanded row of a rising unique: its cheapest live listings and a link to the full search. */
export function LiveListings({ name, base }: { name: string; base: string }) {
  const { state, retry } = useListings(name, base);
  if (state.kind === "loading") {
    return (
      <p className="flex items-center gap-1.5 py-1 text-xs text-neutral-400">
        <Loader2 aria-hidden className="h-3 w-3 animate-spin" /> loading live listings…
      </p>
    );
  }
  if (state.kind === "error") return <ErrorLine error={state.error} retryAt={state.retryAt} retry={retry} />;
  return <Rows data={state.data} />;
}
