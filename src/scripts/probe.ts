/**
 * One-shot API validator. Run on YOUR machine (poe.ninja blocks sandboxed fetchers):
 *   npm run probe
 *
 * Confirms the endpoint, league name, and response shape before the rest of the
 * app is trusted to depend on them. Prints a few sample priced items.
 */
import { CATEGORIES } from "../api/types";
import { fetchCategory, normalize } from "../api/ninjaClient";
import { getActiveLeague } from "../core/leagueState";

async function main(): Promise<void> {
  const league = getActiveLeague();
  console.log(`Probing poe.ninja PoE2 — league="${league}"\n`);

  for (const cat of CATEGORIES) {
    process.stdout.write(`[${cat.type}] ... `);
    const resp = await fetchCategory(cat);
    const items = normalize(resp, cat.type);
    console.log(`OK — ${resp.lines.length} lines, ${resp.items.length} items`);

    const sample = items
      .filter((i) => i.volume > 0)
      .sort((a, b) => b.baseValue - a.baseValue)
      .slice(0, 5);
    for (const it of sample) {
      console.log(
        `   ${it.itemName.padEnd(28)} ${it.baseValue.toFixed(4)} div  vol=${it.volume}` +
          (it.change7d != null ? `  7d=${it.change7d.toFixed(1)}%` : ""),
      );
    }
    console.log();
  }
  console.log("Probe complete. Endpoint + shape valid.");
}

main().catch((err) => {
  console.error("\nPROBE FAILED:\n", err instanceof Error ? err.message : err);
  process.exit(1);
});
