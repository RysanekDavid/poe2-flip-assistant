/*
 * `npm run test:craft-provenance` (runWithTestEnv → temp DB): recipe provenance data, the stamped
 * recipe audit, step legality, patch/RePoE staleness and hit-rate calibration.
 */
import "../config/env";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getDb } from "../db/database";
import { PATCH_SOURCE_ID } from "../sources/patchNotes/contracts";
import { MATS, type CraftMaterial } from "../core/craftMaterials";
import { RECIPES, type CraftRecipe, type GuideStep, type LegReport, type RecipeMarginReport } from "../core/craftRecipes";
import { PROVENANCE_KEYS, provenanceFor } from "../core/craftProvenanceData";
import { buildAuditFile, buildRecipeAudit, currentAuditDeps, loadRecipeAudit, type AuditDeps } from "../core/craftProvenance/audit";
import { checkStep, type StepBase } from "../core/craftProvenance/legality";
import { effectiveHitRate, poolAttempts, type AttemptRow } from "../core/craftProvenance/calibration";
import { calibrationStats } from "../core/craftProvenance/samples";
import { patchStaleness, PATCH_STALE_TTL_MS, recipePatchStaleness, resetPatchStaleCache } from "../core/craftProvenance/patchStale";
import { provenanceViews } from "../core/craftProvenance/view";
import { recipeSourceSchema } from "../core/craftProvenance/schema";
import { assembleReport } from "../core/craftMargin";
import type { EntityRow } from "../core/entities/schema";
import { TARGET_RARITIES, targetRarities } from "./tools/craftMovesTargets";

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

// A step (or note) that SAYS it is unconfirmed must use the `unverified` field, not prose: the
// reviewed gate reads both, so wording cannot slip a doubt past it.
const DOUBT = /\b(unverified|unconfirmed|untested|not (?:yet )?(?:been )?(?:verified|confirmed)|isn't verified|open question|uncertain|unclear)\b/i;

function doubts(r: CraftRecipe): string[] {
  const g = r.guide;
  const steps = g.phases.flatMap((p) => p.steps);
  const flagged = steps.filter((s) => s.unverified).map((s) => `unverified: ${s.unverified}`);
  const guideText = [g.goal, g.shopping, g.marketCheck, g.brick, ...g.phases.map((p) => p.title)];
  const stepText = steps.flatMap((s) => [s.do, s.why, s.check, s.warning, s.onFail]);
  const notes = [...r.materials.map((m) => m.note), r.base.note, r.result.note];
  const prose = [...guideText, ...stepText, ...notes].filter((t): t is string => !!t && DOUBT.test(t));
  return [...flagged, ...prose];
}

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

  const reviewedDoubts = RECIPES.filter((r) => provenanceFor(r.key).status === "reviewed" && doubts(r).length > 0);
  ok("no reviewed recipe has an unverified step or admits one in prose", reviewedDoubts.length === 0, reviewedDoubts.map((r) => `${r.key}: ${doubts(r)[0]}`).join(" | "));
  const estimateWithN = RECIPES.filter((r) => provenanceFor(r.key).hitRateBasis.basis === "unknown" && provenanceFor(r.key).hitRateBasis.n !== null);
  ok("an estimate never claims a creator sample", estimateWithN.length === 0, estimateWithN.map((r) => r.key).join(","));
  ok("the S9 bow is credited to XTheFarmerX (oEmbed), not Fubgun", provenanceFor("bow_amanamu").sources[0]?.creator === "XTheFarmerX");
  // only the 33 recipes that predate durability (craftRecipeData 1-7, listed first) may lack it
  const LEGACY = 33;
  const noDurability = RECIPES.slice(LEGACY).filter((r) => !provenanceFor(r.key).durability).map((r) => r.key);
  ok("every recipe after the 33 legacy ones has why_it_works + breaks_when", noDurability.length === 0, noDurability.join(","));
}

