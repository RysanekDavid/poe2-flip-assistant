"use client";

import type { PlanResponse } from "../../../lib/tools/craftPlannerContract";
import { fmtDivOrEx } from "../../../lib/format";
import { Button } from "../../ui/Button";
import { Drawer } from "../../ui/Drawer";
import { ItemArt } from "../../ui/ItemArt";
import { GuideRunner, useGuideScreen } from "../GuideRunner";
import type { MatInfoFn } from "../craftView";
import type { Screen } from "../SessionStep";
import { qtyText } from "./StepCard";

/**
 * "Run this plan": the generated guide in the same session runner the recipes use, in a drawer you
 * keep beside the game. Progress lives in its own storage key, so a running recipe session is
 * never touched; plan runs are not logged to Craft P&L (that needs saved plans).
 */

export const PLAN_SESSION_KEY = "craft-plan-session";

/** A short stable id of a plan request: the saved session belongs to exactly that plan. */
export function planSessionId(requestJson: string): string {
  let h = 5381;
  for (let i = 0; i < requestJson.length; i++) h = ((h << 5) + h + requestJson.charCodeAt(i)) | 0;
  return `plan-${(h >>> 0).toString(36)}`;
}

function ShopList({ plan, onStart }: { plan: PlanResponse; onStart: () => void }) {
  const ex = plan.exaltPerDivine ?? 0;
  return (
    <div className="space-y-4 p-4">
      <div className="rounded-md border-l-4 border-emerald-500 bg-emerald-950/20 px-3 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400">the goal</p>
        <p className="mt-0.5 text-sm text-emerald-100">{plan.guide.goal}</p>
      </div>
      <div className="rounded-md border-l-4 border-amber-500 bg-amber-950/20 px-3 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-400">the base</p>
        <p className="mt-0.5 text-sm text-amber-100">{plan.guide.shopping}</p>
      </div>
      <ul aria-label="shopping list" className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {plan.bill.map((m) => (
          <li key={m.id} className="flex items-center gap-2 rounded border border-neutral-800 bg-neutral-950/40 px-2 py-1.5 text-sm">
            <ItemArt src={plan.icons[m.id] ?? null} size={6} alt={m.label} />
            <span className="min-w-0 flex-1 truncate text-neutral-200">{m.label}</span>
            <span className="tabular-nums text-neutral-400">{qtyText(m.qty)}</span>
            {m.unitDiv != null && <span className="w-14 text-right text-xs tabular-nums text-neutral-500">{fmtDivOrEx(m.unitDiv, ex)}</span>}
          </li>
        ))}
      </ul>
      <p className="text-sm text-neutral-400">{plan.guide.marketCheck}</p>
      <Button variant="primary" onClick={onStart}>
        Start crafting → step 1
      </Button>
    </div>
  );
}

function Finish({ brick, text, onDone }: { brick: boolean; text: string; onDone: () => void }) {
  return (
    <div className="space-y-3 p-4">
      <p className="text-lg font-medium text-neutral-100">{brick ? "Stopped — the item didn't make it." : "Done — the plan is finished."}</p>
      <p className="text-sm text-neutral-400">{text}</p>
      <p className="text-sm text-neutral-400">Plan runs aren&apos;t logged to Craft P&amp;L yet; recipes are.</p>
      <Button variant="primary" onClick={onDone}>
        Close the session
      </Button>
    </div>
  );
}

interface Props {
  plan: PlanResponse;
  sessionId: string;
  onClose: () => void;
}

export function PlanSession({ plan, sessionId, onClose }: Props) {
  const { screen, go, reset } = useGuideScreen(PLAN_SESSION_KEY, sessionId);
  const ex = plan.exaltPerDivine ?? 0;
  const matInfo: MatInfoFn = (id) => {
    const unit = plan.bill.find((m) => m.id === id)?.unitDiv ?? null;
    return { price: unit != null ? fmtDivOrEx(unit, ex) : null, icon: plan.icons[id] ?? null };
  };
  const finish = (): void => {
    reset();
    onClose();
  };
  const start: Screen = { kind: "step", idx: 0, failed: false };
  return (
    <Drawer title={`Run this plan — ${plan.base.name}`} onClose={onClose}>
      <GuideRunner
        guide={plan.guide}
        screen={screen}
        go={go}
        matInfo={matInfo}
        legality={() => null}
        onReset={screen.kind === "shop" ? null : reset}
        shop={<ShopList plan={plan} onStart={() => go(start)} />}
        outcome={(brick) => <Finish brick={brick} text={plan.guide.brick} onDone={finish} />}
      />
    </Drawer>
  );
}
