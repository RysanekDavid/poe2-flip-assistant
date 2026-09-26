/* Pure test of the demand-board Heat math: the sell-through proxy is a FRACTION of listings gone
 * per scrape (supply increases clipped), so a big churning listing count can no longer outrank a
 * small item that is actually selling through. */
import { heatScore, momentumNorm, sellThroughNorm, sellThroughProxy, SELL_THROUGH_SATURATION } from "../core/demandHeat";

let fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) fail++;
};
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

// --- sellThroughProxy: mean per-step FRACTIONAL drop, increases clipped at 0 ---
{
  ok("fewer than 2 points → 0", sellThroughProxy([]) === 0 && sellThroughProxy([50]) === 0);
  const drain = sellThroughProxy([10, 8, 6]); // (0.2 + 0.25) / 2
  ok("steady drawdown 10→8→6 → (20% + 25%)/2 = 0.225", near(drain, 0.225), String(drain));
  const clipped = sellThroughProxy([10, 20, 15]); // (0 + 0.25) / 2
  ok("new supply is clipped: 10→20→15 → (0 + 25%)/2 = 0.125", near(clipped, 0.125), String(clipped));
  ok("only increases → 0 (a listing flood is not demand)", sellThroughProxy([5, 50, 500]) === 0);
  ok("static count → 0", sellThroughProxy([900, 900, 900, 900]) === 0);
  ok("a zero-listing step contributes nothing (no divide-by-zero)", sellThroughProxy([0, 0, 5]) === 0);
}

// --- heat: listing count no longer dominates ---
{
  const bigChurn = sellThroughProxy([900, 890, 900, 890]); // ~0.7% per step: churn, not demand
  const smallSelling = sellThroughProxy([12, 9, 7, 4]); // ~28% per step: draining
  ok("900→890→900→890 has a tiny fractional sell-through", bigChurn < 0.01, String(bigChurn));
  const hBig = heatScore(bigChurn, 0);
  const hSmall = heatScore(smallSelling, 0);
  ok("big churning listing count scores below a small draining item", hBig < hSmall, `big ${hBig} vs small ${hSmall}`);
  ok("draining item past saturation + no momentum = 50", hSmall === 50, String(hSmall));
}

// --- normalization + momentum clamp edges ---
{
  ok("sell-through saturates", sellThroughNorm(SELL_THROUGH_SATURATION) === 1 && sellThroughNorm(0.9) === 1);
  ok("sell-through half-way → 0.5", near(sellThroughNorm(SELL_THROUGH_SATURATION / 2), 0.5));
  ok("negative momentum contributes 0", momentumNorm(-80) === 0);
  ok("momentum saturates at +50%", momentumNorm(50) === 1 && momentumNorm(400) === 1);
  ok("+25% momentum → 0.5", momentumNorm(25) === 0.5);
  ok("heat capped at 100", heatScore(1, 999) === 100);
  ok("no sell-through, no momentum → 0", heatScore(0, 0) === 0);
}

console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);
