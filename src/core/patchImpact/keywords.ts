/**
 * Patch wording → poe.ninja exchange category. Categories use ninja's `type` values (see
 * CATEGORIES in api/types.ts), whose taxonomy differs from the in-game labels: omens live in
 * "Ritual", catalysts in "Breach", abyssal bones in "Abyss".
 *
 * Deliberately narrow. Generic words ("orb", "currency", "drop") appear in nearly every patch, so
 * mapping them would paint every thread with the whole Currency category; only words that name a
 * mechanic's own item family are listed. Keywords match like item names: whole tokens, and a plain
 * plural of the last word ("omens" -> omen) counts.
 */
export const KEYWORD_CATEGORIES: ReadonlyArray<{ keyword: string; category: string }> = [
  { keyword: "essence", category: "Essences" },
  { keyword: "rune", category: "Runes" },
  { keyword: "talisman", category: "Runes" },
  { keyword: "omen", category: "Ritual" },
  { keyword: "ritual", category: "Ritual" },
  { keyword: "catalyst", category: "Breach" },
  { keyword: "breach", category: "Breach" },
  { keyword: "splinter", category: "Fragments" },
  { keyword: "fragment", category: "Fragments" },
  { keyword: "expedition", category: "Expedition" },
  { keyword: "logbook", category: "Expedition" },
  { keyword: "artifact", category: "Expedition" },
  { keyword: "abyss", category: "Abyss" },
  { keyword: "abyssal", category: "Abyss" },
  { keyword: "soul core", category: "SoulCores" },
  { keyword: "idol", category: "Idols" },
  { keyword: "uncut gem", category: "UncutGems" },
  { keyword: "delirium", category: "Delirium" },
  { keyword: "distilled", category: "Delirium" },
  { keyword: "liquid emotion", category: "Delirium" },
  { keyword: "verisium", category: "Verisium" },
];
