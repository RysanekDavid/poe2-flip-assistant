/*
 * `npm run test:craft-provenance` (runWithTestEnv → temp DB): recipe provenance data, the stamped
 * recipe audit, step legality, patch/RePoE staleness and hit-rate calibration.
 */
import "../config/env";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getDb } from "../db/database";
import { craftAttemptStats } from "../db/craftQueries";
import { PATCH_SOURCE_ID } from "../sources/patchNotes/contracts";
import { MATS, type CraftMaterial } from "../core/craftMaterials";
import { RECIPES, type CraftRecipe, type GuideStep, type LegReport, type RecipeMarginReport } from "../core/craftRecipes";
import { PROVENANCE_KEYS, provenanceFor } from "../core/craftProvenanceData";
import { buildAuditFile, buildRecipeAudit, currentAuditDeps, loadRecipeAudit, type AuditDeps } from "../core/craftProvenance/audit";
import { checkStep } from "../core/craftProvenance/legality";
import { effectiveHitRate } from "../core/craftProvenance/calibration";
import { patchStaleness, recipePatchStaleness, resetPatchStaleCache } from "../core/craftProvenance/patchStale";
import { provenanceViews } from "../core/craftProvenance/view";
import { assembleReport } from "../core/craftMargin";
import type { EntityRow } from "../core/entities/schema";

let fail = 0;
const ok = (name: string, cond: boolean, extra = ""): void => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) fail++;
};

const recipe = (key: string): CraftRecipe => {
  const r = RECIPES.find((x) => x.key === key);
  if (!r) throw new Error(`recipe ${key} missing`);
  return r;
};

// --- D-1: every recipe carries structured provenance, and every cited file/section exists ---
function testProvenanceData(): void {
  const keys = RECIPES.map((r) => r.key);
  const missing = keys.filter((k) => !PROVENANCE_KEYS.includes(k));
  ok("every recipe has a provenance entry", missing.length === 0, missing.join(","));
  const orphans = PROVENANCE_KEYS.filter((k) => !keys.includes(k));
  ok("no provenance entry without a recipe", orphans.length === 0, orphans.join(","));
  let threw = false;
  try {
    provenanceFor("no_such_recipe");
  } catch {
    threw = true;
  }
  ok("provenanceFor throws on an undocumented recipe", threw);

  const refs = RECIPES.flatMap((r) => provenanceFor(r.key).sources.map((s) => s.ref)).filter((x): x is string => x !== null);
  const badRefs = refs.filter((ref) => !existsSync(join(process.cwd(), ref.split(" §")[0] ?? ref)));
  ok("every source ref points at a file in the repo", badRefs.length === 0, badRefs.join(","));
  const kb = readFileSync(join(process.cwd(), "docs/research/poe2-crafting-knowledge.md"), "utf8");
  const badKb = RECIPES.flatMap((r) => provenanceFor(r.key).kbRuleRefs.filter((s) => !kb.includes(`\n## ${s.slice(1)}. `)).map((s) => `${r.key} ${s}`));
  ok("every kbRuleRef is a KB section heading", badKb.length === 0, badKb.join(","));

  // a reviewed recipe must not carry a step the guide itself flags as unverified
  const reviewedUnverified = RECIPES.filter((r) => provenanceFor(r.key).status === "reviewed" && r.guide.phases.some((p) => p.steps.some((s) => s.unverified)));
  ok("no reviewed recipe has an unverified step", reviewedUnverified.length === 0, reviewedUnverified.map((r) => r.key).join(","));
  const estimateWithN = RECIPES.filter((r) => provenanceFor(r.key).hitRateBasis.basis === "unknown" && provenanceFor(r.key).hitRateBasis.n !== null);
  ok("an estimate never claims a creator sample", estimateWithN.length === 0, estimateWithN.map((r) => r.key).join(","));
  ok("the S9 bow is credited to XTheFarmerX (oEmbed), not Fubgun", provenanceFor("bow_amanamu").sources[0]?.creator === "XTheFarmerX");
}

