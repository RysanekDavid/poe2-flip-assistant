/* Synthetic + DB-backed test of the craft-margin engine: EV math, the missing-material failure
 * path, leg-query assembly, and a material-id sanity check against the live DB / a Delirium fixture. */
import "../config/env";
import { priceMaterials, legToQuery } from "../core/craftMargin";
import { computeMargin } from "../core/craftValuation";
import { MATS, ALL_MATERIALS } from "../core/craftMaterials";
import { RECIPES } from "../core/craftRecipes";
import { buildStatIndex } from "../core/statResolver";
import { buildTradeQuery } from "../lib/tradeLink";
import { getDb } from "../db/database";
import type { CraftRecipe } from "../core/craftRecipes";
import type { MaterialPrice } from "../db/craftQueries";
import type { StatOption } from "../api/tradeMeta";

let fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) fail++;
};

// --- computeMargin: EV = hitRate × result − base − materials; margin = EV / cost × 100 ---
{
  const { evDiv, marginPct, returnFlagged } = computeMargin(1, 20, 3, 0.35); // cost 4, ev 0.35*20-4 = 3
  ok("computeMargin EV = 3", Math.abs(evDiv - 3) < 1e-9, String(evDiv));
  ok("computeMargin margin = 75%", Math.abs(marginPct - 75) < 1e-9, String(marginPct));
  ok("computeMargin: a sane return is not flagged", returnFlagged === false);
  const neg = computeMargin(5, 8, 2, 0.5); // cost 7, ev 4-7 = -3
  ok("computeMargin negative EV = -3", Math.abs(neg.evDiv + 3) < 1e-9, String(neg.evDiv));
  ok("computeMargin zero cost → 0% (no divide-by-zero)", computeMargin(0, 10, 0, 0.5).marginPct === 0);
}

// --- priceMaterials: ninja price, manual fallback, and the fail-loud missing path ---
{
  const recipe: CraftRecipe = {
    key: "t",
    label: "t",
    domain: "jewel",
    source: "t",
    base: { label: "b", stats: [], note: "" },
    result: { label: "r", stats: [], note: "" },
    materials: [
      { material: MATS.exalted, qtyPerAttempt: 2 }, // priced from the map
      { material: MATS.potentLiquidContempt, qtyPerAttempt: 1, manualPriceDiv: 0.02 }, // manual fallback
      { material: { id: "nonexistent-mat", label: "X", group: "currency" }, qtyPerAttempt: 1 }, // missing
    ],
    hitRate: 0.5,
    guide: { goal: "", shopping: "", marketCheck: "", phases: [], brick: "" },
  };
  const prices = new Map<string, MaterialPrice>([
    ["exalted", { itemId: "exalted", itemName: "Exalted Orb", priceDiv: 0.005, icon: null, change7d: null, spark7d: null, ageMin: 1 }],
  ]);
  const { lines, missing } = priceMaterials(recipe, prices);
  ok("missing lists the unpriced material", missing.length === 1 && missing[0] === "nonexistent-mat", missing.join(","));
  const exLine = lines.find((l) => l.id === "exalted")!;
  ok("ninja material total = unit × qty", exLine.source === "ninja" && Math.abs(exLine.totalDiv! - 0.01) < 1e-9, String(exLine.totalDiv));
  const manLine = lines.find((l) => l.id === MATS.potentLiquidContempt.id)!;
  ok("manual fallback → source manual, total 0.02", manLine.source === "manual" && Math.abs(manLine.totalDiv! - 0.02) < 1e-9, String(manLine.totalDiv));
  const missLine = lines.find((l) => l.id === "nonexistent-mat")!;
  ok("missing material has null price (not 0)", missLine.unitDiv === null && missLine.totalDiv === null);
}

