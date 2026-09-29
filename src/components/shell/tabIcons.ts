import type { StaticImageData } from "next/image";
import { ScrollText, type LucideIcon } from "lucide-react";
import iconExchange from "../../assets/Currency_exchange.png";
import iconMarket from "../../assets/Web_market.png";
import iconCraft from "../../assets/Craft.png";
import iconWealth from "../../assets/Wealth.png";
import iconCoach from "../../assets/Coach.png";
import iconSettings from "../../assets/settings.png";
// The gold lantern logo stands in until the owner supplies dedicated Alerts art.
import iconAlerts from "../../assets/logo/logo_gold_bg.png";
import iconWaystone from "../../assets/items/waystone.png";
// Scroll of Wisdom identifies items — the closest in-game metaphor for "search my stash".
import iconScrollOfWisdom from "../../assets/items/scroll-of-wisdom.png";
import type { TabId } from "./tabRegistry";

/** Game art, or a lucide glyph for a tab that has no art yet (swapping art in is one line here). */
export type TabIcon = StaticImageData | LucideIcon;

export function isTabArt(icon: TabIcon): icon is StaticImageData {
  return "src" in icon;
}

// Kept apart from tabRegistry.ts so node test scripts never import PNGs.
export const TAB_ICONS: Record<TabId, TabIcon> = {
  exchange: iconExchange,
  market: iconMarket,
  farm: iconWaystone,
  craft: iconCraft,
  wealth: iconWealth,
  regex: iconScrollOfWisdom,
  patches: ScrollText,
  alerts: iconAlerts,
  settings: iconSettings,
  coach: iconCoach,
};
