import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "../../../../auth/session";
import { authenticate, setPassword } from "../../../../db/userQueries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  current: z.string().min(1),
  next: z.string().min(8, "new password must be at least 8 characters"),
});

/** POST /api/auth/password { current, next } → change the logged-in user's password. */
export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error?.issues[0]?.message ?? "bad request" }, { status: 400 });
  }
  // re-verify the current password by name (authenticate is the only verify path)
  if (!authenticate(user.name, parsed.data.current)) {
    return NextResponse.json({ error: "current password is incorrect" }, { status: 403 });
  }
  setPassword(user.id, parsed.data.next);
  return NextResponse.json({ ok: true });
}
