import type { StaticImageData } from "next/image";
import iconExchange from "../../assets/Currency_exchange.png";
import iconMarket from "../../assets/Web_market.png";
import iconCraft from "../../assets/Craft.png";
import iconWealth from "../../assets/Wealth.png";
import iconCoach from "../../assets/Coach.png";
import iconSettings from "../../assets/settings.png";
import iconAlerts from "../../assets/Alerts.png";
import iconFarm from "../../assets/Farm.png";
import iconRegex from "../../assets/Regex.png";
import iconPatches from "../../assets/Patches.png";
import iconLearn from "../../assets/Learn.png";
import type { TabId } from "./tabRegistry";

/** Owner-supplied tab art (src/assets), one PNG per tab. Kept apart from tabRegistry.ts so node test scripts never import PNGs. */
export const TAB_ICONS: Record<TabId, StaticImageData> = {
  flips: iconExchange,
  trade: iconMarket,
  farm: iconFarm,
  craft: iconCraft,
  wealth: iconWealth,
  regex: iconRegex,
  patches: iconPatches,
  learn: iconLearn,
  alerts: iconAlerts,
  settings: iconSettings,
  coach: iconCoach,
};
