/* Craft valuation rework (temp DB via runWithTestEnv): floor-and-percentile leg pricing, the
 * confidence gate behind alerts + top picks, prefill refusal, hunt-preset cap/upsert, and the
 * P&L rule that an unsold hit is pending — not a loss. No network. */
import "../config/env";
import {
  floorValue,
  percentile,
  rankGate,
  cappedMargin,
  ABS_FLOOR_DIV,
  MIN_LEG_SAMPLES,
  RESULT_PERCENTILE,
  RETURN_CAP_MULTIPLE,
} from "../core/craftValuation";
import { listingDiv, shouldAlert } from "../core/craftMargin";
import { prefillCosts, presetCap } from "../core/craftPrefill";
import { parseStoredReport } from "../core/craftReports";
import { upsertCraftBaseHunt, addCraftAttempt, closeCraftAttempt, craftPnlByRecipe } from "../db/craftQueries";
import { getDb } from "../db/database";
import type { LegReport, RecipeMarginReport } from "../core/craftRecipes";

let fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) fail++;
};
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

function leg(over: Partial<LegReport> = {}): LegReport {
  return {
    priceDiv: 10, samples: 20, total: 120, searchUrl: "u", outliersDropped: 2, unresolvedStats: [], icon: null,
    floorDiv: 0.5, percentile: RESULT_PERCENTILE, sampled: 40, ...over,
  };
}
function report(over: Partial<RecipeMarginReport> = {}): RecipeMarginReport {
  return {
    key: "t", status: "ok", base: leg({ priceDiv: 2 }), result: leg({ priceDiv: 40 }), materials: [], materialsDiv: 1,
    hitRate: 0.3, evDiv: 9, marginPct: 300, error: null, valuation: "floor-percentile", returnCapped: false, ...over,
  };
}

// --- percentile + floor valuation ---
{
  ok("percentile p25 of 1..5 = 2", near(percentile([1, 2, 3, 4, 5], 0.25), 2));
  ok("percentile p30 of 1..10 = 3.7 (interpolated)", near(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.3), 3.7));
  ok("percentile of empty = 0", percentile([], 0.3) === 0);

  const allBait = floorValue(Array.from({ length: 40 }, (_, i) => 0.0004 + i * 0.0001), RESULT_PERCENTILE);
  ok("all-bait cluster: nothing clears the absolute floor", allBait.kept === 0 && allBait.dropped === 40, `kept ${allBait.kept}`);
  ok("all-bait cluster: leg would be REJECTED (kept < MIN_LEG_SAMPLES), not priced at junk", allBait.kept < MIN_LEG_SAMPLES && allBait.value === 0);
  ok("absolute floor applied when the cluster median is junk", near(allBait.floorDiv, ABS_FLOOR_DIV), String(allBait.floorDiv));

  const real = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
  const mixed = floorValue([...Array.from({ length: 30 }, () => 0.002), ...real], RESULT_PERCENTILE);
  ok("mixed cluster: 30 junk asks dropped, 10 real kept", mixed.kept === 10 && mixed.dropped === 30, `${mixed.kept}/${mixed.dropped}`);
  ok("result leg = p30 of the real asks (7.7), not the cheapest junk", near(mixed.value, 7.7), String(mixed.value));

  const rel = floorValue([...Array.from({ length: 10 }, () => 100), 3], 0.25);
  ok("relative floor: ask under 5% of the cluster p50 dropped", rel.dropped === 1 && near(rel.floorDiv, 5), `floor ${rel.floorDiv}`);
  const nan = floorValue([Number.NaN, -1, 0, 1, 2, 3], 0.5);
  ok("NaN/≤0 prices discarded, not counted as bait", nan.kept === 3 && nan.dropped === 0, `${nan.kept}/${nan.dropped}`);
}

// --- conversions survive a rate outage ---
{
  const ccy = new Map([["exalted", 0.004], ["alch", 0.0008]]);
  ok("no rates: exalt priced via ninja currency map", near(listingDiv(100, "exalted", null, ccy), 0.4));
  ok("rates: exalt priced via the rate ladder", near(listingDiv(230, "exalted", { exaltPerDivine: 230, chaosPerDivine: 10 }, ccy), 1));
  ok("small currency via ninja map", near(listingDiv(10, "alch", null, ccy), 0.008));
  ok("unknown currency → NaN (dropped, never 0)", Number.isNaN(listingDiv(1, "mirror-shard", null, ccy)));
}

// --- confidence gate: alerts + top picks ---
{
  ok("healthy report passes the gate", rankGate(report()).ok, rankGate(report()).reasons.join("; "));
  ok("healthy high-EV report alerts", shouldAlert(report()));
  const whale = report({ result: leg({ priceDiv: 500, samples: 3, total: 5 }), evDiv: 83, marginPct: 502 });
  ok("3-of-5 whale cluster: gate fails", !rankGate(whale).ok, rankGate(whale).reasons.join("; "));
  ok("3-of-5 whale cluster: NO alert", !shouldAlert(whale));
  const baity = report({ result: leg({ samples: 6, outliersDropped: 9 }) });
  ok("more bait dropped than kept → suppressed", !rankGate(baity).ok);
  ok("legacy (pre-floor) report never ranks", !rankGate(report({ valuation: "legacy-cheapest" })).ok);
  ok("return-capped report never ranks", !rankGate(report({ returnCapped: true })).ok);
  const cap = cappedMargin(1, 1000, 1, 0.5); // cost 2, raw return 500 → capped at 20
  ok(`return capped at ${RETURN_CAP_MULTIPLE}× cost + flagged`, cap.returnCapped && near(cap.evDiv, 18), String(cap.evDiv));
}

