import { NextResponse } from "next/server";
import { z } from "zod";
import { searchListings } from "../../../../api/tradeClient";
import { getCallerCred } from "../../../../auth/tradeCred";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Stat = z.object({ id: z.string(), text: z.string().min(1) });
const Body = z.object({ type: z.string().min(1), stats: z.array(Stat).min(1).max(6) });

/**
 * Reduce a mod line to its tier-agnostic "shape" so a chosen stat ("+# to Spirit")
 * matches a real rolled line ("+58 to Spirit"). Strip the +/- sign and collapse every
 * number to "#", lowercase, squeeze whitespace.
 */
const shape = (s: string): string =>
  s
    .replace(/[+−]/g, "")
    .replace(/-?\d+(?:\.\d+)?/g, "#")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const numbersIn = (s: string): number[] => (s.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);

const pct = (sorted: number[], p: number): number | null => {
  if (sorted.length === 0) return null;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[i] ?? null;
};

export interface RollStat {
  id: string;
  text: string;
  count: number; // how many sampled items actually carry this mod
  min: number | null;
  median: number | null;
  p75: number | null; // a sensible "top-tier" min to target
  max: number | null; // best roll seen = the god-roll ceiling
}

/**
 * POST /api/craft/rolls { type, stats } → for each chosen mod, the distribution of its
 * rolled VALUE across the priciest rares of this base. Powers the interactive top-roll
 * guide: "to be top-end, Spirit should be ~p75; the ceiling seen is max". Read-only.
 */
export async function POST(req: Request): Promise<Response> {
  const cred = await getCallerCred();
  if (!cred) {
    return NextResponse.json({ error: "POESESSID not set — add your session cookie in Settings" }, { status: 409 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const { type, stats } = parsed.data;

  try {
    // most-expensive-first: the high end is where the good rolls live
    const { total, listings } = await searchListings({ type, rarity: "rare" }, 30, "desc", cred);

    // index sampled mod lines by shape → list of representative values (mid of a range)
    const byShape = new Map<string, number[]>();
    for (const l of listings) {
      for (const mod of l.mods) {
        const nums = numbersIn(mod);
        if (nums.length === 0) continue;
        const value = nums.reduce((a, b) => a + b, 0) / nums.length; // range → midpoint
        const key = shape(mod);
        const arr = byShape.get(key) ?? [];
        arr.push(value);
        byShape.set(key, arr);
      }
    }

    const rolls: RollStat[] = stats.map((s) => {
      const vals = (byShape.get(shape(s.text)) ?? []).slice().sort((a, b) => a - b);
      return {
        id: s.id,
        text: s.text,
        count: vals.length,
        min: vals[0] ?? null,
        median: pct(vals, 50),
        p75: pct(vals, 75),
        max: vals[vals.length - 1] ?? null,
      };
    });

    return NextResponse.json({ total, sampled: listings.length, rolls });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
