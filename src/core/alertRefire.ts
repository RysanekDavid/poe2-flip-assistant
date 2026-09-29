/**
 * When may a level-condition alert (SPREAD, CRAFT_MARGIN, TREND, SPIKE) fire again for the same
 * user + item + type? Pure, so the policy is testable without a database.
 *
 * The old rule was "once per cooldown": a spread that stayed open, or a recipe that stayed
 * profitable, re-alerted every hour for as long as it held — the feed filled with the same row.
 * Now, past the cooldown, a repeat needs news: the value rose materially over the last alerted
 * value, the trend call changed direction, or a long quiet period passed (a day-old alert has
 * scrolled away and the condition still holding is worth one reminder).
 */

export interface LastAlert {
  ageMin: number; // minutes since the previous alert for this user + item + type
  value: number | null;
  message: string;
}

export interface RefirePolicy {
  cooldownMin: number; // hard floor between two alerts, whatever changed
  risePct: number; // relative rise over the last alerted value that counts as news
  quietHours: number; // after this long, the condition still holding re-alerts once
}

/** `signal`: the TREND call ("BUY" / "SELL"); its message starts with `${signal}:`. */
export interface NextAlert {
  value: number;
  signal?: string;
}

export type RefireDecision = "fire" | "cooldown" | "unchanged";

/** Magnitude, so a negative-valued signal is judged by how far it moved, not its sign. */
function roseMaterially(last: number, next: number, risePct: number): boolean {
  return Math.abs(next) >= Math.abs(last) * (1 + risePct / 100) && Math.abs(next) > Math.abs(last);
}

export function refireDecision(last: LastAlert | null, next: NextAlert, policy: RefirePolicy): RefireDecision {
  if (last == null) return "fire";
  if (last.ageMin < policy.cooldownMin) return "cooldown";
  if (last.ageMin >= policy.quietHours * 60) return "fire";
  if (next.signal != null && !last.message.startsWith(`${next.signal}:`)) return "fire";
  if (last.value == null) return "fire"; // nothing to compare against: behave like the old cooldown
  return roseMaterially(last.value, next.value, policy.risePct) ? "fire" : "unchanged";
}
