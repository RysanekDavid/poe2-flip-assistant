/*
 * Checks that span files or need the committed catalogs, run by the craft-mining loader after
 * each file has parsed on its own: bases and target families against the craft catalog, entity
 * ids against the entity catalog, extractions against the candidate list, and every prior back
 * to the extraction line it came from. Each throws with the file and the reason.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { entityById } from "../../entities/load";
import { comboFor, loadCraftCatalog, type CatalogCombo } from "../../tools/craftmoves/catalog";
import type { Archetype, CandidatesFile } from "./scaffoldSchema";
import type { CraftVideoExtraction, PriorsFile, RouteTemplate } from "./schema";
import { isVideoPointer, type TargetRole } from "./schemaParts";

function fail(where: string, message: string): never {
  throw new Error(`craft mining ${where}: ${message}`);
}

/** Bases exist for the class, and every natural/desecrated member can roll on each of them. */
export function checkBasesAndRoles(where: string, itemClass: string, bases: readonly string[], roles: readonly TargetRole[]): void {
  const cat = loadCraftCatalog();
  const families = new Set(Object.values(cat.mods).map((m) => m.family));
  const combos: CatalogCombo[] = bases.map((base) => comboFor(cat, itemClass, base) ?? fail(where, `base "${base}" is not a ${itemClass} base in the craft catalog`));
  for (const role of roles) {
    for (const member of role.anyOf) {
      if (!families.has(member.family)) fail(where, `role "${role.id}": family "${member.family}" is not in the craft catalog`);
      if (member.source === "essence" || member.source === null) continue;
      const pool = member.source === "desecrated" ? "desecrated" : role.side;
      combos.forEach((combo, i) => {
        if (!combo[pool][member.family]) fail(where, `role "${role.id}": ${member.family} does not roll as a ${member.source} ${role.side} on ${bases[i]}`);
      });
    }
  }
}

function checkEntity(where: string, id: string, kind?: string): void {
  const row = entityById(id);
  if (!row) fail(where, `"${id}" is not in the entity catalog`);
  if (kind && row.kind !== kind) fail(where, `"${id}" is a ${row.kind}, not an ${kind}`);
}

export function checkRepoPath(where: string, ref: string): void {
  if (!existsSync(join(process.cwd(), ref))) fail(where, `"${ref}" does not exist in the repo`);
}

/** Creator cap and creator floor over the kept set, and every committed transcript present. */
export function checkCandidates(where: string, a: Archetype, c: CandidatesFile): void {
  if (c.archetype !== a.id) fail(where, `archetype "${c.archetype}", expected "${a.id}"`);
  const perCreator = new Map<string, number>();
  for (const cand of c.candidates) {
    if (cand.transcriptRef !== null) checkRepoPath(where, cand.transcriptRef);
    if (cand.decision === "kept" && cand.creator !== null) perCreator.set(cand.creator, (perCreator.get(cand.creator) ?? 0) + 1);
  }
  for (const [creator, n] of perCreator) if (n > a.creatorCap) fail(where, `${n} kept videos from ${creator}; the cap is ${a.creatorCap}`);
  if (perCreator.size < a.minCreators) fail(where, `${perCreator.size} distinct kept creators; the archetype needs ${a.minCreators}`);
}

/** An extraction belongs to a kept (or reference) candidate of its archetype and names real entities. */
export function checkExtraction(where: string, fileId: string, a: Archetype, c: CandidatesFile, x: CraftVideoExtraction): void {
  if (x.videoId !== fileId) fail(where, `videoId "${x.videoId}" must equal the filename "${fileId}"`);
  const cand = c.candidates.find((k) => k.videoId === x.videoId);
  if (!cand) fail(where, `${x.videoId} is not in candidates.json`);
  if (cand.decision !== "kept" && !cand.useAsReference) fail(where, `${x.videoId} was dropped (${cand.reason})`);
  if (cand.transcriptRef !== x.transcriptRef) fail(where, `transcriptRef differs from candidates.json (${cand.transcriptRef})`);
  if (!x.archetypes.includes(a.id)) fail(where, `archetypes must include "${a.id}"`);
  checkRepoPath(where, x.transcriptRef);
  for (const step of x.steps) {
    step.materials.forEach((id) => checkEntity(`${where} step ${step.order}`, id));
    step.omens.forEach((id) => checkEntity(`${where} step ${step.order}`, id, "omen"));
  }
  if (x.qualityPath?.catalyst) checkEntity(`${where} qualityPath`, x.qualityPath.catalyst);
  for (const claim of x.claims) if (claim.material) checkEntity(`${where} claims`, claim.material);
}

export function checkRoute(where: string, archetypeIds: ReadonlySet<string>, t: RouteTemplate): void {
  if (!archetypeIds.has(t.archetype)) fail(where, `template "${t.id}": no archetype "${t.archetype}" under docs/research/craft-mining`);
  checkBasesAndRoles(`${where} template "${t.id}"`, t.itemClass, t.bases, t.targetRoles);
  if (t.preconditions.quality) checkEntity(`${where} template "${t.id}"`, t.preconditions.quality.catalyst);
  for (const s of t.sources) if (s.ref !== null) checkRepoPath(`${where} template "${t.id}"`, s.ref);
}

/** What a prior's file name says about its scope: global.json → "global", rings.json → "Rings". */
export function checkPriorsScope(where: string, fileId: string, f: PriorsFile): void {
  const expected = f.scope === "global" ? "global" : f.scope.toLowerCase();
  if (fileId !== expected) fail(where, `scope "${f.scope}" belongs in ${expected}.json`);
}

/**
 * Every video-sourced prior traces to the extracted line at that timestamp. A creator_measured
 * prior needs the creator's own count there; a weight read off a tool is never a prior.
 */
export function checkPriorTrace(where: string, f: PriorsFile, extractions: ReadonlyMap<string, CraftVideoExtraction>): void {
  for (const entry of f.entries) {
    for (const src of entry.sources.filter(isVideoPointer)) {
      const at = `${where} "${entry.key}" ← ${src.videoId} ${src.at}`;
      const x = extractions.get(src.videoId) ?? fail(at, "no extraction for this video");
      const measured = x.measured.filter((m) => m.at === src.at);
      if (measured.some((m) => m.howMeasured === "table_reading")) fail(at, "is a table_reading; a number read off a weight tool never becomes a prior");
      if (entry.basis === "creator_measured" && !measured.some((m) => m.howMeasured === "own_attempts")) {
        fail(at, "creator_measured needs a measured entry with howMeasured own_attempts at this timestamp");
      }
      if (entry.basis === "creator_stated" && measured.length === 0 && !x.claims.some((c) => c.at === src.at)) {
        fail(at, "nothing in the extraction is stated at this timestamp");
      }
    }
  }
}