// --- stored-report compatibility: pre-rework rows still parse, as legacy ---
{
  const legacy = { ...report(), base: { ...leg() }, result: { ...leg() } } as Record<string, unknown>;
  delete legacy.valuation;
  delete legacy.returnCapped;
  for (const k of ["floorDiv", "percentile", "sampled"]) {
    delete (legacy.base as Record<string, unknown>)[k];
    delete (legacy.result as Record<string, unknown>)[k];
  }
  const parsed = parseStoredReport("t", JSON.stringify(legacy));
  ok("legacy report parses with valuation legacy-cheapest", parsed?.valuation === "legacy-cheapest" && parsed.base?.floorDiv === null);
}

// --- prefill refusal ---
{
  const mats = { totalDiv: 1.5, missing: [] as string[] };
  const good = prefillCosts(report(), {}, mats);
  ok("prefill from a floor-validated base", good.ok && near(good.baseCostDiv, 2) && near(good.matsCostDiv, 1.5));
  const failedBase = prefillCosts(report({ status: "leg-failed", base: null }), {}, mats);
  ok("base leg failed the floor → prefill refused, asks for baseCostDiv", !failedBase.ok && failedBase.needs.includes("baseCostDiv"));
  const legacy = prefillCosts(report({ valuation: "legacy-cheapest" }), {}, mats);
  ok("legacy junk-floor base → prefill refused", !legacy.ok);
  const manual = prefillCosts(null, { baseCostDiv: 3 }, mats);
  ok("manual base price accepted without any report", manual.ok && near(manual.baseCostDiv, 3));
  const missingMats = prefillCosts(report(), {}, { totalDiv: 0.2, missing: ["omen-of-light"] });
  ok("unpriced material → refused, asks for matsCostDiv", !missingMats.ok && missingMats.needs.includes("matsCostDiv"));
}

// --- hunt preset: cap from the trusted base only, upsert per user × recipe × league ---
{
  const rates = { exaltPerDivine: 200, chaosPerDivine: 10 };
  const refused = presetCap(report({ valuation: "legacy-cheapest" }), rates);
  ok("hunt preset refuses a legacy junk-floor base", !refused.ok && /floor-validated/.test(refused.ok ? "" : refused.error));
  const exCap = presetCap(report({ base: leg({ priceDiv: 0.5 }) }), rates);
  ok("sub-div base → exalted cap at 120%", exCap.ok && exCap.cap.ccy === "exalted" && exCap.cap.amount === 120, JSON.stringify(exCap));

  const db = getDb();
  db.prepare("DELETE FROM hunts WHERE label LIKE 'base · test-%'").run();
  const hunt = {
    label: "base · test-recipe", mode: "CRAFT_BASE" as const, item_name: null, base_type: null, category: "weapon.bow",
    ilvl_min: 75, rarity: null, stats_json: null, max_amount: 1, max_ccy: "divine", target_div: null,
  };
  const first = upsertCraftBaseHunt(1, "Test League", hunt);
  db.prepare("UPDATE hunts SET active = 0 WHERE id = ?").run(first.id);
  const second = upsertCraftBaseHunt(1, "Test League", { ...hunt, max_amount: 2.5 });
  const rows = db.prepare("SELECT id, max_amount, active FROM hunts WHERE label = 'base · test-recipe' AND league = 'Test League'").all() as Array<{ id: number; max_amount: number; active: number }>;
  ok("hunt preset upserts: one row after two clicks", rows.length === 1 && first.created && !second.created && first.id === second.id, JSON.stringify(rows));
  ok("upsert moves the cap and re-activates", rows[0]?.max_amount === 2.5 && rows[0]?.active === 1);
  const other = upsertCraftBaseHunt(1, "Other League", hunt);
  ok("same recipe in another league is a separate hunt", other.created && other.id !== first.id);
  db.prepare("DELETE FROM hunts WHERE label LIKE 'base · test-%'").run();
}

// --- P&L: an unsold hit is pending, not a loss ---
{
  const db = getDb();
  db.prepare("DELETE FROM craft_attempts WHERE recipe_key = 'test-pnl'").run();
  const kept = addCraftAttempt(1, { recipeKey: "test-pnl", baseCostDiv: 2, matsCostDiv: 1 });
  closeCraftAttempt(1, kept, "hit", null);
  const brick = addCraftAttempt(1, { recipeKey: "test-pnl", baseCostDiv: 2, matsCostDiv: 1 });
  closeCraftAttempt(1, brick, "brick", null);
  const sold = addCraftAttempt(1, { recipeKey: "test-pnl", baseCostDiv: 2, matsCostDiv: 1 });
  closeCraftAttempt(1, sold, "hit", 10);
  addCraftAttempt(1, { recipeKey: "test-pnl", baseCostDiv: 2, matsCostDiv: 1 }); // still open
  const row = craftPnlByRecipe(1).find((r) => r.recipe_key === "test-pnl");
  ok("realized = brick + sold hit only (spent 6, sold 10)", row?.spent_div === 6 && row?.sold_div === 10, JSON.stringify(row));
  ok("kept hit + open attempt are pending (2, 6 div in)", row?.pending === 2 && row?.pending_cost_div === 6);
  db.prepare("DELETE FROM craft_attempts WHERE recipe_key = 'test-pnl'").run();
}

console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);
