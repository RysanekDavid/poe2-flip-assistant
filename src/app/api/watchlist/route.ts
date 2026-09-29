import { NextResponse } from "next/server";
import { z } from "zod";
import { getWatchlist, addWatch, removeWatch, setManualPrices, manualAgeMs } from "../../../db/watchlistQueries";
import { getCurrentUser } from "../../../auth/session";
import { config } from "../../../config/env";
import { WatchlistResponseSchema, type WatchlistResponse } from "../../../lib/watchlistContract";

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
  const body: WatchlistResponse = WatchlistResponseSchema.parse({ watchlist });
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

const CCY = z.enum(["DIVINE", "EXALT", "CHAOS"]);
const ManualBody = z.object({
  itemId: z.string().min(1),
  manualBuyExalt: z.number().positive().nullable(),
  manualSellChaos: z.number().positive().nullable(),
  manualBuyCcy: CCY.nullish(),
  manualSellCcy: CCY.nullish(),
});

/** PATCH /api/watchlist → set/clear real observed Ange prices + their currencies (REAL-mode spread). */
export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = ManualBody.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  const { itemId, manualBuyExalt, manualSellChaos, manualBuyCcy, manualSellCcy } = parsed.data;
  setManualPrices(
    user.id,
    itemId,
    manualBuyExalt,
    manualBuyExalt != null ? (manualBuyCcy ?? "EXALT") : null,
    manualSellChaos,
    manualSellChaos != null ? (manualSellCcy ?? "CHAOS") : null,
  );
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
