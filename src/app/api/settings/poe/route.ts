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
  poesessid: z
    .string()
    .trim()
    .refine((s) => s === "" || /^[a-f0-9]{32}$/i.test(s), "POESESSID must be the 32-char hex cookie value"),
  contact: z.string().trim().default(""),
  account: z.string().trim().default(""),
  disconnect: z.boolean().default(false),
});

/**
 * POST /api/settings/poe { poesessid, contact?, account?, disconnect? } → store (encrypted).
 * Empty poesessid KEEPS the stored secret (the field is write-only and always blank in the UI);
 * only disconnect=true clears it.
 */
export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "bad request" }, { status: 400 });
  }
  const { poesessid, contact, account, disconnect } = parsed.data;
  setUserPoe(user.id, disconnect ? null : poesessid, contact, account);
  return NextResponse.json(getUserPoeStatus(user.id));
}