/** Every linked video's creator is the committed oEmbed author_name for that URL. */
function testOembedAttribution(): void {
  const oembed = JSON.parse(readFileSync(join(process.cwd(), "docs/kb/sources/oembed.json"), "utf8")) as {
    videos: Array<{ url: string; author_name: string; upload_date?: string }>;
  };
  const author = new Map(oembed.videos.map((v) => [v.url, v.author_name]));
  const uploaded = new Map(oembed.videos.flatMap((v) => (v.upload_date ? [[v.url, v.upload_date] as const] : [])));
  const videos = RECIPES.flatMap((r) => provenanceFor(r.key).sources.filter((s) => s.kind === "video" && s.url !== null));
  const wrong = videos.filter((s) => author.get(s.url ?? "") !== s.creator).map((s) => `${s.url}: ${s.creator}`);
  ok("every linked video's creator matches docs/kb/sources/oembed.json", videos.length > 0 && wrong.length === 0, wrong.join(" | "));
  // oEmbed carries no date: an exact video date must be the upload date recorded from the watch page
  const badDates = videos.filter((s) => s.date !== null && s.datePrecision !== "listing" && uploaded.get(s.url ?? "") !== s.date);
  ok("video dates are search listings or the recorded watch-page upload date", badDates.length === 0, badDates.map((s) => s.url).join(","));
}

