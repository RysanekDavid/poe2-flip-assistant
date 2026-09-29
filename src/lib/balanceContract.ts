import { z } from "zod";

/*
 * Net-worth routes (GET /api/balance, POST /api/balance/read) — parsed on the server before it
 * answers and again in the Wealth panel, so a drifted column fails loudly instead of rendering 0s.
 * Snapshot fields keep the DB's snake_case: they are the balance_snapshots row.
 */

export const balanceSourceSchema = z.enum(["trade", "stash", "ocr", "manual"]);
export type BalanceSourceId = z.infer<typeof balanceSourceSchema>;

export const snapshotSchema = z.object({
  id: z.number().int(),
  divine: z.number(),
  exalted: z.number(),
  chaos: z.number(),
  other_div: z.number(),
  net_worth_div: z.number(),
  source: balanceSourceSchema,
  note: z.string().nullable(),
  fetched_at: z.string(),
  listed_seen: z.number().int().nullable(),
  listed_total: z.number().int().nullable(),
  gear_at_ask_div: z.number().nullable(),
});
export type Snapshot = z.infer<typeof snapshotSchema>;

export const statsSchema = z.object({
  latest: snapshotSchema.nullable(),
  first: snapshotSchema.nullable(),
  change24hPct: z.number().nullable(),
  change7dPct: z.number().nullable(),
  changeAllPct: z.number().nullable(),
  count: z.number().int(),
});
export type Stats = z.infer<typeof statsSchema>;

export const pnlSchema = z.object({
  points: z.array(z.object({ t: z.string(), cum: z.number() })),
  total: z.number(),
  last7d: z.number(),
  last24h: z.number(),
  count: z.number().int(),
});
export type Pnl = z.infer<typeof pnlSchema>;

export const tabRowSchema = z.object({
  tab: z.string(),
  divine: z.number(),
  exalted: z.number(),
  chaos: z.number(),
  other_div: z.number(),
  value_div: z.number(),
  items: z.number().int(),
  unpriced: z.number().int(),
});
export type TabRow = z.infer<typeof tabRowSchema>;

export const tabSeriesPointSchema = z.object({ tab: z.string(), fetched_at: z.string(), value_div: z.number() });
export type TabSeriesPoint = z.infer<typeof tabSeriesPointSchema>;

/** Net-worth change since the current play session's first snapshot (core/wealth/sessionDelta). */
export const sessionSchema = z.object({
  startAt: z.string(),
  startDiv: z.number(),
  deltaDiv: z.number(),
  deltaPct: z.number().nullable(),
});
export type Session = z.infer<typeof sessionSchema>;

export const balanceResponseSchema = z.object({
  /** Net worth is read in the app default league; realized P&L follows the viewer's league. */
  computedLeague: z.string(),
  pnlLeague: z.string(),
  balances: z.array(snapshotSchema),
  stats: statsSchema,
  session: sessionSchema.nullable(),
  pnl: pnlSchema,
  stashEnabled: z.boolean(),
  tabs: z.array(tabRowSchema),
  tabSeries: z.array(tabSeriesPointSchema),
});
export type BalanceResponse = z.infer<typeof balanceResponseSchema>;

export const readScanSchema = z.object({
  listingsSeen: z.number().int(),
  total: z.number().int(),
  divine: z.number(),
  exalted: z.number(),
  chaos: z.number(),
  truncated: z.boolean(),
});

export const readResponseSchema = z.object({
  snapshot: snapshotSchema,
  scan: readScanSchema,
  /** Non-fatal degradation (e.g. unique prices not refreshed). */
  warning: z.string().nullable(),
  computedLeague: z.string(),
});
export type ReadResponse = z.infer<typeof readResponseSchema>;

export const manualResponseSchema = z.object({ snapshot: snapshotSchema, stats: statsSchema, computedLeague: z.string() });
