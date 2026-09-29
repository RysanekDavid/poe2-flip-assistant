"use client";

import { useEffect, useState } from "react";
import { Check, ExternalLink, Link2, RotateCcw } from "lucide-react";
import { Tooltip } from "../../ui/Tooltip";
import { requestRegexApi } from "../../../lib/tools/regexContract";
import type { TabSelection } from "../../../lib/tools/regexPoolContract";
import { shareUrl } from "../../../lib/tools/regexShareUrl";
import { TradeLinkResponseSchema, type TradeLinkPlan, type TradeLinkRequest, type TradeLinkResponse } from "../../../lib/tools/regexTradeContract";
import { writeClipboard } from "./clipboard";
import { TOOL_BUTTON } from "./Popover";

const TRADE_DEBOUNCE_MS = 400;

// The band's big buttons share one height (h-16), so Copy / Trade / Clear read as one row of actions.
export const BIG_BUTTON = "inline-flex h-16 shrink-0 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300";
const TRADE_CLASS = `${BIG_BUTTON} flex-1 border border-neutral-700 bg-neutral-900 text-neutral-200 hover:border-neutral-500 hover:text-neutral-100 md:flex-none`;

/** Copies `?tab=regex&tool=<tab>&s=…` for the current selection; an over-long selection says so. */
export function ShareButton({ selection }: { selection: TabSelection }) {
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const share = () => {
    let url: string;
    try {
      url = shareUrl(window.location.origin, window.location.pathname, selection);
    } catch (error: unknown) {
      setNote({ ok: false, text: error instanceof Error ? error.message : String(error) });
      return;
    }
    writeClipboard(url)
      .then(() => setNote({ ok: true, text: "link copied" }))
      .catch((e: unknown) => {
        console.error("[tools/regex] copying the share link failed", e);
        setNote({ ok: false, text: `copy failed — link: ${url}` });
      });
  };
  useEffect(() => {
    if (!note?.ok) return;
    const t = window.setTimeout(() => setNote(null), 1600);
    return () => window.clearTimeout(t);
  }, [note]);
  return (
    <span className="inline-flex items-center gap-1.5">
      <button type="button" onClick={share} aria-label="copy share link" title="copy a link that reopens this exact selection" className={TOOL_BUTTON}>
        {note?.ok ? <Check aria-hidden className="h-3.5 w-3.5 text-good" /> : <Link2 aria-hidden className="h-3.5 w-3.5" />}
        <span className="hidden sm:inline">Share</span>
      </button>
      {note && <span role="status" className={`max-w-xs break-all text-xs ${note.ok ? "text-good" : "text-bad"}`}>{note.text}</span>}
    </span>
  );
}

type TradeState = { status: "idle" } | { status: "loading" } | { status: "ready"; link: TradeLinkResponse } | { status: "error"; message: string };

/** Prefetched so the button is a plain link (a window opened after an await gets popup-blocked). */
function useTradeLink(request: TradeLinkRequest | null): TradeState {
  const [state, setState] = useState<TradeState>({ status: "idle" });
  const key = request ? JSON.stringify(request) : null;
  useEffect(() => {
    if (key === null) {
      setState({ status: "idle" });
      return;
    }
    let live = true;
    setState({ status: "loading" });
    const t = window.setTimeout(() => {
      requestRegexApi("/api/tools/regex/trade-link", { method: "POST", body: JSON.parse(key) as unknown }, TradeLinkResponseSchema)
        .then((link) => live && setState({ status: "ready", link }))
        .catch((e: unknown) => live && setState({ status: "error", message: e instanceof Error ? e.message : String(e) }));
    }, TRADE_DEBOUNCE_MS);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [key]);
  return state;
}

function NotOnTrade({ items }: { items: readonly string[] }) {
  if (items.length === 0) return null;
  return (
    <span className="absolute -top-2 right-1.5">
      <Tooltip tip={`The trade search ignores: ${items.join(" · ")}.`} side="bottom" align="end">
        <span className="rounded bg-neutral-950 px-1.5 text-xs font-semibold text-warn ring-1 ring-warn/40">{items.length} not on trade</span>
      </Tooltip>
    </span>
  );
}

/** "Trade": the selection as a trade2 search — reference data only, no search budget. */
export function TradeLinkButton({ plan }: { plan: TradeLinkPlan | null }) {
  const state = useTradeLink(plan?.request ?? null);
  const dropped = plan?.dropped ?? [];
  if (state.status !== "ready") {
    const why = state.status === "error" ? `trade link failed: ${state.message}` : state.status === "loading" ? "preparing the trade link…" : "mark a mod or set a filter first";
    return (
      <span className="relative flex flex-1 md:flex-none">
        <button type="button" disabled title={why} className={`${TRADE_CLASS} cursor-not-allowed opacity-50`}>
          <ExternalLink aria-hidden className="h-4 w-4" /> Trade
        </button>
        {state.status === "error" && (
          <span role="alert" title={state.message} className="absolute -top-2 right-1.5 rounded bg-neutral-950 px-1.5 text-xs font-semibold text-bad ring-1 ring-bad/40">
            link failed
          </span>
        )}
      </span>
    );
  }
  const { link } = state;
  return (
    <span className="relative flex flex-1 md:flex-none">
      <a href={link.url} target="_blank" rel="noopener noreferrer" className={TRADE_CLASS} title={`open this search on the trade site (${link.league}, cheapest first)`}>
        <ExternalLink aria-hidden className="h-4 w-4" /> Trade
      </a>
      <NotOnTrade items={[...dropped, ...link.unmatched]} />
    </span>
  );
}

export function ResetButton({ onReset }: { onReset: () => void }) {
  return (
    <button
      type="button"
      onClick={onReset}
      title="clear every Avoid / Want mark and filter"
      className={`${BIG_BUTTON} flex-1 border border-line text-neutral-300 hover:bg-neutral-800/60 hover:text-neutral-100 md:flex-none`}
    >
      <RotateCcw aria-hidden className="h-4 w-4" /> Clear
    </button>
  );
}
