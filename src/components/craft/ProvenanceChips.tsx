"use client";

import type { HitRateView, LegalityCheck, LegalityVerdict, ProvenanceView, StaleReason, StepLegality } from "../../core/craftProvenance/schema";
import { CALIBRATION_K, MIN_CALIBRATION_USERS } from "../../core/craftProvenance/calibration";
import { Tooltip } from "../ui/Tooltip";
import type { RecipeView } from "./craftView";

// Same chip anatomy as ClaimBadge: neutral when settled, amber only when the player should check.
const CHIP = "inline-flex cursor-help items-center rounded border px-1.5 text-xs font-normal";
const SETTLED = `${CHIP} border-line text-neutral-400`;
const UNSETTLED = `${CHIP} border-amber-400/40 text-amber-300`;

export const pct = (x: number): string => `${(x * 100).toFixed(0)}%`;

/**
 * The hit rate the card shows: the one the stored scan priced with (rate, basis and n recorded at
 * scan time), so the chip, the EV line and the near-miss line never disagree. Before a first scan
 * it is the live calibrated view.
 */
export function recipeHitRate(r: Pick<RecipeView, "report" | "provenance">): HitRateView {
  const live = r.provenance.hitRate;
  const rep = r.report;
  return rep ? { ...live, effective: rep.hitRate, basis: rep.hitRateBasis, n: rep.hitRateN } : live;
}

/** "hit 35% · creator claim" / "hit 28% · measured n=23" / "hit 30% · estimate". */
export function hitRateLabel(h: HitRateView): string {
  return h.basis === "measured" ? `hit ${pct(h.effective)} · measured n=${h.n}` : `hit ${pct(h.effective)} · ${basisWord(h)}`;
}

/** Short word for "vs …" comparisons (break-even line, P&L). */
export function basisWord(h: HitRateView): string {
  return h.basis === "measured" ? "measured" : h.basis === "creator_claim" ? "creator claim" : "estimate";
}

function LogLine({ h }: { h: HitRateView }) {
  if (h.measured !== null) {
    return (
      <span className="block text-neutral-400">
        Logged: {pct(h.measured)} over {h.n} attempts from {h.users} players, blended as (hits + {CALIBRATION_K}·{pct(h.model)}) ÷ (n + {CALIBRATION_K}).
      </span>
    );
  }
  if (h.users > 0) {
    return <span className="block text-neutral-400">Logged attempts come from {h.users} player; pooling needs {MIN_CALIBRATION_USERS}.</span>;
  }
  return null;
}

function HitRateTip({ h }: { h: HitRateView }) {
  const claim = h.claimN !== null ? ` (creator's sample: ${h.claimN})` : "";
  return (
    <span className="block space-y-1">
      <span className="block">{h.basis === "measured" ? `Measured: ${h.n} logged attempts now weigh at least as much as the curated ${pct(h.model)}.` : `${h.note}${claim}`}</span>
      <LogLine h={h} />
    </span>
  );
}

export function HitRateChip({ h }: { h: HitRateView }) {
  return (
    <Tooltip tip={<HitRateTip h={h} />}>
      <span className={SETTLED}>{hitRateLabel(h)}</span>
    </Tooltip>
  );
}

export function staleText(reason: StaleReason): string {
  if (reason.kind === "patch") return `${reason.version} patch notes name ${reason.items.join(", ")}`;
  return `game data changed for ${reason.entities.join(", ")}`;
}

const STATUS_MEANING = {
  reviewed: "Checked step by step against the crafting KB and the game data on this patch.",
  draft: "Not fully checked: an unlocated source or a step still marked unverified.",
  stale: "Something the recipe depends on changed after it was checked — re-verify before spending.",
} as const;

/** One chip for status + patch: "verified 0.5.5b", "draft · 0.5.5b", or amber "stale". */
export function StatusChip({ p }: { p: ProvenanceView }) {
  const label = p.status === "reviewed" ? `verified ${p.patchVerified}` : p.status === "draft" ? `draft · ${p.patchVerified}` : "stale";
  const tip = (
    <span className="block space-y-1">
      <span className="block">{STATUS_MEANING[p.status]}</span>
      {p.stale.map((r) => (
        <span key={staleText(r)} className="block text-amber-200">
          {staleText(r)}
        </span>
      ))}
      {p.status === "stale" && <span className="block text-neutral-400">Last verified on {p.patchVerified}.</span>}
    </span>
  );
  return (
    <Tooltip tip={tip}>
      <span className={p.status === "stale" ? UNSETTLED : SETTLED}>{label}</span>
    </Tooltip>
  );
}

const LEGALITY_LABEL: Record<LegalityVerdict, string> = { ok: "rules check out", unknown: "partly unchecked", violation: "breaks a rule" };

function CheckLine({ c }: { c: LegalityCheck }) {
  const mark = c.verdict === "ok" ? "✓" : c.verdict === "violation" ? "✗" : "?";
  return (
    <span className={`block ${c.verdict === "violation" ? "text-amber-200" : c.verdict === "unknown" ? "text-neutral-400" : ""}`}>
      {mark} {c.detail} <span className="text-neutral-500">({c.source})</span>
    </span>
  );
}

/** Per-step legality: floors, ilvl gates, omen pairing and catalog presence, details on hover. */
export function LegalityChip({ step }: { step: StepLegality }) {
  const tip = (
    <span className="block space-y-0.5">
      {step.checks.map((c, i) => (
        <CheckLine key={`${c.kind}-${i}`} c={c} />
      ))}
    </span>
  );
  return (
    <Tooltip tip={tip}>
      <span className={step.verdict === "violation" ? UNSETTLED : SETTLED}>{LEGALITY_LABEL[step.verdict]}</span>
    </Tooltip>
  );
}
