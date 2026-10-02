/**
 * Where a planner fact comes from, as the player reads it. Step text and feasibility reasons stay
 * plain prose; their sources travel separately as these labels (the UI lists them behind ⓘ). The
 * ids map to the crafting KB sections (docs/research/poe2-crafting-knowledge.md §1–§8) and to the
 * evidence behind the curated rules — file names and section signs never reach the player.
 */

const LABEL = {
  "kb-currency": "Crafting rules — currency and tier floors",
  "kb-fracture": "Crafting rules — Fracturing Orb",
  "kb-ilvl": "Crafting rules — item-level tier gates",
  "kb-omens": "Crafting rules — omens",
  "kb-desecration": "Crafting rules — desecration",
  "kb-liquids": "Crafting rules — Liquid Emotions on jewels",
  "kb-essences": "Crafting rules — essences and the crafted slot",
  "kb-catalysts": "Crafting rules — catalysts and quality",
  "owner-test-2026-10-01": "Owner in-game test 2026-10-01",
  "owner-test-2026-10-02": "Owner in-game test 2026-10-02",
  creators: "Creator crafting videos",
  forum: "Official forum report",
  "game-data": "Game data (RePoE)",
  "poe2db": "poe2db item text",
  "group-rule": "Community guide — one mod per mod group",
  "planner-prior": "Planner assumption — no public mod weights",
} as const;

export type SourceId = keyof typeof LABEL;

/** A source as shown to the player: a label, and a link when there is one. */
export interface SourceRef {
  label: string;
  url: string | null;
}

export const sources = (...ids: SourceId[]): SourceRef[] => ids.map((id) => ({ label: LABEL[id], url: null }));

export const linkSource = (label: string, url: string): SourceRef => ({ label, url });

/** One line for a feasibility reason's evidence: the labels, then any links. */
export function sourceLine(refs: readonly SourceRef[]): string {
  return refs.map((r) => (r.url ? `${r.label} (${r.url})` : r.label)).join("; ");
}

export const sourceLabel = (id: SourceId): string => LABEL[id];
