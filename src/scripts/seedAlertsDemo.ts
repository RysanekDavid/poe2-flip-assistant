/* Seed a SCRATCH database with synthetic alerts so the Alerts tab can be checked locally:
 * two SNIPE item cards (rare + unique), one pre-card SNIPE row and a few market alerts.
 * Refuses any DB_PATH that is not obviously temporary; uses no credentials and no network.
 * Run: APP_DISABLE_DOTENV=1 DB_PATH=<tmp>/alerts-demo.db OWNER_PASSWORD=<any> npm run seed:alerts-demo */
import { config } from "../config/env";
import { getDb } from "../db/database";
import { fireAlert } from "../core/alertEngine";
import { insertAlert } from "../db/alertQueries";
import { getDefaultLeague } from "../core/leagueState";
import { tradeSearchUrl } from "../lib/tradeLink";
import { sampleSnipeCard } from "./snipeCardFixture";

if (!/scratchpad|tmp|temp/i.test(config.dbPath)) {
  console.error(`refusing to seed ${config.dbPath} — point DB_PATH at a temp file.`);
  process.exit(1);
}

getDb();
const league = getDefaultLeague();
const OWNER = 1;
const rare = sampleSnipeCard({ league });
const unique = sampleSnipeCard({
  league,
  name: "Atziri's Acuity",
  baseType: "Vaal Gauntlets",
  rarity: "Unique",
  desecrated: false,
  corrupted: true,
  mods: [
    { kind: "implicit", text: "+40 to maximum Energy Shield" },
    { kind: "explicit", text: "Leech from Critical Hits is instant" },
    { kind: "explicit", text: "+45% to Critical Damage Bonus" },
  ],
  price: { amount: 3, currency: "divine" },
  priceDiv: 3,
  valueDiv: 7.5,
  marginPct: 60,
  sellerOnline: false,
  instantBuyout: true,
  tradeUrl: tradeSearchUrl(league, { name: "Atziri's Acuity", type: "Vaal Gauntlets", online: false, account: "SyntheticSeller" }),
});

for (const [i, card] of [rare, unique].entries()) {
  fireAlert(OWNER, league, {
    type: "SNIPE",
    itemId: `demo-listing-${i}`,
    itemName: card.name,
    message: `${Math.round(card.marginPct)}% under (${card.valuation.samples} comps)`,
    value: card.marginPct,
    threshold: 35,
    whisper: card.whisper,
    link: card.tradeUrl,
    details: card,
    dedupe: "once",
  });
}
insertAlert(OWNER, league, { type: "SNIPE", itemId: "demo-legacy", itemName: "Old Snipe", message: "40% under — pre-card alert", value: 40, threshold: 35 });
insertAlert(OWNER, league, { type: "SPREAD", itemId: "demo-spread", itemName: "Greater Rune of Alacrity", message: "REAL spread 18% ≥ 15%", value: 18, threshold: 15 });
insertAlert(OWNER, league, { type: "TREND", itemId: "demo-trend", itemName: "Masterwork Rune", message: "7d +78% · trend → rising", value: 78, threshold: 50 });
insertAlert(OWNER, league, { type: "CRAFT_MARGIN", itemId: "demo-craft", itemName: "Boots · putrefaction ES", message: "EV +42% per attempt", value: 42, threshold: 30 });
console.log(`seeded 6 demo alerts for user ${OWNER} in "${league}" → ${config.dbPath}`);
