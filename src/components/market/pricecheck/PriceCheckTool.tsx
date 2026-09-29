"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PRICE_CHECK_MAX_TEXT, type PriceCheckLiveResponse, type PriceCheckResponse } from "../../../lib/priceCheckContract";
import { Button } from "../../ui/Button";
import { PasteBox, usePasteAutoRead } from "../../ui/PasteBox";
import { useCountdown } from "../../ui/useCountdown";
import { SellHint } from "./SellHint";
import { useLiveValue, usePriceCheck, type LiveView } from "./usePriceCheck";
import { ValueCard } from "./ValueCard";

const LINK_CLASS =
  "inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-md border border-neutral-700 bg-neutral-900 px-2.5 text-xs font-medium text-neutral-200 transition-colors hover:border-neutral-500 hover:text-neutral-100";

function liveLabel(live: LiveView, wait: number): string {
  if (live.kind === "loading") return "searching…";
  if (wait > 0) return `retry in ${wait}s`;
  return "value live · 1 search";
}

/** A link that cannot go anywhere for this item: a disabled button whose reason assistive tech reads too. */
function DisabledAction({ label, reason }: { label: string; reason: string }) {
  const id = useId();
  return (
    <>
      <Button size="sm" disabled aria-describedby={id} title={reason}>
        {label}
      </Button>
      <span id={id} className="sr-only">
        {reason}
      </span>
    </>
  );
}

function LiveButton({ r, live, onLive }: { r: PriceCheckResponse; live: LiveView; onLive: () => void }) {
  const reasonId = useId();
  const wait = useCountdown(live.kind === "error" ? live.retryAt : null);
  const blocked = !r.live.allowed;
  return (
    <>
      <Button
        size="sm"
        onClick={onLive}
        disabled={blocked || live.kind === "loading" || wait > 0}
        aria-describedby={blocked && r.live.reason ? reasonId : undefined}
        title={blocked ? (r.live.reason ?? undefined) : "spends one trade2 search + one fetch with your own POESESSID"}
      >
        {liveLabel(live, wait)}
      </Button>
      {blocked && r.live.reason && (
        <p id={reasonId} className="order-last w-full text-xs text-neutral-400">
          {r.live.reason}
        </p>
      )}
    </>
  );
}

function LiveOutcome({ live }: { live: LiveView }) {
  if (live.kind === "error") {
    return (
      <p role="alert" className="text-sm text-bad">
        {live.error}
      </p>
    );
  }
  if (live.kind !== "done") return null;
  return (
    <p className="text-xs text-neutral-400">
      {live.v.valueDiv == null && `${live.v.hint.reason} · `}
      <a href={live.v.searchUrl} target="_blank" rel="noreferrer" className="text-sky-400 hover:underline">
        open the live search
      </a>
    </p>
  );
}

function Actions({ r, live, onLive }: { r: PriceCheckResponse; live: LiveView; onLive: () => void }) {
  const pathname = usePathname();
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <LiveButton r={r} live={live} onLive={onLive} />
        {r.tradeUrl ? (
          <a href={r.tradeUrl} target="_blank" rel="noreferrer" className={LINK_CLASS} title="prefilled trade-site search — no request spent">
            open trade
          </a>
        ) : (
          <DisabledAction
            label="open trade"
            reason={
              r.kind === "currency" ? "exchange items sell on the in-game Currency Exchange, not the trade site" : "nothing to search the trade site for"
            }
          />
        )}
        {r.craftQuery ? (
          <Link href={`${pathname}${r.craftQuery}`} className={LINK_CLASS} title="open this item in Craft › Paste item">
            craft this →
          </Link>
        ) : (
          <DisabledAction
            label="craft this →"
            reason={r.kind === "currency" ? "nothing to craft on a stackable" : "item text is too long for a link"}
          />
        )}
      </div>
      <LiveOutcome live={live} />
    </div>
  );
}

/** A live value replaces the base hint only when it priced something; "no comparables" keeps the reference. */
function shownHint(r: PriceCheckResponse, live: PriceCheckLiveResponse | null) {
  return live != null && live.valueDiv != null ? live.hint : r.hint;
}

function Result({ text, r }: { text: string; r: PriceCheckResponse }) {
  const { live, run } = useLiveValue(text);
  const liveValue = live.kind === "done" ? live.v : null;
  return (
    <div className="flex flex-col gap-3">
      <ValueCard r={r} live={liveValue} />
      <SellHint hint={shownHint(r, liveValue)} ex={r.exPerDiv} />
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
