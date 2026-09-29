"use client";

import { DemandBoard } from "../../DemandBoard";
import { AutoSnipeBar } from "../../AutoSnipeBar";
import { SnipeTargets } from "../../SnipeTargets";
import { PageHeader } from "../../ui/PageHeader";

/** Trade-site market: what buyers want and listings priced under their value. */
export function MarketTab() {
  return (
    <>
      <PageHeader
        title="Market"
        purpose="What sells on the trade site right now, and listings priced under what they are worth."
      />
      <DemandBoard />
      <AutoSnipeBar />
      <SnipeTargets />
    </>
  );
}
