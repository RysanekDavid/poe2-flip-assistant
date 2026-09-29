/*
 * Route bodies of /api/entities, /api/learn/* and /api/settings/nav-mode, taking the resolved user
 * instead of reading cookies: route files stay two lines and `npm run test:learn` drives these
 * without Next's request context (same split as auth/meResponse.ts).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { listLearnProgress, setLearnStepDone } from "../../db/learnQueries";
import { setNavMode, type UserRow } from "../../db/userQueries";
import {
  navModeBodySchema,
  progressRequestSchema,
  type EntitySearchResponse,
  type NavModeBody,
  type PrimerResponse,
  type ProgressResponse,
} from "../../lib/learnContract";
import { leagueForUser } from "../leagueUsers";
import { ATLAS_CHECKLIST, CURRENCY_PRIMER, isAtlasStepId, primerCards } from "./data";
import { ENTITY_SEARCH_MAX_LIMIT, loadLookupPrices, lookupEntities } from "./lookup";

const unauthorized = (): Response => NextResponse.json({ error: "unauthorized" }, { status: 401 });
const badRequest = (message: string): Response => NextResponse.json({ error: message }, { status: 400 });

async function parseBody<T>(req: Request, schema: z.ZodType<T>): Promise<{ ok: true; data: T } | { ok: false; res: Response }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, res: badRequest("body must be JSON") };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, res: badRequest(parsed.error.issues[0]?.message ?? "bad request") };
  return { ok: true, data: parsed.data };
}

export function navModeGet(user: UserRow | null): Response {
  if (!user) return unauthorized();
  return NextResponse.json({ nav_mode: user.nav_mode } satisfies NavModeBody);
}

export async function navModePost(user: UserRow | null, req: Request): Promise<Response> {
  if (!user) return unauthorized();
  const body = await parseBody(req, navModeBodySchema);
  if (!body.ok) return body.res;
  setNavMode(user.id, body.data.nav_mode);
  return NextResponse.json(body.data satisfies NavModeBody);
}

const searchParamsSchema = z.object({
  q: z.string().trim().min(1, "q must not be empty").max(80),
  limit: z.coerce.number().int().min(1).max(ENTITY_SEARCH_MAX_LIMIT).default(8),
});

/** GET /api/entities?q=&limit= — typeahead over the entity catalog, priced in the user's league. */
export function entitiesGet(user: UserRow | null, url: URL, nowMs: number): Response {
  if (!user) return unauthorized();
  const parsed = searchParamsSchema.safeParse({ q: url.searchParams.get("q") ?? "", limit: url.searchParams.get("limit") ?? undefined });
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "bad query");
  const prices = loadLookupPrices(leagueForUser(user.id), nowMs);
  const body: EntitySearchResponse = { results: lookupEntities(parsed.data.q, parsed.data.limit, prices), ex_per_div: prices.exPerDiv };
  return NextResponse.json(body);
}

/** GET /api/learn/primer — the curated core currencies, priced in the user's league. */
export function primerGet(user: UserRow | null, nowMs: number): Response {
  if (!user) return unauthorized();
  const prices = loadLookupPrices(leagueForUser(user.id), nowMs);
  const body: PrimerResponse = {
    cards: primerCards(prices),
    ex_per_div: prices.exPerDiv,
    verified_against: CURRENCY_PRIMER.patch.verified_against,
  };
  return NextResponse.json(body);
}

function progressBody(userId: number): ProgressResponse {
  const done = listLearnProgress(userId)
    .filter((row) => isAtlasStepId(row.stepId))
    .map((row) => ({ step_id: row.stepId, done_at: row.doneAt }));
  return { checklist: ATLAS_CHECKLIST, done };
}

/** GET /api/learn/progress — the atlas checklist plus the steps this user has ticked. */
export function progressGet(user: UserRow | null): Response {
  if (!user) return unauthorized();
  return NextResponse.json(progressBody(user.id));
}

/** POST /api/learn/progress { step_id, done } — tick or untick one known step. */
export async function progressPost(user: UserRow | null, req: Request, nowMs: number): Promise<Response> {
  if (!user) return unauthorized();
  const body = await parseBody(req, progressRequestSchema);
  if (!body.ok) return body.res;
  if (!isAtlasStepId(body.data.step_id)) return badRequest(`unknown atlas step "${body.data.step_id}"`);
  setLearnStepDone(user.id, body.data.step_id, body.data.done, nowMs);
  return NextResponse.json(progressBody(user.id));
}
