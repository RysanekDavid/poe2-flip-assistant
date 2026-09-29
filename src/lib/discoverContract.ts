import { z } from "zod";

/**
 * GET /api/discover — shared by the route (parses its own response) and the Top Flips table. The
 * flip row types the UI uses are inferred from here, so there is no second hand-written copy.
 * Unknown server fields are stripped: the payload carries exactly what the UI reads.
 */

const CurrencySchema = z.enum(["DIVINE", "EXALT", "CHAOS"]);
const DenomSchema = z.object({ amount: z.number(), unit: CurrencySchema });

export const EdgeIssueSchema = z.enum(["thin", "coarse", "single-market", "fee-unknown", "implausible", "sporadic"]);
export type EdgeIssue = z.infer<typeof EdgeIssueSchema>;

/** The observed-market fields a flip row carries (core/flipModel FlipRow + core/flipMarket CxRowFields). */
export const FlipEdgeInfoSchema = z.object({
  source: z.enum(["cx", "estimated"]),
  edgePct: z.number(),
  ranked: z.boolean(),
  edgeKind: z.enum(["cross", "band"]).nullable(),
  edgeLatestPct: z.number().nullable(),
  edgeMedian24Pct: z.number().nullable(),
  band: z.object({ lowDiv: z.number(), highDiv: z.number() }).nullable(),
  persistence6: z.number().nullable(),
  persistence24: z.number().nullable(),
  liquidityTier: z.enum(["safe", "risky", "thin"]),
  slowerLegDivPerHour: z.number(),
  timeToSellHint: z.object({ sizeUnits: z.number(), hours: z.number() }).nullable(),
  feeGold: z.number().nullable(),
  feeDiv: z.number().nullable(),
  feeComplete: z.boolean(),
  legsHour: z.number().nullable(),
  cxIssue: EdgeIssueSchema.nullable(),
  cxRawNetPct: z.number().nullable(),
  flowObserved: z.boolean(),
});
export type FlipEdgeInfo = z.infer<typeof FlipEdgeInfoSchema>;

/** One flip row. /api/spreads serialises the same scoreItem output, so its rows share this shape. */
export const CandidateSchema = FlipEdgeInfoSchema.extend({
  itemId: z.string(),
  item: z.string(),
  category: z.string(),
  icon: z.string().nullable(),
  buyExalt: z.number(),
  sellChaos: z.number(),
  /** The trade legs: your Ange prices in REAL mode, the market legs otherwise. */
  buyDisp: DenomSchema,
  sellDisp: DenomSchema,
  /** Always the market legs, whatever the mode. */
  marketBuyDisp: DenomSchema,
  marketSellDisp: DenomSchema,
  mode: z.enum(["REAL", "RECO"]),
  marginPct: z.number(),
  midDivine: z.number(),
  volume: z.number(),
  change7d: z.number().nullable(),
  change24h: z.number().nullable(),
  spark: z.array(z.number()).nullable(),
  profitChaos: z.number(),
  profitDiv: z.number(),
  throughputDivDay: z.number(),
  oscScore: z.number(),
  worthScore: z.number(),
  /** REAL only: your observed mid vs ninja's (%); negative = live below ninja. */
  liveVsNinjaPct: z.number().nullable(),
  risk: z.enum(["PUMP", "DECLINE"]).nullable(),
  stable: z.boolean(),
});
export type Candidate = z.infer<typeof CandidateSchema>;

/** The rank gate as core/cx/cxItemMarkets cxRankGate reports it — never hardcoded in the UI. */
export const RankGateSchema = z.object({ minHeldHours: z.number(), windowHours: z.number(), minSlowerDivPerHour: z.number() });
export type RankGate = z.infer<typeof RankGateSchema>;

/** Published edges that still showed in the next hour's digest (core/cx/cxOutcomes). */
export const PersistedNextHourSchema = z.object({ held: z.number(), checked: z.number(), days: z.number() });
export type PersistedNextHour = z.infer<typeof PersistedNextHourSchema>;

const CxSummarySchema = z.object({
  newestHour: z.number(),
  rankGate: RankGateSchema,
  persistedNextHour: PersistedNextHourSchema,
});

export const RatesSchema = z.object({ exaltPerDivine: z.number(), chaosPerDivine: z.number() });

export const DiscoverResponseSchema = z.object({
  rates: RatesSchema.nullable(),
  ratesSource: z.string().optional(),
  ratesFetchedAt: z.string().nullable().optional(),
  fetchedAt: z.string().nullable().optional(),
  cx: CxSummarySchema.nullable().optional(),
  candidates: z.array(CandidateSchema),
  /** Why the list is empty (no rates yet), when it is. */
  note: z.string().optional(),
});
export type DiscoverResponse = z.infer<typeof DiscoverResponseSchema>;
