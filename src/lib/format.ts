/** Compact number: 537000000 → "537M", 1800 → "1.8k". */
export function compact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (abs >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (abs >= 1e3) return (n / 1e3).toFixed(1) + "k";
  return n.toFixed(0);
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
