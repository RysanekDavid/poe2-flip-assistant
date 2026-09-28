import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../../auth/session";
import { leagueForUser } from "../../../../../core/leagueUsers";
import { buildRegex } from "../../../../../core/tools/regex/compose";
import { loadRegexNamespace, type LoadedNamespace } from "../../../../../core/tools/regex/namespaceSource";
import { RegexParamsSchema, zodErrorBody, type BuildResponse } from "../../../../../lib/tools/regexContract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/tools/regex/build → stash-search strings for the selected items at or above a price.
 * Body: RegexParams. Reads cached ninja/scout/trade2-reference data only; no trade2 search calls.
 */
export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = RegexParamsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json(zodErrorBody(parsed.error), { status: 400 });

  const league = leagueForUser(user.id);
  let loaded: LoadedNamespace;
  try {
    loaded = await loadRegexNamespace(league);
  } catch (error: unknown) {
    console.error("[tools/regex] namespace load failed", error);
    const why = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `reference data unavailable: ${why}` }, { status: 502 });
  }
  const result = buildRegex(loaded.ns, parsed.data);
  const body: BuildResponse = { league, ...result, namespaceSize: loaded.ns.entries.length, dataAsOf: loaded.dataAsOf };
  return NextResponse.json(body);
}
