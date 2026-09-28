import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../../auth/session";
import { leagueForUser } from "../../../../../core/leagueUsers";
import { deleteRegexPreset, listRegexPresets, saveRegexPreset } from "../../../../../db/regexPresetQueries";
import { PresetDeleteSchema, PresetSaveSchema, zodErrorBody } from "../../../../../lib/tools/regexContract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/tools/regex/presets → { presets } for the signed-in user (all leagues). */
export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ presets: listRegexPresets(user.id) });
}

/** POST { name, params } → upsert by name; records the league it was saved in. */
export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = PresetSaveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json(zodErrorBody(parsed.error), { status: 400 });
  const preset = saveRegexPreset(user.id, leagueForUser(user.id), parsed.data.name, parsed.data.params);
  return NextResponse.json({ preset }, { status: 201 });
}

/** DELETE { id } → 404 when the preset is not this user's (or does not exist). */
export async function DELETE(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = PresetDeleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json(zodErrorBody(parsed.error), { status: 400 });
  if (!deleteRegexPreset(user.id, parsed.data.id)) {
    return NextResponse.json({ error: `preset ${parsed.data.id} not found` }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
