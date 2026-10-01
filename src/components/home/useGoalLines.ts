"use client";

import { DiscoverResponseSchema } from "../../lib/discoverContract";
import type { NavMode } from "../../lib/navMode";
import { opportunitiesResponseSchema } from "../../lib/opportunitiesContract";
import { patchesResponseSchema } from "../../lib/patchesContract";
import { strategiesResponseSchema, type StrategiesResponse } from "../../lib/strategiesContract";
import { strategyArt } from "../farm/strategies/strategyArt";
import type { GoalId } from "./GoalCards";
import { craftPicksSchema, netWorthSummarySchema, pickCraft, pickFlip, pickNetWorth, pickOpportunity, pickPatch, pickStrategy } from "./homePicks";
import { useHomePick, type HomeLine } from "./useHomePick";

// Module-level so the pickers keep one identity across renders.
const pickHotStrategy = (data: StrategiesResponse) => pickStrategy(data, strategyArt);

/**
 * Today's line for every goal card. Feeds behind Advanced tools run only in Advanced mode; a
 * Beginner's card for them shows its hint instead of spending a request nobody asked for.
 */
export function useGoalLines(mode: NavMode): Record<GoalId, HomeLine> {
  const advanced = mode === "advanced";
  const farm = useHomePick("/api/farm/strategies", strategiesResponseSchema, pickHotStrategy, true);
  const price = useHomePick("/api/market/opportunities", opportunitiesResponseSchema, pickOpportunity, advanced);
  const flips = useHomePick("/api/discover?limit=60", DiscoverResponseSchema, pickFlip, advanced);
  const craft = useHomePick("/api/craft/margins", craftPicksSchema, pickCraft, advanced);
  const stash = useHomePick("/api/balance/summary", netWorthSummarySchema, pickNetWorth, advanced);
  const learn = useHomePick("/api/patches?limit=1", patchesResponseSchema, pickPatch, true);
  return { farm, price, flips, craft, stash, regex: { kind: "off" }, learn };
}
