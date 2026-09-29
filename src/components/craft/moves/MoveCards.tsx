"use client";

import { useState } from "react";
import { familyLabel } from "../../../core/tools/craftmoves/rank";
import type { CraftMovesResponse, RankedMoveView } from "../../../lib/tools/craftMovesContract";
import { Button } from "../../ui/Button";
import { PriceChip } from "../../ui/PriceChip";
import { evLabel, MatIcon, priceLabel } from "../craftView";
import { fetchLiveValue, useCountdown, type LiveState } from "./SellAsIsCard";

const TIER_LABEL: Record<RankedMoveView["tier"], string> = {
  1: "aimed add",
  2: "random add",
  3: "frees a slot",
};

type Odds = CraftMovesResponse["odds"];

/** No odds of our own: PoE2 mod weights are not public, so the card links the estimators instead. */
function OddsLine({ odds }: { odds: Odds }) {
  return (
    <p className="text-xs text-neutral-400">
      odds: not public —{" "}
      {odds.map((o, i) => (
        <span key={o.url}>
          {i > 0 && " / "}
          <a href={o.url} target="_blank" rel="noreferrer" className="text-sky-400 hover:underline" title={o.label}>
            {o.label.split(" — ")[0]}
          </a>
        </span>
      ))}
    </p>
  );
}

interface ValueProps {
  card: RankedMoveView;
  text: string;
  ex: number | null;
  asIsDiv: number | null;
}

/** "value if hit" on demand (one search), and the net only when BOTH the hit and the as-is value exist. */
function OutcomeValue({ card, text, ex, asIsDiv }: ValueProps) {
  const [live, setLive] = useState<LiveState>({ kind: "idle" });
  const wait = useCountdown(live.kind === "error" ? live.retryAt : null);
  const target = card.targetFamily;
  if (!target) return null;
  const line = (target.topReachable ?? target.best).text;
  const run = async (): Promise<void> => {
    setLive({ kind: "loading" });
    setLive(await fetchLiveValue(text, line));
  };
  const hit = live.kind === "done" ? live.v.valueDiv : null;
  const cost = card.move.totalDiv;
  const net = hit != null && asIsDiv != null && cost != null ? hit - cost - asIsDiv : null;
  return (
    <div className="grid gap-1 border-t border-line pt-2">
      {live.kind !== "done" && (
        <Button size="sm" onClick={() => void run()} disabled={live.kind === "loading" || wait > 0} title={`values the item plus "${line}" at its lowest roll — one trade2 search + one fetch`}>
          {live.kind === "loading" ? "searching…" : wait > 0 ? `retry in ${wait}s` : "value this outcome · 1 search"}
        </Button>
      )}
      {live.kind === "error" && <p className="text-sm text-bad">{live.error}</p>}
      {live.kind === "done" && (
        <p className="text-sm text-neutral-300">
          if it hits: <span className="tabular-nums text-neutral-100">{hit == null ? "no comparables" : priceLabel(hit, ex)}</span>{" "}
          <a href={live.v.searchUrl} target="_blank" rel="noreferrer" className="text-xs text-sky-400 hover:underline">
            search
          </a>
        </p>
      )}
      {net != null && (
        <p className="text-sm" title="value if it hits − move cost − value as-is; not odds-weighted (odds are not public)">
          net if it hits <span className={`font-semibold tabular-nums ${net >= 0 ? "text-good" : "text-bad"}`}>{evLabel(net, ex)}</span>
        </p>
      )}
      {live.kind === "done" && net == null && hit != null && <p className="text-xs text-neutral-400">value the item as-is (left) to see the net</p>}
    </div>
  );
}

function MoveCard({ card, rank, text, ex, asIsDiv, odds }: ValueProps & { rank: number; odds: Odds }) {
  const m = card.move;
  const aim = card.targetFamily;
  return (
    <article className="flex flex-col gap-2 rounded-lg border border-line bg-neutral-950/60 p-3">
      <header className="flex items-start gap-2">
        <span className="rounded border border-amber-400/40 px-1.5 text-xs tabular-nums text-amber-200">
          {rank} · {TIER_LABEL[card.tier]}
        </span>
        <span className="flex shrink-0 -space-x-1">
          {m.materials.map((x) => (
            <span key={x.key} title={x.label}>
              <MatIcon icon={x.icon} size={6} />
            </span>
          ))}
        </span>
      </header>
      <h4 className="text-sm font-semibold text-neutral-100">{m.label}</h4>
      <p className="text-sm text-neutral-300">{card.why}</p>
      {aim?.topReachable && (
        <p className="text-xs text-neutral-400" title={`best tier in the game: ${familyLabel({ ...aim, topReachable: null })} (needs ilvl ${aim.best.level})`}>
          tier {aim.topReachable.rank} of {aim.tiers} is the best this item level rolls
        </p>
      )}
      <p className="flex items-center gap-2 text-sm text-neutral-400">
        cost <PriceChip div={m.totalDiv} exPerDiv={ex} source="ninja" />
        {m.floor != null && <span className="text-xs" title={`cannot roll tiers below modifier level ${m.floor} (soft floor)`}>≥ lvl {m.floor}</span>}
      </p>
      <OddsLine odds={odds} />
      <OutcomeValue card={card} text={text} ex={ex} asIsDiv={asIsDiv} />
    </article>
  );
}

/** The top three moves as cards, best first — or why there are none. Remount per read (key) so an
 *  outcome value never carries over to another item. */
export function MoveCards({ r, text, asIsDiv }: { r: CraftMovesResponse; text: string; asIsDiv: number | null }) {
  if (r.locked) return <p className="rounded-lg border border-red-900/60 bg-red-950/20 px-3 py-2 text-sm text-red-300">No moves: {r.locked}</p>;
  if (r.ranked.length === 0) {
    return <p className="text-sm text-neutral-400">No safe next move to recommend — open the full legal list below.</p>;
  }
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {r.ranked.map((card, i) => (
        <MoveCard key={card.move.id} card={card} rank={i + 1} text={text} ex={r.rates.exaltPerDivine} asIsDiv={asIsDiv} odds={r.odds} />
      ))}
    </div>
  );
}
