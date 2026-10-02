import { AlertTriangle, Ban } from "lucide-react";
import { isRmtUrl, type Claim, type ClaimVerdict } from "../../../lib/claim";
import type { FeasibilityIssueView } from "../../../lib/tools/craftPlannerContract";
import { ClaimBadge } from "../../ui/ClaimBadge";

/** The planner's sources are prose ("poe2-crafting-knowledge.md §2; https://poe2db.tw/…"): links become sources, the rest the note. */
export function claimOf(grade: ClaimVerdict, source: string): Claim {
  // an RMT shop is never a source we link to, even if one slips into a planner note
  const src = (source.match(/https?:\/\/[^\s;,)]+/g) ?? []).filter((url) => !isRmtUrl(url));
  return { v: grade, src, note: source };
}

/**
 * One feasibility reason: red = the rule makes it impossible, amber = it rests on an assumption.
 * The grade chip opens the rule's source.
 */
export function IssueLine({ issue, compact = false }: { issue: FeasibilityIssueView; compact?: boolean }) {
  const impossible = issue.severity === "impossible";
  const Icon = impossible ? Ban : AlertTriangle;
  return (
    <p
      role={impossible ? "alert" : undefined}
      className={`flex items-start gap-1.5 ${compact ? "mt-0.5 pl-1 text-xs" : "text-sm"} ${impossible ? "text-red-300" : "text-amber-200"}`}
    >
      <Icon aria-hidden className={`mt-0.5 shrink-0 ${compact ? "h-3 w-3" : "h-3.5 w-3.5"}`} />
      <span className="min-w-0 flex-1">
        <span className="sr-only">{impossible ? "impossible: " : "assumption: "}</span>
        {issue.message} <ClaimBadge claim={claimOf(issue.grade, issue.source)} />
      </span>
    </p>
  );
}
