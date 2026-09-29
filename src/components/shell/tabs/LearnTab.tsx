"use client";

import { AtlasChecklist } from "../../learn/AtlasChecklist";
import { CurrencyPrimer } from "../../learn/CurrencyPrimer";
import { WhatIsThis } from "../../learn/WhatIsThis";
import { PageHeader } from "../../ui/PageHeader";
import { ToolChips } from "../ToolChips";
import { useTabRoute } from "../useTabRoute";

const VIEW = {
  what: { title: "What is this?", purpose: "Find any item: what it does, what it is worth right now, and where to sell it." },
  currency: { title: "Currency primer", purpose: "The currencies you will meet first: what each does, who uses it, and whether to pick it up." },
  atlas: { title: "Atlas checklist", purpose: "The endgame unlock route, step by step — tick steps off as you go." },
} as const;

type LearnTool = keyof typeof VIEW;
const isLearnTool = (tool: string | null): tool is LearnTool => tool !== null && tool in VIEW;

function LearnBody({ tool }: { tool: LearnTool }) {
  switch (tool) {
    case "what":
      return <WhatIsThis />;
    case "currency":
      return <CurrencyPrimer />;
    case "atlas":
      return <AtlasChecklist />;
  }
}

/** Learn tab: the new-player home — item lookup, currency primer, atlas checklist. */
export function LearnTab() {
  const { tool } = useTabRoute();
  // The registry only admits these tools, so anything else is a registry/VIEW drift.
  if (!isLearnTool(tool)) throw new Error(`LearnTab: no view for tool ${String(tool)}`);
  const view = VIEW[tool];
  return (
    <div className="space-y-4" data-tour="learn">
      <PageHeader title={view.title} purpose={view.purpose} action={<ToolChips tab="learn" />} />
      <LearnBody tool={tool} />
    </div>
  );
}
