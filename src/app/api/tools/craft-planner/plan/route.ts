import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../../auth/session";
import { getDefaultLeague } from "../../../../../core/leagueState";
import { planForLeague } from "../../../../../core/tools/planner/load";
import { PlanRejectedError } from "../../../../../core/tools/planner/plan";
import { UnknownPlannerBaseError } from "../../../../../core/tools/planner/targets";
import { planRejectedSchema, planRequestSchema, planResponseSchema, type PlanRequest, type PlanResponse } from "../../../../../lib/tools/craftPlannerContract";
import { createTtlCache } from "../../../../../lib/ttlCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// plans are pure given league prices, which the poller refreshes hourly: 10 minutes is fresh enough
const PLAN_CACHE = createTtlCache<PlanResponse>(10 * 60_000, 64);

const keyOf = (league: string, req: PlanRequest): string => `${league}|${createHash("sha256").update(JSON.stringify(req)).digest("hex")}`;

async function readBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch (e: unknown) {
    // an unparseable body is the client's error: answered as 400 below, never a 500
    return { __invalidJson: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * POST /api/tools/craft-planner/plan { itemClass, base, ilvl, targets[1..6], includeUnverified,
 * quality } → an ordered plan written as targets, per-step odds with their basis, the expected
 * materials bill at live ninja prices, and the CraftGuide the session wizard runs. Spends NO trade2
 * budget. 400 bad body · 401 · 404 unknown base · 422 targets that can't coexist (graded reasons)
 * or no plan with the admitted methods.
 *
 * League: the default league, like the other craft tools — the prices must come from the economy
 * the later value step searches.
 */
export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = planRequestSchema.safeParse(await readBody(req));
  if (!body.success) return NextResponse.json({ error: body.error.issues[0]?.message ?? "bad request" }, { status: 400 });
  const league = getDefaultLeague();
  try {
    const plan = PLAN_CACHE.get(keyOf(league, body.data), () => planForLeague(body.data, league, new Date()));
    // validated on the way out: a drift between core and contract fails here, not in the browser
    return NextResponse.json(planResponseSchema.parse(plan));
  } catch (e: unknown) {
    if (e instanceof UnknownPlannerBaseError) return NextResponse.json({ error: e.message }, { status: 404 });
    if (e instanceof PlanRejectedError) return NextResponse.json(planRejectedSchema.parse({ error: e.message, feasibility: e.issues }), { status: 422 });
    throw e;
  }
}
