import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "../../../../auth/session";
import { setUserPoe, getUserPoeStatus } from "../../../../db/userQueries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/settings/poe → whether the logged-in user has a stored POESESSID (never returns the secret). */
export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(getUserPoeStatus(user.id));
}

const Body = z.object({
  poesessid: z.string().trim(),
  contact: z.string().trim().default(""),
  account: z.string().trim().default(""),
});

/** POST /api/settings/poe { poesessid, contact?, account? } → store (encrypted). Empty poesessid clears it. */
export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const { poesessid, contact, account } = parsed.data;
  setUserPoe(user.id, poesessid, contact, account);
  return NextResponse.json(getUserPoeStatus(user.id));
}
