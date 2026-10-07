/*
 * craft:eval scoring (spec: scratchpad craft-planner/golden-spec.md, "Harness comparison"): the
 * creator's cost at snapshot prices, the planner/creator ratio and its pass band, the route-tag
 * overlap, and the --check regression gate against the committed scoreboard. Pure: the harness
 * script runs the planner and feeds the numbers in.
 */
import { z } from "zod";
import { goldenBandSchema, goldenTagSchema, type GoldenBand, type GoldenCreator } from "./goldenSchema";

export const SCOREBOARD_VERSION = 1;

/** Pass = the planner lands within 2× of what the creator spent, either way. */
export const PASS_BAND = { low: 0.5, high: 2 } as const;
/** --check fails when an entry's ratio moves more than this factor further away from 1. */
export const CHECK_TOLERANCE = 1.1;

/** Creator cost = Σ uses × price + the bought base; null with the materials the snapshot does not price. */
export function creatorCost(c: Pick<GoldenCreator, "materials" | "baseDiv">, prices: ReadonlyMap<string, number>): { div: GoldenBand | null; unpriced: string[] } {
  const unpriced = c.materials.filter((m) => !prices.has(m.id)).map((m) => m.id);
  if (unpriced.length > 0) return { div: null, unpriced };
  const sum = (pick: (b: GoldenBand) => number): number => c.materials.reduce((s, m) => s + pick(m.uses) * prices.get(m.id)!, 0) + (c.baseDiv ? pick(c.baseDiv) : 0);
  return { div: { point: sum((b) => b.point), low: sum((b) => b.low), high: sum((b) => b.high) }, unpriced: [] };
}

/**
 * Planner cost = the plan's material total, plus the bought bases at the creator's base price when
 * the plan starts from a bought base (`buys` counts the restarts that buy another one).
 */
export function plannerCost(totals: GoldenBand, start: { kind: "clean" } | { kind: "bought"; buys: GoldenBand }, baseDiv: GoldenBand | null): GoldenBand {
  if (start.kind !== "bought" || !baseDiv) return totals;
  return { point: totals.point + start.buys.point * baseDiv.point, low: totals.low + start.buys.low * baseDiv.low, high: totals.high + start.buys.high * baseDiv.high };
}

export function ratioOf(planner: GoldenBand | null, creator: GoldenBand | null): number | null {
  if (!planner || !creator || creator.point <= 0) return null;
  return planner.point / creator.point;
}

export const passes = (ratio: number | null): boolean => ratio != null && ratio >= PASS_BAND.low && ratio <= PASS_BAND.high;

/** |A ∩ B| / |A ∪ B|; two empty sets agree fully. */
export function jaccard<T>(a: Iterable<T>, b: Iterable<T>): number {
  const sa = new Set(a);
  const sb = new Set(b);
  const union = new Set([...sa, ...sb]);
  if (union.size === 0) return 1;
  let both = 0;
  for (const x of sa) if (sb.has(x)) both += 1;
  return both / union.size;
}

/** The bill line with the largest share of the material total (null when nothing is priced). */
export function topDriver(bill: ReadonlyArray<{ id: string; label: string; totalDiv: GoldenBand | null }>): ScoreDriver | null {
  const priced = bill.filter((l): l is typeof l & { totalDiv: GoldenBand } => l.totalDiv != null);
  const total = priced.reduce((s, l) => s + l.totalDiv.point, 0);
  if (priced.length === 0 || total <= 0) return null;
  const top = priced.reduce((best, l) => (l.totalDiv.point > best.totalDiv.point ? l : best));
  return { id: top.id, label: top.label, div: top.totalDiv.point, share: top.totalDiv.point / total };
}

export const ERROR_KINDS = ["no-plan", "rejected", "timeout", "unpriced"] as const;

const driverSchema = z.object({ id: z.string(), label: z.string(), div: z.number().nonnegative(), share: z.number().min(0).max(1) }).strict();
export type ScoreDriver = z.infer<typeof driverSchema>;

