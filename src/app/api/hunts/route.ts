import { NextResponse } from "next/server";
import { getHuntsForUser, addHunt, updateHunt, deleteHunt, setHuntActive, type HuntMode } from "../../../db/queries";
import { getCurrentUser } from "../../../auth/session";
import { getCallerCred } from "../../../auth/tradeCred";
import { getDefaultLeague } from "../../../core/leagueState";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/hunts → this user's saved hunts + whether live search is configured. */
export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const cred = await getCallerCred();
  return NextResponse.json({ hunts: getHuntsForUser(user.id, false), liveEnabled: cred != null });
}

/** POST /api/hunts → create a hunt. */
export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json();
  if (!b?.label) {
    return NextResponse.json({ error: "label required" }, { status: 400 });
  }
  // Hunts are scanned by the poller against the app default league (one shared trade2 budget),
  // so that is the market a hunt belongs to regardless of what its author is currently viewing.
  const id = addHunt(user.id, getDefaultLeague(), {
    label: String(b.label),
    mode: (b.mode as HuntMode) ?? "SNIPE",
    item_name: b.itemName ?? null,
    base_type: b.baseType ?? null,
    category: b.category ?? null,
    ilvl_min: b.ilvlMin != null ? Number(b.ilvlMin) : null,
    rarity: b.rarity ?? null,
    stats_json: b.stats ? JSON.stringify(b.stats) : null,
    max_amount: b.maxAmount != null ? Number(b.maxAmount) : null,
    max_ccy: b.maxCcy ?? null,
    target_div: b.targetDiv != null ? Number(b.targetDiv) : null,
  });
  return NextResponse.json({ id });
}

/** PATCH /api/hunts → toggle active (active-only body), or edit criteria (label present). */
export async function PATCH(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json();
  if (b?.id == null) return NextResponse.json({ error: "id required" }, { status: 400 });

  // full-field edit when a label is supplied; otherwise it's the active toggle
  if (b.label != null) {
    updateHunt(user.id, Number(b.id), {
      label: String(b.label),
      mode: (b.mode as HuntMode) ?? "SNIPE",
      item_name: b.itemName ?? null,
      base_type: b.baseType ?? null,
      category: b.category ?? null,
      ilvl_min: b.ilvlMin != null ? Number(b.ilvlMin) : null,
      rarity: b.rarity ?? null,
      stats_json: b.stats ? JSON.stringify(b.stats) : null,
      max_amount: b.maxAmount != null ? Number(b.maxAmount) : null,
      max_ccy: b.maxCcy ?? null,
      target_div: b.targetDiv != null ? Number(b.targetDiv) : null,
    });
    return NextResponse.json({ ok: true });
  }

  if (b.active == null) return NextResponse.json({ error: "active or label required" }, { status: 400 });
  setHuntActive(user.id, Number(b.id), Boolean(b.active));
  return NextResponse.json({ ok: true });
}

/** DELETE /api/hunts → remove a hunt and its hits. */
export async function DELETE(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json();
  if (b?.id == null) return NextResponse.json({ error: "id required" }, { status: 400 });
  deleteHunt(user.id, Number(b.id));
  return NextResponse.json({ ok: true });
}
