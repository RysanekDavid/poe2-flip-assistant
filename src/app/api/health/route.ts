import { NextResponse } from "next/server";
import { latestSnapshots, latestFetchedAt } from "../../../db/queries";
import { deriveRates } from "../../../core/priceEngine";
import { scoutFetchedAt } from "../../../api/scoutClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health — data freshness + current base rates for the header status strip.
 * ninja freshness comes from the DB (poller writes it, works across processes);
 * scout freshness is this web process's in-memory cache (null until first fetch).
 */
export function GET(): Response {
  const prices = latestSnapshots();
  const rates = deriveRates(prices);
  return NextResponse.json({
    ninjaFetchedAt: latestFetchedAt(),
    scoutFetchedAt: scoutFetchedAt(),
    rates,
  });
}
