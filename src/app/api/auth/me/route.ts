import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/auth/me → the logged-in user (or null). Drives the client-side auth gate. */
export async function GET(): Promise<Response> {
  const u = await getCurrentUser();
  return NextResponse.json({ user: u ? { id: u.id, name: u.name, role: u.role } : null });
}
