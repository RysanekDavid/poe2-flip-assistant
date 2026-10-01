import { Activity, Bell, ClipboardPaste, GraduationCap, ScanSearch, Tag, UserRound, type LucideIcon } from "lucide-react";
import { CURRENCY_ART } from "../../lib/currencyArt";
import artMarket from "../../assets/Web_market.png";
import artWealth from "../../assets/Wealth.png";
import artPatches from "../../assets/Patches.png";
import artWaystone from "../../assets/items/waystone.png";
import artTablet from "../../assets/items/regex-tablet.webp";
import artTempleTablet from "../../assets/items/temple-tablet.webp";
import artRelic from "../../assets/items/coffer-relic.png";
import artJewel from "../../assets/items/emerald-jewel.png";
import artGold from "../../assets/items/gold.png";
import artBarya from "../../assets/items/djinn-barya.png";
import artDivine from "../../assets/items/divine-orb.png";
import type { TabId } from "./tabRegistry";
import type { ToolIconKey } from "./toolIconKeys";

/** Sub-tab art as a URL (bundled PNG or poecdn), or a lucide glyph where no in-game object fits. */
export type ToolIcon = { kind: "art"; src: string } | { kind: "glyph"; Icon: LucideIcon };

// Methods shows the Vaal Orb (poecdn art, as CURRENCY_ART): turning items into other items, gambles included.
const VAAL_ORB_ART =
  "https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lWYWFsIiwic2NhbGUiOjEsInJlYWxtIjoicG9lMiJ9XQ/72bc84396c/CurrencyVaal.png";

const art = (src: string): ToolIcon => ({ kind: "art", src });
const glyph = (Icon: LucideIcon): ToolIcon => ({ kind: "glyph", Icon });

// Kept apart from tabRegistry.ts so node test scripts never import PNGs. Vendor shows Gold (what an
// NPC pays for gear); Price uses the Divine Orb, the unit every price in the app is quoted in;
// Bosses shows the Djinn Barya, a pinnacle entry item the boss table prices; Patch notes keeps the
// owner's art from when it was a tab of its own.
// Typed from TOOL_ICON_KEYS: a key missing here, or one not listed there, fails the typecheck.
const TOOL_ICONS: { [T in TabId]: Record<ToolIconKey<T>, ToolIcon> } = {
  home: {},
  flips: {},
  alerts: {},
  coach: {},
  trade: { prices: art(artDivine.src), price: glyph(Tag), opportunities: art(artMarket.src), methods: art(VAAL_ORB_ART) },
  farm: { strategies: art(artTablet.src), bosses: art(artBarya.src) },
  craft: { recipes: art(CURRENCY_ART.ex), moves: glyph(ClipboardPaste), modpool: art(CURRENCY_ART.chaos), rollsell: art(artTempleTablet.src) },
  stash: { worth: art(artWealth.src), sell: art(artGold.src) },
  learn: { what: glyph(ScanSearch), currency: art(artDivine.src), atlas: art(artWaystone.src), patches: art(artPatches.src) },
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
  const icons: Partial<Record<string, ToolIcon>> = TOOL_ICONS[tab];
  const icon = icons[tool];
  if (!icon) throw new Error(`toolIcons: no icon for ${tab} › ${tool}`);
  return icon;
}
