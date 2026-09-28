"use client";

import { ExternalLink } from "lucide-react";
import type { Confidence, Rate } from "../../../core/tools/bossEv/schema";
import type { LootLineView, ResolvedPrice } from "../../../lib/tools/bossEvContract";
import { fmtDivOrEx } from "../../../lib/format";

/* Formatting shared by the Boss EV panel. Lives in the leaf component so the table and the detail
 * view import it without a cycle through BossEvTool. */

/** "1 in 40" for a per-kill probability; "every kill" at ≥1. */
export function oneIn(p: number): string {
  if (p >= 1) return "every kill";
  if (!(p > 0)) return "never";
  const n = 1 / p;
  return `1 in ${n >= 10 ? Math.round(n).toLocaleString("en-US") : n.toFixed(1)}`;
}

export function fmtRate(rate: Rate): string {
  switch (rate.kind) {
    case "guaranteed":
      return "guaranteed";
    case "point":
      return oneIn(rate.p);
    case "range":
      return `${oneIn(rate.hi)} – ${oneIn(rate.lo)}`;
    case "unknown":
      return "rate unknown";
  }
}

/** Amount in div (≥1) or ex (below), with an explicit sign for net values. */
export function fmtDiv(div: number, exPerDiv: number, signed = false): string {
  if (div === 0) return "0";
  const body = fmtDivOrEx(Math.abs(div), exPerDiv);
  if (!signed) return div < 0 ? `−${body}` : body;
  return `${div < 0 ? "−" : "+"}${body}`;
}

export function fmtAge(hours: number | null): string {
  if (hours == null) return "age unknown";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m old`;
  if (hours < 48) return `${Math.round(hours)}h old`;
  return `${Math.round(hours / 24)}d old`;
}

export function ageTone(hours: number | null): string {
  if (hours == null || hours >= 48) return "text-bad";
  if (hours >= 6) return "text-warn";
  return "text-neutral-500";
}

const SOURCE_LABEL: Record<ResolvedPrice["source"], string> = {
  ninja: "poe.ninja exchange",
  scout: "poe2scout — cheapest listing, any roll",
  manual: "hand-entered price",
};

/** Price with a source/age tooltip; unpriced shows why. */
export function PriceCell({ price, exPerDiv, reason }: { price: ResolvedPrice | null; exPerDiv: number; reason?: string | null }) {
  if (!price) {
    return (
      <span className="text-neutral-600" title={reason ?? "no market price found"}>
        unpriced
      </span>
    );
  }
  return (
    <span title={`${SOURCE_LABEL[price.source]} · ${fmtAge(price.ageHours)}`} className="inline-flex items-baseline gap-1.5">
      <span className="tabular-nums text-neutral-200">{fmtDiv(price.div, exPerDiv)}</span>
      <span className={`text-[10px] uppercase tracking-wider ${ageTone(price.ageHours)}`}>{price.source}</span>
    </span>
  );
}

const CONFIDENCE_STYLE: Record<Confidence, string> = {
  confirmed: "border-good/40 text-good",
  "single-source": "border-warn/40 text-warn",
  unverified: "border-bad/40 text-bad",
};

const CONFIDENCE_HINT: Record<Confidence, string> = {
  confirmed: "two or more independent sources agree",
  "single-source": "one source only",
  unverified: "contradicted, self-flagged as a guess, or a small sample",
};

export function ConfidenceChip({ confidence }: { confidence: Confidence }) {
  return (
    <span title={CONFIDENCE_HINT[confidence]} className={`rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${CONFIDENCE_STYLE[confidence]}`}>
      {confidence}
    </span>
  );
}

function evCell(line: LootLineView, exPerDiv: number): { text: string; title: string } {
  if (line.evDiv != null) return { text: fmtDiv(line.evDiv, exPerDiv), title: "price × rate, per kill" };
  if (line.evLowDiv != null && line.evHighDiv != null) {
    return { text: `${fmtDiv(line.evLowDiv, exPerDiv)} – ${fmtDiv(line.evHighDiv, exPerDiv)}`, title: "range rate: counted only in the EV range" };
  }
  return { text: "—", title: line.price == null ? "no price — excluded from EV" : "no known rate — excluded from EV" };
}

/** One drop in the detail table: price (source + age), rate, EV share, confidence, citation. */
export function LootRow({ line, exPerDiv }: { line: LootLineView; exPerDiv: number }) {
  const ev = evCell(line, exPerDiv);
  return (
    <tr className="border-t border-neutral-800/70">
      <td className="px-2 py-1.5 text-neutral-200">{line.name}</td>
      <td className="px-2 py-1.5">
        <PriceCell price={line.price} exPerDiv={exPerDiv} reason={line.unpricedReason} />
      </td>
      <td className={`px-2 py-1.5 tabular-nums ${line.rate.kind === "unknown" ? "text-neutral-600" : "text-neutral-300"}`}>{fmtRate(line.rate)}</td>
      <td className="px-2 py-1.5 tabular-nums text-neutral-300" title={ev.title}>
        {ev.text}
      </td>
      <td className="px-2 py-1.5">
        <ConfidenceChip confidence={line.confidence} />
      </td>
      <td className="px-2 py-1.5">
        <a
          href={line.source.url}
          target="_blank"
          rel="noreferrer"
          title={`${line.source.title} · accessed ${line.source.accessed}`}
          className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-200"
        >
          <ExternalLink className="h-3 w-3" />
          {line.source.accessed}
        </a>
      </td>
    </tr>
  );
}