/** A title we never fetched is null, not placeholder text, and only a creator-named video may lack one. */
function testUntitledSources(): void {
  const sources = RECIPES.flatMap((r) => provenanceFor(r.key).sources);
  const placeholders = sources.filter((s) => s.title !== null && /not fetched|title unknown|untitled/i.test(s.title)).map((s) => s.title);
  ok("no source carries a placeholder title", placeholders.length === 0, placeholders.join(" | "));
  ok("untitled videos are in the data (the wave-3 transcripts)", sources.some((s) => s.title === null));
  const base = { kind: "video", title: null, url: null, creator: "Belton", date: null, datePrecision: null, tier: "primary", ref: "docs/kb/x.txt" } as const;
  ok("an untitled video with a creator and ref is valid", recipeSourceSchema.safeParse(base).success);
  ok("an untitled video without a creator is rejected", !recipeSourceSchema.safeParse({ ...base, creator: null }).success);
  ok("an untitled video without a ref is rejected", !recipeSourceSchema.safeParse({ ...base, ref: null, url: "https://www.youtube.com/watch?v=x" }).success);
  ok("an untitled guide is rejected", !recipeSourceSchema.safeParse({ ...base, kind: "guide" }).success);
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
const base = (ilvlMin: number | undefined, rarity: StepBase["rarity"] = "rare", asBought = true): StepBase => ({ ilvlMin, rarity, asBought });
const has = (checks: ReturnType<typeof checkStep>, kind: string, verdict: string): boolean => checks.some((c) => c.kind === kind && c.verdict === verdict);

function testFloorsAndRarity(deps: AuditDeps): void {
  const run = (mats: CraftMaterial[], b: StepBase) => checkStep(step(mats), b, deps.byExchangeId, deps.gameDataPatch);
  ok("Perfect Augmentation on an ilvl 65 base → floor violation (KB §9 refusal)", has(run([MATS.perfectAug], base(65, "magic")), "floor", "violation"));
  ok("Perfect Augmentation on an ilvl 75 magic base → all ok", run([MATS.perfectAug], base(75, "magic")).every((c) => c.verdict === "ok"));
  const exaltLow = run([MATS.perfectExalted], base(45));
  ok("Perfect Exalted below its floor → soft-floor unknown, not a refusal", has(exaltLow, "floor", "unknown") && !has(exaltLow, "floor", "violation"), JSON.stringify(exaltLow));
  // KB §1 (2026-10-01 fact-check): Perfect Regal floor 50, on a MAGIC item
  const regalLow = run([MATS.perfectRegal], base(45, "magic"));
  ok("Perfect Regal below its floor of 50 → soft-floor unknown, not a refusal", has(regalLow, "floor", "unknown") && !has(regalLow, "floor", "violation"), JSON.stringify(regalLow));
  ok("Perfect Regal on an ilvl 82 magic base → all ok", run([MATS.perfectRegal], base(82, "magic")).every((c) => c.verdict === "ok"));
  ok("Ancient bone below mod level 40 → soft-floor unknown", has(run([MATS.ancientRib], base(30)), "floor", "unknown"));
  ok("Perfect Exalted with the base ilvl unpinned → unknown", has(run([MATS.perfectExalted], base(undefined)), "floor", "unknown"));
  ok("Gnawed Rib on an ilvl 82 base → ilvl violation", has(run([MATS.gnawedRib], base(82)), "ilvl", "violation"));

  ok("Perfect Augmentation on a RARE base as bought → rarity violation", has(run([MATS.perfectAug], base(80, "rare")), "rarity", "violation"));
  ok("Perfect Augmentation on a magic base as bought → rarity ok", has(run([MATS.perfectAug], base(80, "magic")), "rarity", "ok"));
  ok("magic-only currency on a later step → rarity unknown (no simulation)", has(run([MATS.perfectAug], base(80, "rare", false)), "rarity", "unknown"));
  ok("unpinned base rarity → rarity unknown", has(run([MATS.greaterAug], { ilvlMin: 80, rarity: undefined, asBought: true }), "rarity", "unknown"));
  testFloorRaritiesVsItemText(deps);
}

/** VERIFIED_FLOORS rarities (legality's rarity check) accept exactly what each orb's item text targets. */
function testFloorRaritiesVsItemText(deps: AuditDeps): void {
  const floored = [MATS.greaterTransmute, MATS.perfectTransmute, MATS.greaterAug, MATS.perfectAug, MATS.greaterExalted, MATS.perfectExalted, MATS.perfectRegal];
  for (const m of floored) {
    const want = targetRarities(deps.byExchangeId(m.id)?.directions ?? null);
    const got = TARGET_RARITIES.filter((r) => has(checkStep(step([m]), base(80, r), deps.byExchangeId, deps.gameDataPatch), "rarity", "ok"));
    ok(`${m.label}: legality rarity matches the item text`, JSON.stringify(got) === JSON.stringify(want), `legality ${got.join("/")} vs item text ${want.join("/")}`);
  }
}

function testPairing(deps: AuditDeps): void {
  const run = (mats: CraftMaterial[]) => checkStep(step(mats), base(80, "rare", false), deps.byExchangeId, deps.gameDataPatch);
  const dextralAnnul = run([MATS.omenDextralAnnulment, MATS.annul]);
  ok("Dextral Annulment + Annulment (only an unverified rule) → pairing unknown", has(dextralAnnul, "pairing", "unknown") && !has(dextralAnnul, "pairing", "ok"), JSON.stringify(dextralAnnul));
  ok("Dextral Erasure + Chaos (verified rule) → pairing ok", has(run([MATS.omenDextralErasure, MATS.chaos]), "pairing", "ok"));
  ok("Greater Exaltation rides a Perfect Exalt (any exalt tier)", has(run([MATS.omenGreaterExaltation, MATS.perfectExalted]), "pairing", "ok"));
  ok("Dextral Crystallisation + a Perfect essence (verified rule) → pairing ok", has(run([MATS.omenDextralCrystallisation, MATS.perfectEssenceEnhancement]), "pairing", "ok"));
  ok("Sinistral Crystallisation + a Corrupted essence (item text) → pairing ok", has(run([MATS.omenSinistralCrystallisation, MATS.essenceOfTheBreach]), "pairing", "ok"));
  const greater = run([MATS.omenDextralCrystallisation, MATS.greaterEssenceEnhancement]);
  ok("Crystallisation + a Greater essence (not Perfect or Corrupted) → pairing unknown", has(greater, "pairing", "unknown") && !has(greater, "pairing", "ok"), JSON.stringify(greater));
  ok("Crystallisation + an alloy (creator-only) → pairing unknown", !has(run([MATS.omenSinistralCrystallisation, MATS.transcendentAlloy]), "pairing", "ok"));
  // the omen is consumed by the first essence or alloy it meets, so only that one may pair
  ok("Crystallisation + Corrupted essence, then an alloy → pairing ok", has(run([MATS.omenDextralCrystallisation, MATS.essenceOfHorror, MATS.mysticAlloy]), "pairing", "ok"));
  ok("Crystallisation + an alloy before the Perfect essence → not ok", !has(run([MATS.omenSinistralCrystallisation, MATS.transcendentAlloy, MATS.perfectEssenceMind]), "pairing", "ok"));
  ok("Crystallisation + a Greater essence before the Perfect one → not ok", !has(run([MATS.omenDextralCrystallisation, MATS.greaterEssenceEnhancement, MATS.perfectEssenceEnhancement]), "pairing", "ok"));
  const alloys = Object.values(MATS).filter((m) => /\bAlloy\b/.test(m.label));
  ok("every alloy material id ends in -alloy (legality spots alloys by id)", alloys.length > 0 && alloys.every((m) => m.id.endsWith("-alloy")), alloys.map((m) => m.id).join(","));
  ok("Whittling without a Chaos Orb → pairing unknown", has(run([MATS.omenWhittling, MATS.annul]), "pairing", "unknown"));
  ok("a material missing from the game data → catalog violation", has(run([{ id: "not-a-real-orb", label: "Orb of Nothing", group: "currency" }]), "catalog", "violation"));
  ok("a step without materials has no checks", checkStep({ do: "look" }, base(80), deps.byExchangeId, deps.gameDataPatch).length === 0);
}

// --- RePoE change: a changed entity text makes the recipe stale until it is re-verified ---
function testRepoeChange(deps: AuditDeps): void {
  const r = recipe("ring_fractured_t1res");
  const prov = provenanceFor(r.key);
  const first = buildRecipeAudit(r, prov, deps, null, false);
  ok("a first audit has no RePoE change", first.repoeChanged.length === 0);
  const whittling = deps.byId("omen-of-whittling");
  if (!whittling) throw new Error("fixture: Omen of Whittling missing from the entity catalog");
  const changedText: EntityRow = { ...whittling, summary: "Removes the HIGHEST level modifier" };
  const changedDeps: AuditDeps = { ...deps, byId: (id) => (id === whittling.id ? changedText : deps.byId(id)) };
  const after = buildRecipeAudit(r, prov, changedDeps, first, false);
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

  const liege = [{ key: "bow_amanamu", patchVerified: "0.5.5b", names: ["Omen of the Liege"] }];
  const now = Date.now();
  ok("a new subject set is computed, not served from another set's cache", !recipePatchStaleness(liege, now).has("bow_amanamu"));
  seedPatch(9003, "0.5.7", ["Omen of the Liege is removed."]);
  ok("the same subject set is memoized inside the TTL", !recipePatchStaleness(liege, now + 1000).has("bow_amanamu"));
  ok("after the TTL the new thread shows", recipePatchStaleness(liege, now + PATCH_STALE_TTL_MS).has("bow_amanamu"));
  const bumped = [{ key: "bow_amanamu", patchVerified: "0.5.7", names: ["Omen of the Liege"] }];
  ok("a bumped patchVerified recomputes at once", !recipePatchStaleness(bumped, now + PATCH_STALE_TTL_MS + 1).has("bow_amanamu"));
  resetPatchStaleCache();
}

// --- D-4 calibration: shrinkage, pooling guards ---
const row = (userId: number, outcome: "hit" | "brick", costDiv = 1, createdAt = "2026-09-20 10:00:00"): AttemptRow => ({ userId, outcome, costDiv, createdAt });

function testShrinkage(): void {
  const r = { hitRate: 0.3 };
  const prov = provenanceFor("jewel_liquid_5mod_budget");
  ok("no attempts → model, measured null", effectiveHitRate(r, prov, undefined).effective === 0.3 && effectiveHitRate(r, prov, undefined).measured === null);
  const at = effectiveHitRate(r, prov, { closed: 20, hits: 5, users: 3 });
  ok("n=20, 25% measured → (5 + 20·0.3)/40 = 27.5%, basis measured", Math.abs(at.effective - 0.275) < 1e-9 && at.basis === "measured", String(at.effective));
  ok("n=19 keeps the curated basis", effectiveHitRate(r, prov, { closed: 19, hits: 5, users: 3 }).basis === "creator_claim");
  const byHits = [0, 5, 10, 15, 20].map((h) => effectiveHitRate(r, prov, { closed: 20, hits: h, users: 2 }).effective);
  ok("shrinkage is monotone in hits", byHits.every((v, i) => i === 0 || v > (byHits[i - 1] ?? Infinity)), byHits.join(","));
  const gaps = [10, 40, 160, 640].map((n) => Math.abs(effectiveHitRate(r, prov, { closed: n, hits: n * 0.6, users: 2 }).effective - 0.6));
  ok("more attempts move the rate monotonically toward the measured one", gaps.every((g, i) => i === 0 || g < (gaps[i - 1] ?? -1)), gaps.join(","));
  let threw = false;
  try {
    effectiveHitRate(r, prov, { closed: 2, hits: 3, users: 2 });
  } catch {
    threw = true;
  }
  ok("more hits than closed attempts throws", threw);
}

function testPoolingGuards(): void {
  const r = { hitRate: 0.3 };
  const prov = provenanceFor("bow_amanamu");
  const solo = poolAttempts(Array.from({ length: 20 }, () => row(7, "hit")), null);
  ok("one user's 20 fake hits pool nothing (needs 2+ users)", solo.closed === 0 && effectiveHitRate(r, prov, solo).effective === 0.3, JSON.stringify(solo));
  const flood = poolAttempts([...Array.from({ length: 20 }, () => row(7, "hit")), row(8, "brick"), row(8, "brick")], null);
  ok("a flooding user is capped at half the pooled sample", flood.closed === 4 && flood.hits === 2, JSON.stringify(flood));
  const capped = effectiveHitRate(r, prov, flood).effective;
  ok("20 fake hits move the shared rate no further than the cap allows", Math.abs(capped - (2 + 20 * 0.3) / 24) < 1e-9, String(capped));
  ok("zero-cost attempts do not count", poolAttempts([row(1, "hit", 0), row(2, "hit", 0)], null).users === 0);
  const cutoff = Date.parse("2026-09-11T03:39:22Z");
  ok("attempts before the verified patch are dropped", poolAttempts([row(1, "hit", 1, "2026-09-01 00:00:00"), row(2, "hit"), row(3, "brick")], cutoff).closed === 2);
}

function testCalibrationDb(): void {
  resetDb();
  const insert = getDb().prepare("INSERT INTO craft_attempts (user_id, recipe_key, outcome, base_cost_div, mats_cost_div, created_at) VALUES (?, ?, ?, ?, ?, ?)");
  const rows: Array<[number, string, number, string]> = [
    [1, "hit", 1, "2026-09-20 10:00:00"],
    [2, "hit", 1, "2026-09-20 10:00:00"],
    [2, "brick", 1, "2026-09-20 10:00:00"],
    [5, "brick", 1, "2026-09-20 10:00:00"],
    [1, "open", 1, "2026-09-20 10:00:00"],
    [3, "hit", 0, "2026-09-20 10:00:00"], // zero cost
    [4, "hit", 1, "2026-08-01 10:00:00"], // before 0.5.5b went live (patch-coverage.json)
  ];
  for (const [user, outcome, cost, at] of rows) insert.run(user, "bow_amanamu", outcome, cost, 0, at);
  const stats = calibrationStats(RECIPES).get("bow_amanamu");
  ok("DB pooling: 3 users, open/zero-cost/pre-patch attempts skipped", stats?.closed === 4 && stats.hits === 2 && stats.users === 3, JSON.stringify(stats));
}

// --- a measured 0% (bricks only) prices EV = −cost instead of crashing the near-miss ---
function testZeroHitRate(): void {
  const shell: RecipeMarginReport = {
    key: "t", status: "ok", base: null, result: null, materials: [], materialsDiv: 1, hitRate: 0, evDiv: 0, marginPct: 0,
    error: null, valuation: "comparable-result", returnFlagged: false, nearMiss: null, hitRateBasis: "measured", hitRateN: 40,
  };
  const leg = (priceDiv: number): LegReport => ({
    priceDiv, samples: 10, total: 30, searchUrl: "u", outliersDropped: 0, unresolvedStats: [], icon: null, floorDiv: null,
    percentile: null, sampled: 20, method: "comparable-median", band: { p25: 8, p50: 10, p75: 12 }, relaxed: false, unrated: 0,
  });
  const out = assembleReport(shell, leg(1), leg(10));
  ok("hit rate 0 → ok report, EV = −cost, no near-miss", out.report.status === "ok" && out.report.evDiv === -2 && out.report.nearMiss === null, JSON.stringify(out.report));
  ok("the report keeps the basis it was priced with", out.report.hitRateBasis === "measured" && out.report.hitRateN === 40);
}

testProvenanceData();
testOembedAttribution();
testUntitledSources();
const deps = testAuditArtifact();
testFloorsAndRarity(deps);
testPairing(deps);
testRepoeChange(deps);
testPatchStalePure();
testPatchStaleDb();
testShrinkage();
testPoolingGuards();
testCalibrationDb();
testZeroHitRate();

console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);
