import { toDivine, type Currency, type ExchangeRates } from "../../core/priceEngine";
import type { Candidate } from "./flipTypes";

/** What the plan form holds, parsed. Amounts are per unit in their own currency. */
export interface PlanInput {
  buy: number;
  buyCcy: Currency;
  sell: number;
  sellCcy: Currency;
  qty: number;
}

async function send(url: string, method: "POST" | "PATCH", body: unknown): Promise<void> {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (r.ok) return;
  const detail = await r.text();
  throw new Error(`${method} ${url} failed (${r.status})${detail ? `: ${detail.slice(0, 160)}` : ""}`);
}

/**
 * Save your real Ange prices (switches the watched row to REAL mode). Prices only live on a
 * watchlist row, so an unwatched Top Flips item is watched first — otherwise the save would
 * update nothing and the prices would silently vanish.
 */
export async function saveManualPrices(row: Candidate, watched: boolean, p: PlanInput | null): Promise<void> {
  if (!watched) await send("/api/watchlist", "POST", { itemId: row.itemId, itemName: row.item, category: row.category });
  await send("/api/watchlist", "PATCH", {
    itemId: row.itemId,
    manualBuyExalt: p?.buy ?? null,
    manualSellChaos: p?.sell ?? null,
    manualBuyCcy: p?.buyCcy ?? "EXALT",
    manualSellCcy: p?.sellCcy ?? "CHAOS",
  });
  window.dispatchEvent(new Event("watchlist-changed"));
}

/** A completed round trip straight into Flip History: qty × (sell − buy). */
export async function logFlip(row: Candidate, p: PlanInput): Promise<void> {
  await send("/api/flips", "POST", {
    item_id: row.itemId,
    item_name: row.item,
    qty: p.qty,
    buy_price: p.buy,
    buy_ccy: p.buyCcy,
    sell_price: p.sell,
    sell_ccy: p.sellCcy,
  });
  window.dispatchEvent(new Event("flips-changed"));
}

/** The BUY leg only; the position is sold later from Open Positions. */
export async function openPosition(row: Candidate, p: Pick<PlanInput, "buy" | "buyCcy" | "qty">): Promise<void> {
  await send("/api/positions", "POST", { itemId: row.itemId, itemName: row.item, qty: p.qty, buyPrice: p.buy, buyCcy: p.buyCcy });
  window.dispatchEvent(new Event("positions-changed"));
}

export interface Sizing {
  committedDiv: number;
  /** null until a sell price is entered. */
  profitDiv: number | null;
  /** Your margin on these prices, % of the buy leg; null until a sell price is entered. */
  marginPct: number | null;
}

/** Capital tied up and the expected result of the plan, all in Divine. */
export function planSizing(p: PlanInput, rates: ExchangeRates): Sizing | null {
  if (!(p.buy > 0) || !(p.qty > 0)) return null;
  const buyDiv = toDivine(p.buy, p.buyCcy, rates);
  if (!(p.sell > 0)) return { committedDiv: buyDiv * p.qty, profitDiv: null, marginPct: null };
  const sellDiv = toDivine(p.sell, p.sellCcy, rates);
  return { committedDiv: buyDiv * p.qty, profitDiv: (sellDiv - buyDiv) * p.qty, marginPct: ((sellDiv - buyDiv) / buyDiv) * 100 };
}
