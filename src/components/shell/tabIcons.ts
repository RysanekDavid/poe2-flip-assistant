import type { StaticImageData } from "next/image";
import { Map as MapIcon, Regex, type LucideIcon } from "lucide-react";
import iconExchange from "../../assets/Currency_exchange.png";
import iconMarket from "../../assets/Web_market.png";
import iconCraft from "../../assets/Craft.png";
import iconWealth from "../../assets/Wealth.png";
import iconCoach from "../../assets/Coach.png";
import iconSettings from "../../assets/settings.png";
// The gold lantern logo stands in until the owner supplies dedicated Alerts art.
import iconAlerts from "../../assets/logo/logo_gold_bg.png";
import type { TabId } from "./tabRegistry";

export type TabIcon = { kind: "art"; src: StaticImageData } | { kind: "lucide"; Icon: LucideIcon };

/*
 * Farm and Regex use lucide glyphs until the owner supplies Farm.png / Regex.png — swapping one in
 * is a one-line change here. Kept apart from tabRegistry.ts so node test scripts never import PNGs.
 */
export const TAB_ICONS: Record<TabId, TabIcon> = {
  exchange: { kind: "art", src: iconExchange },
  market: { kind: "art", src: iconMarket },
  farm: { kind: "lucide", Icon: MapIcon },
  craft: { kind: "art", src: iconCraft },
  wealth: { kind: "art", src: iconWealth },
  regex: { kind: "lucide", Icon: Regex },
  alerts: { kind: "art", src: iconAlerts },
  settings: { kind: "art", src: iconSettings },
  coach: { kind: "art", src: iconCoach },
};
