import type { StaticImageData } from "next/image";
import type { LucideIcon } from "lucide-react";
import iconExchange from "../../assets/Currency_exchange.png";
import iconMarket from "../../assets/Web_market.png";
import iconCraft from "../../assets/Craft.png";
import iconWealth from "../../assets/Wealth.png";
import iconCoach from "../../assets/Coach.png";
import iconSettings from "../../assets/settings.png";
// The gold lantern logo stands in until the owner supplies dedicated Alerts art.
import iconAlerts from "../../assets/logo/logo_gold_bg.png";
import iconFarm from "../../assets/Farm.png";
import iconRegex from "../../assets/Regex.png";
import iconPatches from "../../assets/Patches.png";
import iconLearn from "../../assets/Learn.png";
import type { TabId } from "./tabRegistry";

/** Tab art (owner-supplied PNGs in src/assets), or a lucide glyph where no art exists yet. */
export type TabIcon = { kind: "art"; src: StaticImageData } | { kind: "glyph"; Icon: LucideIcon };

const art = (src: StaticImageData): TabIcon => ({ kind: "art", src });

// Kept apart from tabRegistry.ts so node test scripts never import PNGs.
export const TAB_ICONS: Record<TabId, TabIcon> = {
  flips: art(iconExchange),
  trade: art(iconMarket),
  farm: art(iconFarm),
  craft: art(iconCraft),
  wealth: art(iconWealth),
  regex: art(iconRegex),
  patches: art(iconPatches),
  learn: art(iconLearn),
  alerts: art(iconAlerts),
  settings: art(iconSettings),
  coach: art(iconCoach),
};