// --- D-2 audit artifact: stamped with the manifest's snapshot, current, and free of violations ---
function testAuditArtifact(): AuditDeps {
  const manifest = JSON.parse(readFileSync(join(process.cwd(), "src/data/poe2/repoe/manifest.json"), "utf8")) as { artifact_sha256: string };
  const committed = loadRecipeAudit();
  ok("recipe-audit.json is stamped with the manifest's RePoE artifact", committed.artifact_sha256 === manifest.artifact_sha256, "run npm run craft:audit-recipes");
  const deps = currentAuditDeps();
  const fresh = buildAuditFile(RECIPES, provenanceFor, deps, committed, new Set());
  ok("recipe-audit.json matches a fresh audit (recipe data or game data changed?)", JSON.stringify(fresh) === JSON.stringify(committed), "run npm run craft:audit-recipes");
  const violations = Object.entries(committed.recipes).flatMap(([k, r]) => r.steps.filter((s) => s.verdict === "violation").map((s) => `${k}#${s.idx}`));
  ok("no curated recipe step breaks a verified rule", violations.length === 0, violations.join(","));
  const stale = Object.entries(committed.recipes).filter(([, r]) => r.repoeChanged.length > 0).map(([k]) => k);
  ok("no shipped recipe is stale against the committed game data", stale.length === 0, stale.join(","));
  return deps;
}

// --- D-3 legality fixtures ---
const step = (mats: CraftMaterial[]): GuideStep => ({ do: "fixture", mats });

function testLegality(deps: AuditDeps): void {
  const run = (mats: CraftMaterial[], ilvl: number | undefined) => checkStep(step(mats), ilvl, deps.byExchangeId, deps.gameDataPatch);
  const perfectAugLow = run([MATS.perfectAug], 65);
  ok("Perfect Augmentation on an ilvl 65 base → floor violation", perfectAugLow.some((c) => c.kind === "floor" && c.verdict === "violation"), JSON.stringify(perfectAugLow));
  ok("Perfect Augmentation on an ilvl 75 base → floor ok", run([MATS.perfectAug], 75).every((c) => c.verdict === "ok"));
  ok("Perfect Exalted with the base ilvl unpinned → unknown", run([MATS.perfectExalted], undefined).some((c) => c.kind === "floor" && c.verdict === "unknown"));
  ok("Gnawed Rib on an ilvl 82 base → ilvl violation", run([MATS.gnawedRib], 82).some((c) => c.kind === "ilvl" && c.verdict === "violation"));

  const dextralAnnul = run([MATS.omenDextralAnnulment, MATS.annul], 75);
  ok("Dextral Annulment + Annulment → pairing ok", dextralAnnul.some((c) => c.kind === "pairing" && c.verdict === "ok") && !dextralAnnul.some((c) => c.verdict !== "ok"), JSON.stringify(dextralAnnul));
  ok("Greater Exaltation rides a Perfect Exalt (any exalt tier)", run([MATS.omenGreaterExaltation, MATS.perfectExalted], 80).every((c) => c.verdict === "ok"));
  const crystal = run([MATS.omenDextralCrystallisation, MATS.perfectEssenceEnhancement], 80);
  ok("Dextral Crystallisation (no rule) → pairing unknown", crystal.some((c) => c.kind === "pairing" && c.verdict === "unknown"));
  ok("Whittling without a Chaos Orb → pairing unknown", run([MATS.omenWhittling, MATS.annul], 80).some((c) => c.kind === "pairing" && c.verdict === "unknown"));
  const ghost = run([{ id: "not-a-real-orb", label: "Orb of Nothing", group: "currency" }], 80);
  ok("a material missing from the game data → catalog violation", ghost.some((c) => c.kind === "catalog" && c.verdict === "violation"));
  ok("a step without materials has no checks", checkStep({ do: "look" }, 80, deps.byExchangeId, deps.gameDataPatch).length === 0);
}

