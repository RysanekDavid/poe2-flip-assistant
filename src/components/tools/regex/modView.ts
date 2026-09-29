/*
 * View helpers for the mod list: display text, roll ranges and which composed token stands for a
 * mod. Pure (no React) so the list rows stay small.
 */
import type { ComposedToken, PoolComposeResult } from "../../../core/tools/regex/poolCompose";
import { modKey } from "../../../core/tools/regex/poolNamespace";
import type { PoolMod, RegexPool } from "../../../core/tools/regex/pools/schema";
import { sampleLines } from "../../../core/tools/regex/poolSamples";

export const modLabel = (mod: PoolMod): string => mod.lines.map((l) => l.template).join(" / ");

/** "rolls 10–50" across every tier for the first number of each numeric line; "" for fixed text. */
export function rollSummary(mod: PoolMod): string {
  const parts = mod.lines.flatMap((line, i) => {
    if (line.numeric.count === 0) return [];
    const ranges = mod.tiers.flatMap((t) => t.lines.filter((l) => l.line === i).map((l) => l.ranges[0]).filter((r) => r !== undefined));
    if (ranges.length === 0) return [];
    const lo = Math.min(...ranges.map((r) => r.min));
    const hi = Math.max(...ranges.map((r) => r.max));
    return [lo === hi ? `${lo}` : `${lo}–${hi}`];
  });
  return parts.length > 0 ? `rolls ${parts.join(" / ")}` : "";
}

export interface ModTokenInfo {
  tokens: ComposedToken[];
  /** Other pool mods the mod's tokens also light, as display text. */
  alsoMatches: string[];
  notes: string[];
}

/** Composed tokens per mod id, with `alsoMatches` resolved to readable mod text. */
export function tokenInfoByMod(pool: RegexPool, result: PoolComposeResult | null): Map<string, ModTokenInfo> {
  const out = new Map<string, ModTokenInfo>();
  if (!result) return out;
  const byId = new Map(pool.mods.map((m) => [m.id, m]));
  for (const mod of pool.mods) {
    const tokens = result.tokens.filter((t) => t.covers.includes(modKey(mod.id)));
    if (tokens.length === 0) continue;
    const also = [...new Set(tokens.flatMap((t) => t.alsoMatches))].map((id) => {
      const other = byId.get(id);
      return other ? modLabel(other) : id;
    });
    const notes = tokens.flatMap((t) => (t.note ? [t.note] : []));
    out.set(mod.id, { tokens, alsoMatches: also, notes });
  }
  return out;
}

/** Groups in pool order with the mods that pass the text filter; empty groups are dropped. */
export function filterGroups(pool: RegexPool, query: string): Array<{ id: string; label: string; mods: PoolMod[] }> {
  const q = query.trim().toLowerCase();
  const hit = (m: PoolMod): boolean => q === "" || modLabel(m).toLowerCase().includes(q) || m.name.toLowerCase().includes(q);
  return pool.groups
    .map((g) => ({ id: g.id, label: g.label, mods: pool.mods.filter((m) => m.group === g.id && hit(m)) }))
    .filter((g) => g.mods.length > 0);
}

/** One sample tooltip per mod (its highest tier at max rolls) for the explain box's per-term view. */
export function explainSamples(pool: RegexPool): Array<{ key: string; label: string; lines: string[] }> {
  return pool.mods.map((m) => {
    const top = m.tiers[m.tiers.length - 1];
    return { key: m.id, label: modLabel(m), lines: top ? sampleLines(m, top, "max") : [] };
  });
}
