import { createSearch, fetchListings, type Listing, type TradeCred } from "./tradeClient";
import { toDivine } from "../core/huntEngine";
import { buildValuer } from "../core/valuation";
import type { ExchangeRates } from "../core/priceEngine";

const ORBS = new Set(["Divine Orb", "Exalted Orb", "Chaos Orb"]);

// trade2 returns at most 100 result ids per search; fetch in pages of 10 (the fetch endpoint cap).
const MAX_IDS = 100;
const FETCH_PAGE = 10;

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
  otherDiv: number; // total value (Div) of non-currency items in your public tabs
  gearAtAskDiv: number; // the part of otherDiv priced at YOUR OWN asking price (no market match)
  unpriced: number; // items we couldn't value at all (no market match, no ratable listing price)
  listingsSeen: number;
  total: number; // trade says this many of your items are listed
  truncated: boolean; // total > listingsSeen — the cheapest (total − seen) listings were not read
  tabs: TabValue[]; // per-stash-tab breakdown, value-descending
}

type Rates = Pick<ExchangeRates, "exaltPerDivine" | "chaosPerDivine">;
type TabAcc = Omit<TabValue, "valueDiv">;

const tabValue = (t: TabAcc, rates: Rates): number =>
  t.divine + toDivine(t.exalted, "exalted", rates) + toDivine(t.chaos, "chaos", rates) + t.otherDiv;

/**
 * Your own listings, MOST EXPENSIVE FIRST. trade2 hands back at most 100 ids per search, so a
 * price-ascending read of a big account silently dropped the valuable gear and kept the junk.
 * Descending means truncation costs the cheapest items — and the caller still reports it.
 * online: false → any seller status (you are usually not in-game while this runs);
 * buyout: false → include unpriced listings (they may still carry market value).
 */
async function readOwnListings(account: string, cred?: TradeCred): Promise<{ total: number; listings: Listing[] }> {
  const search = await createSearch({ account, online: false, buyout: false }, "desc", cred);
  const ids = (search.result ?? []).slice(0, MAX_IDS);
  const listings: Listing[] = [];
  for (let i = 0; i < ids.length; i += FETCH_PAGE) {
    listings.push(...(await fetchListings(ids.slice(i, i + FETCH_PAGE), search.id, cred)));
  }
  return { total: search.total ?? listings.length, listings };
}

/** Fold one listing into the account + tab totals. */
function addListing(l: Listing, acc: AccountCurrency, t: TabAcc, valuer: ReturnType<typeof buildValuer>, rates: Rates): void {
  t.items++;
  // raw orbs go to the currency totals (counted by stack, not market-valued)
  if (ORBS.has(l.itemName) && l.stackSize > 0) {
    if (l.itemName === "Divine Orb") { acc.divine += l.stackSize; t.divine += l.stackSize; }
    else if (l.itemName === "Exalted Orb") { acc.exalted += l.stackSize; t.exalted += l.stackSize; }
    else { acc.chaos += l.stackSize; t.chaos += l.stackSize; }
    return;
  }
  // everything else: value at MARKET first (ninja/scout × stack), so showcase-priced items still
  // count. Fall back to the listing's own price — flagged, because that is what YOU ask, not
  // what the market pays (a rare listed at a hopeful price inflates net worth).
  const mv = valuer.value(l.itemName, l.stackSize);
  if (mv) {
    acc.otherDiv += mv.div; t.otherDiv += mv.div;
    return;
  }
  const d = l.price ? toDivine(l.price.amount, l.price.currency, rates) : NaN;
  if (Number.isFinite(d)) {
    acc.otherDiv += d; t.otherDiv += d; acc.gearAtAskDiv += d;
  } else {
    acc.unpriced++; t.unpriced++;
  }
}

/**
 * Total your Divine/Exalted/Chaos (and the value of other gear) from your own public-tab
 * listings, via a trade search on your account name. Read-only. Currency in a PRIVATE tab is
 * invisible to trade — make the tab public for it to count. Each listing carries its stash tab
 * name, so the worth is also broken down per tab (the per-tab charts).
 */
export async function readCurrencyFromTrade(account: string, rates: Rates, cred?: TradeCred): Promise<AccountCurrency> {
  const { listings, total } = await readOwnListings(account, cred);
  const valuer = buildValuer(); // ninja (live) + scout (daily cache) — no network here
  const acc: AccountCurrency = {
    divine: 0, exalted: 0, chaos: 0, otherDiv: 0, gearAtAskDiv: 0, unpriced: 0,
    listingsSeen: listings.length, total, truncated: total > listings.length, tabs: [],
  };
  const byTab = new Map<string, TabAcc>();
  for (const l of listings) {
    const k = l.stash || "(unnamed)";
    let t = byTab.get(k);
    if (!t) { t = { tab: k, divine: 0, exalted: 0, chaos: 0, otherDiv: 0, items: 0, unpriced: 0 }; byTab.set(k, t); }
    addListing(l, acc, t, valuer, rates);
  }
  acc.tabs = [...byTab.values()]
    .map((t) => ({ ...t, valueDiv: tabValue(t, rates) }))
    .sort((a, b) => b.valueDiv - a.valueDiv);
  return acc;
}
