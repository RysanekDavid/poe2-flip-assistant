import type { ItemStateView, PlanResponse } from "../../../lib/tools/craftPlannerContract";
import { MOD_TONE, SideChip, TooltipFrame } from "./tooltipParts";

/**
 * The item after one step, as a small in-game tooltip: wanted mods in their game colours, junk as
 * a dim placeholder of its side, and what this step changed marked "new" (removed lines struck
 * through). The plan is abstract — junk has no identity — so a line names its role, not a roll.
 */

type Affix = ItemStateView["affixes"][number];
type Target = PlanResponse["targets"][number];

const SIDE_ORDER = { prefix: 0, suffix: 1, any: 2 } as const;
const sigOf = (a: Affix): string => `${a.side}|${a.kind}|${a.target ?? "-"}|${a.unrevealed ? 1 : 0}`;

/** Multiset difference a − b by signature. */
function minus(a: readonly Affix[], b: readonly Affix[]): Affix[] {
  const left = new Map<string, number>();
  for (const x of b) left.set(sigOf(x), (left.get(sigOf(x)) ?? 0) + 1);
  return a.filter((x) => {
    const n = left.get(sigOf(x)) ?? 0;
    if (n > 0) left.set(sigOf(x), n - 1);
    return n === 0;
  });
}

function label(a: Affix, targets: readonly Target[]): { text: string; tone: string } {
  if (a.unrevealed) return { text: `unrevealed desecrated ${a.side === "any" ? "mod" : a.side} — reveal at the Well`, tone: MOD_TONE.desecrated };
  const t = a.target != null ? targets[a.target] : undefined;
  const tone = MOD_TONE[a.kind];
  if (t) return { text: t.text, tone };
  const role = a.kind === "fractured" ? "fractured anchor" : a.kind === "crafted" ? "crafted mod" : "a mod you don't need";
  return { text: `${role}${a.side === "any" ? " (either side)" : ""}`, tone: `${tone} italic opacity-70` };
}

interface Props {
  after: ItemStateView;
  /** The item before this step; null for the first step (everything shown is the bought base). */
  before: ItemStateView | null;
  plan: PlanResponse;
  art: string | null;
}

export function StepItemPreview({ after, before, plan, art }: Props) {
  const added = before ? minus(after.affixes, before.affixes) : [];
  const removed = before ? minus(before.affixes, after.affixes) : [];
  const fresh = new Set(added);
  const lines = [...after.affixes].sort((a, b) => SIDE_ORDER[a.side] - SIDE_ORDER[b.side]);
  const quality = after.quality > 0 ? ` · ${after.quality}% quality` : "";
  return (
    <TooltipFrame compact title={plan.base.name} subtitle={`${after.rarity}${quality}`} art={art}>
      {lines.length === 0 && <p className="text-center text-xs italic text-neutral-500">no mods</p>}
      <ul className="space-y-0.5">
        {lines.map((a, i) => {
          const { text, tone } = label(a, plan.targets);
          const isNew = fresh.has(a);
          return (
            <li key={`${sigOf(a)}-${i}`} className={`flex items-start gap-1.5 rounded-sm pl-1 ${isNew ? "bg-amber-400/10 shadow-[inset_2px_0_0_theme(colors.accent)]" : ""}`}>
              <SideChip side={a.side} />
              <span className={`min-w-0 flex-1 text-xs leading-5 ${tone}`}>{text}</span>
              {isNew && <span className="shrink-0 text-xs text-amber-300">new</span>}
            </li>
          );
        })}
        {removed.map((a, i) => (
          <li key={`gone-${sigOf(a)}-${i}`} className="flex items-start gap-1.5 pl-1 opacity-60">
            <SideChip side={a.side} />
            <span className="min-w-0 flex-1 text-xs leading-5 text-neutral-400 line-through">{label(a, plan.targets).text}</span>
            <span className="shrink-0 text-xs text-neutral-400">gone</span>
          </li>
        ))}
      </ul>
    </TooltipFrame>
  );
}
