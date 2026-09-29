/*
 * Wire contract of the Learn tab routes (/api/entities, /api/learn/*, /api/settings/nav-mode).
 * The server builds these shapes and the client parses them, so a drift fails at the boundary.
 */
import { z } from "zod";
import { claimSchema } from "./claim";
import { navModeSchema } from "./navMode";
import { ENTITY_ID_PATTERN, POE2DB_URL_PATTERN, POECDN_ICON_PATTERN, entityKindSchema } from "../core/entities/schema";
import { atlasChecklistSchema, pickupAdviceSchema } from "../core/learn/schema";

/** Where a new player sells it: Currency Exchange (stackables), trade site (uniques), or we cannot say. */
export const SELL_ROUTES = ["cx", "trade", "unknown"] as const;
export const sellRouteSchema = z.enum(SELL_ROUTES);
export type SellRoute = z.infer<typeof sellRouteSchema>;

/** The "pick up?" rule of thumb: worth ≥ 1 Exalted each → pick it up. */
export const PICKUP_HINTS = ["pick_up", "low_value", "unknown"] as const;
export const pickupHintSchema = z.enum(PICKUP_HINTS);
export type PickupHint = z.infer<typeof pickupHintSchema>;

export const PICKUP_THRESHOLD_EX = 1;

export const lookupPriceSchema = z
  .object({
    /** Divine per item. */
    div: z.number().positive().finite(),
    /** ISO time the value was stored. */
    at: z.string().datetime({ offset: true }),
    source: z.enum(["ninja", "scout"]),
  })
  .strict();
export type LookupPrice = z.infer<typeof lookupPriceSchema>;

export const entityLookupSchema = z
  .object({
    id: z.string().regex(ENTITY_ID_PATTERN),
    kind: entityKindSchema,
    name: z.string().min(1),
    icon_url: z.string().regex(POECDN_ICON_PATTERN).nullable(),
    summary: z.string().min(1).nullable(),
    directions: z.string().min(1).nullable(),
    poe2db_url: z.string().regex(POE2DB_URL_PATTERN),
    exchange_id: z.string().min(1).nullable(),
    price: lookupPriceSchema.nullable(),
    sell_route: sellRouteSchema,
    pickup_hint: pickupHintSchema,
  })
  .strict();
export type EntityLookup = z.infer<typeof entityLookupSchema>;

export const entitySearchResponseSchema = z
  .object({
    results: z.array(entityLookupSchema).max(20),
    /** Exalted per Divine for showing sub-Divine prices in ex; null when no rate source answers. */
    ex_per_div: z.number().positive().nullable(),
  })
  .strict();
export type EntitySearchResponse = z.infer<typeof entitySearchResponseSchema>;

export const primerCardSchema = z
  .object({
    entity: entityLookupSchema,
    who_uses: z.string().min(1),
    pickup: pickupAdviceSchema,
    claim: claimSchema,
  })
  .strict();
export type PrimerCard = z.infer<typeof primerCardSchema>;

export const primerResponseSchema = z
  .object({
    cards: z.array(primerCardSchema),
    ex_per_div: z.number().positive().nullable(),
    verified_against: z.string().min(1),
  })
  .strict();
export type PrimerResponse = z.infer<typeof primerResponseSchema>;

export const learnDoneSchema = z.object({ step_id: z.string().min(1), done_at: z.number().int() }).strict();

export const progressResponseSchema = z
  .object({
    checklist: atlasChecklistSchema,
    done: z.array(learnDoneSchema),
  })
  .strict();
export type ProgressResponse = z.infer<typeof progressResponseSchema>;

export const progressRequestSchema = z.object({ step_id: z.string().min(1).max(64), done: z.boolean() }).strict();

export const navModeBodySchema = z.object({ nav_mode: navModeSchema }).strict();
export type NavModeBody = z.infer<typeof navModeBodySchema>;

/** GET /api/auth/me user as the client reads it (auth/meResponse.ts builds it). */
export const meUserSchema = z
  .object({
    id: z.number().int().positive(),
    name: z.string().min(1),
    role: z.enum(["owner", "member"]),
    nav_mode: navModeSchema,
  })
  .strict();
export type MeUser = z.infer<typeof meUserSchema>;
export const meResponseSchema = z.object({ user: meUserSchema.nullable() }).strict();
