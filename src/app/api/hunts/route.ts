import { NextResponse } from "next/server";
import { z } from "zod";
import { getHuntsForUser, addHunt, updateHunt, deleteHunt, setHuntActive } from "../../../db/huntQueries";
import { getCurrentUser } from "../../../auth/session";
import { getCallerCred } from "../../../auth/tradeCred";
import { getDefaultLeague } from "../../../core/leagueState";
import { parseHuntBody } from "../../../lib/huntSchema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IdBody = z.object({ id: z.number().int().positive() }).passthrough();
const ToggleBody = z.object({ id: z.number().int().positive(), active: z.boolean() });

async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null; // not JSON → the schema below rejects it with a 400
  }
}

const bad = (error: string): Response => NextResponse.json({ error }, { status: 400 });

/** GET /api/hunts → this user's saved hunts + whether live search is configured. */
export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const cred = await getCallerCred();
  return NextResponse.json({ hunts: getHuntsForUser(user.id, false), liveEnabled: cred != null });
}

/** POST /api/hunts → create a hunt (zod-validated; a malformed hunt is rejected, not stored). */
export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = parseHuntBody(await readJson(req));
  if (!parsed.ok) return bad(parsed.error);
  // Hunts are scanned by the poller against the app default league (one shared trade2 budget),
  // so that is the market a hunt belongs to regardless of what its author is currently viewing.
  const id = addHunt(user.id, getDefaultLeague(), parsed.fields);
  return NextResponse.json({ id });
}

/** PATCH /api/hunts → toggle active ({id, active}), or edit criteria (full body with a label). */
export async function PATCH(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await readJson(req);
  const idParsed = IdBody.safeParse(body);
  if (!idParsed.success) return bad("id: required positive integer");

  const toggle = ToggleBody.safeParse(body);
  if (toggle.success) {
    setHuntActive(user.id, toggle.data.id, toggle.data.active);
    return NextResponse.json({ ok: true });
  }
  const parsed = parseHuntBody(body);
  if (!parsed.ok) return bad(parsed.error);
  updateHunt(user.id, idParsed.data.id, parsed.fields);
  return NextResponse.json({ ok: true });
}

/** DELETE /api/hunts → remove a hunt and its hits. */
export async function DELETE(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = IdBody.safeParse(await readJson(req));
  if (!parsed.success) return bad("id: required positive integer");
  deleteHunt(user.id, parsed.data.id);
  return NextResponse.json({ ok: true });
}
