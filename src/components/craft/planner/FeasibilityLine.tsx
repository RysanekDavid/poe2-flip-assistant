import { Check } from "lucide-react";
import type { FeasibilityIssueView } from "../../../lib/tools/craftPlannerContract";
import { IssueLine } from "./IssueLine";
import type { LiveCheck } from "./plannerModel";

/**
 * Live feasibility under the item, in plain words: slot counts, the one-crafted / one-desecrated
 * limits and the item-level gate — each a chip that turns red when broken. The server's reasons
 * that concern no single slot are listed under it with their grade.
 */

const CHIP = "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs tabular-nums";
const OK = `${CHIP} border-neutral-700 text-neutral-300`;
const BAD = `${CHIP} border-red-500/50 bg-red-950/30 text-red-200`;

interface Props {
  check: LiveCheck;
  issues: FeasibilityIssueView[];
  onIlvl: (n: number) => void;
}

export function FeasibilityLine({ check, issues, onIlvl }: Props) {
  const needs = check.ilvlShort.reduce((m, x) => Math.max(m, x.needs), 0);
  return (
    <div className="space-y-1.5" aria-live="polite">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={OK} title="prefix slots used of this base's cap">
          {check.p.used}/{check.p.cap} prefixes
        </span>
        <span className={OK} title="suffix slots used of this base's cap">
          {check.s.used}/{check.s.cap} suffixes
        </span>
        {check.crafted > 0 && (
          <span className={check.crafted > 1 ? BAD : OK} title="one crafted (essence-only) mod per item — a second needs Astrid's Creativity, which the planner doesn't plan">
            crafted {check.crafted}/1
          </span>
        )}
        {check.desecrated > 0 && (
          <span className={check.desecrated > 1 ? BAD : OK} title="one desecrated mod per item — a second needs Putrefaction, which corrupts the item">
            desecrated {check.desecrated}/1
          </span>
        )}
        {check.fractured > 0 && (
          <span className={check.fractured > 1 ? BAD : OK} title="an item can be fractured once, and a fracture locks one mod">
            fractured {check.fractured}/1
          </span>
        )}
        {needs > 0 ? (
          <button type="button" onClick={() => onIlvl(needs)} className={`${BAD} hover:bg-red-950/60`} title="a picked tier needs a higher item level — click to raise it">
            needs ilvl {needs} · fix
          </button>
        ) : (
          <span className={OK}>
            <Check aria-hidden className="h-3 w-3 text-emerald-400" /> item level ok
          </span>
        )}
      </div>
      {issues.map((issue) => (
        <IssueLine key={issue.rule + issue.message} issue={issue} />
      ))}
    </div>
  );
}
