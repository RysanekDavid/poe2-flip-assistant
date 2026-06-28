import { NextResponse } from "next/server";
import { scanAll } from "../../../../core/huntEngine";
import { getCurrentUser } from "../../../../auth/session";
import { getCallerCred } from "../../../../auth/tradeCred";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/hunts/scan → run THIS user's active hunts once with their own cred (manual). Read-only. */
export async function POST(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const cred = await getCallerCred();
  if (!cred) {
    return NextResponse.json({ error: "POESESSID not set — add your session cookie in Settings" }, { status: 409 });
  }
  try {
    const summary = await scanAll({ userId: user.id, cred });
    return NextResponse.json(summary);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
