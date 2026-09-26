import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../auth/session";
import { changePassword } from "../../../../auth/passwordChange";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/password { current, next } → change the logged-in user's password.
 * Revokes every other session; this browser gets a fresh cookie so the user stays logged in.
 */
export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return changePassword(req, user);
}
