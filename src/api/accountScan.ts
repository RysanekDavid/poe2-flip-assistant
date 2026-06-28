import { searchAccountListings, type TradeCred } from "./tradeClient";
import { toDivine } from "../core/huntEngine";
import { buildValuer } from "../core/valuation";
import type { ScoutRates } from "./scoutClient";

const ORBS = new Set(["Divine Orb", "Exalted Orb", "Chaos Orb"]);

export interface TabValue {
  tab: string; // stash tab name
  divine: number;
  exalted: number;
  chaos: number;
  otherDiv: number; // market value (Div) of non-orb items in this tab
  valueDiv: number; // total Div value of the tab (currency + gear)
  items: number; // listings seen in this tab
  unpriced: number; // items with no market value AND no usable listing price (showcase sentinels)
}

export interface AccountCurrency {
  divine: number;
  exalted: number;
  chaos: number;
  otherDiv: number; // total market value (Div) of non-currency items in your public tabs
  unpriced: number; // items we couldn't value at all (no market match, no ratable listing price)
  listingsSeen: number;
  total: number; // trade says this many of your items are listed
  tabs: TabValue[]; // per-stash-tab breakdown, value-descending
}

const tabValue = (t: Omit<TabValue, "valueDiv">, rates: ScoutRates): number =>
  t.divine + toDivine(t.exalted, "exalted", rates) + toDivine(t.chaos, "chaos", rates) + t.otherDiv;

/**
 * Total your Divine/Exalted/Chaos (and the listed value of other gear) from your own
 * public-tab listings, via a trade search on your account name. Read-only. Currency in a
 * PRIVATE tab is invisible to trade — make the tab public for it to count.
 *
 * Each listing carries its stash tab name, so we also break the worth down per tab —
 * that's what powers the per-tab charts.
 */
export async function readCurrencyFromTrade(
  account: string,
  rates: ScoutRates,
  cred?: TradeCred,
): Promise<AccountCurrency> {
  const { listings, total } = await searchAccountListings(account, 200, cred);
  const valuer = buildValuer(); // ninja (live) + scout (daily cache) — no network here
  const acc: AccountCurrency = {
    divine: 0, exalted: 0, chaos: 0, otherDiv: 0, unpriced: 0, listingsSeen: listings.length, total, tabs: [],
  };
  const byTab = new Map<string, Omit<TabValue, "valueDiv">>();
  const bump = (name: string): Omit<TabValue, "valueDiv"> => {
    const k = name || "(unnamed)";
    let t = byTab.get(k);
    if (!t) { t = { tab: k, divine: 0, exalted: 0, chaos: 0, otherDiv: 0, items: 0, unpriced: 0 }; byTab.set(k, t); }
    return t;
  };

  for (const l of listings) {
    const t = bump(l.stash ?? "(unnamed)");
    t.items++;

    // raw orbs go to the currency totals (counted by stack, not market-valued)
    if (ORBS.has(l.itemName) && l.stackSize > 0) {
      if (l.itemName === "Divine Orb") { acc.divine += l.stackSize; t.divine += l.stackSize; }
      else if (l.itemName === "Exalted Orb") { acc.exalted += l.stackSize; t.exalted += l.stackSize; }
      else { acc.chaos += l.stackSize; t.chaos += l.stackSize; }
      continue;
    }

    // everything else: value at MARKET first (ninja/scout × stack), so showcase-priced items
    // still count. Fall back to the listing's own price; only then give up as "unpriced".
    const mv = valuer.value(l.itemName, l.stackSize);
    if (mv) {
      acc.otherDiv += mv.div; t.otherDiv += mv.div;
    } else if (l.price) {
      const d = toDivine(l.price.amount, l.price.currency, rates);
      if (Number.isFinite(d)) { acc.otherDiv += d; t.otherDiv += d; }
      else { acc.unpriced++; t.unpriced++; }
    } else {
      acc.unpriced++; t.unpriced++;
    }
  }

  acc.tabs = [...byTab.values()]
    .map((t) => ({ ...t, valueDiv: tabValue(t, rates) }))
    .sort((a, b) => b.valueDiv - a.valueDiv);
  return acc;
}
