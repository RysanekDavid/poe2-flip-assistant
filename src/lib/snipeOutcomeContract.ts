import { z } from "zod";

/**
 * What happened to alerted snipe listings, ~2 h and ~24 h after the alert. trade2 cannot tell a
 * sale from a delisting or a reprice-away, so the only vocabulary is what a re-check observes:
 * the listing is still served ("listed"), no longer served ("gone"), or the check failed
 * ("error"). Nothing here may ever say "sold". Pure module: the route writes it, the UI reads it.
 */
export const OUTCOME_STATES = ["listed", "gone", "error"] as const;
export type OutcomeState = (typeof OUTCOME_STATES)[number];

/** fetch = /fetch against the search that found the listing; search = a fresh seller+base search. */
export const OUTCOME_METHODS = ["fetch", "search"] as const;
export type OutcomeMethod = (typeof OUTCOME_METHODS)[number];

/**
 * Whether the fetch method has been shown to tell gone from listed: unverified until a
 * cross-check re-search agrees with it, broken once a re-search finds a listing it called gone.
 */
export const FETCH_METHOD_STATES = ["unverified", "verified", "broken"] as const;
export type FetchMethodState = (typeof FETCH_METHOD_STATES)[number];

const CHECKPOINTS = ["2h", "24h"] as const;
export type Checkpoint = (typeof CHECKPOINTS)[number];

/** The ask as the listing states it — formatted from its own currency, never a later rate. */
const RawAskSchema = z.object({ amount: z.number().positive(), currency: z.string().min(1).max(40) });
type RawAsk = z.infer<typeof RawAskSchema>;

export const OutcomeCheckSchema = z.object({
  state: z.enum(OUTCOME_STATES),
  at: z.number().int().nonnegative(), // epoch ms of the check
  ask: RawAskSchema.nullable(), // current ask when listed; null = gone/error/unpriced
  method: z.enum(OUTCOME_METHODS).nullable(), // null = no request made (e.g. missed window)
});
export type OutcomeCheck = z.infer<typeof OutcomeCheckSchema>;

export const SnipeOutcomeViewSchema = z.object({
  listingId: z.string(),
  profile: z.string(),
  alertedAt: z.number().int().nonnegative(),
  check2h: OutcomeCheckSchema.nullable(), // null = not checked yet
  check24h: OutcomeCheckSchema.nullable(),
  lastError: z.string().nullable(),
});
export type SnipeOutcomeView = z.infer<typeof SnipeOutcomeViewSchema>;

const Pct = z.number().min(0).max(100).nullable(); // null = nothing decided yet, never 0

/** Per-archetype hit rates. gone2hPct is the quality signal: a real snipe disappears fast. */
export const ProfileOutcomeStatsSchema = z.object({
  profile: z.string(),
  label: z.string(),
  n: z.number().int().nonnegative(), // alerted listings tracked in the window
  checked2h: z.number().int().nonnegative(), // decided (listed|gone) at the 2 h check
  gone2hPct: Pct,
  decided24h: z.number().int().nonnegative(), // gone at 2 h, or listed|gone at 24 h
  gone24hPct: Pct,
  listed24hPct: Pct,
  errors: z.number().int().nonnegative(), // checkpoints that ended in error
  medianMarginGonePct: z.number().nullable(), // alert margin of listings that went
  medianMarginListedPct: z.number().nullable(), // …and of those still listed at 24 h
});
export type ProfileOutcomeStats = z.infer<typeof ProfileOutcomeStatsSchema>;

export const SnipeOutcomesResponseSchema = z.object({
  league: z.string(), // stats cover this league (the scanner's)
  windowDays: z.number().int().positive(),
  fetchMethod: z.enum(FETCH_METHOD_STATES),
  byListing: z.record(z.string(), SnipeOutcomeViewSchema),
  profiles: z.array(ProfileOutcomeStatsSchema),
  pending: z.number().int().nonnegative(), // tracked listings with a checkpoint still to run
});
export type SnipeOutcomesResponse = z.infer<typeof SnipeOutcomesResponseSchema>;

