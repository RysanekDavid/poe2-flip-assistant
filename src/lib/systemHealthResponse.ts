import { NextResponse } from "next/server";
import { buildSystemHealth } from "../core/systemHealth";
import type { UserRole } from "../db/userQueries";
import type { SystemHealth } from "./systemHealthContract";

/**
 * Owner gate for GET /api/system/health, kept out of the route file (Next restricts route
 * exports) and out of core (which stays free of next/server) so tests can drive it without a
 * request context. Members get a bare 403: the panel's existence is itself owner-only information.
 */
export async function systemHealthResponse(
  user: { role: UserRole } | null,
  build: () => Promise<SystemHealth> = () => buildSystemHealth(),
): Promise<Response> {
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "owner") return NextResponse.json({ error: "owner only" }, { status: 403 });
  return NextResponse.json(await build(), { headers: { "Cache-Control": "no-store" } });
}
