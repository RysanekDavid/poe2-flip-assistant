"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PRICE_CHECK_MAX_TEXT, type PriceCheckResponse } from "../../../lib/priceCheckContract";
import { useCountdown } from "../../craft/moves/SellAsIsCard";
import { Button } from "../../ui/Button";
import { PasteBox, usePasteAutoRead } from "../../ui/PasteBox";
import { SellHint } from "./SellHint";
import { useLiveValue, usePriceCheck, type LiveView } from "./usePriceCheck";
import { ValueCard } from "./ValueCard";

const LINK_CLASS =
  "inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-md border border-neutral-700 bg-neutral-900 px-2.5 text-xs font-medium text-neutral-200 transition-colors hover:border-neutral-500 hover:text-neutral-100";
const OFF_CLASS = "inline-flex h-7 items-center rounded-md border border-neutral-800 px-2.5 text-xs text-neutral-500";

function liveLabel(live: LiveView, wait: number): string {
  if (live.kind === "loading") return "searching…";
  if (wait > 0) return `retry in ${wait}s`;
  return "value live · 1 search";
}

function Actions({ r, live, onLive }: { r: PriceCheckResponse; live: LiveView; onLive: () => void }) {
  const pathname = usePathname();
  const wait = useCountdown(live.kind === "error" ? live.retryAt : null);
  const liveTitle = r.live.allowed ? "spends one trade2 search + one fetch with your own POESESSID" : (r.live.reason ?? undefined);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={onLive} disabled={!r.live.allowed || live.kind === "loading" || wait > 0} title={liveTitle}>
          {liveLabel(live, wait)}
        </Button>
        {r.tradeUrl ? (
          <a href={r.tradeUrl} target="_blank" rel="noreferrer" className={LINK_CLASS} title="prefilled trade-site search — no request spent">
            open trade
          </a>
        ) : (
          <span className={OFF_CLASS} title="exchange items sell on the in-game Currency Exchange, not the trade site">
            open trade
          </span>
        )}
        {r.craftQuery ? (
          <Link href={`${pathname}${r.craftQuery}`} className={LINK_CLASS} title="open this item in Craft › Paste item">
            craft this →
          </Link>
        ) : (
          <span className={OFF_CLASS} title={r.kind === "currency" ? "nothing to craft on a stackable" : "item text is too long for a link"}>
            craft this →
          </span>
        )}
      </div>
      {!r.live.allowed && r.live.reason && <p className="text-xs text-neutral-400">{r.live.reason}</p>}
      {live.kind === "done" && (
        <a href={live.v.searchUrl} target="_blank" rel="noreferrer" className="text-xs text-sky-400 hover:underline">
          open the live search
        </a>
      )}
      {live.kind === "error" && (
        <p role="alert" className="text-sm text-bad">
          {live.error}
        </p>
      )}
    </div>
  );
}

function Result({ text, r }: { text: string; r: PriceCheckResponse }) {
  const { live, run } = useLiveValue(text);
  const liveValue = live.kind === "done" ? live.v : null;
  return (
    <div className="flex flex-col gap-3">
      <ValueCard r={r} live={liveValue} />
      <SellHint hint={liveValue?.hint ?? r.hint} ex={r.exPerDiv} />
      <Actions r={r} live={live} onLive={() => void run()} />
    </div>
  );
}

/** Paste an item → what it is worth, where that number came from, and how to sell it. */
export function PriceCheckTool() {
  const [text, setText] = useState("");
  const { view, read, lastRead } = usePriceCheck();
  usePasteAutoRead(text, read, lastRead);
  return (
    <section className="flex flex-col gap-3">
      <PasteBox
        text={text}
        setText={setText}
        busy={view.kind === "loading"}
        onRead={() => void read(text)}
        compact={view.kind === "done"}
        maxLength={PRICE_CHECK_MAX_TEXT}
        readLabel="Price check"
      />
      {view.kind === "error" && (
        <p role="alert" className="text-sm text-bad">
          {view.error}
        </p>
      )}
      {view.kind === "done" && <Result key={view.seq} text={view.text} r={view.r} />}
    </section>
  );
}
