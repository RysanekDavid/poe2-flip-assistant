"use client";

import { Map as MapIcon } from "lucide-react";
import { ToolChips } from "../../shell/ToolChips";
import { EmptyState } from "../../ui/EmptyState";
import { PageHeader } from "../../ui/PageHeader";

/** Farm → Strategies shell: routed and switchable now; the verified strategy cards land with the strategy KB. */
export function StrategiesTool() {
  return (
    <section className="grid gap-3">
      <PageHeader
        title="Farm strategies"
        purpose="Atlas setups per mechanic: master, notables, tablets, waystones and what the basket sells for."
        action={<ToolChips tab="farm" />}
      />
      <EmptyState
        icon={<MapIcon className="h-5 w-5" />}
        sentence="Coming soon — strategies are being verified against the current patch before they are shown."
      />
    </section>
  );
}
