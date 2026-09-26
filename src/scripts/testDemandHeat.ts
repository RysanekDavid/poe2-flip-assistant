/* Pure test of the demand-board Heat math: sell-through proxy clips supply increases, and a big
 * static listing count can no longer outrank a small item that is actually selling. */
import { heatScore, logNorm, momentumNorm, sellThroughProxy } from "../core/demandHeat";

let fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) fail++;
};

// --- sellThroughProxy: mean per-step DROP, increases clipped at 0 ---
{
  ok("fewer than 2 points → 0", sellThroughProxy([]) === 0 && sellThroughProxy([50]) === 0);
  ok("steady drawdown 10→8→5 → (2+3)/2 = 2.5", sellThroughProxy([10, 8, 5]) === 2.5, String(sellThroughProxy([10, 8, 5])));
  ok("new supply is clipped: 10→20→15 → (0+5)/2 = 2.5", sellThroughProxy([10, 20, 15]) === 2.5, String(sellThroughProxy([10, 20, 15])));
  ok("only increases → 0 (a listing flood is not demand)", sellThroughProxy([5, 50, 500]) === 0);
  ok("static count → 0", sellThroughProxy([900, 900, 900, 900]) === 0);
}

// --- heat: listing count no longer dominates ---
{
  const bigStatic = sellThroughProxy([900, 905, 900, 910]); // huge, flat supply
  const smallSelling = sellThroughProxy([12, 9, 7, 4]); // small, draining
  const max = Math.max(bigStatic, smallSelling);
  const hBig = heatScore(bigStatic, max, 0);
  const hSmall = heatScore(smallSelling, max, 0);
  ok("big static listing count scores below a small draining item", hBig < hSmall, `big ${hBig} vs small ${hSmall}`);
  ok("draining item at the board max + no momentum = 50", hSmall === 50, String(hSmall));
}

// --- momentum clamp + normalization edges ---
{
  ok("negative momentum contributes 0", momentumNorm(-80) === 0);
  ok("momentum saturates at +50%", momentumNorm(50) === 1 && momentumNorm(400) === 1);
  ok("+25% momentum → 0.5", momentumNorm(25) === 0.5);
  ok("heat capped at 100", heatScore(10, 10, 999) === 100);
  ok("empty board (max 0) → no sell-through credit", logNorm(3, 0) === 0 && heatScore(0, 0, 0) === 0);
}

console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);
