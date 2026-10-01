import { z } from "zod";

/**
 * GET /api/balance/summary as the header's net-worth chip and Home's stash card read it. Pure zod,
 * client-safe. Divine, never inverted; null = no stash read yet (never 0).
 */
export const netWorthSummarySchema = z.object({ netWorthDiv: z.number().nullable(), change24hPct: z.number().nullable() });
export type NetWorthSummary = z.infer<typeof netWorthSummarySchema>;
