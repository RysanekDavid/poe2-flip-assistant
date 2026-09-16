import { NextResponse } from "next/server";
import { z } from "zod";
import { getOpenPositions, insertPosition, deletePosition } from "../../../db/queries";
import { latestSnapshots } from "../../../db/marketQueries";
import { getCurrentUser } from "../../../auth/session";
import { toDivine, type Currency } from "../../../core/priceEngine";
import { getActiveLeague } from "../../../core/leagueState";
import { resolveRates } from "../../../core/rates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/positions → this user's open positions marked-to-market against current mids. */
export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const prices = latestSnapshots(getActiveLeague());
  const byId = new Map(prices.map((p) => [p.itemId, p]));
  const positions = getOpenPositions(user.id).map((pos) => {
    const mid = byId.get(pos.item_id)?.baseValue ?? null; // current mid in Div/unit
    const committedDiv = pos.buy_div_unit * pos.qty;
    const markDiv = mid != null ? mid * pos.qty : null;
    const unrealizedDiv = markDiv != null ? markDiv - committedDiv : null;
    return { ...pos, mid, committedDiv, markDiv, unrealizedDiv };
  });
  const committedTotal = positions.reduce((a, p) => a + p.committedDiv, 0);
  const unrealizedTotal = positions.reduce((a, p) => a + (p.unrealizedDiv ?? 0), 0);
  return NextResponse.json({ positions, committedTotal, unrealizedTotal });
}

const OpenBody = z.object({
  itemId: z.string().min(1),
  itemName: z.string().min(1),
  qty: z.number().int().positive(),
  buyPrice: z.number().positive(),
  buyCcy: z.enum(["DIVINE", "EXALT", "CHAOS"]),
  notes: z.string().optional(),
});

/** POST /api/positions → open a position (the BUY leg). Cost basis is locked in Div at open. */
export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = OpenBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const resolved = resolveRates(getActiveLeague());
  if (!resolved) return NextResponse.json({ error: "no rates yet — poll prices first" }, { status: 409 });

  const b = parsed.data;
  const buyDivUnit = toDivine(b.buyPrice, b.buyCcy as Currency, resolved.rates);
  const pos = insertPosition(user.id, {
    item_id: b.itemId,
    item_name: b.itemName,
    qty: b.qty,
    buy_price: b.buyPrice,
    buy_ccy: b.buyCcy,
    buy_div_unit: buyDivUnit,
    notes: b.notes ?? null,
  });
  return NextResponse.json({ position: pos, ratesSource: resolved.source, ratesFetchedAt: resolved.fetchedAt });
}

/** DELETE /api/positions { id } → cancel a position without selling (no flip logged). */
export async function DELETE(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await req.json().catch(() => ({}));
  if (typeof id !== "number") return NextResponse.json({ error: "id required" }, { status: 400 });
  deletePosition(user.id, id);
  return NextResponse.json({ ok: true });
}
