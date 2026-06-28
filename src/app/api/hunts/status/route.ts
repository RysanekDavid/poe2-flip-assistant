import { NextResponse } from "next/server";
import { getRuntime } from "../../../../db/queries";
import { getCallerCred } from "../../../../auth/tradeCred";
import { config } from "../../../../config/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/hunts/status → live-search runtime (connections, last event, error). */
export async function GET(): Promise<Response> {
  const cred = await getCallerCred();
  return NextResponse.json({
    ...getRuntime(),
    liveEnabled: cred != null,
    huntEnabled: config.hunt.enabled,
    maxConn: 20,
  });
}
