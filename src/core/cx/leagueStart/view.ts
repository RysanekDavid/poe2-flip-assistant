import { CX_HOUR_SECONDS } from "../../../api/cxClient";
import type { PricedItem } from "../../../api/types";
import { config } from "../../../config/env";
import { cxItemNames, cxMarketsAt } from "../../../db/cxMarketQueries";
import { getStartMeta, listStartMeta, startDays, type LeagueStartMeta } from "../../../db/cxStartQueries";
import { latestSnapshots } from "../../../db/marketQueries";
import { baseLeagueName } from "../../../db/leagueQueries";
import type { LeagueStartItem, LeagueStartResponse } from "../../../lib/leagueStartContract";
import { hourEdges } from "../cxEdges";
import { freshNewestHour, resolveItemIds } from "../cxItemMarkets";
import { modelParams } from "../cxMarketModel";
import { HORIZON_SHORT, MIN_LEAGUES, isModeActive, isPermanentLeague, itemSignals, leagueDay, rankSignals, type ItemSignal } from "./signals";
import { toCurve, type LeagueCurve } from "./curves";

/** Rows the panel lists; the rest are one scroll the player will not do mid-league-start. */
export const MAX_ITEMS = 30;

/**
 * The league-start view for one league (the caller's). Reads only stored data: curves from
 * cx_start_days, "now" from the newest stored exchange hour, art and watchlist ids from ninja.
 */

/** Past = started before this league and has at least one ratio's worth of days. */
function pastMetas(base: LeagueStartMeta | null, all: readonly LeagueStartMeta[]): LeagueStartMeta[] {
  return all.filter((m) => m.league !== base?.league && (base == null || m.startHour < base.startHour) && m.daysAvailable >= 2);
}

/** Latest exchange mid (Div) per base id in the league's newest fresh stored hour. */
function nowMids(league: string, nowMs: number): Map<string, number> {
  const hour = freshNewestHour(league, nowMs);
  const out = new Map<string, number>();
  if (hour == null) return out;
  for (const [item, h] of hourEdges(hour, cxMarketsAt(league, hour), modelParams())) {
    if (h.midDiv > 0 && Number.isFinite(h.midDiv)) out.set(item, h.midDiv);
  }
  return out;
}

function positiveOrNull(n: number | null | undefined): number | null {
  return n != null && Number.isFinite(n) && n > 0 ? n : null;
}

function toItems(signals: readonly ItemSignal[], league: string, nowMs: number): LeagueStartItem[] {
  const names = cxItemNames();
  const ninja: PricedItem[] = latestSnapshots(league);
  const { itemIdOf } = resolveItemIds(signals.map((s) => s.baseId), names, ninja);
  const iconOf = new Map(ninja.map((n) => [n.itemId, n.icon ?? null]));
  const mids = nowMids(league, nowMs);
  return signals.map((s): LeagueStartItem => {
    const watchItemId = itemIdOf.get(s.baseId) ?? null;
    const nowDiv = positiveOrNull(mids.get(s.baseId));
    return {
      baseId: s.baseId,
      // An unnamed id is still a real exchange item; its id is ugly but honest.
      name: names.get(s.baseId) ?? s.baseId,
      icon: watchItemId == null ? null : (iconOf.get(watchItemId) ?? null),
      watchItemId,
      nowDiv,
      ratio7: positiveOrNull(s.ratio7),
      ratio14: positiveOrNull(s.ratio14),
      expected7Div: nowDiv != null && s.ratio7 != null ? positiveOrNull(nowDiv * s.ratio7) : null,
      signal: s.signal,
      confidence: s.confidence,
    };
  });
}

function inactiveNote(meta: LeagueStartMeta | null, day: number | null, base: string): string {
  if (isPermanentLeague(base)) return `${base} is a permanent league — league-start mode follows challenge leagues.`;
  if (meta == null) return `${base}'s start is not dated yet — it is read from GGG's exchange archive within a few poll cycles.`;
  return `${base} is on day ${day ?? 0}; league-start mode covers days 0–${config.leagueStart.days - 1}.`;
}

/** The full GET /api/league/start body for `league` at `nowMs`. */
export function loadLeagueStartView(league: string, nowMs: number = Date.now()): LeagueStartResponse {
  const base = baseLeagueName(league);
  const curveDays = config.leagueStart.days;
  const meta = getStartMeta(base);
  const nowHour = Math.floor(nowMs / 1000 / CX_HOUR_SECONDS) * CX_HOUR_SECONDS;
  const past = pastMetas(meta, listStartMeta());
  const curves: LeagueCurve[] = past.map((m) => toCurve(m.league, m.daysAvailable, startDays(m.league)));
  const day = meta == null ? null : leagueDay(meta.startHour, nowHour);
  const active = meta != null && isModeActive(meta.startHour, nowHour, curveDays);
  const shell: LeagueStartResponse = {
    league,
    baseLeague: base,
    curveDays,
    startHour: meta?.startHour ?? null,
    day,
    active,
    basedOn: curves.length,
    pastLeagues: past.map((m) => ({ league: m.league, startHour: m.startHour, daysAvailable: m.daysAvailable })),
    recordedDays: meta?.daysAvailable ?? 0,
    items: [],
    note: null,
  };
  if (!active || day == null) return { ...shell, note: inactiveNote(meta, day, base) };
  if (curves.length < MIN_LEAGUES) return { ...shell, note: "unknown — no past league recorded yet" };
  const ranked = rankSignals(itemSignals(curves, day)).slice(0, MAX_ITEMS);
  const note = ranked.length === 0 ? `No item has day-${day} prices in ${MIN_LEAGUES}+ past leagues with a ${HORIZON_SHORT}-day follow-up.` : null;
  return { ...shell, items: toItems(ranked, league, nowMs), note };
}

/** Sell-now rows that can be watched, steepest drop first — what the preset button adds. */
export function sellNowPreset(view: LeagueStartResponse, limit = 10): LeagueStartItem[] {
  return view.items.filter((i) => i.signal === "sell-now" && i.watchItemId != null).slice(0, limit);
}
