import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const targets = {
  auth: "src/scripts/testAuth.ts",
  craft: "src/scripts/testCraftMargin.ts",
  cx: "src/scripts/testCxHistory.ts",
  "cx-shadow": "src/scripts/testCxShadow.ts",
  "craft-valuation": "src/scripts/testCraftValuation.ts",
  "craft-guides": "src/scripts/testCraftGuides.ts",
  "craft-provenance": "src/scripts/testCraftProvenance.ts",
  balance: "src/scripts/testBalanceLeague.ts",
  db: "src/scripts/testDbCompact.ts",
  "entity-catalog": "src/scripts/testEntityCatalog.ts",
  "features-schema": "src/scripts/testFeatureSchema.ts",
  flips: "src/scripts/testFlipModel.ts",
  learn: "src/scripts/testLearn.ts",
  market: "src/scripts/testMarketLeague.ts",
  "market-prices": "src/scripts/testMarketPrices.ts",
  "market-uniques": "src/scripts/testMarketUniques.ts",
  opportunities: "src/scripts/testOpportunities.ts",
  notify: "src/scripts/testNotify.ts",
  "notify-drain": "src/scripts/testNotifyDrain.ts",
  "alert-center": "src/scripts/testAlertCenter.ts",
  "alert-noise": "src/scripts/testAlertNoise.ts",
  "patch-summary": "src/scripts/testPatchSummary.ts",
  rates: "src/scripts/testRates.ts",
  "scout-demand": "src/scripts/testScoutDemand.ts",
  "snipe-db": "src/scripts/testSnipeDb.ts",
  strategies: "src/scripts/testStrategies.ts",
  system: "src/scripts/testSystem.ts",
  "tools-regex": "src/scripts/tools/testRegexTool.ts",
  "tools-craft-moves": "src/scripts/tools/testCraftMoves.ts",
  "tools-boss-ev": "src/scripts/tools/testBossEv.ts",
  "tools-liquidate": "src/scripts/tools/testLiquidate.ts",
  "user-league": "src/scripts/testUserLeague.ts",
  "watchlist-prices": "src/scripts/testWatchlistPrices.ts",
} as const;
type Target = keyof typeof targets;

const target = process.argv[2] as Target | undefined;
if (!target || !(target in targets)) {
  throw new Error(`test target must be one of: ${Object.keys(targets).join(", ")}`);
}

process.env.APP_DISABLE_DOTENV = "1";
process.env.OWNER_PASSWORD = "test-only-owner-password";
process.env.AUTH_SECRET = "test-only-auth-secret";
process.env.DB_PATH = resolve("data", `tmp-${target}-test.db`);

import(pathToFileURL(resolve(targets[target])).href).catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
