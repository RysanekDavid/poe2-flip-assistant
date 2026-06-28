import { NextResponse } from "next/server";
import { z } from "zod";
import { getHoldings, setHolding } from "../../../db/queries";
import { getCurrentUser } from "../../../auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ holdings: getHoldings(user.id) });
}

const Body = z.object({
  currency: z.enum(["DIVINE", "EXALT", "CHAOS"]),
  amount: z.number().nonnegative(),
});

/** PUT /api/holdings { currency, amount } → set a currency balance. */
export async function PUT(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  setHolding(user.id, parsed.data.currency, parsed.data.amount);
  return NextResponse.json({ ok: true });
}
