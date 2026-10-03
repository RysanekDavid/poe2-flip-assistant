import { TriangleAlert } from "lucide-react";
import type { ImpracticalView, PlanResponse } from "../../../lib/tools/craftPlannerContract";
import { ItemArt } from "../../ui/ItemArt";
import { Tooltip } from "../../ui/Tooltip";
import { severityOf } from "./alternativesModel";

/**
 * The loud "this step is not realistic" banner. The counts are the same model's expectations the
 * bill shows — the banner only puts them in words, with the per-try odds that make them explode.
 */

const count = (n: number): string => Math.round(n).toLocaleString("en");
const oneIn = (p: number): string => (p >= 0.5 ? `${Math.round(p * 100)}%` : `1 in ${count(1 / p)}`);

const TONE = {
  amber: "border-amber-400/60 bg-amber-950/40 text-amber-100",
  red: "border-red-500/60 bg-red-950/40 text-red-100",
} as const;

export function ImpracticalBanner({ imp, plan }: { imp: ImpracticalView; plan: PlanResponse }) {
  const tone = severityOf(imp);
  const odds = imp.perClick != null && imp.perClick > 0 ? `Each try lands the mod it aims at about ${oneIn(imp.perClick)}` : "Each try is a long shot";
  const undo = imp.undoRisk ? ", and the Annulment that clears a miss can take a mod you already landed — so the count snowballs" : "";
  const next = plan.alternatives.length > 0 ? "The summary lists cheaper targets — one click re-plans." : "Lower a minimum tier or leave a mod off to bring it down.";
  return (
    <div role="alert" className={`mt-3 flex items-start gap-3 rounded-md border p-3 ${TONE[tone]}`}>
      <TriangleAlert aria-hidden className={`mt-0.5 h-5 w-5 shrink-0 ${tone === "red" ? "text-red-300" : "text-amber-300"}`} />
      <div className="min-w-0 flex-1 space-y-1 text-sm">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold">
          <span>Not realistic: about</span>
          <Tooltip tip={`${count(imp.clicks.point)} on average; the band is ${count(imp.clicks.low)} – ${count(imp.clicks.high)}. On average only 1 try in ${count(imp.clicks.point)} finishes this step.`} align="start">
            <span className="inline-flex items-center gap-1 tabular-nums">
              <ItemArt src={plan.icons[imp.materialId] ?? null} size={5} alt="" />
              {count(imp.clicks.point)} × {imp.label}
            </span>
          </Tooltip>
          <span>on this step</span>
        </p>
        <p className="opacity-90">
          {odds}
          {undo}. {next}
        </p>
      </div>
    </div>
  );
}
