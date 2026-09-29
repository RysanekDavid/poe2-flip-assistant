/*
 * The entity catalog: one row per player-facing thing (currency, omens, fragments, uniques, …)
 * with its game art and in-game text. Generated offline by `npm run sync:entities` into
 * src/data/poe2/entities.json.gz; the Coach annotates answers from it, and later the new-player
 * "What is this?" lookup and strategy KB entity refs read the same rows. Keys are snake_case
 * because the Python Coach consumes the file unchanged.
 */
import { z } from "zod";

export const ENTITY_CATALOG_SCHEMA_VERSION = 1;

/** Ordered roughly by how often a trader meets them; the order is the hover-card label order only. */
export const ENTITY_KINDS = [
  "currency",
  "omen",
  "essence",
  "catalyst",
  "fragment",
  "rune",
  "soul_core",
  "idol",
  "augment",
  "lineage_gem",
  "uncut_gem",
  "waystone",
  "unique",
  "other",
] as const;
export const entityKindSchema = z.enum(ENTITY_KINDS);
export type EntityKind = z.infer<typeof entityKindSchema>;

export const ENTITY_KIND_LABEL: Record<EntityKind, string> = {
  currency: "Currency",
  omen: "Omen",
  essence: "Essence",
  catalyst: "Catalyst",
  fragment: "Fragment / key",
  rune: "Rune",
  soul_core: "Soul Core",
  idol: "Idol",
  augment: "Augment",
  lineage_gem: "Lineage support gem",
  uncut_gem: "Uncut gem",
  waystone: "Waystone",
  unique: "Unique",
  other: "Item",
};

// The CSP allows images only from the app and *.poecdn.com; any other host would render broken.
export const POECDN_ICON_PATTERN = /^https:\/\/web\.poecdn\.com\/gen\/image\/[A-Za-z0-9_\-=]+\/[0-9a-f]{10}\/[\w\-.%]+\.png$/;
export const POE2DB_URL_PATTERN = /^https:\/\/poe2db\.tw\/us\/[^\s]+$/;
export const ENTITY_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const entityRowSchema = z
  .object({
    id: z.string().regex(ENTITY_ID_PATTERN),
    kind: entityKindSchema,
    name: z.string().min(1),
    /** Curated extra surface forms (never bare "Divine"/"Chaos"/"Exalted"); plurals are derived by consumers. */
    aliases: z.array(z.string().min(1)),
    /** What the item does, from game text; null when the game data carries none. */
    summary: z.string().min(1).nullable(),
    /** How to use it ("Right click this item then…"), when distinct from the summary. */
    directions: z.string().min(1).nullable(),
    stack_size: z.number().int().positive().nullable(),
    icon_url: z.string().regex(POECDN_ICON_PATTERN).nullable(),
    /** trade2 static id — also the poe.ninja exchange overview id for current-league items. */
    exchange_id: z.string().min(1).nullable(),
    repoe_id: z.string().min(1).nullable(),
    item_class: z.string().min(1).nullable(),
    /** Base type of a unique ("Crimson Amulet"); null for everything else. */
    base_type: z.string().min(1).nullable(),
    poe2db_url: z.string().regex(POE2DB_URL_PATTERN),
  })
  .strict();
export type EntityRow = z.infer<typeof entityRowSchema>;

export const entityCatalogSchema = z
  .object({
    schema_version: z.literal(ENTITY_CATALOG_SCHEMA_VERSION),
    source_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    repoe_version: z.string().min(1),
    game_data_patch: z.string().min(1),
    /** sha256 of the trade2 data/static body the icons came from; icon URLs carry a server hash. */
    trade_static_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    fetched_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    entities: z.array(entityRowSchema).min(1),
  })
  .strict();
export type EntityCatalog = z.infer<typeof entityCatalogSchema>;
