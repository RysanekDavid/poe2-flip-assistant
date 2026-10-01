"use client";

import { BossesTool } from "../../farm/BossesTool";
import { StrategiesTool } from "../../farm/strategies/StrategiesTool";
import { useTabRoute } from "../useTabRoute";

/** Farm tab: strategy cards (the default) or the pinnacle boss table (tool=bosses). */
export function FarmTab() {
  const { tool } = useTabRoute();
  return tool === "bosses" ? <BossesTool /> : <StrategiesTool />;
}
