import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../auth/session";
import { isCuratedBossId } from "../../../../core/farm/farmLoad";
import { deleteFarmSpeed, saveFarmSpeed } from "../../../../db/farmSpeedQueries";
import {
  speedDeleteResponseSchema,
  speedDeleteSchema,
  speedErrorText,
  speedPutResponseSchema,
  speedPutSchema,
} from "../../../../lib/farmContract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const unauthorized = (): Response => NextResponse.json({ error: "unauthorized" }, { status: 401 });

/**
 * PUT { kind, key, minutesPerRun, divPerRun? } → the viewer's own pace on one farm row (full
 * replacement). A boss key must be a curated boss: a pace saved under a typo would never show up.
 * Mechanic keys are ninja categories, which come and go with the market, so any is accepted.
 */
export async function PUT(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const parsed = speedPutSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: speedErrorText(parsed.error) }, { status: 400 });
  if (parsed.data.kind === "boss" && !isCuratedBossId(parsed.data.key)) {
    return NextResponse.json({ error: `key: unknown boss "${parsed.data.key}"` }, { status: 400 });
  }
  const entry = saveFarmSpeed(user.id, parsed.data, Date.now());
  return NextResponse.json(speedPutResponseSchema.parse({ entry }));
}

/** DELETE { kind, key } → clears the viewer's pace; 404 when they had none on that row. */
export async function DELETE(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const parsed = speedDeleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: speedErrorText(parsed.error) }, { status: 400 });
  if (!deleteFarmSpeed(user.id, parsed.data.kind, parsed.data.key)) {
    return NextResponse.json({ error: `no saved pace for ${parsed.data.kind} "${parsed.data.key}"` }, { status: 404 });
  }
  return NextResponse.json(speedDeleteResponseSchema.parse({ ok: true }));
}