export async function fetchSnipeOutcomes(): Promise<SnipeOutcomesResponse> {
  const r = await fetch("/api/snipe/outcomes");
  if (!r.ok) throw new Error(`/api/snipe/outcomes → ${r.status}`);
  return SnipeOutcomesResponseSchema.parse(await r.json());
}

export const GONE_MEANING =
  "gone = trade2 no longer serves the listing: sold, delisted or repriced away — trade2 cannot tell which, so this is not a sale count";

/** Why a fetch-observed outcome may not be trusted yet; null once the method is verified. */
export function fetchMethodCaveat(state: FetchMethodState): string | null {
  if (state === "unverified") return "unverified method: re-fetching via the original search has not yet been confirmed by an independent re-search";
  if (state === "broken") return "unreliable method: a re-search found a listing the re-fetch called gone — fetch-based results may be wrong";
  return null;
}

/** What a snipe card needs to render its outcome chip. */
export interface CardOutcome {
  view: SnipeOutcomeView;
  fetchMethod: FetchMethodState;
}

export interface OutcomeChip {
  label: string;
  tone: "good" | "warn" | "muted";
  hint: string;
}

const HOUR_MS = 3_600_000;
const SHORT_CCY: Record<string, string> = { exalted: "ex", exalt: "ex", divine: "div", chaos: "c" };

function fmtRawAsk(ask: RawAsk): string {
  return `${ask.amount.toLocaleString("en", { maximumFractionDigits: 2 })} ${SHORT_CCY[ask.currency] ?? ask.currency}`;
}

/** Hours from alert to check: "gone <3h" rounds up, "listed 25h" rounds down — neither overstates. */
const hoursUp = (c: OutcomeCheck, alertedAt: number): number => Math.max(1, Math.ceil((c.at - alertedAt) / HOUR_MS));
const hoursDown = (c: OutcomeCheck, alertedAt: number): number => Math.max(0, Math.floor((c.at - alertedAt) / HOUR_MS));

function observed(o: SnipeOutcomeView, c: OutcomeCheck, fetchMethod: FetchMethodState): OutcomeChip | null {
  const note = c.method === "search" ? " (re-searched)" : c.method === "fetch" ? " (re-fetched)" : "";
  const caveat = c.method === "fetch" ? fetchMethodCaveat(fetchMethod) : null;
  const trust = (chip: OutcomeChip): OutcomeChip =>
    caveat == null ? chip : { label: fetchMethod === "broken" ? `${chip.label}?` : chip.label, tone: "muted", hint: `${chip.hint}\n${caveat}` };
  if (c.state === "gone") return trust({ label: `gone <${hoursUp(c, o.alertedAt)}h`, tone: "good", hint: `${GONE_MEANING}${note}` });
  if (c.state === "listed") {
    const ask = c.ask != null ? ` · ask ${fmtRawAsk(c.ask)}` : "";
    const h = hoursDown(c, o.alertedAt);
    return h >= 24
      ? trust({ label: `still listed ${h}h${ask}`, tone: "warn", hint: `nobody took it within a day — the value estimate may be off${note}` })
      : trust({ label: `listed at ${h}h${ask}`, tone: "muted", hint: `still listed ${h} h after the alert; the 24 h check is pending${note}` });
  }
  return null;
}

/**
 * The card chip for one tracked listing, or null when there is nothing to say yet (not checked,
 * or an alert from before tracking existed — those have no row at all).
 */
export function outcomeChip(o: SnipeOutcomeView, fetchMethod: FetchMethodState): OutcomeChip | null {
  const { check2h: h2, check24h: h24 } = o;
  if (h2?.state === "gone") return observed(o, h2, fetchMethod);
  if (h24 != null && h24.state !== "error") return observed(o, h24, fetchMethod);
  if (h24?.state === "error") return { label: "outcome unknown", tone: "muted", hint: `the 24 h check failed: ${o.lastError ?? "no detail"}` };
  if (h2?.state === "listed") return observed(o, h2, fetchMethod);
  if (h2?.state === "error") return { label: "2h check failed", tone: "muted", hint: `${o.lastError ?? "no detail"}; the 24 h check is pending` };
  return null;
}
