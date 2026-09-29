"use client";

import dynamic from "next/dynamic";
import { CraftMarginPanel } from "../../CraftMarginPanel";
import { CraftTopPicks } from "../../CraftTopPicks";
import { CraftPnlPanel } from "../../CraftPnlPanel";
import { MaterialsPanel } from "../../MaterialsPanel";
import { CraftMarginsProvider } from "../../craft/CraftMarginsContext";
import { PageHeader } from "../../ui/PageHeader";
import { PanelLoading } from "../PanelLoading";
import { ToolChips } from "../ToolChips";
import { useTabRoute } from "../useTabRoute";

const CraftMovesTool = dynamic(() => import("../../tools/craftmoves/CraftMovesTool").then((m) => m.CraftMovesTool), {
  loading: PanelLoading,
});

function Recipes() {
  return (
    // one shared /api/craft/margins poller for top picks + the four domain windows
    <CraftMarginsProvider>
      <CraftTopPicks />
      <CraftMarginPanel domain="jewel" showRefresh />
      <CraftMarginPanel domain="weapon" />
      <CraftMarginPanel domain="jewellery" />
      <CraftMarginPanel domain="armour" />
      {/* real attempts logged against the model (hit rate + net) */}
      <CraftPnlPanel />
      <MaterialsPanel />
    </CraftMarginsProvider>
  );
}

/*
 * Interim Craft tab: the current recipe panels (tool=recipes) and the craft-moves tool
 * (tool=moves), unchanged, until stream C rebuilds both.
 */
export function CraftTab() {
  const { tool } = useTabRoute();
  return (
    <>
      <PageHeader
        title="Craft"
        purpose="Recipes that pay today, or paste an item to see what you can do with it next."
        action={<ToolChips tab="craft" />}
      />
      {tool === "moves" ? <CraftMovesTool /> : <Recipes />}
    </>
  );
}
