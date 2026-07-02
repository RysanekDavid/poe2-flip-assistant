/** Compact number: 537000000 → "537M", 1800 → "1.8k". */
export function compact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (abs >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (abs >= 1e3) return (n / 1e3).toFixed(1) + "k";
  return n.toFixed(0);
}

/**
 * Human number for value cells — decimals scale with magnitude so big values get
 * thousands separators instead of noise: 4780.001 → "4,780", 12.34 → "12.3",
 * 0.0034 → "0.0034". Use this for any raw numeric cell (mids, Div amounts).
 */
export function fmtSmart(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 100) return Math.round(n).toLocaleString("en-US");
  if (abs >= 10) return n.toFixed(1);
  if (abs >= 1) return n.toFixed(2);
  if (abs === 0) return "0";
  return n.toPrecision(2);
}

/**
 * Round an order price for display. Exchange orders are placed in whole units,
 * so ≥1 rounds to a whole number (standard .5-up). Below 1 keeps 2 decimals so
 * cheap items don't collapse to "0".
 */
export function roundPrice(n: number): string {
  if (Math.abs(n) >= 1) return Math.round(n).toLocaleString("en-US");
  return n.toFixed(2);
}