// --- RePoE change: a changed entity text makes the recipe stale until it is re-verified ---
function testRepoeChange(deps: AuditDeps): void {
  const r = recipe("ring_fractured_t1res");
  const prov = provenanceFor(r.key);
  const base = buildRecipeAudit(r, prov, deps, null, false);
  ok("a first audit has no RePoE change", base.repoeChanged.length === 0);
  const whittling = deps.byId("omen-of-whittling");
  if (!whittling) throw new Error("fixture: Omen of Whittling missing from the entity catalog");
  const changedText: EntityRow = { ...whittling, summary: "Removes the HIGHEST level modifier" };
  const changedDeps: AuditDeps = { ...deps, byId: (id) => (id === whittling.id ? changedText : deps.byId(id)) };
  const after = buildRecipeAudit(r, prov, changedDeps, base, false);
  ok("changed Omen of Whittling text → repoeChanged lists it", after.repoeChanged.join() === "omen-of-whittling", after.repoeChanged.join());
  const carried = buildRecipeAudit(r, prov, changedDeps, after, false);
  ok("the change persists across re-runs until re-verified", carried.repoeChanged.join() === "omen-of-whittling");
  ok("--rebaseline accepts the new text", buildRecipeAudit(r, prov, changedDeps, after, true).repoeChanged.length === 0);
  ok("bumping patchVerified re-baselines", buildRecipeAudit(r, { ...prov, patchVerified: "0.5.6" }, changedDeps, after, false).repoeChanged.length === 0);
}

// --- D-2 patch staleness: a newer patch naming a recipe's entity marks it stale ---
function testPatchStalePure(): void {
  const subjects = [
    { key: "whittle", patchVerified: "0.5.5b", names: ["Omen of Whittling", "Perfect Exalted Orb"] },
    { key: "other", patchVerified: "0.5.5b", names: ["Omen of Putrefaction"] },
  ];
  const text = (t: string) => [{ source: "body" as const, text: t }];
  const out = patchStaleness(subjects, [
    { threadId: 1, version: "0.5.5", title: "old", texts: text("Omen of Whittling was changed.") },
    { threadId: 2, version: "0.5.6", title: "new", texts: text("Omen of Whittling now previews its target. Omens of Whittlings drop more.") },
  ]);
  const reasons = out.get("whittle") ?? [];
  ok("a 0.5.6 patch naming Omen of Whittling marks the recipe stale", reasons.length === 1 && reasons[0]?.kind === "patch" && reasons[0].items.join() === "Omen of Whittling", JSON.stringify(reasons));
  ok("a patch older than patchVerified never marks stale", !reasons.some((r) => r.kind === "patch" && r.version === "0.5.5"));
  ok("a recipe the patch does not name stays fresh", !out.has("other"));
}

function seedPatch(threadId: number, version: string, items: string[]): void {
  const db = getDb();
  const snap = db
    .prepare(`INSERT INTO source_snapshot (source_id, snapshot_kind, external_id, source_url, http_status, content_sha256, artifact_path,
      content_bytes, valid, parser_name, parser_version, validation_policy, retrieved_at)
      VALUES (?, 'index', '2212', 'https://x', 200, ?, 'a', 1, 1, 't', 't', 't', 'now')`)
    .run(PATCH_SOURCE_ID, String(threadId).padStart(64, "0")).lastInsertRowid;
  db.prepare(`INSERT INTO official_patch (thread_id, source_id, source_order, title, version_text, published_text, source_url,
    index_snapshot_id, body_valid, headings_json, list_items_json) VALUES (?, ?, ?, ?, ?, 'x', 'https://x', ?, 1, '[]', ?)`)
    .run(threadId, PATCH_SOURCE_ID, threadId, `${version} Patch Notes`, version, snap, JSON.stringify(items));
}

function resetDb(): void {
  const db = getDb();
  db.pragma("foreign_keys = OFF");
  db.exec("DELETE FROM craft_attempts; DELETE FROM patch_summary; DELETE FROM pending_patch_effect; DELETE FROM official_patch; DELETE FROM source_snapshot;");
  db.pragma("foreign_keys = ON");
}

