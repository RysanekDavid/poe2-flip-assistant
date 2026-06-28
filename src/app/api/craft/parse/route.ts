import { NextResponse } from "next/server";
import { z } from "zod";
import { fetchTradeMeta } from "../../../../api/tradeMeta";
import { parseItem } from "../../../../core/itemParser";
import { buildStatIndex, resolveLine } from "../../../../core/statResolver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ itemText: z.string().min(1) });

export interface ParsedRare {
  name: string;
  baseType: string;
  itemLevel: number | null;
  stats: Array<{ id: string; text: string; group: string; roll: number }>;
}

/**
 * POST /api/craft/parse { itemText } → base type + resolved mods (with rolls), to PREFILL the
 * Craft Planner. No live search here — just turn pasted in-game text into the planner's inputs
 * so the user values/explores it with the planner's robust ladder + roll guide. Needs only the
 * (cached) stat catalog, so it works without POESESSID.
 */
export async function POST(req: Request): Promise<Response> {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const item = parseItem(parsed.data.itemText);
  if (!item) {
    return NextResponse.json({ error: "could not parse — paste the full in-game item text (Ctrl+C)" }, { status: 422 });
  }

  try {
    const { stats } = await fetchTradeMeta();
    const idx = buildStatIndex(stats);

    // resolve each mod line to a trade stat id + its rolled value; drop lines with no catalog match
    const seen = new Set<string>();
    const resolved = item.mods
      .map((m) => resolveLine(m, idx))
      .filter((r): r is NonNullable<typeof r> => r != null)
      .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
      .map((r) => ({ id: r.id, text: r.text, group: r.group, roll: r.value }));

    return NextResponse.json({
      name: item.name,
      baseType: item.baseType,
      itemLevel: item.itemLevel,
      stats: resolved,
    } satisfies ParsedRare);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