// --- legToQuery: resolves stat texts, reports unresolved (never silent), carries pdpsMin/category ---
{
  const CATALOG: StatOption[] = [{ id: "explicit.stat_phys", text: "#% increased Physical Damage", group: "explicit" }];
  const idx = buildStatIndex(CATALOG);
  const bow = RECIPES.find((r) => r.key === "bow_amanamu")!;
  const { query: q, unresolved } = legToQuery(bow.result, idx);
  ok("bow result carries pdpsMin 400", q.pdpsMin === 400, String(q.pdpsMin));
  ok("bow result category weapon.bow", q.category === "weapon.bow", q.category);
  ok("bow result reports no unresolved stats", unresolved.length === 0, unresolved.join(","));
  // the %phys stat lives on the BASE leg (you buy a %phys base; the result is valued by pdps)
  const baseLeg = legToQuery(bow.base, idx);
  ok("bow base resolved its phys stat", (baseLeg.query.stats ?? []).length === 1, String((baseLeg.query.stats ?? []).length));
  // an unresolvable target text must be surfaced (so alerts suppress + UI warns), not silently dropped
  const widened = legToQuery(
    { label: "x", category: "weapon.bow", stats: [{ text: "#% increased Physical Damage", min: 100 }, { text: "totally fake stat", min: 1 }], note: "" },
    idx,
  );
  ok("unresolved stat surfaced", widened.unresolved.length === 1 && widened.unresolved[0] === "totally fake stat", widened.unresolved.join(","));
  ok("resolved stat still applied alongside the unresolved one", (widened.query.stats ?? []).length === 1, String((widened.query.stats ?? []).length));
  // buildTradeQuery must translate pdpsMin → equipment_filters.pdps.min (the tradeLink change)
  const raw = buildTradeQuery({ category: "weapon.bow", pdpsMin: 250 }) as {
    filters?: { equipment_filters?: { filters?: { pdps?: { min?: number } } } };
  };
  const pdps = raw.filters?.equipment_filters?.filters?.pdps?.min;
  ok("buildTradeQuery emits equipment_filters.pdps.min = 250", pdps === 250, String(pdps));
}

// --- recipe integrity: 14 recipes, valid hitRate, every material has a positive expected qty ---
{
  ok("14 curated recipes", RECIPES.length === 14, String(RECIPES.length));
  const badRate = RECIPES.filter((r) => !(r.hitRate > 0 && r.hitRate <= 1));
  ok("all hitRates in (0,1]", badRate.length === 0, badRate.map((r) => r.key).join(","));
  const badQty = RECIPES.flatMap((r) => r.materials).filter((m) => !(m.qtyPerAttempt > 0));
  ok("all material qtyPerAttempt > 0", badQty.length === 0, badQty.map((m) => m.material.id).join(","));
}

// --- material-id sanity: every MATS id must exist in the live DB, or (Delirium) in the fixture ---
{
  // The full live Delirium set (probed from the ninja endpoint); Delirium isn't in the pre-existing
  // DB until the new category has been polled, so its ids are verified against this fixture instead.
  const DELIRIUM_FIXTURE = new Set([
    "potent-liquid-contempt", "ancient-potent-liquid-contempt", "ancient-concentrated-liquid-isolation",
    "ancient-concentrated-liquid-suffering", "ancient-diluted-liquid-greed", "ancient-diluted-liquid-ire",
    "ancient-liquid-disgust", "ancient-liquid-envy", "ancient-liquid-paranoia", "ancient-potent-liquid-ferocity",
    "ancient-concentrated-liquid-fear", "ancient-liquid-despair", "ancient-potent-liquid-melancholy",
    "concentrated-liquid-isolation", "concentrated-liquid-suffering", "diluted-liquid-ire", "liquid-despair",
    "liquid-envy", "liquid-paranoia", "potent-liquid-ferocity", "concentrated-liquid-fear", "diluted-liquid-greed",
    "diluted-liquid-guilt", "ancient-diluted-liquid-guilt", "liquid-disgust", "potent-liquid-melancholy",
  ]);

  let dbIds: Set<string> | null = null;
  try {
    const rows = getDb().prepare("SELECT DISTINCT item_id FROM price_snapshots").all() as Array<{ item_id: string }>;
    dbIds = new Set(rows.map((r) => r.item_id));
  } catch (e) {
    console.log(`WARN  DB unavailable — skipping non-Delirium id check (${e instanceof Error ? e.message : e})`);
  }

  const badDelirium = ALL_MATERIALS.filter((m) => m.group === "delirium" && !DELIRIUM_FIXTURE.has(m.id));
  ok("all Delirium material ids in the live fixture", badDelirium.length === 0, badDelirium.map((m) => m.id).join(","));

  if (dbIds && dbIds.size > 0) {
    const missing = ALL_MATERIALS.filter((m) => m.group !== "delirium" && !dbIds!.has(m.id));
    ok("all non-Delirium material ids present in the live DB", missing.length === 0, missing.map((m) => m.id).join(","));
  } else {
    console.log("WARN  DB empty/absent — non-Delirium id check skipped");
  }
}

console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);
