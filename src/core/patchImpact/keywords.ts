/**
 * Patch wording → poe.ninja exchange category. Categories use ninja's `type` values (see
 * CATEGORIES in api/types.ts), whose taxonomy differs from the in-game labels: omens live in
 * "Ritual", catalysts in "Breach", abyssal bones in "Abyss".
 *
 * Deliberately narrow. Generic words ("orb", "currency", "drop") appear in nearly every patch, so
 * mapping them would paint every thread with the whole Currency category; only words that name a
 * mechanic's own item family are listed. Each keyword is matched as whole tokens, like item names.
 */
export const KEYWORD_CATEGORIES: ReadonlyArray<{ keyword: string; category: string }> = [
  { keyword: "essence", category: "Essences" },
  { keyword: "essences", category: "Essences" },
  { keyword: "rune", category: "Runes" },
  { keyword: "runes", category: "Runes" },
  { keyword: "talisman", category: "Runes" },
  { keyword: "talismans", category: "Runes" },
  { keyword: "omen", category: "Ritual" },
  { keyword: "omens", category: "Ritual" },
  { keyword: "ritual", category: "Ritual" },
  { keyword: "catalyst", category: "Breach" },
  { keyword: "catalysts", category: "Breach" },
  { keyword: "breach", category: "Breach" },
  { keyword: "splinter", category: "Fragments" },
  { keyword: "splinters", category: "Fragments" },
  { keyword: "fragment", category: "Fragments" },
  { keyword: "fragments", category: "Fragments" },
  { keyword: "expedition", category: "Expedition" },
  { keyword: "logbook", category: "Expedition" },
  { keyword: "logbooks", category: "Expedition" },
  { keyword: "artifact", category: "Expedition" },
  { keyword: "artifacts", category: "Expedition" },
  { keyword: "abyss", category: "Abyss" },
  { keyword: "abyssal", category: "Abyss" },
  { keyword: "soul core", category: "SoulCores" },
  { keyword: "soul cores", category: "SoulCores" },
  { keyword: "idol", category: "Idols" },
  { keyword: "idols", category: "Idols" },
  { keyword: "uncut gem", category: "UncutGems" },
  { keyword: "uncut gems", category: "UncutGems" },
  { keyword: "delirium", category: "Delirium" },
  { keyword: "distilled", category: "Delirium" },
  { keyword: "liquid emotion", category: "Delirium" },
  { keyword: "liquid emotions", category: "Delirium" },
  { keyword: "verisium", category: "Verisium" },
];
