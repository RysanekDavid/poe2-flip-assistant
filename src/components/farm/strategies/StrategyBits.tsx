"use client";

import { usePathname, useRouter } from "next/navigation";
import { Regex, TrendingDown, TrendingUp } from "lucide-react";
import { BUDGET_SCALE, BUDGET_STEPS, RATING_LABEL, RATING_STEPS, scaleText } from "../../../core/strategies/ratings";
import { BUDGET_TIERS, type BudgetTier, type RatingKey } from "../../../core/strategies/schema";
import type { StrategyView, Trend } from "../../../lib/strategiesContract";
import { Tooltip } from "../../ui/Tooltip";
import { BUDGET_LABEL } from "./strategiesView";
import { fmtChange, statusChip, trendTip, trendTone, waystoneRegexHref } from "./strategyCards";

// Fits beside "BUDGET" in a third of a 390 px card; the full tier name is in the hover.
const BUDGET_SHORT: Record<BudgetTier, string> = { league_start: "Start", mid: "Mid", high: "High" };

const TONE_CLASS = {
  up: "border-good/40 bg-good/10 text-good",
  down: "border-bad/40 bg-bad/10 text-bad",
  flat: "border-line bg-neutral-900/80 text-neutral-300",
} as const;

/** "▲ +12% 7d": the card headline — how the drops' prices moved, never a profit per hour. */
export function TrendPill({ trend }: { trend: Trend | null }) {
  const tone = trendTone(trend);
  const Icon = tone === "down" ? TrendingDown : TrendingUp;
  return (
    <Tooltip tip={trendTip(trend)} align="end">
      <span tabIndex={0} className={`relative inline-flex h-7 cursor-help items-center gap-1 whitespace-nowrap rounded-full border px-2.5 text-sm font-semibold tabular-nums ${TONE_CLASS[tone]}`}>
        {trend ? (
          <>
            {tone !== "flat" && <Icon aria-hidden className="h-4 w-4" />}
            {fmtChange(trend.change7d)} <span className="text-xs font-normal">7d</span>
            {/* partial coverage stays visible, not only on hover: the move may rest on one drop */}
            {trend.counted < trend.total && (
              <span className="text-xs font-normal text-neutral-400">
                · {trend.counted}/{trend.total}
                <span className="sr-only"> drops counted</span>
              </span>
            )}
          </>
        ) : (
          <span className="text-xs font-normal">no price trend</span>
        )}
      </span>
    </Tooltip>
  );
}

function Bar({ filled, steps }: { filled: number | null; steps: number }) {
  return (
    <span aria-hidden className="mt-1 flex gap-[3px]">
      {Array.from({ length: steps }, (_, i) => (
        <span key={i} className={`h-1.5 flex-1 rounded-full ${filled !== null && i < filled ? "bg-neutral-300" : "bg-neutral-800"}`} />
      ))}
    </span>
  );
}

function Meter({ label, filled, steps, tip, value }: { label: string; filled: number | null; steps: number; tip: string; value: string }) {
  return (
    <Tooltip tip={tip} align="start">
      <span tabIndex={0} className="grid min-w-0 cursor-help">
        <span className="flex items-baseline justify-between gap-1 text-xs uppercase tracking-wide text-neutral-400">
          {label}
          <span className="whitespace-nowrap normal-case tracking-normal text-neutral-300">{value}</span>
        </span>
        <Bar filled={filled} steps={steps} />
      </span>
    </Tooltip>
  );
}

function ratingMeter(strategy: Pick<StrategyView, "ratings">, key: RatingKey) {
  const rating = strategy.ratings[key];
  const label = RATING_LABEL[key];
  if (rating.value === null) {
    return <Meter key={key} label={label} filled={null} steps={RATING_STEPS} value="—" tip={`${label}: not rated — ${rating.why}`} />;
  }
  const tip = `${label} ${rating.value}/${RATING_STEPS} — ${scaleText(key, rating.value)}. ${rating.why}`;
  return <Meter key={key} label={label} filled={rating.value} steps={RATING_STEPS} value={`${rating.value}/${RATING_STEPS}`} tip={tip} />;
}

/** Budget (three curated tiers), Build and Complexity (1–5); every bar explains itself on hover. */
export function StrategyMeters({ strategy }: { strategy: Pick<StrategyView, "budget" | "ratings"> }) {
  const tier = strategy.budget.tier;
  const budgetTip = `Budget: ${BUDGET_LABEL[tier]} — ${BUDGET_SCALE[tier]}. ${strategy.budget.why}`;
  return (
    <div className="grid grid-cols-3 gap-3">
      <Meter label="Budget" filled={BUDGET_TIERS.indexOf(tier) + 1} steps={BUDGET_STEPS} value={BUDGET_SHORT[tier]} tip={budgetTip} />
      {ratingMeter(strategy, "build")}
      {ratingMeter(strategy, "complexity")}
    </div>
  );
}

const STATUS_CLASS = {
  draft: "border-line text-neutral-400",
  verified: "border-good/40 text-good",
  stale: "border-amber-400/40 text-amber-300",
} as const;

/** "draft" grey until reviewed; a reviewed strategy shows the patch it was checked on. */
export function StatusBadge({ strategy }: { strategy: Pick<StrategyView, "status" | "patch"> }) {
  const chip = statusChip(strategy);
  return (
    <span title={chip.tip} className={`inline-flex h-6 items-center rounded border px-1.5 text-xs ${STATUS_CLASS[chip.tone]}`}>
      {chip.text}
    </span>
  );
}

/** Opens Regex › Waystone with this strategy's waystone totals already selected. */
export function WaystoneRegexLink({ waystone, compact = false }: { waystone: StrategyView["waystone"]; compact?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const href = waystoneRegexHref(waystone.prefer);
  if (href === null) return null;
  return (
    <a
      href={href}
      onClick={(e) => {
        e.stopPropagation();
        // a plain click stays in the app (no reload); ctrl/middle click still opens a new tab via href
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        router.push(`${pathname}${href}`);
      }}
      title="Open the Regex tool with these waystone totals selected; set your minimums there and copy the search"
      className="inline-flex h-7 items-center gap-1 rounded-md border border-line px-2 text-xs text-neutral-300 hover:border-neutral-500 hover:text-neutral-100"
    >
      <Regex aria-hidden className="h-3.5 w-3.5" />
      {compact ? "Regex" : "Waystone regex"}
    </a>
  );
}