function testPatchStaleDb(): void {
  resetDb();
  resetPatchStaleCache();
  seedPatch(9001, "0.5.5", ["Omen of Whittling was adjusted."]);
  seedPatch(9002, "0.5.6B", ["Omen of Whittling now removes the lowest tier modifier.", "Exalted Orb drop rate increased."]);
  const { views } = provenanceViews(RECIPES, new Map());
  const ring = views.get("ring_fractured_t1res");
  ok("ring_fractured_t1res (uses Whittling) reads stale after the 0.5.6b notes", ring?.status === "stale" && ring.stale.some((s) => s.kind === "patch" && s.version === "0.5.6b"), JSON.stringify(ring?.stale));
  const bow = views.get("bow_amanamu");
  ok("an Exalted Orb mention alone does not stale a recipe", bow?.status === "reviewed" && bow.stale.length === 0, JSON.stringify(bow?.stale));
  seedPatch(9003, "0.5.7", ["Omen of the Liege is removed."]);
  const cached = recipePatchStaleness([{ key: "bow_amanamu", patchVerified: "0.5.5b", names: ["Omen of the Liege"] }]);
  ok("staleness is memoized (15 min) — a new thread shows after the TTL", !cached.has("bow_amanamu"));
  resetPatchStaleCache();
}

// --- D-4 calibration ---
function testCalibration(): void {
  const r = { hitRate: 0.3 };
  const prov = provenanceFor("jewel_liquid_5mod_budget");
  const below = effectiveHitRate(r, prov, { closed: 19, hits: 10 });
  ok("n=19 → curated rate stays in charge", below.effective === 0.3 && below.basis === "creator_claim" && below.measured !== null && below.n === 19);
  const at = effectiveHitRate(r, prov, { closed: 20, hits: 5 });
  ok("n=20 → measured rate takes over", at.effective === 0.25 && at.basis === "measured" && at.model === 0.3);
  ok("no attempts → model, measured null", effectiveHitRate(r, prov, undefined).measured === null);
  let threw = false;
  try {
    effectiveHitRate(r, prov, { closed: 2, hits: 3 });
  } catch {
    threw = true;
  }
  ok("more hits than closed attempts throws", threw);

  resetDb();
  const insert = getDb().prepare("INSERT INTO craft_attempts (user_id, recipe_key, outcome) VALUES (?, ?, ?)");
  for (const [user, outcome] of [[1, "hit"], [2, "hit"], [2, "brick"], [1, "open"]] as const) insert.run(user, "bow_amanamu", outcome);
  const stats = craftAttemptStats().get("bow_amanamu");
  ok("attempt stats pool every user and skip open attempts", stats?.closed === 3 && stats.hits === 2, JSON.stringify(stats));
}

// --- a measured 0% (bricks only) prices EV = −cost instead of crashing the near-miss ---
function testZeroHitRate(): void {
  const shell: RecipeMarginReport = {
    key: "t", status: "ok", base: null, result: null, materials: [], materialsDiv: 1, hitRate: 0, evDiv: 0, marginPct: 0,
    error: null, valuation: "comparable-result", returnFlagged: false, nearMiss: null,
  };
  const leg = (priceDiv: number): LegReport => ({
    priceDiv, samples: 10, total: 30, searchUrl: "u", outliersDropped: 0, unresolvedStats: [], icon: null, floorDiv: null,
    percentile: null, sampled: 20, method: "comparable-median", band: { p25: 8, p50: 10, p75: 12 }, relaxed: false, unrated: 0,
  });
  const out = assembleReport(shell, leg(1), leg(10));
  ok("hit rate 0 → ok report, EV = −cost, no near-miss", out.report.status === "ok" && out.report.evDiv === -2 && out.report.nearMiss === null, JSON.stringify(out.report));
}

testProvenanceData();
const deps = testAuditArtifact();
testLegality(deps);
testRepoeChange(deps);
testPatchStalePure();
testPatchStaleDb();
testCalibration();
testZeroHitRate();

console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);
