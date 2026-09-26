"use client";

import type { HeartbeatView } from "../../lib/systemHealthContract";
import { STATUS_TONE, TONE_DOT, TONE_TEXT, ageOf, formatDuration, formatSeconds } from "./healthTone";

const STATUS_TEXT: Record<HeartbeatView["status"], string> = {
  ok: "ok",
  failing: "failing",
  stale: "stale",
  never: "no run yet",
  idle: "idle league",
  disabled: "off",
};

function cadenceTip(row: HeartbeatView): string {
  if (row.expectedSec == null) return "on demand — never stale";
  return `expected every ${formatSeconds(row.expectedSec)} · stale after ${formatSeconds(row.staleAfterSec ?? row.expectedSec)} without a success`;
}

function ErrorCell({ row, nowMs }: { row: HeartbeatView; nowMs: number }) {
  if (row.lastError == null) return <span className="text-neutral-700">—</span>;
  // Only a CURRENT failure is red; a recovered one stays readable but quiet.
  const current = row.status === "failing";
  return (
    <span className={`block max-w-[22rem] truncate ${current ? "text-bad" : "text-neutral-500"}`} title={row.lastError}>
      {ageOf(row.lastErrorAt, nowMs)} · {row.lastError}
    </span>
  );
}

function HeartbeatRow({ row, nowMs }: { row: HeartbeatView; nowMs: number }) {
  const tone = STATUS_TONE[row.status];
  return (
    <tr className="border-t border-neutral-800/60">
      <td className="py-1 pr-3" title={row.hint}>
        <span className="text-neutral-200">{row.label}</span>
        {row.league && <span className="ml-1.5 text-neutral-500">{row.league}</span>}
      </td>
      <td className="py-1 pr-3 whitespace-nowrap" title={cadenceTip(row)}>
        <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${TONE_DOT[tone]}`} />
        <span className={TONE_TEXT[tone]}>{STATUS_TEXT[row.status]}</span>
      </td>
      <td className="py-1 pr-3 text-right tabular-nums text-neutral-300" title={row.lastOkAt ?? "never succeeded"}>
        {ageOf(row.lastOkAt, nowMs)}
      </td>
      <td className="py-1 pr-3 text-right tabular-nums text-neutral-400" title="duration of the latest run">
        {formatDuration(row.durationMs)}
      </td>
      <td className="py-1 pr-3 text-right tabular-nums text-neutral-500">{row.runs}</td>
      <td className="py-1">
        <ErrorCell row={row} nowMs={nowMs} />
      </td>
    </tr>
  );
}

/** One dense row per poller loop (per league where the loop is per league). */
export function HeartbeatTable({ rows, nowMs }: { rows: HeartbeatView[]; nowMs: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-left text-[10px] uppercase tracking-wider text-neutral-500">
          <tr>
            <th className="py-1 pr-3 font-medium">Loop</th>
            <th className="py-1 pr-3 font-medium">State</th>
            <th className="py-1 pr-3 text-right font-medium" title="time since the last successful run">Last ok</th>
            <th className="py-1 pr-3 text-right font-medium">Took</th>
            <th className="py-1 pr-3 text-right font-medium" title="runs recorded since the row was created">Runs</th>
            <th className="py-1 font-medium">Last error</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <HeartbeatRow key={`${row.name}|${row.league}`} row={row} nowMs={nowMs} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
