import { NextResponse } from "next/server";
import { buildCraftTargetsPayload } from "../../../../core/craftMeta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/craft/targets → curated craft-target library resolved against the live stat catalog,
 * ranked by scraped meta weights (buildMeta.json). Powers the Craft Helper's profile browser.
 */
export async function GET(): Promise<Response> {
  try {
    return NextResponse.json(await buildCraftTargetsPayload());
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
