import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const targets = {
  craft: "src/scripts/testCraftMargin.ts",
  cx: "src/scripts/testCxHistory.ts",
  db: "src/scripts/testDbCompact.ts",
  flips: "src/scripts/testFlipModel.ts",
  market: "src/scripts/testMarketLeague.ts",
  rates: "src/scripts/testRates.ts",
  "user-league": "src/scripts/testUserLeague.ts",
} as const;
type Target = keyof typeof targets;

const target = process.argv[2] as Target | undefined;
if (!target || !(target in targets)) {
  throw new Error(`test target must be one of: ${Object.keys(targets).join(", ")}`);
}

process.env.APP_DISABLE_DOTENV = "1";
process.env.OWNER_PASSWORD = "test-only-owner-password";
process.env.DB_PATH = resolve("data", `tmp-${target}-test.db`);

import(pathToFileURL(resolve(targets[target])).href).catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
