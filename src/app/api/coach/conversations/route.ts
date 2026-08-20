import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../auth/session";
import { listCoachConversations } from "../../../../db/coachHistoryQueries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ conversations: listCoachConversations(user.id) });
}
