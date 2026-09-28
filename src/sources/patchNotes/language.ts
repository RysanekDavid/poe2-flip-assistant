import type { CheerioAPI } from "cheerio";

/*
 * Coach and the patch→price mapping read patch text as English. GGG serves a translated copy
 * of every patch thread in per-language forums (2222 German "Patch-Notes", 2233 French "Patch
 * notes", 2243 Spanish "Notas de parches"), all with English page chrome and <html lang="en">,
 * so neither the lang attribute nor Accept-Language tells them apart. Two cheap checks do:
 * the forum name that leads every page <title>, and the function words in the body itself.
 */

// Case-sensitive on purpose: the French forum is "Patch notes", the German one "Patch-Notes".
const ENGLISH_FORUM_NAME = /\bPatch Notes\b/;

/*
 * English counts every common patch-note word, including the short ones one-line hotfixes are
 * made of ("Fixed a crash"). "a" and "an" are also Spanish/German words; that only makes the
 * check more lenient, and the real German copies still score far past the threshold (verified
 * against the German 0.5.4d hotfix: 4 foreign vs 0 English). The foreign list stays strictly
 * non-English: no "die" (English notes about dying) and no "com" (every pathofexile.com link).
 */
const ENGLISH_WORDS = new Set([
  "the", "and", "to", "of", "is", "are", "now", "with", "for", "that", "this", "when",
  "from", "have", "has", "be", "will", "it", "you", "your", "can", "longer", "which",
  "a", "an", "where", "fixed", "could", "would", "been", "into", "some", "players",
]);
const FOREIGN_WORDS = new Set([
  // German
  "der", "das", "und", "ist", "sind", "nicht", "mit", "für", "jetzt", "wenn", "von", "werden",
  "wurde", "wurden", "ein", "eine", "einen", "ihr", "euch", "auf", "dem", "den", "im", "bei",
  // French
  "le", "la", "les", "et", "est", "une", "du", "pour", "avec", "maintenant", "lorsque", "vous",
  // Spanish / Portuguese
  "el", "los", "las", "y", "con", "para", "ahora", "cuando", "del", "una", "não",
]);
const MIN_FOREIGN_HITS = 3;

/** Throws unless the page <title> names an English patch-notes forum. */
export function assertEnglishForumPage($: CheerioAPI, context: string): void {
  const pageTitle = $("title").first().text().replace(/\s+/g, " ").trim();
  const forumName = pageTitle.split(" - ")[0] ?? "";
  if (!ENGLISH_FORUM_NAME.test(forumName)) {
    throw new Error(
      `${context} is not from the English patch-notes forum (page title "${pageTitle.slice(0, 80)}")`,
    );
  }
}

/**
 * Throws when the text is clearly non-English. Short or ambiguous text passes: a one-line
 * hotfix note has too few function words to judge, and a false alarm there would hide nothing.
 */
export function assertEnglishText(text: string, context: string): void {
  const { english, foreign } = languageSignal(text);
  if (foreign >= MIN_FOREIGN_HITS && foreign > english) {
    throw new Error(
      `${context} text looks non-English (${foreign} foreign vs ${english} English function words)`,
    );
  }
}

export function languageSignal(text: string): { english: number; foreign: number } {
  let english = 0;
  let foreign = 0;
  for (const word of text.toLowerCase().match(/\p{L}+/gu) ?? []) {
    if (ENGLISH_WORDS.has(word)) english += 1;
    else if (FOREIGN_WORDS.has(word)) foreign += 1;
  }
  return { english, foreign };
}
