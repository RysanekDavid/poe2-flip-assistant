/* Sell response contract: rows built by the real pipeline (plan → buildSellRows → sellTotals) must
 * parse under sellResponseSchema and survive a JSON round-trip unchanged — the panel parses the
 * same schema, so any drift fails here first. */
import assert from "node:assert/strict";
import type { PricedItem } from "../../api/types";
import { groupStashItems, planLiquidation } from "../../core/wealth/plan";
import { buildSellRows, sellTotals } from "../../core/wealth/sellRows";
import type { BalanceItemRow } from "../../db/balanceItemQueries";
import { sellResponseSchema, type SellResponse } from "../../lib/wealthContract";

const RATES = { exaltPerDivine: 400, chaosPerDivine: 20 };

const stored = (item_name: string, over: Partial<BalanceItemRow> = {}): BalanceItemRow => ({
  tab: "sell", item_name, base_type: item_name, rarity: "Unique", stack_size: 1, market_div: null, market_source: null,
  ask_amount: 5, ask_currency: "divine", listing_id: `L-${item_name}`, indexed_at: "2026-09-20T10:00:00Z", item_json: null, ...over,
});

export function testSellContract(): void {
  const rune: PricedItem = { itemId: "rune", itemName: "Greater Rune", category: "Runes", baseValue: 0.5, volume: 900, change7d: 40, spark7d: null, icon: null };
  const { items } = groupStashItems(
    [stored("Mageblood"), stored("Headhunter", { ask_amount: 41 }), stored("Doom Grip", { rarity: "Rare" }), stored("Greater Rune", { stack_size: 20, rarity: "Currency", ask_amount: 200, ask_currency: "exalted" })],
    RATES,
  );
  const ninjaByName = new Map([["greater rune", rune]]);
  const plan = planLiquidation(items, {
    rates: RATES, ninjaByName, cxByItemId: new Map(), uniqueDiv: new Map([["headhunter", 40]]), compDiv: new Map([["mageblood", 3.2]]),
    competition: new Map(), params: { goldPerExalt: 5000, flowSharePct: 10, maxGridStepPct: 10 },
  });
  const comp = { listingId: "L-Mageblood", fairDiv: 3.2, cheapestDiv: 3.1, samples: 6, searchUrl: "https://trade/x", checkedAt: "2026-09-29T10:00:00.000Z" };
  const rows = buildSellRows(items, plan, { ninjaByName, compsByListing: new Map([[comp.listingId, comp]]), rates: RATES });
  assert.deepEqual(rows.map((r) => [r.name, r.verdict]), [
    ["Mageblood", "reprice"], ["Headhunter", "list"], ["Greater Rune", "hold"], ["Doom Grip", "unpriced"],
  ], "most actionable first: reprice → sell now → list → hold → unpriced");
  const mb = rows[0]!;
  assert.deepEqual([mb.targetDiv, mb.note, mb.comp?.cheapestDiv, mb.listedAt], [3.2, "~price 64 chaos", 3.1, "2026-09-20T10:00:00Z"]);
  assert.equal(rows[3]!.note, null, "nothing to list → no note");
  const totals = sellTotals(plan, rows);
  assert.deepEqual(totals.byVerdict, { "sell-cx": 0, list: 1, reprice: 1, hold: 1, unpriced: 1 });
  const body: SellResponse = {
    league: "L", snapshot: { fetchedAt: "2026-09-29 18:00:00", ageMin: 5 }, reason: null, rows, totals,
    provenance: { league: "L", rates: RATES, ratesSource: "cx", ratesFetchedAt: null, ninjaFetchedAt: null, cxHour: null, scoutAgeHours: 3 },
    currencyIcons: { DIVINE: null, EXALT: null, CHAOS: null },
    sold: { count: 2, askDiv: 43, names: ["A", "B"], previousAt: "2026-09-29 15:00:00" },
    reprice: { state: "done", requestedAt: "2026-09-29T10:00:00.000Z", finishedAt: "2026-09-29T10:03:00.000Z", checked: 1, error: null, nextAt: "2026-09-29T16:00:00.000Z", candidates: 2 },
    warnings: [],
  };
  const parsed = sellResponseSchema.parse(JSON.parse(JSON.stringify(body)));
  assert.deepEqual(parsed, body, "the response survives the wire unchanged");
  assert.throws(() => sellResponseSchema.parse({ ...body, rows: [{ ...mb, unitDiv: "3.2" }] }), "a mistyped value fails loudly");
}
