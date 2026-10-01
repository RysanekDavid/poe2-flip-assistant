/*
 * Game art for a strategy card and a mechanic chip. A mechanic with its own tablet base shows that
 * tablet; one without (Essence, Strongbox, Trial of Chaos…) shows its strategies' main drop, which
 * is what the player farms it for. Never a generic placeholder passed off as the mechanic.
 */
import type { Mechanic } from "../../../core/strategies/schema";
import type { StrategyView } from "../../../lib/strategiesContract";
import { tabletArtSrc } from "./tabletArtImages";

const MECHANIC_TABLET: Partial<Record<Mechanic, string>> = {
  breach: "Breach Tablet",
  abyss: "Abyss Tablet",
  delirium: "Delirium Tablet",
  ritual: "Ritual Tablet",
  expedition: "Expedition Tablet",
  map_boss: "Overseer Tablet",
};

type ArtSource = Pick<StrategyView, "mechanics" | "tablets" | "yields">;

function mainDropArt(strategy: ArtSource): string | null {
  const main = strategy.yields.find((y) => y.role === "primary") ?? strategy.yields[0];
  return main?.icon_url ?? null;
}

/** A mechanic chip's art: its tablet, else the main drop of the first strategy that covers it. */
export function mechanicArt(mechanic: Mechanic, strategies: readonly ArtSource[]): string | null {
  const tablet = MECHANIC_TABLET[mechanic];
  if (tablet) return tabletArtSrc({ type: tablet, unique: null });
  const covering = strategies.find((s) => s.mechanics.includes(mechanic));
  return covering ? mainDropArt(covering) : null;
}

/** A card's header art: the first tablet it slots, else its first mechanic's art. */
export function strategyArt(strategy: ArtSource): string | null {
  const tablet = strategy.tablets[0];
  if (tablet) return tabletArtSrc(tablet);
  const first = strategy.mechanics[0];
  return first ? mechanicArt(first, [strategy]) : mainDropArt(strategy);
}
