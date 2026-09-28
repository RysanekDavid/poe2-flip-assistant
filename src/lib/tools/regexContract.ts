/*
 * Wire contract for the Price regex tool: request bodies the routes validate and response shapes
 * the panel validates. Shared by server and client so the two cannot drift. Holds the enum
 * constants too, so the client bundle never imports the server-side cover algorithm.
 */
import { z } from "zod";

/*
 * Conservative until the owner measures the real stash-search limit in-game (50 vs 250). It is a
 * game constant, so the UI keeps a per-browser override rather than a per-user DB preference.
 */
export const REGEX_MAX_CHARS_DEFAULT = 50;
export const REGEX_MODES = ["keep", "trash"] as const;
export type RegexMode = (typeof REGEX_MODES)[number];
export const NAME_KINDS = ["exchange", "unique", "base", "stat"] as const;
export type NameKind = (typeof NAME_KINDS)[number];
export const UNCOVERED_REASONS = ["fragment-too-long", "qualifier-not-item-text"] as const;
export type UncoveredReason = (typeof UNCOVERED_REASONS)[number];
export const WARNING_CODES = [
  "trash-negation-unconfirmed",
  "trash-multi-chunk",
  "trash-uncovered-lit",
  "verify-in-game",
] as const;
export type WarningCode = (typeof WARNING_CODES)[number];

export const REGEX_MAX_CHARS_MIN = 20;
export const REGEX_MAX_CHARS_MAX = 500;

export const RegexParamsSchema = z.object({
  mode: z.enum(REGEX_MODES),
  minDiv: z.number().finite().min(0),
  categories: z.array(z.string().min(1).max(40)).max(20),
  includeUniques: z.boolean(),
  maxChars: z.number().int().min(REGEX_MAX_CHARS_MIN).max(REGEX_MAX_CHARS_MAX),
});
export type RegexParams = z.infer<typeof RegexParamsSchema>;

/*
 * A preset stores the selection only: max chars is a per-browser game constant, and the regex
 * itself is regenerated from live prices on load. Defaults let older rows parse after new fields.
 */
export const PresetParamsSchema = RegexParamsSchema.omit({ maxChars: true }).extend({
  categories: RegexParamsSchema.shape.categories.default([]),
  includeUniques: z.boolean().default(false),
});
export type PresetParams = z.infer<typeof PresetParamsSchema>;

const ChunkSchema = z.object({ text: z.string(), chars: z.number().int(), covers: z.array(z.string()) });
export type RegexChunkView = z.infer<typeof ChunkSchema>;

const CoveredSchema = z.object({
  name: z.string(),
  kind: z.enum(NAME_KINDS),
  category: z.string().nullable(),
  valueDiv: z.number(),
  perUnit: z.boolean(),
  fragment: z.string(),
  icon: z.string().nullable(),
  collisions: z.array(z.string()),
  verify: z.boolean(),
});
export type CoveredView = z.infer<typeof CoveredSchema>;

const UncoveredSchema = z.object({
  name: z.string(),
  valueDiv: z.number(),
  icon: z.string().nullable(),
  reason: z.enum(UNCOVERED_REASONS),
  detail: z.string(),
});
export type UncoveredView = z.infer<typeof UncoveredSchema>;

const WarningSchema = z.object({ code: z.enum(WARNING_CODES), label: z.string(), detail: z.string() });
export type RegexWarningView = z.infer<typeof WarningSchema>;

/** ISO timestamps (or null when that source has never loaded) — every number shows its age. */
export const DataAsOfSchema = z.object({
  ninja: z.string().nullable(),
  uniques: z.string().nullable(),
  tradeMeta: z.string().nullable(),
});
export type DataAsOf = z.infer<typeof DataAsOfSchema>;

export const BuildResponseSchema = z.object({
  league: z.string(),
  mode: z.enum(REGEX_MODES),
  chunks: z.array(ChunkSchema),
  covered: z.array(CoveredSchema),
  uncovered: z.array(UncoveredSchema),
  warnings: z.array(WarningSchema),
  targetCount: z.number().int(),
  reason: z.string().nullable(),
  namespaceSize: z.number().int(),
  dataAsOf: DataAsOfSchema,
});
export type BuildResponse = z.infer<typeof BuildResponseSchema>;

// The in-game search box holds ≤250 chars; 500 leaves room for pasted guide strings while keeping
// the linear literal scan (alternatives × namespace) around 50 ms per debounced keystroke.
export const ExplainRequestSchema = z.object({ text: z.string().min(1).max(500) });

const KindCounts = z.object({ exchange: z.number(), unique: z.number(), base: z.number(), stat: z.number() });
export const ExplainResponseSchema = z.object({
  terms: z.array(
    z.object({
      raw: z.string(),
      negated: z.boolean(),
      alternatives: z.array(z.string()),
      names: z.object({ exchange: z.array(z.string()), unique: z.array(z.string()), base: z.array(z.string()) }),
      counts: KindCounts,
    }),
  ),
  highlighted: z.array(z.string()),
  highlightedCount: z.number().int(),
});
export type ExplainResponse = z.infer<typeof ExplainResponseSchema>;

/** Error body of every regex route: `position` for parse errors, `path` for zod issues. */
export const RegexErrorSchema = z.object({
  error: z.string(),
  position: z.number().int().optional(),
  path: z.array(z.union([z.string(), z.number()])).optional(),
});

export type RegexError = z.infer<typeof RegexErrorSchema>;

/** 400 body from a failed parse: the first issue's message and path, so the form can point at it. */
export function zodErrorBody(error: z.ZodError): RegexError {
  const first = error.issues[0];
  if (!first) return { error: "invalid request" };
  const where = first.path.length > 0 ? `${first.path.join(".")}: ` : "";
  return { error: `${where}${first.message}`, path: first.path };
}

export const PresetSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  league: z.string(),
  params: PresetParamsSchema.nullable(),
  /** Why a stored row no longer parses; shown on the preset chip so it can be deleted. */
  invalid: z.string().nullable(),
  updatedAt: z.string(),
});
export type Preset = z.infer<typeof PresetSchema>;

export const PresetListSchema = z.object({ presets: z.array(PresetSchema) });
export const PresetSavedSchema = z.object({ preset: PresetSchema });
export const OkSchema = z.object({ ok: z.literal(true) });
export const PresetSaveSchema = z.object({ name: z.string().trim().min(1).max(60), params: PresetParamsSchema });
export const PresetDeleteSchema = z.object({ id: z.number().int().positive() });

/** A regex route's error, keeping the parse position so the explain box can point at it. */
export class RegexApiError extends Error {
  constructor(
    message: string,
    readonly position: number | null,
  ) {
    super(message);
    this.name = "RegexApiError";
  }
}

/** Client call to a regex route: non-2xx becomes RegexApiError, 2xx must match `schema`. */
export async function requestRegexApi<T>(
  url: string,
  init: { method: "GET" | "POST" | "DELETE"; body?: unknown },
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
): Promise<T> {
  const res = await fetch(url, {
    method: init.method,
    headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (error: unknown) {
    throw new RegexApiError(`${url} → HTTP ${res.status}, body is not JSON: ${String(error)}`, null);
  }
  if (!res.ok) {
    const err = RegexErrorSchema.safeParse(json);
    throw new RegexApiError(err.success ? err.data.error : `${url} → HTTP ${res.status}`, err.data?.position ?? null);
  }
  return schema.parse(json);
}
