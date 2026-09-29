import { z } from "zod";
import { fmtDivOrEx } from "./format";

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

export const CHECKPOINTS = ["2h", "24h"] as const;
export type Checkpoint = (typeof CHECKPOINTS)[number];

export const OutcomeCheckSchema = z.object({
  state: z.enum(OUTCOME_STATES),
  at: z.number().int().nonnegative(), // epoch ms of the check
  askDiv: z.number().positive().nullable(), // current ask when listed; null = gone/error/unrated
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

export interface OutcomeChip {
  label: string;
  tone: "good" | "warn" | "muted";
  hint: string;
}

const methodNote = (c: OutcomeCheck): string =>
  c.method === "search" ? " (re-searched: the original search had expired)" : c.method === "fetch" ? " (re-fetched)" : "";

/**
 * The card chip for one tracked listing, or null when there is nothing to say yet (not checked,
 * or an alert from before tracking existed — those have no row at all).
 */
export function outcomeChip(o: SnipeOutcomeView, exaltPerDivine: number): OutcomeChip | null {
  const { check2h: h2, check24h: h24 } = o;
  if (h2?.state === "gone") return { label: "gone <2h", tone: "good", hint: `${GONE_MEANING}${methodNote(h2)}` };
  if (h24?.state === "gone") return { label: "gone <24h", tone: "good", hint: `${GONE_MEANING}${methodNote(h24)}` };
  if (h24?.state === "listed") {
    const ask = h24.askDiv != null ? ` · ask ${fmtDivOrEx(h24.askDiv, exaltPerDivine)}` : "";
    return { label: `still listed 24h${ask}`, tone: "warn", hint: `nobody took it within a day — the value estimate may be off${methodNote(h24)}` };
  }
  if (h24?.state === "error") return { label: "outcome unknown", tone: "muted", hint: `the 24 h check failed: ${o.lastError ?? "no detail"}` };
  if (h2?.state === "listed") return { label: "listed at 2h", tone: "muted", hint: `still listed 2 h after the alert; 24 h check pending${methodNote(h2)}` };
  if (h2?.state === "error") return { label: "2h check failed", tone: "muted", hint: `${o.lastError ?? "no detail"}; 24 h check pending` };
  return null;
}
