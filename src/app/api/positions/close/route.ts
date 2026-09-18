import { NextResponse } from "next/server";
import { z } from "zod";
import { getPosition, deletePosition, insertFlip } from "../../../../db/queries";
import { getCurrentUser } from "../../../../auth/session";
import { toDivine, divineToChaos, type Currency } from "../../../../core/priceEngine";
import { leagueForUser } from "../../../../core/leagueUsers";
import { resolveRates } from "../../../../core/rates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  id: z.number().int(),
  sellPrice: z.number().positive(),
  sellCcy: z.enum(["DIVINE", "EXALT", "CHAOS"]),
  notes: z.string().optional(),
});

/**
 * POST /api/positions/close → close the SELL leg. Profit = (sell − buy cost basis) × qty,
 * computed in Divine at current rates, then logged to `flips` (the realized ledger) and the
 * position is removed.
 */
export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });

  // A position is only closable in the league it was opened in. The list the UI renders is
  // already filtered to that league, so a foreign id is not "forbidden", it does not exist —
  // 404, same non-disclosure style as every other per-user lookup here. This also means the sell
  // leg can only ever be converted at the position's OWN economy's rates.
  const league = leagueForUser(user.id);
  const pos = getPosition(user.id, league, parsed.data.id);
  if (!pos) return NextResponse.json({ error: "position not found" }, { status: 404 });

  const resolved = resolveRates(league);
  if (!resolved) return NextResponse.json({ error: "no rates yet — poll prices first" }, { status: 409 });

  const { sellPrice, sellCcy, notes } = parsed.data;
  const sellDivUnit = toDivine(sellPrice, sellCcy as Currency, resolved.rates);
  const profitDiv = (sellDivUnit - pos.buy_div_unit) * pos.qty;
  const profitChaos = divineToChaos(profitDiv, resolved.rates);

  const flipId = insertFlip(user.id, league, {
    item_id: pos.item_id,
    item_name: pos.item_name,
    qty: pos.qty,
    buy_price: pos.buy_price,
    buy_ccy: pos.buy_ccy,
    sell_price: sellPrice,
    sell_ccy: sellCcy,
    profit_div: profitDiv,
    profit_chaos: profitChaos,
    notes: notes ?? null,
  });
  deletePosition(user.id, league, pos.id);
  return NextResponse.json({
    flipId,
    profitDiv,
    profitChaos,
    league,
    ratesSource: resolved.source,
    ratesFetchedAt: resolved.fetchedAt,
  });
}
