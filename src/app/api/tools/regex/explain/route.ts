import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../../auth/session";
import { leagueForUser } from "../../../../../core/leagueUsers";
import { SearchParseError, explainSearch, parseSearch, type SearchAst } from "../../../../../core/tools/regex/explain";
import { loadRegexNamespace, type LoadedNamespace } from "../../../../../core/tools/regex/namespaceSource";
import { ExplainRequestSchema, zodErrorBody, type ExplainResponse } from "../../../../../lib/tools/regexContract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseErrorResponse(error: SearchParseError): Response {
  return NextResponse.json({ error: error.message, position: error.position }, { status: 400 });
}

/**
 * POST /api/tools/regex/explain → what a pasted stash-search string matches in our namespace.
 * Body: { text, regexMode? }. A malformed string is a 400 with the char position, never a guess.
 */
export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = ExplainRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json(zodErrorBody(parsed.error), { status: 400 });

  let ast: SearchAst;
  try {
    ast = parseSearch(parsed.data.text);
  } catch (error: unknown) {
    if (error instanceof SearchParseError) return parseErrorResponse(error);
    throw error;
  }
  let loaded: LoadedNamespace;
  try {
    loaded = await loadRegexNamespace(leagueForUser(user.id));
  } catch (error: unknown) {
    console.error("[tools/regex] namespace load failed", error);
    const why = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `reference data unavailable: ${why}` }, { status: 502 });
  }
  try {
    const body: ExplainResponse = explainSearch(ast, loaded.ns, { regexMode: parsed.data.regexMode });
    return NextResponse.json(body);
  } catch (error: unknown) {
    // regex mode compiles each alternative; an invalid pattern is the player's input, not a crash
    if (error instanceof SearchParseError) return parseErrorResponse(error);
    throw error;
  }
}
