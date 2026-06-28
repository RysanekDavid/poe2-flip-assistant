/* Synthetic-data test of the comparable valuation pipeline (no network, no live DB). */
import { parseItem } from "../core/itemParser";
import { buildStatIndex, resolveLine } from "../core/statResolver";
import { applyPseudos } from "../core/pseudoRules";
import { valueFromComparables, checkSnipe } from "../core/comparableValuation";
import type { StatOption } from "../api/tradeMeta";
import type { Listing } from "../api/tradeClient";
import type { ScoutRates } from "../api/scoutClient";

let fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) fail++;
};

// --- a tiny synthetic stat catalog (mirrors /api/trade2/data/stats shape) ---
const CATALOG: StatOption[] = [
  { id: "explicit.stat_life", text: "+# to maximum Life", group: "explicit" },
  { id: "explicit.stat_fire", text: "+#% to Fire Resistance", group: "explicit" },
  { id: "explicit.stat_cold", text: "+#% to Cold Resistance", group: "explicit" },
  { id: "explicit.stat_allele", text: "+#% to all Elemental Resistances", group: "explicit" },
  { id: "explicit.stat_str", text: "+# to Strength", group: "explicit" },
  { id: "implicit.stat_str", text: "+# to Strength", group: "implicit" },
  { id: "explicit.stat_spelldmg", text: "#% increased Spell Damage", group: "explicit" },
  { id: "pseudo.pseudo_total_ele", text: "#% total Elemental Resistance", group: "pseudo" },
  { id: "pseudo.pseudo_total_life", text: "+# total maximum Life", group: "pseudo" },
];

const SAMPLE = `Item Class: Gloves
Rarity: Rare
Gauntlets of the Whale
Vaal Gauntlets
--------
Armour: 300
--------
Requirements:
Level: 70
Str: 100
--------
Item Level: 82
--------
+25 to Strength (implicit)
--------
+95 to maximum Life
+30% to Fire Resistance
+18% to Cold Resistance
+12% to all Elemental Resistances
35% increased Spell Damage
--------`;

// 1. parse
const item = parseItem(SAMPLE)!;
ok("parse rarity", item.rarity === "Rare", item.rarity);
ok("parse baseType", item.baseType === "Vaal Gauntlets", item.baseType);
ok("parse ilvl", item.itemLevel === 82, String(item.itemLevel));
ok("parse mods count", item.mods.length === 6, String(item.mods.length)); // 5 explicit + 1 implicit
ok(
  "implicit marker",
  item.mods.find((m) => m.raw.includes("Strength"))?.marker === "implicit",
);

// 2. resolve
const idx = buildStatIndex(CATALOG);
const resolved = item.mods.map((m) => resolveLine(m, idx)).filter((r) => r != null);
ok("resolved life→explicit", resolved.some((r) => r!.id === "explicit.stat_life" && r!.value === 95));
ok("resolved str→implicit (marker pick)", resolved.some((r) => r!.id === "implicit.stat_str" && r!.value === 25));

// 3. pseudos
const pseudos = applyPseudos(resolved as never, idx);
const ele = pseudos.find((p) => p.id === "pseudo.pseudo_total_ele");
// 30(fire×1) + 18(cold×1) + 12×3(all-ele) = 84
ok("pseudo total ele res = 84", ele?.value === 84, String(ele?.value));
const life = pseudos.find((p) => p.id === "pseudo.pseudo_total_life");
ok("pseudo total life = 95", life?.value === 95, String(life?.value));

// 4. value from comparables (synthetic listings)
const rates: ScoutRates = { exaltPerDivine: 200, chaosPerDivine: 20 };
const mk = (amount: number, currency: string, online = true): Listing => ({
  listingId: `${amount}${currency}`,
  price: { amount, currency },
  account: "x",
  online,
  indexed: null,
  whisper: null,
  itemName: "x",
  baseType: "Vaal Gauntlets",
  icon: null,
  stackSize: 0,
  mods: [],
  stash: null,
});
const listings: Listing[] = [
  mk(8, "divine"),
  mk(10, "divine"),
  mk(12, "divine"),
  mk(2000, "exalted"), // = 10 div
  mk(50, "divine", false), // offline → excluded
];
const v = valueFromComparables(listings, 120, rates);
ok("value samples = 4 (offline dropped)", v.samples === 4, String(v.samples));
ok("median value = 10 div", v.valueDiv === 10, String(v.valueDiv));
ok("min = 8 div", v.minDiv === 8, String(v.minDiv));

// 5. snipe verdict
const cheap = checkSnipe(5, v); // 50% under 10 → snipe (discount 35%)
ok("snipe fires at 5 div", cheap.isSnipe, cheap.reason);
const fair = checkSnipe(9, v); // 10% under → not a snipe
ok("no snipe at 9 div", !fair.isSnipe, fair.reason);
const thin = checkSnipe(1, { ...v, samples: 1 });
ok("thin data blocks snipe", !thin.isSnipe, thin.reason);

console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);
