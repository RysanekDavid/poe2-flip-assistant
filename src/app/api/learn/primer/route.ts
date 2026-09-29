import { getCurrentUser } from "../../../../auth/session";
import { primerGet } from "../../../../core/learn/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/learn/primer → curated core currencies with catalog text, live price and pickup advice. */
export async function GET(): Promise<Response> {
  return primerGet(await getCurrentUser(), Date.now());
}
