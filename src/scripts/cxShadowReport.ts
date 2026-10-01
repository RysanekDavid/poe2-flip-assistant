/* CX-derived shadow prices vs poe.ninja for one league over the newest N digest hours.
 * Run: npm run cx:shadow-report -- [--league "Forbidden Rites"] [--hours 168] [--json]
 * Reads DB_PATH (config). Owner decision aid for the exchange-price cutover; no network. */
import { parseArgs } from "node:util";
import { loadCxShadowReport } from "../core/cx/cxPriceShadow";
import type { CxShadowReport, DeviationStats } from "../core/cx/cxShadowReport";
import { getDefaultLeague } from "../core/leagueState";
import { getDb } from "../db/database";

const { values } = parseArgs({
  options: {
    league: { type: "string" },
    hours: { type: "string", default: "168" },
    json: { type: "boolean", default: false },
  },
});

const hours = Number(values.hours);
const league = values.league ?? getDefaultLeague();
const report = loadCxShadowReport(league, hours);
console.log(values.json ? JSON.stringify(report, null, 2) : formatReport(report).join("\n"));
getDb().close();

function pct(v: number | null): string {
  return v == null ? "—" : `${v.toFixed(1)}%`;
}

function statsLine(label: string, s: DeviationStats): string {
  return `  ${label.padEnd(10)} n=${String(s.n).padStart(6)}  median |dev| ${pct(s.medianAbsPct).padStart(7)}  p90 ${pct(s.p90AbsPct).padStart(7)}  median signed ${pct(s.medianSignedPct).padStart(7)}`;
}

function hourText(h: number | null): string {
  return h == null ? "—" : new Date(h * 1000).toISOString().slice(0, 16).replace("T", " ");
}

function formatReport(r: CxShadowReport): string[] {
  const c = r.coverage;
  const lines = [
    `CX shadow vs poe.ninja — ${r.league}, last ${r.hoursRequested}h (${r.hoursComputed} digest hour(s) computed, ${hourText(r.fromHour)} → ${hourText(r.toHour)} UTC, hour = end of traded hour)`,
    "",
    "Coverage (items):",
    `  CX traded ${c.cxTraded} · CX carried only ${c.cxCarriedOnly} · ninja ${c.ninja} · both ${c.both}`,
    `  ninja only ${c.ninjaOnly.length} · CX only ${c.cxOnly.length} · digest ids missing from the entity catalog ${c.unmapped.length}`,
    "",
    "Deviation cx/ninja − 1 (per item-hour):",
    statsLine("traded", r.traded),
    ...(["direct", "bridge", "carried"] as const).map((m) => statsLine(m, r.byMethod[m])),
    "By Divine filled on the priced leg (traded):",
    ...r.byLiquidity.map((t) => statsLine(t.tier, t)),
    "",
    `Worst ${r.outliers.length} items by median |dev| (traded hours):`,
    ...r.outliers.map(
      (o) =>
        `  ${pct(o.medianAbsPct).padStart(8)} ${pct(o.medianSignedPct).padStart(8)}  ${o.name.slice(0, 40).padEnd(40)} cx ${o.cxDiv.toPrecision(4).padStart(9)} ninja ${o.ninjaDiv.toPrecision(4).padStart(9)} ${o.method.padEnd(7)} ${o.hours}h ${o.medianVolumeDiv.toFixed(2)} Div/h`,
    ),
    "",
    `Ninja only (first ${Math.min(20, c.ninjaOnly.length)}): ${c.ninjaOnly.slice(0, 20).map((i) => i.name).join(", ") || "—"}`,
    `CX only (first ${Math.min(20, c.cxOnly.length)}): ${c.cxOnly.slice(0, 20).map((i) => i.name).join(", ") || "—"}`,
    `Not in the entity catalog (CX cannot price them yet): ${c.unmapped.map((u) => u.name).join(", ") || "—"}`,
  ];
  return lines;
}
