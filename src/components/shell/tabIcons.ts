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

/**
 * Tab art (owner-supplied PNGs in src/assets), or a lucide glyph where no art exists yet. `lift` is
 * the CSS brightness factor that art is drawn with (1 = as supplied).
 */
export type TabIcon = { kind: "art"; src: StaticImageData; lift: number } | { kind: "glyph"; Icon: LucideIcon };
export type TabArtIcon = Extract<TabIcon, { kind: "art" }>;

const art = (src: StaticImageData, lift: number): TabIcon => ({ kind: "art", src, lift });

/*
 * Per-image lift, because the set mixes dark metal art with bright gold art and no single factor
 * serves both: at one global 1.35 the gold Wealth art saturates 16% of its pixels while Learn is
 * still the darkest icon in the bar. Each factor (drawn with TabArt's contrast) brings the icon's
 * mean opaque-pixel luminance (0-255, at the 2x render size) up to the ~80-92 of the gold art with
 * at most ~8% clipped pixels. Before → after: Learn 36→83, Farm 45→82, Patches 45→84, Web_market
 * 47→82, Regex 63→83, Craft 70→78, Coach 73→82, Currency_exchange 83→90, settings 83→90; Wealth 92
 * and the Alerts logo 171 stay as supplied. Re-measure when the owner swaps a PNG.
 */
// Kept apart from tabRegistry.ts so node test scripts never import PNGs.
export const TAB_ICONS: Record<TabId, TabIcon> = {
  flips: art(iconExchange, 1.1),
  trade: art(iconMarket, 1.8),
  farm: art(iconFarm, 1.9),
  craft: art(iconCraft, 1.15),
  wealth: art(iconWealth, 1),
  regex: art(iconRegex, 1.35),
  patches: art(iconPatches, 1.9),
  learn: art(iconLearn, 2.4),
  alerts: art(iconAlerts, 1),
  settings: art(iconSettings, 1.1),
  coach: art(iconCoach, 1.15),
};
