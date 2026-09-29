/**
 * The key a curated item name and a poe2scout name are matched on: lowercase, straight apostrophes,
 * no diacritics ("Mórrigan’s Insight" = "morrigan's insight"). Hand-curated names and scout's names
 * drift on exactly these, and a missed match would silently read as "unpriced".
 */
export function scoutKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
