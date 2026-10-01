"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { CraftMarginPanel } from "../../CraftMarginPanel";
import { CraftTopPicks } from "../../CraftTopPicks";
import { CraftPnlPanel } from "../../CraftPnlPanel";
import { MaterialsPanel } from "../../MaterialsPanel";
import { CraftMarginsProvider, useCraftMargins } from "../../craft/CraftMarginsContext";
import { MOD_POOL_LEGEND } from "../../../lib/tools/modPoolContract";
import { decodeItem, SHARE_PARAM } from "../../../lib/tools/shareItem";
import { ComputedLeague } from "../../ui/ComputedLeague";
import { PageHeader } from "../../ui/PageHeader";
import { PanelLoading } from "../PanelLoading";
import { useTabRoute } from "../useTabRoute";

const CraftMovesTool = dynamic(() => import("../../craft/moves/CraftMovesTool").then((m) => m.CraftMovesTool), {
  loading: PanelLoading,
});

const RollSellTool = dynamic(() => import("../../craft/rollsell/RollSellTool").then((m) => m.RollSellTool), {
  loading: PanelLoading,
});

const ModPoolTool = dynamic(() => import("../../craft/modpool/ModPoolTool").then((m) => m.ModPoolTool), {
  loading: PanelLoading,
});

const RECIPES_LEGEND =
  "Modelled EV per attempt = curated hit rate × result price (median of comparable instant-buyout asks) − base − materials. " +
  "Asks are not sales. Only well-sampled recipes are ranked or alerted; the rest show Review. Read-only — you craft by hand.";

const MOVES_LEGEND =
  "Moves are legal by the verified 0.5.x rules. No odds: PoE2 mod weights are not public, so cards rank by what the move does " +
  "and link Craft of Exile / poe2htc for estimates. Valuing an outcome spends one trade search with your POESESSID.";

/** The one league chip for the recipe view: every craft panel prices in the default league. */
function RecipesLeague() {
  const { data } = useCraftMargins();
  return <ComputedLeague league={data?.computedLeague} />;
}

function Recipes() {
  return (
    <>
      <CraftTopPicks />
      <CraftMarginPanel />
      {/* real attempts logged against the model (hit rate + net) */}
      <CraftPnlPanel />
      <MaterialsPanel />
    </>
  );
}

/** ?item=<base64url> from a share link; a malformed one is reported, never silently dropped. */
function useSharedItem(): { text: string | null; error: string | null } {
  const raw = useSearchParams().get(SHARE_PARAM);
  return useMemo(() => {
    if (raw == null) return { text: null, error: null };
    try {
      return { text: decodeItem(raw), error: null };
    } catch (e: unknown) {
      console.error("[craft] share link item unreadable", e);
      return { text: null, error: `this share link's item could not be read (${e instanceof Error ? e.message : String(e)})` };
    }
  }, [raw]);
}

function MovesView() {
  const shared = useSharedItem();
  return (
    <>
      <PageHeader
        title="Craft"
        purpose="Paste an item: its three next best moves, what they cost and what a hit is worth."
        legend={MOVES_LEGEND}
      />
      {shared.error && <p role="alert" className="text-sm text-bad">{shared.error}</p>}
      <CraftMovesTool initialText={shared.text} />
    </>
  );
}

function ModPoolView() {
  return (
    <>
      <PageHeader
        title="Craft"
        purpose="Pick a base: every mod it rolls at your item level, its tier gates, and what items carrying it ask."
        legend={MOD_POOL_LEGEND}
      />
      <ModPoolTool />
    </>
  );
}

function RecipesView() {
  return (
    // one shared /api/craft/margins poller for the header chip, top picks and the recipe list
    <CraftMarginsProvider>
      <PageHeader
        title="Craft"
        purpose="Recipes that pay today at current prices — craft the amber ones, review the rest."
        legend={RECIPES_LEGEND}
        action={<RecipesLeague />}
      />
      <Recipes />
    </CraftMarginsProvider>
  );
}

/**
 * Craft tab: recipes that pay today (tool=recipes), an item's next best move (tool=moves), a base's
 * mod pool (tool=modpool) or items worth rolling for one mod and selling (tool=rollsell).
 */
export function CraftTab() {
  const { tool } = useTabRoute();
  if (tool === "moves") return <MovesView />;
  if (tool === "modpool") return <ModPoolView />;
  if (tool === "rollsell") return <RollSellTool />;
  return <RecipesView />;
}
