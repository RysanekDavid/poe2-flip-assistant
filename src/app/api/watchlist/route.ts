import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getWatchlist,
  addWatch,
  removeWatch,
  setManualPrices,
  setManualPricesInLeague,
  manualAgeMs,
} from "../../../db/watchlistQueries";
import { getCurrentUser } from "../../../auth/session";
import { config } from "../../../config/env";
import { leagueForUser } from "../../../core/leagueUsers";
import { ManualPricesBodySchema, WatchlistResponseSchema, type WatchlistResponse } from "../../../lib/watchlistContract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const staleMs = config.manualStaleHours * 3600_000;
  const watchlist = getWatchlist(user.id, false).map((w) => {
    const ageMs = manualAgeMs(w.manual_set_at);
    return { ...w, manual_stale: ageMs != null && ageMs > staleMs };
  });
  // Parse on the way out: a malformed row fails here with its field name, not in the flip card.
  const body: WatchlistResponse = WatchlistResponseSchema.parse({ league: leagueForUser(user.id), watchlist });
  return NextResponse.json(body);
}

const AddBody = z.object({
  itemId: z.string().min(1),
  itemName: z.string().min(1),
  category: z.string().min(1),
  buyThresholdPct: z.number().optional(),
  sellThresholdPct: z.number().optional(),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = AddBody.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  addWatch(user.id, parsed.data);
  return NextResponse.json({ ok: true }, { status: 201 });
}

/**
 * PATCH /api/watchlist → set or clear your real Ange prices (REAL-mode spread). A `set` is always
 * for the league you are viewing: the row is watched/re-stamped there in the same transaction.
 */
export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = ManualPricesBodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  const body = parsed.data;
  if (body.action === "clear") {
    setManualPrices(user.id, body.itemId, null, null, null, null);
  } else {
    setManualPricesInLeague(user.id, leagueForUser(user.id), body, body.buy, body.sell);
  }
  return NextResponse.json({ ok: true });
}

const DeleteBody = z.object({ itemId: z.string().min(1) });

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = DeleteBody.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  removeWatch(user.id, parsed.data.itemId);
  return NextResponse.json({ ok: true });
}
