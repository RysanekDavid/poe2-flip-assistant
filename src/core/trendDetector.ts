export type TrendSignalType = "BUY" | "SELL" | "WATCH" | "IGNORE";

export interface TrendSignal {
  item: string;
  change7d: number; // % (from poe.ninja sparkline)
  change24h: number; // % (computed from local history; 0 if unknown)
  volumeRatio: number; // current vol / avg vol (1 if unknown)
  signal: TrendSignalType;
  reason: string;
}

export interface HistoryPoint {
  baseValue: number;
  volume: number;
  fetchedAt: string; // ISO/SQLite datetime
}

/**
 * Classify an item's trend.
 *
 * Rules (per spec):
 *   BUY    change7d > 50 AND change24h > 0   (uptrend continues)
 *   SELL   change7d > 100 AND change24h < -5 (peak rolling over)
 *   WATCH  change7d > 30                       (rising, keep an eye)
 *   IGNORE change7d < 0                        (falling)
 */
export function analyzeTrend(
  itemName: string,
  change7d: number | null,
  history: HistoryPoint[],
  currentVolume: number,
): TrendSignal {
  const c7 = change7d ?? 0;
  const change24h = compute24hChange(history);
  const volumeRatio = computeVolumeRatio(history, currentVolume);

  let signal: TrendSignalType = "IGNORE";
  let reason = "no significant movement";

  if (c7 > 100 && change24h < -5) {
    signal = "SELL";
    reason = `peak rolling over: 7d +${c7.toFixed(0)}%, 24h ${change24h.toFixed(1)}%`;
  } else if (c7 > 50 && change24h > 0) {
    signal = "BUY";
    reason = `uptrend continues: 7d +${c7.toFixed(0)}%, 24h +${change24h.toFixed(1)}%`;
  } else if (c7 > 30) {
    signal = "WATCH";
    reason = `rising: 7d +${c7.toFixed(0)}%`;
  } else if (c7 < 0) {
    signal = "IGNORE";
    reason = `falling: 7d ${c7.toFixed(0)}%`;
  }

  return { item: itemName, change7d: c7, change24h, volumeRatio, signal, reason };
}

/**
 * Oscillation score from the 7d cumulative-%-change series. Measures how much the
 * price WIGGLES beyond its net drift — high swing + low drift = flips repeatedly
 * without trending away, the ideal market-making target (per reddit guidance).
 *   swing = total absolute movement, drift = |net change|, osc = max(0, swing - drift)
 */
export function oscillationScore(series: number[] | null): number {
  if (!series || series.length < 3) return 0;
  let swing = 0;
  for (let i = 1; i < series.length; i++) swing += Math.abs(series[i]! - series[i - 1]!);
  const drift = Math.abs(series[series.length - 1]! - series[0]!);
  return Math.max(0, swing - drift);
}

/** % change between the newest point and the closest point ≥24h older. 0 if insufficient data. */
function compute24hChange(history: HistoryPoint[]): number {
  if (history.length < 2) return 0;
  const newest = history[history.length - 1]!;
  const newestT = Date.parse(newest.fetchedAt);
  const dayMs = 24 * 60 * 60 * 1000;

  let ref: HistoryPoint | null = null;
  for (let i = history.length - 2; i >= 0; i--) {
    const p = history[i]!;
    if (newestT - Date.parse(p.fetchedAt) >= dayMs) {
      ref = p;
      break;
    }
  }
  if (!ref || ref.baseValue <= 0) return 0;
  return ((newest.baseValue - ref.baseValue) / ref.baseValue) * 100;
}

/** current volume vs mean of historical volume. 1 if no history. */
function computeVolumeRatio(history: HistoryPoint[], currentVolume: number): number {
  if (history.length === 0) return 1;
  const sum = history.reduce((a, p) => a + p.volume, 0);
  const avg = sum / history.length;
  if (avg <= 0) return 1;
  return currentVolume / avg;
}
