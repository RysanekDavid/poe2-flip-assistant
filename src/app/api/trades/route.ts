import { NextResponse } from "next/server";
import { z } from "zod";
import { getTrades, insertTrade, deleteTrade } from "../../../db/queries";
import { getCurrentUser } from "../../../auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ trades: getTrades(user.id) });
}

const TradeBody = z.object({
  item_id: z.string().min(1),
  item_name: z.string().min(1),
  side: z.enum(["BUY", "SELL"]),
  currency: z.enum(["CHAOS", "EXALT", "DIVINE"]),
  rate: z.number().positive(),
  quantity: z.number().int().positive(),
  notes: z.string().nullish(),
});

/** POST /api/trades → log a trade. total_currency derived; profit left null (filled manually/later). */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = TradeBody.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  const t = parsed.data;
  const id = insertTrade(user.id, {
    item_id: t.item_id,
    item_name: t.item_name,
    side: t.side,
    currency: t.currency,
    rate: t.rate,
    quantity: t.quantity,
    total_currency: t.rate * t.quantity,
    profit_chaos: null,
    notes: t.notes ?? null,
  });
  return NextResponse.json({ id }, { status: 201 });
}

const DeleteBody = z.object({ id: z.number().int() });

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = DeleteBody.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  deleteTrade(user.id, parsed.data.id);
  return NextResponse.json({ ok: true });
}
