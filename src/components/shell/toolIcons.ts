import { Activity, Bell, ClipboardPaste, GraduationCap, ScanSearch, Tag, UserRound, type LucideIcon } from "lucide-react";
import { CURRENCY_ART } from "../../lib/currencyArt";
import artMarket from "../../assets/Web_market.png";
import artWealth from "../../assets/Wealth.png";
import artWaystone from "../../assets/items/waystone.png";
import artTablet from "../../assets/items/precursor-tablet.png";
import artRelic from "../../assets/items/coffer-relic.png";
import artJewel from "../../assets/items/emerald-jewel.png";
import artGold from "../../assets/items/gold.png";
import artDivine from "../../assets/items/divine-orb.png";
import type { TabId } from "./tabRegistry";

/** Sub-tab art as a URL (bundled PNG or poecdn), or a lucide glyph where no in-game object fits. */
export type ToolIcon = { kind: "art"; src: string } | { kind: "glyph"; Icon: LucideIcon };

const art = (src: string): ToolIcon => ({ kind: "art", src });
const glyph = (Icon: LucideIcon): ToolIcon => ({ kind: "glyph", Icon });

// Kept apart from tabRegistry.ts so node test scripts never import PNGs. Vendor shows Gold (what an
// NPC pays for gear); Price uses the Divine Orb, the unit every price in the app is quoted in.
const TOOL_ICONS: Partial<Record<TabId, Record<string, ToolIcon>>> = {
  market: { price: glyph(Tag), board: art(artMarket.src) },
  farm: { board: art(artWaystone.src), strategies: art(artTablet.src) },
  craft: { recipes: art(CURRENCY_ART.ex), moves: glyph(ClipboardPaste), modpool: art(CURRENCY_ART.chaos) },
  wealth: { worth: art(artWealth.src), sell: art(artGold.src) },
  learn: { what: glyph(ScanSearch), currency: art(artDivine.src), atlas: art(artWaystone.src) },
  regex: {
    waystone: art(artWaystone.src),
    tablet: art(artTablet.src),
    relic: art(artRelic.src),
    jewel: art(artJewel.src),
    vendor: art(artGold.src),
    price: art(artDivine.src),
  },
  settings: { account: glyph(UserRound), notify: glyph(Bell), mode: glyph(GraduationCap), system: glyph(Activity) },
};

/** A registry tool without an icon is a drift between tabRegistry.ts and this map — fail loudly. */
export function toolIcon(tab: TabId, tool: string): ToolIcon {
  const icon = TOOL_ICONS[tab]?.[tool];
  if (!icon) throw new Error(`toolIcons: no icon for ${tab} › ${tool}`);
  return icon;
}
