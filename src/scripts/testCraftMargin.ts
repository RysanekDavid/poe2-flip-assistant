/* Synthetic + DB-backed test of the craft-margin engine: EV math, the missing-material failure
 * path, leg-query assembly, and a material-id sanity check against the live DB / a Delirium fixture. */
import "../config/env";
import { priceMaterials, legToQuery } from "../core/craftLegPricing";
import { resultQuery } from "../core/craftResultValuation";
import { computeMargin } from "../core/craftValuation";
import { MATS, ALL_MATERIALS } from "../core/craftMaterials";
import { RECIPES } from "../core/craftRecipes";
import { buildStatIndex } from "../core/statResolver";
import { buildTradeQuery } from "../lib/tradeLink";
import { getDb } from "../db/database";
import type { CraftRecipe, LegReport, RecipeMarginReport, RecipeStatSpec } from "../core/craftRecipes";
import { assembleReport, buildReport } from "../core/craftMargin";
import type { MaterialPrice } from "../db/craftQueries";
import type { StatOption } from "../api/tradeMeta";

let fail = 0;
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
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
  const CATALOG: StatOption[] = [
    { id: "explicit.stat_phys", text: "#% increased Physical Damage", group: "explicit" },
    { id: "explicit.stat_as_local", text: "#% increased Attack Speed (Local)", group: "explicit" },
    { id: "explicit.stat_crit_local", text: "#% to Critical Hit Chance", group: "explicit" },
  ];
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


// --- stat groups: a named group is searched exactly; a missing one widens VISIBLY ---
{
  const CATALOG: StatOption[] = [
    { id: "pseudo.plus3", text: "# to Level of all Spell Skills", group: "pseudo" },
    { id: "explicit.plus3", text: "# to Level of all Spell Skills", group: "explicit" },
    { id: "fractured.plus3", text: "# to Level of all Spell Skills", group: "fractured" },
    { id: "explicit.proj", text: "# to Level of all Projectile Skills", group: "explicit" },
    { id: "pseudo.res", text: "+#% total Elemental Resistance", group: "pseudo" },
  ];
  const idx = buildStatIndex(CATALOG);
  const q = (stats: RecipeStatSpec[]) => legToQuery({ label: "x", stats, note: "" }, idx);
  ok("group fractured → the fractured id", q([{ text: "# to Level of all Spell Skills", group: "fractured" }]).query.stats?.[0]?.id === "fractured.plus3");
  ok("no group → explicit preferred over a pseudo listed first", q([{ text: "# to Level of all Spell Skills" }]).query.stats?.[0]?.id === "explicit.plus3");
  ok("group pseudo → the pseudo id", q([{ text: "+#% total Elemental Resistance", group: "pseudo" }]).query.stats?.[0]?.id === "pseudo.res");
  const fallback = q([{ text: "# to Level of all Projectile Skills", group: "fractured", min: 2 }]);
  ok("missing fractured twin → searched as explicit", fallback.query.stats?.[0]?.id === "explicit.proj");
  ok("…and surfaced as unresolved (gates the report), never silent", fallback.unresolved.length === 1 && /no fractured stat/.test(fallback.unresolved[0] ?? ""), fallback.unresolved.join(","));
}

// --- result queries: strict = every stat at the recipe's own mins; relaxed = tier-1 only; always
//     instant-buyout, never mirrored, putrefaction results corrupted ---
{
  const CATALOG: StatOption[] = [
    { id: "explicit.ms", text: "#% increased Movement Speed", group: "explicit" },
    { id: "pseudo.res", text: "+#% total Elemental Resistance", group: "pseudo" },
  ];
  const idx = buildStatIndex(CATALOG);
  const boots = RECIPES.find((r) => r.key === "boots_putrefaction")!;
  const strict = resultQuery(boots.result, { idx }, false).query;
  ok("strict result search keeps tier-1 AND tier-2 stats", (strict.stats ?? []).map((f) => f.id).join(",") === "explicit.ms,pseudo.res");
  ok("strict mins are the recipe's sellable-tier floors, unrelaxed (30 / 60)", strict.stats?.[0]?.min === 30 && strict.stats?.[1]?.min === 60, JSON.stringify(strict.stats));
  ok("result search is instant-buyout and never mirrored", strict.instantBuyout === true && strict.mirrored === false);
  const relaxed = resultQuery(boots.result, { idx }, true).query;
  ok("relaxed result search drops tier-2 support stats", (relaxed.stats ?? []).map((f) => f.id).join(",") === "explicit.ms");
  const putrefaction = RECIPES.filter((r) => r.materials.some((m) => m.material.id === MATS.omenPutrefaction.id));
  ok("putrefaction recipes found", putrefaction.length === 3, putrefaction.map((r) => r.key).join(","));
  ok("every putrefaction result leg searches CORRUPTED comparables", putrefaction.every((r) => resultQuery(r.result, { idx }, false).query.corrupted === true));
  ok("base legs stay uncorrupted", putrefaction.every((r) => legToQuery(r.base, idx).query.corrupted === false));
}

