"use client";

import { Activity, ArrowLeftRight, Crosshair, Globe, ScrollText, TrendingUp, Zap, type LucideIcon } from "lucide-react";
import type { Alert } from "../../lib/alertCenter";
import { alertTypeLabel } from "../../lib/alertLabels";
import { CURRENCY_ART } from "../../lib/currencyArt";
import { cardIcon } from "../../lib/snipeCard";
import { LeagueEmblem } from "../LeagueEmblem";
import { ItemArt } from "../ui/ItemArt";
import { typeChip } from "./AlertBits";

/** Line glyph per type, for rows without game art (and the filter chips). */
const TYPE_GLYPH: Record<string, LucideIcon> = {
  SNIPE: Crosshair,
  SPREAD: ArrowLeftRight,
  TREND: TrendingUp,
  SPIKE: Zap,
  LEAGUE: Globe,
  PATCH: ScrollText,
};

export function TypeGlyph({ type, className = "h-4 w-4" }: { type: string; className?: string }) {
  const Glyph = TYPE_GLYPH[type] ?? Activity;
  return <Glyph aria-hidden className={`shrink-0 ${className}`} />;
}

/**
 * The row's leading art: the snipe's own item, an Exalted Orb for craft margins (the craft
 * currency), the league emblem for league news; everything else its type glyph in the type colour.
 */
export function AlertArt({ alert }: { alert: Alert }) {
  if (alert.type === "SNIPE" && alert.details) return <ItemArt src={cardIcon(alert.details.icon)} size={6} />;
  if (alert.type === "CRAFT_MARGIN") return <ItemArt src={CURRENCY_ART.ex} size={6} />;
  if (alert.type === "LEAGUE" && alert.item_name) {
    return (
      <span className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center">
        <LeagueEmblem league={alert.item_name} />
      </span>
    );
  }
  return (
    <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center ${typeChip(alert.type).text}`}>
      <TypeGlyph type={alert.type} />
    </span>
  );
}

/** Type label chip, coloured per type so a craft margin never reads like a trend. */
export function TypeChip({ type }: { type: string }) {
  const chip = typeChip(type);
  return (
    <span className={`inline-flex shrink-0 items-center rounded border px-1.5 text-xs font-medium ${chip.text} ${chip.border}`}>
      {alertTypeLabel(type)}
    </span>
  );
}
