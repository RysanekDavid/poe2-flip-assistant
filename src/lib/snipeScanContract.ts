import { z } from "zod";
import { PoecdnIconUrl, Trade2Url } from "./snipeCard";

/**
 * One snipe from the last scan. Its item card is stored with the SNIPE alert only (Alerts and
 * Opportunities render it from there); older reports that still carry a `card` parse, the field is
 * just not read.
 */
const FindingSchema = z.object({
  listingId: z.string(),
  itemName: z.string(),
  baseType: z.string(),
  marginPct: z.number(),
  searchUrl: z.string(),
});

/** Per-archetype scan diagnostics (core/autoSnipe ProfileDiag) — owner-only, shown under System. */
export const SnipeDiagSchema = z.object({
  key: z.string(),
  label: z.string(),
  total: z.number(),
  fetched: z.number(),
  candidates: z.number(),
  verified: z.number(),
  snipes: z.number(),
  floorDiv: z.number(),
  note: z.string(),
});
export type SnipeDiag = z.infer<typeof SnipeDiagSchema>;

/** Gate failures that still make a listing worth a look: under value, but not by enough (or on too few comparables). */
export const NEAR_MISS_REASONS = ["not-discounted", "thin-reference"] as const;
export type NearMissReason = (typeof NEAR_MISS_REASONS)[number];

/**
 * A valued listing that passed every snipe check except the margin or the comparable count.
 * Market › Opportunities shows the best few instead of an empty "no snipes" line. `basis` says where
 * the value came from: a live comparable search, or the price book (the scan's free short-circuit).
 */
export const NearMissSchema = z.object({
  listingId: z.string().min(1),
  archetype: z.string().min(1),
  name: z.string().max(200),
  baseType: z.string().max(200),
  rarity: z.string().max(20).nullable(),
  icon: PoecdnIconUrl.nullable(),
  priceDiv: z.number().positive(),
  valueDiv: z.number().positive(),
  marginPct: z.number().finite(),
  samples: z.number().int().nonnegative(),
  basis: z.enum(["comps", "book"]),
  reason: z.enum(NEAR_MISS_REASONS),
  /** The gate's own words ("28% under value, need 35%"). */
  detail: z.string().max(300),
  /** trade2 `indexed`: near-misses age out like snipes do. */
  listedAt: z.string().nullable(),
  exaltPerDivine: z.number().positive(),
  tradeUrl: Trade2Url,
});
export type NearMiss = z.infer<typeof NearMissSchema>;

const ReportSchema = z.object({
  league: z.string().optional(), // the league the scan ran in; older reports lack it
  profiles: z.number(),
  searched: z.number(),
  exaltPerDivine: z.number(),
  valuations: z.number(),
  maxValuations: z.number(),
  findings: z.array(FindingSchema),
  diags: z.array(SnipeDiagSchema).optional(), // stripped for members (see reportForViewer)
  nearMisses: z.array(NearMissSchema).optional(), // reports from before near-misses have none
  errors: z.array(z.object({ profile: z.string(), error: z.string() })),
});
export type SnipeScanReport = z.infer<typeof ReportSchema>;

/**
 * GET /api/snipe/scan. `lastReport` is the stored JSON as-is and is parsed on its own
 * (parseScanReport): an old or damaged report must not take the scanner status — and Scan now —
 * down with it.
 */
export const SnipeScanStatusSchema = z.object({
  enabled: z.boolean(),
  live: z.boolean(),
  /** Scans spend the shared trade2 budget, so only the owner may queue one. */
  canScan: z.boolean(),
  intervalMin: z.number(),
  profiles: z.array(z.object({ key: z.string(), label: z.string(), category: z.string() })),
  lastReport: z.unknown(),
  lastScanAt: z.string().nullable(),
  pending: z.boolean(),
  lastError: z.string().nullable(),
  failedAt: z.string().nullable(),
});
export type SnipeScanStatus = z.infer<typeof SnipeScanStatusSchema>;

export type ParsedReport = { report: SnipeScanReport | null; error: string | null };

/** The last report, or why it cannot be read (null report + null error = no scan yet). */
export function parseScanReport(raw: unknown): ParsedReport {
  if (raw == null) return { report: null, error: null };
  const parsed = ReportSchema.safeParse(raw);
  if (parsed.success) return { report: parsed.data, error: null };
  const issue = parsed.error.issues[0];
  return { report: null, error: `last report unreadable (${issue?.path.join(".") || "root"}: ${issue?.message ?? "invalid"}) — run a new scan` };
}

/**
 * The stored report as a viewer may see it: archetype diagnostics are internal tuning data, so a
 * member's copy has none (the UI hides them too; this is the server-side guarantee).
 */
export function reportForViewer(raw: unknown, isOwner: boolean): unknown {
  if (isOwner || raw == null || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const copy: Record<string, unknown> = { ...raw };
  delete copy.diags;
  return copy;
}

/** Fetch and validate the scanner status; throws with the reason on any failure. */
export async function fetchSnipeScanStatus(): Promise<SnipeScanStatus> {
  const r = await fetch("/api/snipe/scan");
  if (!r.ok) throw new Error(`/api/snipe/scan → ${r.status}`);
  return SnipeScanStatusSchema.parse(await r.json());
}
