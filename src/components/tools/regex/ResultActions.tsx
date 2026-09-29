"use client";

import { useEffect, useState } from "react";
import { ExternalLink, RotateCcw, Share2 } from "lucide-react";
import { Button } from "../../ui/Button";
import { Tooltip } from "../../ui/Tooltip";
import { requestRegexApi } from "../../../lib/tools/regexContract";
import type { TabSelection } from "../../../lib/tools/regexPoolContract";
import { shareUrl } from "../../../lib/tools/regexShareUrl";
import { TradeLinkResponseSchema, type TradeLinkPlan, type TradeLinkRequest, type TradeLinkResponse } from "../../../lib/tools/regexTradeContract";
import { writeClipboard } from "./clipboard";

const TRADE_DEBOUNCE_MS = 400;

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
      <Button variant="secondary" size="md" onClick={share} title="copy a link that reopens this exact selection">
        <Share2 aria-hidden className="h-4 w-4" /> Share
      </Button>
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

const LINK_CLASS =
  "inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-neutral-700 bg-neutral-900 px-3.5 text-sm font-medium text-neutral-200 hover:border-neutral-500 hover:text-neutral-100";

function NotOnTrade({ items }: { items: readonly string[] }) {
  if (items.length === 0) return null;
  return (
    <Tooltip tip={`The trade search ignores: ${items.join(" · ")}.`} side="bottom" align="end">
      <span className="rounded bg-warn/15 px-1.5 py-0.5 text-xs font-semibold text-warn">{items.length} not on trade</span>
    </Tooltip>
  );
}

/** "Search on trade": the selection as a trade2 search — reference data only, no search budget. */
export function TradeLinkButton({ plan }: { plan: TradeLinkPlan | null }) {
  const state = useTradeLink(plan?.request ?? null);
  const dropped = plan?.dropped ?? [];
  if (state.status !== "ready") {
    const why = state.status === "error" ? state.message : state.status === "loading" ? "preparing the trade link…" : "mark a mod or set a filter first";
    return (
      <span className="inline-flex items-center gap-1.5">
        <Button variant="secondary" size="md" disabled title={why}>
          <ExternalLink aria-hidden className="h-4 w-4" /> Search on trade
        </Button>
        {state.status === "error" && <span className="text-xs text-bad">trade link failed</span>}
      </span>
    );
  }
  const { link } = state;
  return (
    <span className="inline-flex items-center gap-1.5">
      <a href={link.url} target="_blank" rel="noopener noreferrer" className={LINK_CLASS} title={`trade2 search in ${link.league}, cheapest first`}>
        <ExternalLink aria-hidden className="h-4 w-4" /> Search on trade
      </a>
      <NotOnTrade items={[...dropped, ...link.unmatched]} />
    </span>
  );
}

export function ResetButton({ onReset }: { onReset: () => void }) {
  return (
    <Button variant="ghost" size="md" onClick={onReset} title="clear every Want/Avoid mark and filter">
      <RotateCcw aria-hidden className="h-4 w-4" /> Reset
    </Button>
  );
}
