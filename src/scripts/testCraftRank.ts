/* craftRank: three-tier ordering (picks / near-misses / unpriced) against the golden fixture the
 * Coach's Python rank_key is pinned to, plus the verdict boundaries. Pure — no DB, no network. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { rankCandidates, verdictOf, type RankInput } from "../core/craftRank";
import type { LegReport, RecipeMarginReport } from "../core/craftRecipes";

let fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) fail++;
};

const CaseSchema = z.object({
  key: z.string(),
  status: z.enum(["ok", "missing-materials", "leg-failed"]),
  gateOk: z.boolean(),
  evDiv: z.number(),
  marginPct: z.number(),
  confidence: z.enum(["high", "medium", "low"]).nullable(),
  scannedAt: z.string(),
});
const GoldenSchema = z.object({
  cases: z.array(CaseSchema),
  expected: z.object({ picks: z.array(z.string()), nearMisses: z.array(z.string()), unpriced: z.array(z.string()) }),
});
type Case = z.infer<typeof CaseSchema>;

const LEG: LegReport = {
  priceDiv: 1, samples: 10, total: 30, searchUrl: "u", outliersDropped: 0, unresolvedStats: [], icon: null, floorDiv: null,
  percentile: null, sampled: 20, method: "comparable-median", band: { p25: 1, p50: 1, p75: 1 }, relaxed: false, unrated: 0,
};

function toInput(c: Case): RankInput {
  const priced = c.status === "ok";
  const nearMiss = c.confidence
    ? {
        costDiv: 1, resultMedianDiv: 1, resultBandDiv: { lo: 1, hi: 1 }, evDiv: c.evDiv, evLowDiv: c.evDiv, breakEvenHitRate: 0.5,
        modelHitRate: 0.3, hitRateGap: 0.2, resultNeededDiv: 3, gapDiv: Math.max(0, -c.evDiv), confidence: c.confidence,
      }
    : null;
  const report: RecipeMarginReport = {
    key: c.key, status: c.status, base: priced ? LEG : null, result: priced ? LEG : null, materials: [], materialsDiv: 0,
    hitRate: 0.3, evDiv: c.evDiv, marginPct: c.marginPct, error: priced ? null : "leg failed", valuation: "comparable-result",
    returnFlagged: false, nearMiss,
  };
  return { key: c.key, report, gate: { ok: c.gateOk, reasons: c.gateOk ? [] : ["gated"] }, scannedAt: c.scannedAt };
}

// --- golden ordering shared with services/coach craft_gate.rank_key ---
{
  const path = resolve("services", "coach", "tests", "fixtures", "craft_rank_golden.json");
  const golden = GoldenSchema.parse(JSON.parse(readFileSync(path, "utf8")));
  // reversed input: the ranking must not depend on arrival order
  const tiers = rankCandidates(golden.cases.map(toInput).reverse());
  const keys = (xs: RankInput[]): string => xs.map((x) => x.key).join(",");
  ok("picks: gate ok ∧ EV > 0, by EV desc", keys(tiers.picks) === golden.expected.picks.join(","), keys(tiers.picks));
  ok("near-misses: priced, by margin desc then confidence", keys(tiers.nearMisses) === golden.expected.nearMisses.join(","), keys(tiers.nearMisses));
  ok("unpriced: most recent scan first", keys(tiers.unpriced) === golden.expected.unpriced.join(","), keys(tiers.unpriced));
}

// --- verdict boundaries ---
{
  ok("gate ok + EV > 0 → pick", verdictOf(true, 0.01, true) === "pick");
  ok("EV exactly 0 is not a pick", verdictOf(true, 0, true) === "near_miss");
  ok("gate failing + positive EV → near miss", verdictOf(false, 5, true) === "near_miss");
  ok("unpriced wins over everything", verdictOf(true, 5, false) === "unpriced");
  const neverScanned: RankInput = { key: "z", report: null, gate: { ok: false, reasons: ["not scanned yet"] }, scannedAt: null };
  const scanned = toInput({ key: "y", status: "leg-failed", gateOk: false, evDiv: 0, marginPct: 0, confidence: null, scannedAt: "2026-01-01 00:00:00" });
  const t = rankCandidates([neverScanned, scanned]);
  ok("never-scanned recipes are unpriced, after scanned ones", t.unpriced.map((x) => x.key).join(",") === "y,z");
}

console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);
