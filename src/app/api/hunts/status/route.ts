import { NextResponse } from "next/server";
import { getRuntime } from "../../../../db/huntQueries";
import { getCallerCred } from "../../../../auth/tradeCred";
import { config } from "../../../../config/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/hunts/status → background scan health (hunts scanned, last scan, last error). */
export async function GET(): Promise<Response> {
  const cred = await getCallerCred();
  const rt = getRuntime();
  return NextResponse.json({
    scannedHunts: rt.connections, // runtime row reused: "connections" now = hunts scanned last cycle
    last_scan_at: rt.last_event_at,
    last_error: rt.last_error,
    updated_at: rt.updated_at,
    liveEnabled: cred != null,
    huntEnabled: config.hunt.enabled,
    scanSec: config.hunt.scanSec,
  });
}
