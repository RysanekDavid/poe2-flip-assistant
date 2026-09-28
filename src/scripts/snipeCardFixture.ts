import { SnipeCardSchema, type SnipeCard } from "../lib/snipeCard";
import { tradeSearchUrl } from "../lib/tradeLink";

/** A synthetic, schema-valid SNIPE card for tests and the local seed — no real account or listing. */
export function sampleSnipeCard(over: Partial<SnipeCard> = {}): SnipeCard {
  const league = over.league ?? "Runes of Aldur";
  return SnipeCardSchema.parse({
    v: 1,
    league,
    icon: "https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQXJtb3Vycy9HbG92ZXMvQmFzZXR5cGVzL0dsb3Zlc1N0ckRleDAxIiwidyI6MiwiaCI6Miwic2NhbGUiOjEsInJlYWxtIjoicG9lMiJ9XQ/b26babb5f6/GlovesStrDex01.png",
    name: "Doom Grip",
    baseType: "Vaal Gauntlets",
    rarity: "Rare",
    itemLevel: 82,
    corrupted: false,
    desecrated: true,
    mods: [
      { kind: "rune", text: "+12% to Fire Resistance" },
      { kind: "explicit", text: "+118 to maximum Life" },
      { kind: "explicit", text: "+42% to Cold Resistance" },
      { kind: "explicit", text: "18% increased Attack Speed" },
      { kind: "desecrated", text: "+2 to Level of all Melee Skills" },
    ],
    price: { amount: 90, currency: "exalted" },
    priceDiv: 0.45,
    valueDiv: 1.8,
    marginPct: 75,
    exaltPerDivine: 200,
    valuation: {
      samples: 7,
      dropped: 1,
      unrated: 0,
      total: 23,
      minDiv: 1.2,
      broadened: false,
      searchedMods: ["+118 to maximum Life", "+2 to Level of all Melee Skills"],
      comparablesUrl: `https://www.pathofexile.com/trade2/search/poe2/${encodeURIComponent(league)}/AbCdEf`,
    },
    listedAt: new Date(Date.now() - 4 * 60_000).toISOString(),
    sellerOnline: true,
    instantBuyout: false,
    whisper: "@SyntheticSeller Hi, I would like to buy your Doom Grip Vaal Gauntlets listed for 90 exalted in Runes of Aldur",
    tradeUrl: tradeSearchUrl(league, { type: "Vaal Gauntlets", online: false, account: "SyntheticSeller", ilvlMin: 82 }),
    ...over,
  });
}
