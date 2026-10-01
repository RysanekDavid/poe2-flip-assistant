import type { StaticImageData } from "next/image";
import iconHome from "../../assets/Home.png";
import iconExchange from "../../assets/Currency_exchange.png";
import iconMarket from "../../assets/Web_market.png";
import iconCraft from "../../assets/Craft.png";
import iconWealth from "../../assets/Wealth.png";
import iconCoach from "../../assets/Coach.png";
import iconSettings from "../../assets/settings.png";
import iconAlerts from "../../assets/Alerts.png";
import iconFarm from "../../assets/Farm.png";
import iconRegex from "../../assets/Regex.png";
import iconLearn from "../../assets/Learn.png";
import type { TabId } from "./tabRegistry";

/**
 * Owner-supplied tab art (src/assets), one PNG per tab. Kept apart from tabRegistry.ts so node test
 * scripts never import PNGs. Home.png is a placeholder (a copy of the Waystone item art) until the
 * owner supplies Home art; swapping it is a file replacement.
 */
export const TAB_ICONS: Record<TabId, StaticImageData> = {
  home: iconHome,
  flips: iconExchange,
  trade: iconMarket,
  farm: iconFarm,
  craft: iconCraft,
  stash: iconWealth,
  regex: iconRegex,
  learn: iconLearn,
  alerts: iconAlerts,
  settings: iconSettings,
  coach: iconCoach,
};
