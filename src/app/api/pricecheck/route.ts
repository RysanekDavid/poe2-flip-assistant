import { NextResponse } from "next/server";
import { z } from "zod";
import { evaluateItem } from "../../../core/snipeEngine";
import { getCurrentUser } from "../../../auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  baseType: z.string().min(1),
  mods: z.array(z.string()).default([]),
  askDiv: z.number().nonnegative().optional(), // optional: judge a specific asking price
});

/**
 * POST /api/pricecheck → value an item from the price book.
 * Body: { baseType, mods[], askDiv? } → { valueDiv, samples, snipeUnderDiv, isSnipe, ... }.
 * This is the "what's this worth / would I snipe it" endpoint — the brain the AI agent reuses.
 */
export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const { baseType, mods, askDiv } = parsed.data;
  return NextResponse.json(evaluateItem(baseType, mods, askDiv ?? 0));
}
