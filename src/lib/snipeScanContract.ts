import { z } from "zod";
import { SnipeCardSchema, type SnipeCard } from "./snipeCard";

/** One snipe from the last scan. `card` is checked per finding, so one bad card never blanks the list. */
const FindingSchema = z.object({
  listingId: z.string(),
  itemName: z.string(),
  baseType: z.string(),
  marginPct: z.number(),
  searchUrl: z.string(),
  card: z.unknown().optional(), // reports from before item cards have none
});

/** Per-archetype scan diagnostics (core/autoSnipe ProfileDiag) — owner-facing, shown under System. */
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

const ReportSchema = z.object({
  profiles: z.number(),
  searched: z.number(),
  exaltPerDivine: z.number(),
  valuations: z.number(),
  maxValuations: z.number(),
  findings: z.array(FindingSchema),
  diags: z.array(SnipeDiagSchema),
  errors: z.array(z.object({ profile: z.string(), error: z.string() })),
});
export type SnipeScanReport = z.infer<typeof ReportSchema>;

/** GET /api/snipe/scan. */
export const SnipeScanStatusSchema = z.object({
  enabled: z.boolean(),
  live: z.boolean(),
  intervalMin: z.number(),
  profiles: z.array(z.object({ key: z.string(), label: z.string(), category: z.string() })),
  lastReport: ReportSchema.nullable(),
  lastScanAt: z.string().nullable(),
  pending: z.boolean(),
  lastError: z.string().nullable(),
  failedAt: z.string().nullable(),
});
export type SnipeScanStatus = z.infer<typeof SnipeScanStatusSchema>;

export type FindingCard = { ok: true; card: SnipeCard } | { ok: false; error: string };

/** A finding's item card, or why it cannot be shown as one. */
export function findingCard(finding: SnipeScanReport["findings"][number]): FindingCard {
  if (finding.card === undefined) return { ok: false, error: "scanned before item cards existed" };
  const parsed = SnipeCardSchema.safeParse(finding.card);
  if (parsed.success) return { ok: true, card: parsed.data };
  const issue = parsed.error.issues[0];
  return { ok: false, error: `card has an unexpected shape at ${issue?.path.join(".") ?? "?"}: ${issue?.message ?? "invalid"}` };
}

/** Fetch and validate the scanner status; throws with the reason on any failure. */
export async function fetchSnipeScanStatus(): Promise<SnipeScanStatus> {
  const r = await fetch("/api/snipe/scan");
  if (!r.ok) throw new Error(`/api/snipe/scan → ${r.status}`);
  return SnipeScanStatusSchema.parse(await r.json());
}
