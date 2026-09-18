import { NextResponse } from "next/server";
import { z } from "zod";
import { getOpenPositions, insertPosition, deletePosition } from "../../../db/queries";
import { latestSnapshots } from "../../../db/marketQueries";
import { getCurrentUser } from "../../../auth/session";
import { toDivine, type Currency } from "../../../core/priceEngine";
import { leagueForUser } from "../../../core/leagueUsers";
import { resolveRates } from "../../../core/rates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/positions → this user's open positions in the league they are viewing, marked to
 * market against that league's mids.
 *
 * Positions are a strictly per-league view: a flip belongs to the economy it was made in, and a
 * new league starts from zero. Because the rows are filtered to the viewer's league before they
 * are marked, the mids applied to them are by construction from that same market — there is no
 * path by which one league's Divine price can value another league's position. Nothing is
 * deleted: switching back shows the other league's positions exactly as they were left.
 */
export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const league = leagueForUser(user.id);
  const byId = new Map(latestSnapshots(league).map((p) => [p.itemId, p.baseValue]));
  const positions = getOpenPositions(user.id, league).map((pos) => {
    const mid = byId.get(pos.item_id) ?? null; // current mid in Div/unit, same league by construction
    const committedDiv = pos.buy_div_unit * pos.qty;
    const markDiv = mid != null ? mid * pos.qty : null;
    return { ...pos, mid, committedDiv, markDiv, unrealizedDiv: markDiv != null ? markDiv - committedDiv : null };
  });

  const committedTotal = positions.reduce((a, p) => a + p.committedDiv, 0);
  const unrealizedTotal = positions.reduce((a, p) => a + (p.unrealizedDiv ?? 0), 0);
  return NextResponse.json({ positions, committedTotal, unrealizedTotal, league });
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
  const league = leagueForUser(user.id);
  const resolved = resolveRates(league);
  if (!resolved) return NextResponse.json({ error: "no rates yet — poll prices first" }, { status: 409 });

  const b = parsed.data;
  const buyDivUnit = toDivine(b.buyPrice, b.buyCcy as Currency, resolved.rates);
  const pos = insertPosition(user.id, league, {
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
  // Scoped to the viewer's league like every other position read: an id from another league is
  // not theirs to touch from here.
  deletePosition(user.id, leagueForUser(user.id), id);
  return NextResponse.json({ ok: true });
}
