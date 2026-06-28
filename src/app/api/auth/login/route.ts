import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate } from "../../../../db/userQueries";
import { signSession, SESSION_COOKIE } from "../../../../auth/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ name: z.string().min(1), password: z.string().min(1) });

/** POST /api/auth/login → verify credentials, set the signed session cookie. */
export async function POST(req: Request): Promise<Response> {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const u = authenticate(parsed.data.name, parsed.data.password);
  if (!u) return NextResponse.json({ error: "invalid credentials" }, { status: 401 });

  const res = NextResponse.json({ user: { id: u.id, name: u.name, role: u.role } });
  res.cookies.set(SESSION_COOKIE, signSession(u.id), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 3600,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
