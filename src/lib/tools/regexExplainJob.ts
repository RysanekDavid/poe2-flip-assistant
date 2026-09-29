/*
 * The job the explain worker runs: one pasted search string against a batch of tooltips (every
 * pool mod as sample lines, plus an optional pasted item). Validated on both sides of postMessage
 * so a malformed message fails loudly instead of rendering half an explanation.
 */
import { z } from "zod";
import { EMULATOR_MAX_LINES, SEARCH_MAX_CHARS, compileSearch, evaluateSearch } from "../../core/tools/regex/searchEmulator";

/** Big enough for the largest pool (jewel ~210 mods) plus a pasted item. */
export const EXPLAIN_MAX_ITEMS = 400;
/** The deadline the panel gives the worker per job. */
export const EXPLAIN_TIMEOUT_MS = 200;
/** Item key of the tooltip the player pasted (every other key is a pool mod id). */
export const PASTED_ITEM_KEY = "@pasted";

export const ExplainJobSchema = z.object({
  search: z.string().min(1).max(SEARCH_MAX_CHARS),
  items: z
    .array(z.object({ key: z.string().min(1).max(80), lines: z.array(z.string()).max(EMULATOR_MAX_LINES) }))
    .max(EXPLAIN_MAX_ITEMS),
});
export type ExplainJob = z.infer<typeof ExplainJobSchema>;

const TermSchema = z.object({ raw: z.string(), negated: z.boolean(), holds: z.boolean(), hitLines: z.array(z.number().int()) });
export const SearchEvaluationSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), matched: z.boolean(), terms: z.array(TermSchema) }),
  z.object({ ok: z.literal(false), error: z.string(), position: z.number().int().nullable() }),
]);

export const ExplainJobResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), items: z.array(z.object({ key: z.string(), evaluation: SearchEvaluationSchema })) }),
  z.object({ ok: z.literal(false), error: z.string(), position: z.number().int().nullable() }),
]);
export type ExplainJobResult = z.infer<typeof ExplainJobResultSchema>;

/**
 * Pure job body the worker wraps. A search the dialect refuses fails identically for every item,
 * so it is evaluated once and reported once instead of as N copies of the same error.
 */
export function runExplainJob(raw: unknown): ExplainJobResult {
  const job = ExplainJobSchema.parse(raw);
  const probe = evaluateSearch(job.search, []);
  if (!probe.ok) return probe;
  // the probe proved it compiles; compile once more and reuse it for every item of the batch
  const compiled = compileSearch(job.search);
  return { ok: true, items: job.items.map((item) => ({ key: item.key, evaluation: evaluateSearch(compiled, item.lines) })) };
}
