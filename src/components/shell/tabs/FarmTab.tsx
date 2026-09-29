"use client";

import { FarmBoard } from "../../farm/FarmBoard";
import { StrategiesTool } from "../../farm/strategies/StrategiesTool";
import { useTabRoute } from "../useTabRoute";

/** Farm tab: the board (mechanic heat strip, pinnacle boss table, boss detail) or atlas strategies (tool=strategies). */
export function FarmTab() {
  const { tool } = useTabRoute();
  return tool === "strategies" ? <StrategiesTool /> : <FarmBoard />;
}
