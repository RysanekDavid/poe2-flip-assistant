import { ArrowDownRight } from "lucide-react";
import type { AlternativeView, PlanResponse } from "../../../lib/tools/craftPlannerContract";
import { fmtDivOrEx } from "../../../lib/format";
import { Tooltip } from "../../ui/Tooltip";
import { alternativeLabel, changeText } from "./alternativesModel";

/**
 * Cheaper target sets for a plan with an impractical step, as one-click chips: the chip changes the
 * item's slots and re-plans. Each cost comes from planning that exact target set, never a guess.
 */

function Chip({ alt, ex, onPick }: { alt: AlternativeView; ex: number; onPick: ((alt: AlternativeView) => void) | null }) {
  const cost = alt.totals.div ? `≈ ${fmtDivOrEx(alt.totals.div.point, ex)}` : "unpriced";
  const tip = (
    <span className="block max-w-[15rem] space-y-1 sm:max-w-xs">
      {alt.changes.map((c) => (
        <span key={`${c.kind}:${c.target}`} className="block">
          {changeText(c)}
        </span>
      ))}
      <span className="block text-neutral-300">
        {alt.impractical ? "Cheaper, but a step is still past what anyone clicks by hand." : "Planned with the same odds model as this plan."}
        {onPick ? " Click to change the item and plan it." : ""}
      </span>
    </span>
  );
  return (
    <li>
      <Tooltip tip={tip} align="start">
        <button
          type="button"
          disabled={!onPick}
          onClick={onPick ? () => onPick(alt) : undefined}
          className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-amber-400/50 bg-amber-950/30 px-2.5 py-1 text-left text-sm text-amber-100 hover:border-amber-300 hover:bg-amber-900/40 disabled:cursor-not-allowed disabled:opacity-70"
        >
          <ArrowDownRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-amber-300" />
          <span className="min-w-0 break-words">{alternativeLabel(alt)}</span>
          <span className="shrink-0 tabular-nums text-amber-300">{cost}</span>
          {alt.impractical && <span className="shrink-0 text-xs text-red-300">still long</span>}
        </button>
      </Tooltip>
    </li>
  );
}

export function AlternativeChips({ plan, onPick }: { plan: PlanResponse; onPick: ((alt: AlternativeView) => void) | null }) {
  if (plan.alternatives.length === 0) return null;
  return (
    <section aria-label="cheaper targets" className="space-y-2 rounded-md border border-amber-400/40 bg-amber-950/20 p-3">
      <p className="text-sm font-medium text-amber-100">Cheaper targets</p>
      <ul className="flex flex-wrap gap-2">
        {plan.alternatives.map((alt) => (
          <Chip key={alt.changes.map((c) => `${c.kind}:${c.target}`).join("|")} alt={alt} ex={plan.exaltPerDivine ?? 0} onPick={onPick} />
        ))}
      </ul>
      {!onPick && <p className="text-xs text-amber-200">You changed the item since this plan — plan it again to use these.</p>}
    </section>
  );
}
