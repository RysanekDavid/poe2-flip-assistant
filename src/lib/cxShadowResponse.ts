import { NextResponse } from "next/server";
import { z } from "zod";
import { CX_SHADOW_MAX_REPORT_HOURS, loadCxShadowReport } from "../core/cx/cxPriceShadow";
import type { CxShadowReport } from "../core/cx/cxShadowReport";
import { canonicalLeague, leagueForUser } from "../core/leagueUsers";
import type { UserRole } from "../db/userQueries";

/**
 * Owner gate + query parsing for GET /api/system/cx-shadow, kept out of the route file (Next
 * restricts route exports) so tests drive it without a request context — same split as
 * systemHealthResponse. Members get a bare 403: the shadow run is owner-only information.
 */

const QuerySchema = z.object({
  hours: z.coerce.number().int().min(1).max(CX_SHADOW_MAX_REPORT_HOURS).default(24),
  league: z.string().trim().min(1).max(100).optional(),
});

export type CxShadowLoader = (league: string, hours: number) => CxShadowReport;

export function cxShadowResponse(
  user: { id: number; role: UserRole } | null,
  url: URL,
  load: CxShadowLoader = (league, hours) => loadCxShadowReport(league, hours),
  defaultLeague: (userId: number) => string = (userId) => leagueForUser(userId),
): Response {
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "owner") return NextResponse.json({ error: "owner only" }, { status: 403 });
  const parsed = QuerySchema.safeParse({
    hours: url.searchParams.get("hours") ?? undefined,
    league: url.searchParams.get("league") ?? undefined,
  });
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    return NextResponse.json({ error: `bad query: ${detail}` }, { status: 400 });
  }
  const league = parsed.data.league != null ? canonicalLeague(parsed.data.league) : defaultLeague(user.id);
  return NextResponse.json(load(league, parsed.data.hours), { headers: { "Cache-Control": "no-store" } });
}
