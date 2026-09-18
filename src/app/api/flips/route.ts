import { NextResponse } from "next/server";
import { z } from "zod";
import { getFlips, insertFlip, deleteFlip } from "../../../db/queries";
import { getCurrentUser } from "../../../auth/session";
import { toDivine, divineToChaos, type Currency } from "../../../core/priceEngine";
import { leagueForUser } from "../../../core/leagueUsers";
import { resolveRates } from "../../../core/rates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Per-league, like positions: cross-league P&L would add Divines from two economies.
  return NextResponse.json({ flips: getFlips(user.id, leagueForUser(user.id)) });
}

const CCY = z.enum(["DIVINE", "EXALT", "CHAOS"]);
const FlipBody = z.object({
  item_id: z.string().min(1),
  item_name: z.string().min(1),
  qty: z.number().int().positive(),
  buy_price: z.number().positive(),
  buy_ccy: CCY,
  sell_price: z.number().positive(),
  sell_ccy: CCY,
  notes: z.string().nullish(),
});

/** POST /api/flips → log a flip; profit auto-computed in Divine + Chaos at current rates. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = FlipBody.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  const f = parsed.data;

  const resolved = resolveRates(leagueForUser(user.id));
  if (!resolved) {
    return NextResponse.json({ error: "no rates yet — poll first" }, { status: 409 });
  }

  const buyDiv = toDivine(f.buy_price, f.buy_ccy as Currency, resolved.rates);
  const sellDiv = toDivine(f.sell_price, f.sell_ccy as Currency, resolved.rates);
  const profitDiv = (sellDiv - buyDiv) * f.qty;
  const profitChaos = divineToChaos(profitDiv, resolved.rates);

  const id = insertFlip(user.id, leagueForUser(user.id), {
    item_id: f.item_id,
    item_name: f.item_name,
    qty: f.qty,
    buy_price: f.buy_price,
    buy_ccy: f.buy_ccy,
    sell_price: f.sell_price,
    sell_ccy: f.sell_ccy,
    profit_div: profitDiv,
    profit_chaos: profitChaos,
    notes: f.notes ?? null,
  });
  return NextResponse.json(
    { id, profitDiv, profitChaos, ratesSource: resolved.source, ratesFetchedAt: resolved.fetchedAt },
    { status: 201 },
  );
}

const DeleteBody = z.object({ id: z.number().int() });

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = DeleteBody.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  deleteFlip(user.id, parsed.data.id);
  return NextResponse.json({ ok: true });
}
