"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check, Copy, SearchCode } from "lucide-react";
import { fmtSmart } from "../../../lib/format";
import { CELL, ROW_BASE, SCROLL_BOX, THEAD_STICKY, categoryColor } from "../../../lib/tableStyle";
import type { BuildResponse, CoveredView, DataAsOf, RegexChunkView, UncoveredView } from "../../../lib/tools/regexContract";
import { MatIcon } from "../../craft/craftView";

const NINJA_STALE_MIN = 120; // same red line as the header's MarketStatus
// Scout uniques refresh every ~6h, but only when a balance scan runs — a day old means nobody did.
const UNIQUES_STALE_MIN = 24 * 60;

function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function age(iso: string | null, now: number): { label: string; mins: number | null } {
  if (!iso) return { label: "never", mins: null };
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  return { label: mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`, mins };
}

function AgeChip({ name, iso, now, stale, title }: { name: string; iso: string | null; now: number; stale: boolean; title: string }) {
  const a = age(iso, now);
  const bad = stale || a.mins === null;
  return (
    <span
      title={`${title}${iso ? ` · ${new Date(iso).toLocaleString()}` : " · not loaded yet"}`}
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 ${bad ? "bg-bad/15 font-semibold text-bad" : "bg-neutral-800/70 text-neutral-400"}`}
    >
      {name} <span className="tabular-nums">{a.label}</span>
    </span>
  );
}

/** Source + age of every input, so a stale price is never mistaken for a live one. */
export function DataAgeStrip({ dataAsOf, league, namespaceSize }: { dataAsOf: DataAsOf; league: string; namespaceSize: number }) {
  const now = useNow();
  const ninja = age(dataAsOf.ninja, now);
  const uniques = age(dataAsOf.uniques, now);
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
      <span className="text-neutral-500" title="league these prices come from">{league}</span>
      <AgeChip name="ninja" iso={dataAsOf.ninja} now={now} stale={(ninja.mins ?? 0) >= NINJA_STALE_MIN} title="poe.ninja exchange prices" />
      <AgeChip name="uniques" iso={dataAsOf.uniques} now={now} stale={(uniques.mins ?? 0) >= UNIQUES_STALE_MIN} title="poe2scout unique prices (refreshed by balance scans, ~6h)" />
      <AgeChip name="trade2 ref" iso={dataAsOf.tradeMeta} now={now} stale={false} title="trade2 names, bases and mod texts used for collisions (24h cache)" />
      <span className="text-neutral-600" title="item names, uniques, bases and mod lines every fragment was checked against">
        {namespaceSize.toLocaleString("en-US")} lines checked
      </span>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      })
      .catch((e: unknown) => console.error("[tools/regex] copying the search string failed", e));
  };
  return (
    <button
      type="button"
      onClick={copy}
      title="copy to clipboard, paste into the stash search"
      className="inline-flex items-center gap-1 rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-good" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "copied" : "copy"}
    </button>
  );
}

function ChunkCard({ chunk, index, maxChars, onExplain }: {
  chunk: RegexChunkView;
  index: number;
  maxChars: number;
  onExplain: (text: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/20 bg-neutral-950/70 px-3 py-2">
      <span className="text-xs tabular-nums text-neutral-600">#{index + 1}</span>
      <code className="min-w-0 flex-1 break-all font-mono text-sm text-amber-200" title={`covers: ${chunk.covers.join(", ")}`}>
        {chunk.text}
      </code>
      <span className="text-xs tabular-nums text-neutral-500" title="characters used / limit">
        {chunk.chars}/{maxChars}
      </span>
      <button
        type="button"
        onClick={() => onExplain(chunk.text)}
        title="show what this string matches"
        className="rounded p-1 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
      >
        <SearchCode className="h-4 w-4" />
      </button>
      <CopyButton text={chunk.text} />
    </div>
  );
}

function ValueCell({ div, perUnit }: { div: number; perUnit: boolean }) {
  return (
    <td className={`${CELL} text-right tabular-nums text-neutral-200`} title={perUnit ? "per unit — a stack is worth more" : "per item"}>
      {fmtSmart(div)} <span className="text-neutral-500">div{perUnit ? "/u" : ""}</span>
    </td>
  );
}

function CoveredRow({ row }: { row: CoveredView }) {
  const tone = row.kind === "unique" ? "bg-orange-700/20 text-orange-300" : categoryColor(row.category ?? "");
  return (
    <tr className={ROW_BASE}>
      <td className={CELL}>
        <span className="flex items-center gap-2">
          <MatIcon icon={row.icon} size={6} />
          <span className="text-neutral-100">{row.name}</span>
          <span className={`rounded px-1.5 text-[10px] ${tone}`}>{row.kind === "unique" ? "Unique" : row.category}</span>
        </span>
      </td>
      <ValueCell div={row.valueDiv} perUnit={row.perUnit} />
      <td className={`${CELL} font-mono text-amber-200`}>
        {row.fragment}
        {row.verify && (
          <span
            title={row.collisions.length > 0 ? `also matches: ${row.collisions.join(" · ")}` : "escaped full name — check the in-game search accepts it"}
            className="ml-2 inline-flex items-center gap-1 rounded bg-warn/15 px-1.5 font-sans text-[10px] font-semibold text-warn"
          >
            <AlertTriangle className="h-3 w-3" /> verify
          </span>
        )}
      </td>
    </tr>
  );
}

function CoveredTable({ rows }: { rows: CoveredView[] }) {
  if (rows.length === 0) return null;
  return (
    <div className={SCROLL_BOX}>
      <table className="w-full text-sm">
        <thead className={THEAD_STICKY}>
          <tr>
            <th className={CELL}>Item ({rows.length})</th>
            <th className={`${CELL} text-right`}>Value</th>
            <th className={CELL}>Matched by</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <CoveredRow key={r.name} row={r} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UncoveredList({ rows }: { rows: UncoveredView[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="rounded-md border border-bad/30 bg-bad/[0.04] px-3 py-2 text-xs">
      <div className="mb-1 font-semibold text-bad">Not in any string ({rows.length})</div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {rows.map((r) => (
          <li key={r.name} title={r.detail} className="flex items-center gap-1.5 text-neutral-300">
            <MatIcon icon={r.icon} size={4} />
            {r.name} <span className="tabular-nums text-neutral-500">{fmtSmart(r.valueDiv)} div</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RegexOutput({ result, maxChars, onExplain }: {
  result: BuildResponse;
  maxChars: number;
  onExplain: (text: string) => void;
}) {
  if (result.reason !== null) {
    return <div className="rounded-md border border-neutral-800 px-3 py-2 text-sm text-neutral-500">Nothing to search for: {result.reason}.</div>;
  }
  return (
    <div className="flex flex-col gap-3">
      {result.warnings.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {result.warnings.map((w) => (
            <span key={w.code} title={w.detail} className="inline-flex items-center gap-1 rounded bg-warn/15 px-2 py-0.5 text-xs font-semibold text-warn">
              <AlertTriangle className="h-3.5 w-3.5" /> {w.label}
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        {result.chunks.map((c, i) => (
          <ChunkCard key={c.text} chunk={c} index={i} maxChars={maxChars} onExplain={onExplain} />
        ))}
      </div>
      <UncoveredList rows={result.uncovered} />
      <CoveredTable rows={result.covered} />
    </div>
  );
}
