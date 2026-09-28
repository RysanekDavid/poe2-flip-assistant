/*
 * Target selection, greedy fragment cover and char-limited chunking for the price regex.
 * Pure: namespace in, search strings out. The route adds data provenance around the result.
 */
import type { NameKind, RegexMode, UncoveredReason, WarningCode } from "../../../lib/tools/regexContract";
import { shortestUniqueFragment } from "./fragment";
import type { NameEntry, Namespace } from "./namespace";

export interface RegexBuildParams {
  mode: RegexMode;
  minDiv: number;
  categories: readonly string[];
  includeUniques: boolean;
  maxChars: number;
}

export interface RegexChunk {
  text: string;
  chars: number;
  covers: string[];
}

export interface FragmentPick {
  fragment: string;
  literal: string;
  target: NameEntry;
  collisions: string[];
  covers: NameEntry[];
}

export interface CoveredRow {
  name: string;
  kind: NameKind;
  category: string | null;
  valueDiv: number;
  /** Exchange prices are per unit — a stack can be worth many times this. */
  perUnit: boolean;
  fragment: string;
  icon: string | null;
  collisions: string[];
  /** Fragment is the escaped/colliding full-name fallback: check it highlights the right things. */
  verify: boolean;
}

export interface UncoveredRow {
  name: string;
  valueDiv: number;
  icon: string | null;
  reason: UncoveredReason;
  detail: string;
}

export interface RegexWarning {
  code: WarningCode;
  label: string;
  detail: string;
}

export interface BuildResult {
  mode: RegexMode;
  chunks: RegexChunk[];
  covered: CoveredRow[];
  uncovered: UncoveredRow[];
  warnings: RegexWarning[];
  targetCount: number;
  /** Why the output is empty; null whenever at least one item was selected. */
  reason: string | null;
}

const byValueDesc = (a: NameEntry, b: NameEntry): number =>
  (b.valueDiv ?? 0) - (a.valueDiv ?? 0) || a.name.localeCompare(b.name);

/** Priced items at or above `minDiv`: exchange items in the chosen categories, plus uniques. */
export function selectTargets(
  ns: Namespace,
  params: Pick<RegexBuildParams, "minDiv" | "categories" | "includeUniques">,
): NameEntry[] {
  const categories = new Set(params.categories);
  return ns.entries
    .filter((e) => {
      if (e.valueDiv === null || e.valueDiv < params.minDiv) return false;
      if (e.kind === "exchange") return e.category !== undefined && categories.has(e.category);
      return e.kind === "unique" && params.includeUniques;
    })
    .sort(byValueDesc);
}

function dropRedundant(picks: FragmentPick[]): FragmentPick[] {
  const kept = [...picks];
  // Lowest-value picks first: a late fragment can cover an early target, orphaning its pick.
  for (let i = kept.length - 1; i >= 0; i--) {
    const pick = kept[i];
    if (!pick) continue;
    const others = kept.filter((_, j) => j !== i);
    if (pick.covers.every((t) => others.some((o) => o.covers.includes(t)))) kept.splice(i, 1);
  }
  return kept;
}

/**
 * Greedy by value: each uncovered target gets its shortest fragment that is safe against the
 * whole selection; targets an earlier fragment already matches get none of their own.
 */
export function coverWithFragments(targets: readonly NameEntry[], ns: Namespace): FragmentPick[] {
  const allowed = new Set(targets.map((t) => t.key));
  const picks: FragmentPick[] = [];
  for (const target of targets) {
    if (picks.some((p) => target.haystack.includes(p.literal))) continue;
    const r = shortestUniqueFragment(target, ns, allowed);
    picks.push({ ...r, target, covers: [] });
  }
  for (const p of picks) p.covers = targets.filter((t) => t.haystack.includes(p.literal));
  return dropRedundant(picks);
}

/** Search text for one chunk. Any space forces quoting of the whole alternation. */
export function renderChunk(fragments: readonly string[], mode: RegexMode): string {
  const body = fragments.join("|");
  if (mode === "trash") return `"!${body}"`;
  return fragments.some((f) => f.includes(" ")) ? `"${body}"` : body;
}

/**
 * First-fit into strings of at most `maxChars`, in value order so the most valuable items land
 * in the first string. A fragment is never split; one that cannot fit even alone is returned in
 * `tooLong` for the uncovered table.
 */
