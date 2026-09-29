import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../../auth/session";
import { fetchTradeMeta, type StatOption } from "../../../../../api/tradeMeta";
import { leagueForUser } from "../../../../../core/leagueUsers";
import { buildRegexTradeLink, indexStats } from "../../../../../core/tools/regex/tradeLink";
import { zodErrorBody } from "../../../../../lib/tools/regexContract";
import { TradeLinkRequestSchema, type TradeLinkResponse } from "../../../../../lib/tools/regexTradeContract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// fetchTradeMeta hands back the same snapshot for 24h; index it once per snapshot.
let indexed: { at: number; byText: Map<string, StatOption> } | null = null;

/**
 * POST /api/tools/regex/trade-link → { url, league, matched, unmatched } for the selected regex mods.
 * Body: TradeLinkRequest. Reads only the cached trade2 reference data (/api/trade2/data); no
 * search is run, so this costs none of the trade2 search budget.
 */
export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = TradeLinkRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json(zodErrorBody(parsed.error), { status: 400 });

  let byText: Map<string, StatOption>;
  try {
    const meta = await fetchTradeMeta();
    if (!indexed || indexed.at !== meta.at) indexed = { at: meta.at, byText: indexStats(meta.stats) };
    byText = indexed.byText;
  } catch (error: unknown) {
    console.error("[tools/regex] trade2 reference data load failed", error);
    const why = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `trade2 reference data unavailable: ${why}` }, { status: 502 });
  }
  const league = leagueForUser(user.id);
  const link = buildRegexTradeLink(byText, league, parsed.data);
  const body: TradeLinkResponse = { ...link, league };
  return NextResponse.json(body);
}
