import { z } from "zod";
import { PATCH_VERSION_RE } from "../../../sources/patchNotes/contracts";

/*
 * Curated pinnacle-boss data (src/data/poe2/bosses/boss-loot.json). Every schema is .strict() so a
 * typo'd key in the hand-edited file fails loudly instead of silently dropping a loot line.
 * Plain zod only (no node/DB imports): the client contract re-uses these schemas.
 */

/** Round-trips through Date so an overflowing day (2026-02-30 → March 2) is rejected, not rolled over. */
const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD")
  .refine((s) => {
    const ms = Date.parse(`${s}T00:00:00Z`);
    return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === s;
  }, "not a real calendar date");

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
    patch: z.string().regex(PATCH_VERSION_RE, "expected a patch version like 0.5.5"),
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

/** PoE2 1.0 launch, announced for 2026-12-11. A date alone proves nothing changed, so it only nudges. */
export const POE2_1_0_LAUNCH_MS = Date.parse("2026-12-11T00:00:00Z");

/** "0.5.4d" → { parts: [0, 5, 4], letter: "d" }; throws on anything outside PATCH_VERSION_RE. */
function parsePatch(patch: string): { parts: number[]; letter: string } {
  if (!PATCH_VERSION_RE.test(patch)) throw new Error(`unparseable patch version "${patch}"`);
  const letter = /[a-z]$/.test(patch) ? patch.slice(-1) : "";
  return { parts: patch.slice(0, patch.length - letter.length).split(".").map(Number), letter };
}

/** Numeric parts only; a missing trailing part counts as 0, so 0.5.4 equals 0.5.4.0. */
function compareNumeric(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** <0 when a is older than b. A hotfix letter sorts after the bare patch: 0.5.4 < 0.5.4d < 0.5.4.1 < 0.5.5. */
export function comparePatch(a: string, b: string): number {
  const [pa, pb] = [parsePatch(a), parsePatch(b)];
  const numeric = compareNumeric(pa.parts, pb.parts);
  if (numeric !== 0) return numeric;
  return pa.letter === pb.letter ? 0 : pa.letter < pb.letter ? -1 : 1;
}

/**
 * `obsolete` is evidence (the game data moved past the tables' patch) and earns an alert banner;
 * `recheck` is a nudge (a hotfix letter or the 1.0 date) and must not look like one.
 */
export type PatchWarning = { level: "obsolete" | "recheck"; text: string };

/**
 * Why the curated tables may be out of date, or null. The coverage patch is the game-data
 * snapshot the app is verified against (patch-coverage.json): only when THAT has moved past the
 * file's patch is there evidence the tables are stale. A file curated ahead of the snapshot is
 * normal (tables get re-checked on patch day, the RePoE sync lags). A hotfix rarely touches
 * pinnacle loot, so a letter-only delta is a nudge, not an alarm.
 */
export function patchWarning(filePatch: string, coveragePatch: string, nowMs: number): PatchWarning | null {
  const [file, coverage] = [parsePatch(filePatch), parsePatch(coveragePatch)];
  const numeric = compareNumeric(file.parts, coverage.parts);
  if (numeric < 0) {
    return {
      level: "obsolete",
      text: `Game data is on ${coveragePatch}, newer than these ${filePatch} boss tables — access chains and loot may be obsolete until re-curated.`,
    };
  }
  if (numeric === 0 && file.letter < coverage.letter) {
    return { level: "recheck", text: `Game data moved to hotfix ${coveragePatch} since these ${filePatch} boss tables — worth a re-check.` };
  }
  if (nowMs >= POE2_1_0_LAUNCH_MS) {
    return { level: "recheck", text: `PoE2 1.0 launched 2026-12-11 — re-check these ${filePatch} boss tables.` };
  }
  return null;
}
