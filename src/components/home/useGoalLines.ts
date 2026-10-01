"use client";

import { DiscoverResponseSchema } from "../../lib/discoverContract";
import type { NavMode } from "../../lib/navMode";
import { opportunitiesResponseSchema } from "../../lib/opportunitiesContract";
import { patchesResponseSchema } from "../../lib/patchesContract";
import { strategiesResponseSchema, type StrategiesResponse } from "../../lib/strategiesContract";
import { strategyArt } from "../farm/strategies/strategyArt";
import { useNetWorthSummary, type NetWorthState } from "../wealth/useNetWorthSummary";
import type { GoalId } from "./GoalCards";
import { craftPicksSchema, pickCraft, pickFlip, pickNetWorth, pickOpportunity, pickPatch, pickStrategy } from "./homePicks";
import { useHomePick, type HomeLine } from "./useHomePick";

// Module-level so the pickers keep one identity across renders.
const pickHotStrategy = (data: StrategiesResponse) => pickStrategy(data, strategyArt);

/** The stash card reads the header chip's own poll (useNetWorthSummary), never a second request. */
function stashLine(net: NetWorthState, advanced: boolean): HomeLine {
  if (!advanced) return { kind: "off" };
  if (net.data) return pickNetWorth(net.data);
  if (net.error !== null) return { kind: "error", message: net.error };
  return { kind: "loading" };
}

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
  const learn = useHomePick("/api/patches?limit=1", patchesResponseSchema, pickPatch, true);
  const stash = stashLine(useNetWorthSummary(), advanced);
  return { farm, price, flips, craft, stash, regex: { kind: "off" }, learn };
}
