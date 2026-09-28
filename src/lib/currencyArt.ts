/** PoE2 currency art (poecdn) for the three rate currencies, so prices read like the in-game exchange. */
export const CURRENCY_ART = {
  div: "https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lNb2RWYWx1ZXMiLCJzY2FsZSI6MSwicmVhbG0iOiJwb2UyIn1d/2986e220b3/CurrencyModValues.png",
  ex: "https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lBZGRNb2RUb1JhcmUiLCJzY2FsZSI6MSwicmVhbG0iOiJwb2UyIn1d/ad7c366789/CurrencyAddModToRare.png",
  chaos: "https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lSZXJvbGxSYXJlIiwic2NhbGUiOjEsInJlYWxtIjoicG9lMiJ9XQ/c0ca392a78/CurrencyRerollRare.png",
} as const;

const BY_TRADE_ID: Record<string, { art: string; label: string }> = {
  divine: { art: CURRENCY_ART.div, label: "Divine Orb" },
  exalted: { art: CURRENCY_ART.ex, label: "Exalted Orb" },
  chaos: { art: CURRENCY_ART.chaos, label: "Chaos Orb" },
};

/** Art for a trade2 price currency id ("divine" | "exalted" | "chaos"); null for anything else. */
export function tradeCurrencyArt(currency: string): { art: string; label: string } | null {
  return BY_TRADE_ID[currency.toLowerCase()] ?? null;
}