export function composeChunks(
  picks: readonly FragmentPick[],
  maxChars: number,
  mode: RegexMode,
): { chunks: RegexChunk[]; tooLong: FragmentPick[] } {
  const bins: FragmentPick[][] = [];
  const tooLong: FragmentPick[] = [];
  for (const pick of picks) {
    if (renderChunk([pick.fragment], mode).length > maxChars) {
      tooLong.push(pick);
      continue;
    }
    const bin = bins.find((b) => renderChunk([...b, pick].map((p) => p.fragment), mode).length <= maxChars);
    if (bin) bin.push(pick);
    else bins.push([pick]);
  }
  const chunks = bins.map((bin) => {
    const text = renderChunk(
      bin.map((p) => p.fragment),
      mode,
    );
    const covers = [...new Set(bin.flatMap((p) => p.covers.map((t) => t.name)))];
    return { text, chars: text.length, covers };
  });
  return { chunks, tooLong };
}

function coveredRows(picks: readonly FragmentPick[], targets: readonly NameEntry[]): CoveredRow[] {
  return targets.flatMap((t) => {
    const pick = picks.find((p) => p.covers.includes(t));
    if (!pick) return [];
    return [
      {
        name: t.name,
        kind: t.kind,
        category: t.category ?? null,
        valueDiv: t.valueDiv ?? 0,
        perUnit: t.kind === "exchange",
        fragment: pick.fragment,
        icon: t.icon ?? null,
        collisions: pick.collisions,
        verify: pick.collisions.length > 0 || pick.fragment !== pick.literal,
      },
    ];
  });
}

interface WarningInputs {
  mode: RegexMode;
  chunkCount: number;
  verifyCount: number;
  uncoveredCount: number;
}

function buildWarnings({ mode, chunkCount, verifyCount, uncoveredCount }: WarningInputs): RegexWarning[] {
  const out: RegexWarning[] = [];
  // In trash mode an item missing from every string is NOT excluded, so it lights up as trash.
  if (mode === "trash" && uncoveredCount > 0) {
    out.push({
      code: "trash-uncovered-lit",
      label: `${uncoveredCount} valuable lit as trash`,
      detail: `${uncoveredCount} valuable items can't be protected and will be highlighted as trash — check the "not in any string" list before selling.`,
    });
  }
  if (mode === "trash") {
    out.push({
      code: "trash-negation-unconfirmed",
      label: "! unconfirmed",
      detail: "Whether a leading ! negates the whole a|b|c alternation is not yet confirmed in-game — test before selling.",
    });
  }
  if (mode === "trash" && chunkCount > 1) {
    out.push({
      code: "trash-multi-chunk",
      label: `${chunkCount} trash strings`,
      detail: "Each trash string only protects its own items: an item kept by one string is highlighted by the others. Raise max chars or the threshold to fit one string.",
    });
  }
  if (verifyCount > 0) {
    out.push({
      code: "verify-in-game",
      label: `${verifyCount} to verify`,
      detail: "These items have no fragment that avoids every other item and mod text — the full name is used and may over-highlight.",
    });
  }
  return out;
}

function uncoveredRow(t: NameEntry, maxChars: number): UncoveredRow {
  const common = { name: t.name, valueDiv: t.valueDiv ?? 0, icon: t.icon ?? null };
  if (t.qualifier !== undefined) {
    return {
      ...common,
      reason: "qualifier-not-item-text",
      detail: `"${t.qualifier}" is poe.ninja's label, not text on the item — the stash search cannot tell it apart from other variants`,
    };
  }
  return { ...common, reason: "fragment-too-long", detail: `its shortest safe fragment does not fit in ${maxChars} chars` };
}

function emptyReason(params: RegexBuildParams): string {
  if (params.categories.length === 0 && !params.includeUniques) return "no categories selected and uniques excluded";
  return `no priced item in the selection is worth at least ${params.minDiv} Div`;
}

export function buildRegex(ns: Namespace, params: RegexBuildParams): BuildResult {
  const targets = selectTargets(ns, params);
  if (targets.length === 0) {
    const empty = { chunks: [], covered: [], uncovered: [], warnings: [], targetCount: 0 };
    return { mode: params.mode, ...empty, reason: emptyReason(params) };
  }
  const searchable = targets.filter((t) => t.qualifier === undefined);
  const picks = coverWithFragments(searchable, ns);
  const { chunks, tooLong } = composeChunks(picks, params.maxChars, params.mode);
  const covered = coveredRows(
    picks.filter((p) => !tooLong.includes(p)),
    searchable,
  );
  const coveredNames = new Set(covered.map((c) => c.name));
  const uncovered = targets
    .filter((t) => !coveredNames.has(t.name))
    .map((t) => uncoveredRow(t, params.maxChars));
  const verifyCount = covered.filter((c) => c.verify).length;
  return {
    mode: params.mode,
    chunks,
    covered,
    uncovered,
    warnings: buildWarnings({
      mode: params.mode,
      chunkCount: chunks.length,
      verifyCount,
      uncoveredCount: uncovered.length,
    }),
    targetCount: targets.length,
    reason: null,
  };
}
