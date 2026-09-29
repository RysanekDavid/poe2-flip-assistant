/*
 * The RePoE sources the entity catalog reads, and how an item's "what it does" text is derived
 * from them. Game text lives in different sources per item family: currency/omens/essences carry
 * `properties.description`, runes/soul cores/idols carry per-slot stats in `augments`, lineage
 * supports carry `support_text` in `skill_gems`, named reliquary keys carry implicit mods, and
 * families with no per-item text (waystones, wombgifts, plain reliquary keys) share the in-game
 * keyword glossary entry for their class.
 */
import { z } from "zod";
import { cleanTemplate } from "../repoe/snapshot";

const baseItemSchema = z
  .object({
    name: z.string().nullish(),
    item_class: z.string(),
    release_state: z.string(),
    implicits: z.array(z.string()).optional(),
    properties: z
      .object({
        description: z.string().optional(),
        directions: z.string().optional(),
        stack_size: z.number().int().optional(),
      })
      .passthrough()
      .optional(),
    visual_identity: z.object({ dds_file: z.string() }).passthrough().optional(),
  })
  .passthrough();
export type RepoeBaseItem = z.infer<typeof baseItemSchema>;

const augmentSchema = z
  .object({
    type_id: z.string(),
    categories: z.record(z.string(), z.object({ stat_text: z.array(z.string()).optional() }).passthrough()),
  })
  .passthrough();
export type RepoeAugment = z.infer<typeof augmentSchema>;

const skillGemSchema = z.object({ support_text: z.string().nullish() }).passthrough();

const uniqueSchema = z
  .object({
    name: z.string().min(1),
    item_class: z.string().min(1),
    is_alternate_art: z.boolean(),
    visual_identity: z.object({ dds_file: z.string(), id: z.string() }).passthrough(),
  })
  .passthrough();
export type RepoeUnique = z.infer<typeof uniqueSchema>;

export const entityRepoeSchema = z.object({
  sources: z.object({
    base_items: z.record(z.string(), baseItemSchema),
    augments: z.record(z.string(), augmentSchema),
    skill_gems: z.record(z.string(), skillGemSchema),
    uniques: z.record(z.string(), uniqueSchema),
    flavour: z.record(z.string(), z.string()),
    mods: z.record(z.string(), z.object({ text: z.string().nullish() }).passthrough()),
    keywords: z.record(z.string(), z.object({ definition: z.string(), term: z.string() }).passthrough()),
  }),
});
export type EntityRepoe = z.infer<typeof entityRepoeSchema>["sources"];

/** Game markup stripped and line breaks folded: hover cards show one flowing paragraph. */
export function gameText(value: string | null | undefined): string | null {
  if (!value) return null;
  const text = cleanTemplate(value).replace(/\s*\n\s*/g, " ").replace(/\s{2,}/g, " ").trim();
  return text === "" ? null : text;
}

/** "Armour: +13% to Chaos Resistance · Martial Weapon: 25% increased Magnitude of Poison you inflict". */
function augmentText(augment: RepoeAugment | undefined): string | null {
  if (!augment) return null;
  const parts = Object.entries(augment.categories).flatMap(([slot, category]) => {
    const stats = (category.stat_text ?? []).map(gameText).filter((s): s is string => s !== null);
    return stats.length > 0 ? [`${slot}: ${stats.join("; ")}`] : [];
  });
  return parts.length > 0 ? parts.join(" · ") : null;
}

function implicitText(base: RepoeBaseItem, repoe: EntityRepoe): string | null {
  const lines = (base.implicits ?? []).map((id) => gameText(repoe.mods[id]?.text)).filter((s): s is string => s !== null);
  return lines.length > 0 ? lines.join(" · ") : null;
}

/**
 * Item class → in-game glossary keyword whose definition explains every item of that class. The
 * per-item keywords (BreachFruitCurrency, VaultKeyWorldDrop) exist but are empty in the game data.
 */
const CLASS_KEYWORD: Record<string, string> = {
  Map: "Waystone",
  BrequelFruit: "BreachWombgift",
  VaultKey: "ReliquaryVault",
};

/** First paragraph of a glossary definition; a missing mapped keyword means the game data moved. */
function classKeywordText(itemClass: string, repoe: EntityRepoe): string | null {
  const keyword = CLASS_KEYWORD[itemClass];
  if (keyword === undefined) return null;
  const definition = repoe.keywords[keyword]?.definition.split(/\r?\n\s*\r?\n/)[0];
  const text = gameText(definition);
  if (text === null) throw new Error(`RePoE keyword ${keyword} (for item class ${itemClass}) has no definition`);
  return text;
}

export interface ItemText {
  summary: string | null;
  directions: string | null;
}

/** Description first; stats/support text/implicits for families without one; directions last resort. */
export function itemText(repoeId: string, base: RepoeBaseItem, repoe: EntityRepoe): ItemText {
  const directions = gameText(base.properties?.directions);
  const summary =
    gameText(base.properties?.description) ??
    augmentText(repoe.augments[repoeId]) ??
    gameText(repoe.skill_gems[repoeId]?.support_text) ??
    implicitText(base, repoe) ??
    classKeywordText(base.item_class, repoe);
  if (summary !== null) return { summary, directions };
  // A fragment's only text is often "Bring this to …" — that IS what it does, so it becomes the summary.
  return { summary: directions, directions: null };
}

/** "Artificer's Orb" → https://poe2db.tw/us/Artificers_Orb (poe2db drops apostrophes, spaces → _). */
export function poe2dbUrl(name: string): string {
  const slug = name.replace(/['’]/g, "").trim().replace(/\s+/g, "_");
  return `https://poe2db.tw/us/${encodeURIComponent(slug)}`;
}

/** "Mjölner" → "mjolner", "Kulemak's Invitation" → "kulemaks-invitation". */
export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
