/* SNIPE item card contract tests — pure, NO network, NO DB: desecrated capture from the trade2
 * fetch shape, mod ordering, the per-listing trade deep link, and the stored-card round trip.
 * Run: npm run test:snipe. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseFetchResponse, type Listing } from "../api/tradeListing";
import { buildSnipeCard, cardMods, listingTradeQuery } from "../core/snipeCard";
import { parseStoredCard, SnipeCardSchema } from "../lib/snipeCard";
import type { Valuation } from "../core/comparableValuation";
import { sampleSnipeCard } from "./snipeCardFixture";

let fail = 0;
const ok = (name: string, cond: boolean, extra = ""): void => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) fail++;
};

const listings = parseFetchResponse(JSON.parse(readFileSync(resolve("src/scripts/fixtures/trade2-fetch-shape.json"), "utf8")));
const gl = listings.find((l) => l.listingId === "fx-gloves-ib");
if (!gl) throw new Error("fixture listing fx-gloves-ib missing");

// --- desecrated capture ---
ok("item-level desecrated flag carried", gl.desecrated);
const desecratedLines = gl.modLines.filter((m) => m.desecrated).map((m) => m.text);
ok("only the flagged mod line is desecrated", desecratedLines.join("|") === "+2 to Level of all Melee Skills", desecratedLines.join("|"));

// --- mod order: tooltip blocks, desecrated last ---
const kinds = cardMods(gl.modLines).map((m) => m.kind);
ok("implicit first, desecrated last", kinds[0] === "implicit" && kinds[kinds.length - 1] === "desecrated", kinds.join(","));
ok("rune above the explicit block", kinds.indexOf("rune") < kinds.indexOf("explicit"), kinds.join(","));

// --- per-listing trade link ---
const decodeQ = (url: string): { query: { status: { option: string }; type?: string; name?: string; filters?: Record<string, unknown> } } => {
  const q = new URL(url).searchParams.get("q");
  if (!q) throw new Error(`no ?q= in ${url}`);
  return JSON.parse(q) as { query: { status: { option: string }; type?: string; name?: string; filters?: Record<string, unknown> } };
};
const value: Valuation = { valueDiv: 4, minDiv: 3, samples: 6, dropped: 1, unrated: 0, total: 14 };
const card = buildSnipeCard({
  listing: gl,
  league: "Runes of Aldur",
  priceDiv: 1.5,
  valueDiv: 4,
  marginPct: 62.5,
  exaltPerDivine: 200,
  value,
  searchStats: [],
  broadened: true,
  comparablesUrl: "https://www.pathofexile.com/trade2/search/poe2/Runes%20of%20Aldur/Xyz",
});
const q = decodeQ(card.tradeUrl);
const trade = JSON.stringify(q.query.filters ?? {});
ok("link is league-scoped", card.tradeUrl.startsWith("https://www.pathofexile.com/trade2/search/poe2/Runes%20of%20Aldur?q="), card.tradeUrl.slice(0, 80));
ok("link narrows to the seller + base + ilvl", q.query.type === gl.baseType && trade.includes(`"account":{"input":"${gl.account}"}`) && trade.includes('"ilvl":{"min":82}'), trade);
ok("status any — instant-buyout sellers may be offline", q.query.status.option === "any");
ok("rare: no name filter (a rare's name is random)", q.query.name === undefined);
const unique: Listing = { ...gl, rarity: "Unique", itemName: "Atziri's Acuity" };
ok("unique: name filter added", listingTradeQuery(unique).name === "Atziri's Acuity");
ok("card records the valuation basis", card.valuation.samples === 6 && card.valuation.dropped === 1 && card.valuation.broadened);
ok("card keeps the desecrated flag + icon", card.desecrated && (card.icon === null || card.icon.startsWith("https://")));

// --- stored round trip ---
const stored = JSON.stringify(sampleSnipeCard());
ok("stored card parses back", parseStoredCard(stored, 1).card?.name === "Doom Grip");
ok("NULL details → no card, no error", parseStoredCard(null, 2).card === null && parseStoredCard(null, 2).error === null);
const broken = parseStoredCard('{"v":2}', 3);
ok("unreadable card → reported, not thrown", broken.card === null && /unexpected shape/.test(broken.error ?? ""), broken.error ?? "");
ok("non-https icon rejected", !SnipeCardSchema.safeParse({ ...sampleSnipeCard(), icon: "http://x/y.png" }).success);
ok("icon off poecdn rejected", !SnipeCardSchema.safeParse({ ...sampleSnipeCard(), icon: "https://evil.example/x.png" }).success);
ok("icon host lookalike rejected", !SnipeCardSchema.safeParse({ ...sampleSnipeCard(), icon: "https://poecdn.com.evil.example/x.png" }).success);
ok("tradeUrl off pathofexile.com/trade2 rejected", !SnipeCardSchema.safeParse({ ...sampleSnipeCard(), tradeUrl: "https://evil.example/trade2/search" }).success);
ok("tradeUrl on the old trade (PoE1) path rejected", !SnipeCardSchema.safeParse({ ...sampleSnipeCard(), tradeUrl: "https://www.pathofexile.com/trade/search/Standard" }).success);
const badComps = { ...sampleSnipeCard().valuation, comparablesUrl: "https://example.com/x" };
ok("comparablesUrl off trade2 rejected", !SnipeCardSchema.safeParse({ ...sampleSnipeCard(), valuation: badComps }).success);
ok("the real fixture icon host passes", gl.icon == null || SnipeCardSchema.shape.icon.safeParse(gl.icon).success, gl.icon ?? "");
ok("unknown seller (\"?\") → no account filter", listingTradeQuery({ ...gl, account: "?" }).account === undefined);
ok("known seller → account filter", listingTradeQuery(gl).account === gl.account);

console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);
