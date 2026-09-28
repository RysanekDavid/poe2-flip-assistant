import { z } from "zod";

/*
 * Curated pinnacle-boss data (src/data/poe2/bosses/boss-loot.json). Every schema is .strict() so a
 * typo'd key in the hand-edited file fails loudly instead of silently dropping a loot line.
 * Plain zod only (no node/DB imports): the client contract re-uses these schemas.
 */

const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD")
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), "not a real calendar date");

const probability = z.number().min(0).max(1);

export const sourceSchema = z
  .object({ title: z.string().min(1), url: z.string().url(), accessed: isoDay })
  .strict();
export type Source = z.infer<typeof sourceSchema>;

export const confidenceSchema = z.enum(["confirmed", "single-source", "unverified"]);
export type Confidence = z.infer<typeof confidenceSchema>;

/**
 * Where a loot line's price comes from. `unpriced` exists for lines no market can value — e.g. a
 * random pick from a 17-omen pool — so they stay visible (and counted) instead of being dropped.
 */
export const priceRefSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ninja"), itemId: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("scout"), name: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("manual"), div: z.number().positive(), asOf: isoDay }).strict(),
  z.object({ kind: z.literal("unpriced"), reason: z.string().min(1) }).strict(),
]);
export type PriceRef = z.infer<typeof priceRefSchema>;

/** Per-kill drop probability. `unknown` is a first-class answer: most boss rates are guesses. */
export const rateSchema = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("point"), p: probability }).strict(),
    z.object({ kind: z.literal("range"), lo: probability, hi: probability }).strict(),
    z.object({ kind: z.literal("guaranteed") }).strict(),
    z.object({ kind: z.literal("unknown") }).strict(),
  ])
  .refine((r) => r.kind !== "range" || r.lo <= r.hi, "range lo must be ≤ hi");
export type Rate = z.infer<typeof rateSchema>;

export const lootLineSchema = z
  .object({
    name: z.string().min(1),
    priceRef: priceRefSchema,
    rate: rateSchema,
    confidence: confidenceSchema,
    source: sourceSchema,
  })
  .strict();
export type LootLine = z.infer<typeof lootLineSchema>;

const craftPartSchema = z.object({ itemId: z.string().min(1), qty: z.number().positive() }).strict();

/** One consumed entry item. `craftFrom` is the self-assembly recipe; cost = min(buy, craft). */
export const entryLineSchema = z
  .object({ itemId: z.string().min(1), qty: z.number().positive(), craftFrom: z.array(craftPartSchema).min(1).optional() })
  .strict();
export type EntryLine = z.infer<typeof entryLineSchema>;

export const tierSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    label: z.string().min(1),
    entry: z.array(entryLineSchema).min(1),
    loot: z.array(lootLineSchema).min(1),
  })
  .strict();
export type Tier = z.infer<typeof tierSchema>;

export const bossSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    name: z.string().min(1),
    mechanic: z.string().min(1),
    accessChain: z.string().min(1),
    sources: z.array(sourceSchema).min(1),
    tiers: z.array(tierSchema).min(1),
  })
  .strict();
export type Boss = z.infer<typeof bossSchema>;

export const bossLootFileSchema = z
  .object({
    schemaVersion: z.literal(1),
    patch: z.string().regex(/^\d+\.\d+\.\d+[a-z]?$/),
    dataAsOf: isoDay,
    bosses: z.array(bossSchema).min(1),
  })
  .strict()
  .superRefine((file, ctx) => {
    const seen = new Set<string>();
    for (const boss of file.bosses) {
      if (seen.has(boss.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `duplicate boss id ${boss.id}` });
      seen.add(boss.id);
      const tierIds = new Set(boss.tiers.map((t) => t.id));
      if (tierIds.size !== boss.tiers.length) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${boss.id}: duplicate tier id` });
      }
    }
  });
export type BossLootFile = z.infer<typeof bossLootFileSchema>;

/** Parse the curated file, throwing with the first few issue paths so the bad line is findable. */
export function parseBossLoot(raw: unknown): BossLootFile {
  const parsed = bossLootFileSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new Error(`boss-loot.json invalid — ${issues.join("; ")}`);
  }
  return parsed.data;
}

/** PoE2 1.0 launch (announced for 2026-12-11): the 0.5 boss roster and loot tables stop applying. */
export const POE2_1_0_LAUNCH_MS = Date.parse("2026-12-11T00:00:00Z");

/** "0.5.4d" → "0.5.4": a hotfix letter never reshuffles pinnacle loot tables, a patch number can. */
function patchCore(patch: string): string {
  const match = /^\d+\.\d+\.\d+/.exec(patch);
  return match ? match[0] : patch;
}

/**
 * Why the curated tables may be out of date, or null. The coverage patch is the game-data
 * snapshot the app is verified against (patch-coverage.json).
 */
export function patchWarning(filePatch: string, coveragePatch: string, nowMs: number): string | null {
  if (nowMs >= POE2_1_0_LAUNCH_MS) {
    return `PoE2 1.0 is live (2026-12-11) — these ${filePatch} boss tables are likely obsolete until re-curated.`;
  }
  if (patchCore(filePatch) !== patchCore(coveragePatch)) {
    return `Boss tables were curated for ${filePatch}, but the app's game data covers ${coveragePatch} — re-check access chains and loot.`;
  }
  return null;
}
