import { cookies } from "next/headers";
import { SESSION_COOKIE } from "../../../../auth/auth";
import { meResponse } from "../../../../auth/meResponse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/auth/me → the logged-in user (or null). Drives the client-side auth gate. */
export async function GET(): Promise<Response> {
  return meResponse((await cookies()).get(SESSION_COOKIE)?.value);
}
