import { Bug, Dot, Scale, type LucideIcon } from "lucide-react";
import artWaystone from "../../assets/items/waystone.png";
import { CURRENCY_ART } from "../../lib/currencyArt";
import { groupLabel } from "../../lib/patchesContract";
import type { SummaryKind } from "../../sources/patchNotes/summaryContract";

/** Game art where an in-game object stands for the change, a plain glyph where none does. */
export type GroupIcon = { kind: "art"; src: string } | { kind: "glyph"; Icon: LucideIcon };

export interface GroupKindStyle {
  label: string;
  icon: GroupIcon;
  /** A 3px left border in a semantic token — the only colour a group carries (text stays neutral). */
  border: string;
}

// Literal class names so Tailwind's content scan keeps them. Amber is left to actions; the groups
// take the other existing tokens, dimmed, and the icons do the identifying.
const STYLE: Record<SummaryKind, Omit<GroupKindStyle, "label">> = {
  economy: { icon: { kind: "art", src: CURRENCY_ART.div }, border: "border-l-good/60" },
  crafting: { icon: { kind: "art", src: CURRENCY_ART.ex }, border: "border-l-subtle" },
  loot: { icon: { kind: "art", src: artWaystone.src }, border: "border-l-info/50" },
  balance: { icon: { kind: "glyph", Icon: Scale }, border: "border-l-bad/50" },
  bugfix: { icon: { kind: "glyph", Icon: Bug }, border: "border-l-subtle" },
  other: { icon: { kind: "glyph", Icon: Dot }, border: "border-l-line" },
};

/** Label (patchesContract stays the one source of labels), icon and accent of a summary group. */
export function groupKindStyle(kind: SummaryKind): GroupKindStyle {
  return { label: groupLabel(kind), ...STYLE[kind] };
}
