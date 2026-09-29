import type { StaticImageData } from "next/image";
import { ScrollText, Search, type LucideIcon } from "lucide-react";
import iconExchange from "../../assets/Currency_exchange.png";
import iconMarket from "../../assets/Web_market.png";
import iconCraft from "../../assets/Craft.png";
import iconWealth from "../../assets/Wealth.png";
import iconCoach from "../../assets/Coach.png";
import iconSettings from "../../assets/settings.png";
// The gold lantern logo stands in until the owner supplies dedicated Alerts art.
import iconAlerts from "../../assets/logo/logo_gold_bg.png";
import iconWaystone from "../../assets/items/waystone.png";
import type { TabId } from "./tabRegistry";

/** Tab art, or a lucide glyph where no in-game object fits (swap to `art` once owner PNGs exist). */
export type TabIcon = { kind: "art"; src: StaticImageData } | { kind: "glyph"; Icon: LucideIcon };

const art = (src: StaticImageData): TabIcon => ({ kind: "art", src });

// Kept apart from tabRegistry.ts so node test scripts never import PNGs.
export const TAB_ICONS: Record<TabId, TabIcon> = {
  exchange: art(iconExchange),
  market: art(iconMarket),
  farm: art(iconWaystone),
  craft: art(iconCraft),
  wealth: art(iconWealth),
  regex: { kind: "glyph", Icon: Search },
  patches: { kind: "glyph", Icon: ScrollText },
  alerts: art(iconAlerts),
  settings: art(iconSettings),
  coach: art(iconCoach),
};