export const scoreEntrySchema = z
  .object({
    id: z.string().min(1),
    archetype: z.string().min(1),
    /** Which start the scored plan used (null when there is no plan). */
    start: z.enum(["clean", "bought"]).nullable(),
    creatorDiv: goldenBandSchema.nullable(),
    plannerDiv: goldenBandSchema.nullable(),
    /** startMode "compare": both candidates' cost (a bought one with its bases), null = that start has no plan. */
    compared: z.object({ clean: goldenBandSchema.nullable(), bought: goldenBandSchema.nullable() }).strict().nullable(),
    ratio: z.number().nonnegative().nullable(),
    pass: z.boolean(),
    tags: z.object({ planner: z.array(goldenTagSchema), creator: z.array(goldenTagSchema), jaccard: z.number().min(0).max(1) }).strict(),
    topDriver: driverSchema.nullable(),
    impractical: z.boolean(),
    marketDiv: z.number().nonnegative().nullable(),
    error: z.object({ kind: z.enum(ERROR_KINDS), message: z.string() }).strict().nullable(),
  })
  .strict();
export type ScoreEntry = z.infer<typeof scoreEntrySchema>;

export const scoreboardSchema = z
  .object({
    schema_version: z.literal(SCOREBOARD_VERSION),
    generatedAt: z.string().datetime(),
    prices: z.object({ league: z.string(), fetchedAt: z.string().datetime(), source: z.string() }).strict(),
    budget: z.object({ clock: z.literal("cpu"), searchMs: z.number().positive(), alternativesMs: z.number().positive() }).strict(),
    summary: z.object({ entries: z.number().int().nonnegative(), passed: z.number().int().nonnegative(), errored: z.number().int().nonnegative() }).strict(),
    entries: z.array(scoreEntrySchema),
  })
  .strict();
export type Scoreboard = z.infer<typeof scoreboardSchema>;

export const summarize = (entries: readonly ScoreEntry[]): Scoreboard["summary"] => ({
  entries: entries.length,
  passed: entries.filter((e) => e.pass).length,
  errored: entries.filter((e) => e.error).length,
});

/** How far a ratio is from 1, symmetric in over- and under-estimates (2× and 0.5× are equally far). */
const distance = (ratio: number): number => Math.abs(Math.log(ratio));

export interface CheckResult {
  regressions: string[];
  notes: string[];
}

function checkEntry(base: ScoreEntry, now: ScoreEntry): string[] {
  const out: string[] = [];
  if (base.pass && !now.pass) out.push(`${now.id}: pass → fail (ratio ${fmt(base.ratio)} → ${fmt(now.ratio)})`);
  if (base.ratio != null && now.ratio == null) out.push(`${now.id}: had ratio ${fmt(base.ratio)}, now none (${now.error?.kind ?? "no cost"}: ${now.error?.message ?? ""})`);
  if (base.ratio != null && now.ratio != null && base.ratio > 0 && now.ratio > 0 && distance(now.ratio) > distance(base.ratio) + Math.log(CHECK_TOLERANCE)) {
    out.push(`${now.id}: ratio ${fmt(base.ratio)} → ${fmt(now.ratio)} moved more than ${Math.round((CHECK_TOLERANCE - 1) * 100)}% further from 1`);
  }
  return out;
}

/**
 * The regression gate. `onlyIds` limits it to a --only run; otherwise a baseline entry missing from
 * the run fails too, so deleting a golden file cannot hide a regression.
 */
export function checkAgainstBaseline(baseline: readonly ScoreEntry[], current: readonly ScoreEntry[], onlyIds: ReadonlySet<string> | null): CheckResult {
  const now = new Map(current.map((e) => [e.id, e]));
  const regressions: string[] = [];
  const notes: string[] = [];
  for (const base of baseline) {
    if (onlyIds && !onlyIds.has(base.id)) continue;
    const entry = now.get(base.id);
    if (!entry) {
      regressions.push(`${base.id}: in the baseline but not in this run (refresh the baseline with npm run craft:eval if it was removed on purpose)`);
      continue;
    }
    regressions.push(...checkEntry(base, entry));
  }
  const known = new Set(baseline.map((e) => e.id));
  for (const e of current) if (!known.has(e.id)) notes.push(`${e.id}: new, not in the baseline`);
  return { regressions, notes };
}

export const fmt = (n: number | null, digits = 2): string => (n == null ? "–" : n.toFixed(digits));
