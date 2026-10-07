/*
 * craft:eval scoring (spec: scratchpad craft-planner/golden-spec.md, "Harness comparison"): the
 * creator's cost at snapshot prices, the planner/creator ratio and its pass band, the route-tag
 * overlap, and the --check regression gate against the committed scoreboard. Pure: the harness
 * script runs the planner and feeds the numbers in.
 */
import { z } from "zod";
import { BENCHMARKS, goldenBandSchema, goldenTagSchema, type GoldenBand, type GoldenCreator, type GoldenEntry } from "./goldenSchema";

export const SCOREBOARD_VERSION = 2;

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

/**
 * The creator side the ratio is taken against: the material sum, or the creator's stated total for a
 * "statedTotal" entry. An "excluded" entry keeps the material sum so --check still sees it drift.
 */
export function benchmarkDiv(entry: Pick<GoldenEntry, "id" | "benchmark" | "creator">, materialsDiv: GoldenBand | null): GoldenBand | null {
  if (entry.benchmark !== "statedTotal") return materialsDiv;
  if (!entry.creator.statedTotalDiv) throw new Error(`craft:eval ${entry.id}: benchmark "statedTotal" without creator.statedTotalDiv`);
  return entry.creator.statedTotalDiv;
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

/**
 * How a compare entry picked its start: "with-base" = the UI's rule with the creator's base price;
 * "no-base-clean" = no base price in the source, so the clean plan (a bought plan's total would skip
 * the work its unpriced base embodies and look falsely cheap); "one-plan" = only one start planned;
 * "no-plan" = neither did.
 */
export const COMPARE_RULES = ["with-base", "no-base-clean", "one-plan", "no-plan"] as const;
export type CompareRule = (typeof COMPARE_RULES)[number];

const driverSchema = z.object({ id: z.string(), label: z.string(), div: z.number().nonnegative(), share: z.number().min(0).max(1) }).strict();
export type ScoreDriver = z.infer<typeof driverSchema>;

export const scoreEntrySchema = z
  .object({
    id: z.string().min(1),
    archetype: z.string().min(1),
    /** Which start the scored plan used (null when there is no plan). */
    start: z.enum(["clean", "bought"]).nullable(),
    benchmark: z.object({ kind: z.enum(BENCHMARKS), reason: z.string().min(1).nullable() }).strict(),
    /** The creator's materials at snapshot prices (+ the bought base). */
    creatorDiv: goldenBandSchema.nullable(),
    /** The creator's stated total; the ratio's denominator when benchmark.kind is "statedTotal". */
    statedDiv: goldenBandSchema.nullable(),
    plannerDiv: goldenBandSchema.nullable(),
    /** startMode "compare": both candidates' cost (a bought one with its bases), null = that start has no plan. */
    compared: z.object({ clean: goldenBandSchema.nullable(), bought: goldenBandSchema.nullable(), rule: z.enum(COMPARE_RULES) }).strict().nullable(),
    /** planner / benchmark (see benchmarkDiv). */
    ratio: z.number().nonnegative().nullable(),
    /** The 0.5–2 band; an excluded entry still records it, but the summary does not count it. */
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
    summary: z
      .object({ entries: z.number().int().nonnegative(), counted: z.number().int().nonnegative(), excluded: z.number().int().nonnegative(), passed: z.number().int().nonnegative(), errored: z.number().int().nonnegative() })
      .strict(),
    entries: z.array(scoreEntrySchema),
  })
  .strict();
export type Scoreboard = z.infer<typeof scoreboardSchema>;

export const isCounted = (e: Pick<ScoreEntry, "benchmark">): boolean => e.benchmark.kind !== "excluded";

/** `passed` counts only the counted entries: an excluded entry's band result is drift data, not a score. */
export function summarize(entries: readonly ScoreEntry[]): Scoreboard["summary"] {
  const counted = entries.filter(isCounted);
  return {
    entries: entries.length,
    counted: counted.length,
    excluded: entries.length - counted.length,
    passed: counted.filter((e) => e.pass).length,
    errored: entries.filter((e) => e.error).length,
  };
}

export const summaryLine = (s: Scoreboard["summary"]): string => `${s.passed}/${s.counted} counted pass (${s.excluded} excluded), ${s.errored} errored`;

/** How far a ratio is from 1, symmetric in over- and under-estimates (2× and 0.5× are equally far). */
const distance = (ratio: number): number => Math.abs(Math.log(ratio));

export interface CheckResult {
  regressions: string[];
  notes: string[];
}

function checkEntry(base: ScoreEntry, now: ScoreEntry): string[] {
  // A ratio against a different benchmark is not comparable: a re-classification must refresh the baseline.
  if (base.benchmark.kind !== now.benchmark.kind) return [`${now.id}: benchmark ${base.benchmark.kind} → ${now.benchmark.kind}, ratios not comparable (refresh the baseline with npm run craft:eval)`];
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
