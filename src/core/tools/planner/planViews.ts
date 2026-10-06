import type { PlanResponse } from "../../../lib/tools/craftPlannerContract";
import { addBand, scaleBand } from "./expectation";
import { targetText } from "./methodKit";
import type { Band, Move, PlanCtx } from "./types";
import type { Unrolled } from "./unroll";

/** Response parts derived from the context and the found moves: the target list, the start, the total with the bought base. */

export function targetViews(ctx: PlanCtx): PlanResponse["targets"] {
  return ctx.targets.map((t) => ({
    idx: t.idx,
    modId: t.modId,
    text: t.text,
    side: t.side,
    level: t.level,
    source: t.source,
    fractured: t.fractured,
    group: t.group,
    candidates: t.alts.map((c) => ({ modId: c.modId, text: c.text, level: c.level })),
  }));
}

/** The start the plan uses; a bought one names what it carries (the planner's pick when the player left it open). */
export function startView(ctx: PlanCtx, moves: readonly Move[], buys: Band): PlanResponse["start"] {
  const first = moves[0];
  if (ctx.start.kind !== "bought" || !first?.bought) return { kind: "clean" };
  return {
    kind: "bought",
    rarity: first.bought.rarity,
    carried: first.bought.carried.map((c) => {
      const t = ctx.targets[c.ref]!;
      return { ref: c.ref, fractured: c.fractured, modIds: t.alts.length > 0 ? t.alts.map((a) => a.modId) : [t.modId], text: targetText(t.text) };
    }),
    askDiv: ctx.start.askDiv,
    buys: { ...buys },
  };
}

/** Materials plus every base bought at the player's price; null div until the price (and every material price) is in. */
export function totalsWithBase(ctx: PlanCtx, out: Pick<Unrolled, "totals" | "buys">): PlanResponse["totalsWithBase"] {
  if (ctx.start.kind !== "bought") return null;
  const ask = ctx.start.askDiv;
  const div = out.totals.div && ask != null ? addBand(out.totals.div, scaleBand(out.buys, ask)) : null;
  return { div, basis: out.totals.basis };
}