// --- a tier floor is never widened into the tier below: a fractured +3 search stays ≥ 3 ---
{
  // one catalog entry per spec'd text in the spec'd group, so every recipe stat resolves exactly
  const specs = RECIPES.flatMap((r) => [...r.base.stats, ...r.result.stats]);
  const catalog = new Map(specs.map((st) => [`${st.group ?? "explicit"}|${st.text}`, st]));
  const idx = buildStatIndex(
    [...catalog.keys()].map((k) => {
      const [group, text] = k.split("|") as [string, string];
      return { id: `${group}.${text}`, text, group };
    }),
  );
  const amulet = RECIPES.find((r) => r.key === "amulet_fracture_plus3")!;
  for (const tier1Only of [false, true]) {
    const plus3 = resultQuery(amulet.result, { idx }, tier1Only).query.stats?.[0];
    ok(`fracture +3 ${tier1Only ? "relaxed" : "strict"} search: fractured stat, min stays 3`, plus3?.id.startsWith("fractured.") === true && plus3.min === 3, JSON.stringify(plus3));
  }
  const drifted = RECIPES.filter((r) => {
    const sent = (resultQuery(r.result, { idx }, false).query.stats ?? []).map((f) => f.min ?? null);
    return sent.join(",") !== r.result.stats.map((st) => st.min ?? null).join(",");
  });
  ok("every result leg sends exactly the recipe's mins", drifted.length === 0, drifted.map((r) => r.key).join(","));
}

// --- result-leg data: every result leg defines its archetype; tiers only on result legs ---
{
  const undefinedArchetype = RECIPES.filter(
    (r) => !r.result.stats.some((st) => st.tier !== 2) && r.result.pdpsMin == null && r.result.esMin == null && r.result.evMin == null,
  );
  ok("every result leg has a tier-1 stat or a pdps/ES/EV floor", undefinedArchetype.length === 0, undefinedArchetype.map((r) => r.key).join(","));
  ok("no base leg carries a result tier", RECIPES.every((r) => r.base.stats.every((st) => st.tier == null)));
}

// --- no exchange rates: the tick fails TRANSIENTLY before spending a trade2 search ---
async function noRatesIsTransient(): Promise<void> {
  const ctx = { idx: buildStatIndex([]), rates: null, cred: { poesessid: "" }, currencyDiv: new Map<string, number>() };
  // rates are checked BEFORE the base leg, so no search is spent (with an empty POESESSID a base
  // search would fail with a POESESSID error instead)
  const bare: CraftRecipe = { ...RECIPES[0]!, materials: [] };
  const built = await buildReport(bare, ctx, new Map());
  ok(
    "rates outage: transient leg-failed report, base never priced",
    built.transient && built.report.status === "leg-failed" && built.report.base === null && /no exchange rates/.test(built.report.error ?? ""),
    built.report.error ?? "",
  );
}

// --- engine bugs become a visible leg-failed report, never an exception that aborts a sweep ---
{
  const shell: RecipeMarginReport = {
    key: "t", status: "ok", base: null, result: null, materials: [], materialsDiv: 1, hitRate: 0.3, evDiv: 0, marginPct: 0,
    error: null, valuation: "comparable-result", returnFlagged: false, nearMiss: null,
  };
  const leg = (over: Partial<LegReport>): LegReport => ({
    priceDiv: 10, samples: 10, total: 30, searchUrl: "u", outliersDropped: 0, unresolvedStats: [], icon: null, floorDiv: null,
    percentile: null, sampled: 20, method: "comparable-median", band: { p25: 8, p50: 10, p75: 12 }, relaxed: false, unrated: 0, ...over,
  });
  const good = assembleReport(shell, leg({ priceDiv: 1, method: "floor-percentile", band: null }), leg({}));
  ok("priced legs → ok report with EV and near-miss", good.report.status === "ok" && near(good.report.evDiv, 1) && good.report.nearMiss?.costDiv === 2);
  const bandless = assembleReport(shell, leg({ priceDiv: 1 }), leg({ band: null }));
  ok(
    "result leg without a band → leg-failed naming the engine error, legs kept, not transient",
    bandless.report.status === "leg-failed" && /engine error — comparable result leg has no band/.test(bandless.report.error ?? "") &&
      bandless.report.base !== null && bandless.report.result !== null && !bandless.transient,
    bandless.report.error ?? "",
  );
  const zeroMedian = assembleReport(shell, leg({ priceDiv: 1 }), leg({ band: { p25: 0, p50: 0, p75: 0 } }));
  ok("near-miss on a zero median → leg-failed, not a throw", zeroMedian.report.status === "leg-failed" && /engine error/.test(zeroMedian.report.error ?? ""));
}

// --- recipe integrity: 16 recipes, valid hitRate, every material has a positive expected qty ---
{
  ok("16 curated recipes", RECIPES.length === 16, String(RECIPES.length));
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

noRatesIsTransient()
  .then(() => {
    console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILED`);
    process.exit(fail === 0 ? 0 : 1);
  })
  .catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
