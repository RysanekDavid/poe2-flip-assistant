/* "Next best move" cards (rank.ts), the outcome text a card values, and share-link round-trips.
 * Imported by testCraftMoves.ts. */
import assert from "node:assert/strict";
import { SAMPLE_ITEM } from "../../components/craft/moves/craftMovesClient";
import type { CraftCatalog } from "../../core/tools/craftmoves/catalog";
import { classifyText, type ItemState } from "../../core/tools/craftmoves/classify";
import { ninjaIdsOf, priceMoves, type SnapshotPrice } from "../../core/tools/craftmoves/cost";
import { tierGates } from "../../core/tools/craftmoves/gates";
import { assembleMoves } from "../../core/tools/craftmoves/moves";
import { outcomeText, rolledLines } from "../../core/tools/craftmoves/outcome";
import { rankMoves, tierOf } from "../../core/tools/craftmoves/rank";
import { evaluateRules, legalMoves } from "../../core/tools/craftmoves/rules";
import { craftMovesResponseSchema } from "../../lib/tools/craftMovesContract";
import { decodeItem, encodeItem, SHARE_MAX_BYTES, shareQuery } from "../../lib/tools/shareItem";
import { itemText, RING, ringLines, renderFamily } from "./craftMovesFixtures";

function classify(cat: CraftCatalog, text: string): ItemState {
  const r = classifyText(text, cat);
  assert.ok(r, "fixture must parse as an item");
  return r.state;
}

/** Every material priced at 1 div, with per-id overrides — cheapest-first must be driven by these. */
function prices(state: ItemState, overrides: Record<string, number> = {}): Map<string, SnapshotPrice> {
  const ids = ninjaIdsOf(legalMoves(state));
  return new Map(ids.map((id) => [id, { priceDiv: overrides[id] ?? 1, icon: null, ageMin: 1 }]));
}

function ranked(cat: CraftCatalog, state: ItemState, overrides?: Record<string, number>) {
  const moves = priceMoves(legalMoves(state), prices(state, overrides), { exaltPerDivine: 100 });
  return rankMoves(moves, state, tierGates(state, cat));
}

function testOpenPrefixRing(cat: CraftCatalog): void {
  const s = classify(cat, itemText({ ...RING, rarity: "Rare", ilvl: 82, lines: ringLines(cat, ["IncreasedLife", "IncreasedMana"], ["FireResistance", "ColdResistance", "Strength"]) }));
  assert.deepEqual([s.openPrefixes, s.openSuffixes], [1, 0]);
  const cards = ranked(cat, s);
  assert.equal(cards[0]?.move.id, "omen-sinistral-exaltation", `open prefix → Sinistral Exaltation first: ${cards.map((c) => c.move.id).join(",")}`);
  assert.equal(cards[0]?.tier, 1);
  assert.equal(cards[0]?.targetFamily?.side, "prefix", "aims at a prefix family");
  assert.equal(cards[0]?.targetFamily?.present, false, "never aims at a family already on the item");
  assert.match(cards[0]?.why ?? "", /open prefix slot — aim: /);
  assert.ok(cards.length === 3 && cards.slice(1).every((c) => c.tier >= 1), "three cards");
  assert.deepEqual(ranked(cat, s).map((c) => c.move.id), cards.map((c) => c.move.id), "deterministic");
}

function testFullRare(cat: CraftCatalog): void {
  const s = classify(cat, itemText({ ...RING, rarity: "Rare", ilvl: 82, lines: ringLines(cat, ["IncreasedLife", "IncreasedMana", "FireDamage"], ["FireResistance", "ColdResistance", "Strength"]) }));
  const legal = legalMoves(s).map((m) => m.id);
  assert.ok(legal.includes("omen-whittling"), "Whittling is legal on a full rare");
  // make Whittling the cheapest thing on the list: it still must not reach the cards
  const cards = ranked(cat, s, { "omen-of-whittling": 0.0001, chaos: 0.0002 });
  const ids = cards.map((c) => c.move.id);
  assert.ok(!ids.some((id) => /whittling|putrefaction|fracture/.test(id)), `wallet-killers never top-3: ${ids.join(",")}`);
  assert.ok(cards.every((c) => c.move.verified && c.move.warnings.length === 0), "only verified, warning-free moves");
  assert.ok(cards.every((c) => c.tier === 3 && c.targetFamily === null), "a full rare can only free a slot");
}

function testCheapestAndVariants(cat: CraftCatalog): void {
  const s = classify(cat, SAMPLE_ITEM);
  const cards = ranked(cat, s, { exalted: 0.01, "greater-exalted-orb": 0.001, "perfect-exalted-orb": 0.5 });
  const ids = cards.map((c) => c.move.id);
  assert.equal(ids[0], "omen-sinistral-exaltation", `sample ring aims at a prefix first: ${ids.join(",")}`);
  assert.equal(ids.filter((id) => /^exalt(-|$)/.test(id)).length, 1, "Exalt tiers collapse to one card");
  assert.ok(ids.includes("exalt-greater"), "the cheapest Exalt tier represents them");
}

const stub = (id: string, totalDiv: number | null = null) => ({ id, label: id, family: "currency" as const, materials: [], requires: "", effect: "", warnings: [], notes: [], floor: null, source: "", verified: true, totalDiv, totalEx: null });

/** Currency tiers classify like their base orb; magic-tier essences are one card, Perfect is another. */
function testTierClassification(): void {
  const tiers = (ids: string[]) => ids.map((id) => tierOf(stub(id), null));
  assert.deepEqual(tiers(["chaos", "chaos-greater", "chaos-perfect"]), [3, 3, 3], "every Chaos tier frees a slot");
  assert.deepEqual(tiers(["exalt", "exalt-greater", "regal-perfect", "aug-greater", "transmute-perfect", "alchemy", "omen-greater-exaltation"]), [2, 2, 2, 2, 2, 2, 2]);
  assert.deepEqual(tiers(["essence", "essence-greater", "essence-perfect"]), [1, 1, 3], "Lesser/regular/Greater essences add, Perfect Essence replaces");
  assert.deepEqual(tiers(["omen-sinistral-greater-exaltation", "omen-dextral-greater-exaltation"]), [1, 1], "side-steered double adds are aimed adds");
  assert.deepEqual(tiers(["divine", "fracture", "omen-whittling", "bone-preserved"]), [null, null, null, null], "never a card");
}

/**
 * KB §7: an alloy removes a random mod and writes the crafted one, like a Perfect essence — a card
 * on a full rare. Over an existing crafted mod both are refused with the same, inferred reason.
 */
function testAlloyCard(cat: CraftCatalog): void {
  const full = ringLines(cat, ["IncreasedLife", "IncreasedMana", "FireDamage"], ["FireResistance", "ColdResistance", "Strength"]);
  const s = classify(cat, itemText({ ...RING, rarity: "Rare", ilvl: 82, lines: full }));
  const alloy = legalMoves(s).find((m) => m.id === "alloy");
  assert.ok(alloy && alloy.verified && alloy.warnings.length === 0, "a full rare ring takes an alloy (verified, no warning)");
  assert.equal(tierOf(stub("alloy"), null), 3, "an alloy frees a slot, the Perfect-essence tier");
  const cards = rankMoves([stub("annul", 0.5), stub("alloy", 0.01), stub("essence-perfect", 0.2)], s, []);
  assert.deepEqual(cards.map((c) => [c.move.id, c.tier]), [["alloy", 3], ["essence-perfect", 3], ["annul", 3]], "the cheapest alloy leads the cards");
  assert.match(cards[0]?.why ?? "", /^frees a slot/);
  const crafted = classify(cat, itemText({ ...RING, rarity: "Rare", ilvl: 82, lines: [...full.slice(0, -1), `${full[full.length - 1]} (crafted)`] }));
  assert.equal(crafted.slots.crafted, 1, "the crafted line is counted");
  const ev = evaluateRules(crafted);
  const [perfect, alloyBlock] = ["essence-perfect", "alloy"].map((id) => ev.blocked.find((b) => b.id === id));
  assert.ok(perfect && alloyBlock, "both crafted-slot writers are refused over a crafted mod");
  assert.equal(perfect.reason, alloyBlock.reason, "same refusal for both");
  assert.match(perfect.reason, /already has a crafted mod.*3967316, 3960848, 3932540.*unverified/);
  assert.ok(!perfect.verified && !alloyBlock.verified, "the refusal is inferred, not verified");
  assert.ok(!legalMoves(crafted).some((m) => m.id === "alloy" || m.id === "essence-perfect"), "neither is offered");
}

/** Lesser/regular and Greater essences do the same thing to a magic item: one card, the cheaper one. */
function testEssenceCollapse(cat: CraftCatalog): void {
  const s = classify(cat, itemText({ ...RING, rarity: "Magic", ilvl: 82, lines: renderFamily(cat, RING.itemClass, RING.base, "suffix", "FireResistance") }));
  const cards = rankMoves([stub("essence-greater", 0.2), stub("essence", 0.1), stub("essence-perfect", 0.05)], s, []);
  assert.deepEqual(cards.map((c) => [c.move.id, c.tier]), [["essence", 1], ["essence-perfect", 3]], "magic-tier essences collapse onto the cheapest; Perfect stays its own card");
}

/**
 * KB §1/§7 targets: a magic item's cards are an essence (tier 1, upgrades it with a guaranteed mod),
 * Augmentation (tier 2) and Annulment (tier 3). Alchemy stays off a magic item's cards because it
 * discards the mods (red warning); on a normal item it is the card, and no essence is.
 */
function testMagicAndNormalCards(cat: CraftCatalog): void {
  const magic = classify(cat, itemText({ ...RING, rarity: "Magic", ilvl: 82, lines: renderFamily(cat, RING.itemClass, RING.base, "suffix", "FireResistance") }));
  const cards = ranked(cat, magic);
  assert.deepEqual(cards.map((c) => [c.move.id, c.tier]), [["essence", 1], ["aug", 2], ["annul", 3]], `magic ring cards: ${cards.map((c) => c.move.id).join(",")}`);
  assert.match(cards[0]?.why ?? "", /writes the essence's mod/);
  const normal = classify(cat, itemText({ ...RING, rarity: "Normal", ilvl: 82, lines: [] }));
  const normalCards = ranked(cat, normal);
  assert.deepEqual(normalCards.map((c) => c.move.id), ["alchemy"], `normal ring cards: ${normalCards.map((c) => c.move.id).join(",")}`);
}

function testLockedAndContract(cat: CraftCatalog): void {
  const corrupted = classify(cat, itemText({ ...RING, rarity: "Rare", ilvl: 82, lines: ringLines(cat, ["IncreasedLife"], ["FireResistance"]), extra: ["Corrupted"] }));
  const body = { league: "T", ...assembleMoves(corrupted, cat, new Map(), null), bookValue: null, bookError: null };
  assert.deepEqual(craftMovesResponseSchema.parse(body).ranked, [], "corrupted → no cards");
  const open = classify(cat, SAMPLE_ITEM);
  const parsed = craftMovesResponseSchema.parse({ league: "T", ...assembleMoves(open, cat, new Map(), null), bookValue: null, bookError: null });
  assert.ok(parsed.ranked.length > 0 && parsed.ranked.every((c) => parsed.moves.some((m) => m.id === c.move.id)), "cards come from the legal list");
  assert.ok(parsed.ranked.every((c) => c.move.totalDiv === null), "unpriced stays null on a card");
}

function testOutcomeText(cat: CraftCatalog): void {
  assert.deepEqual(rolledLines("+(41-45)% to Fire Resistance"), ["+41% to Fire Resistance"], "ranges value at their low end");
  assert.deepEqual(rolledLines("Adds (3-5) to (8-12) Fire Damage\n+(10-15) to maximum Life"), ["Adds 3 to 8 Fire Damage", "+10 to maximum Life"]);
  const base = classify(cat, SAMPLE_ITEM);
  const target = rankMoves(priceMoves(legalMoves(base), new Map(), null), base, tierGates(base, cat))[0]?.targetFamily;
  assert.ok(target?.topReachable, "sample ring has a reachable target");
  const hit = classify(cat, outcomeText(SAMPLE_ITEM, target.topReachable.text));
  assert.equal(hit.prefixes + hit.suffixes, base.prefixes + base.suffixes + 1, "the outcome is the item plus exactly that mod");
  assert.equal(hit.unmatched.length, 0, "the rolled line resolves against the catalog");
  assert.throws(() => outcomeText(SAMPLE_ITEM, "  \n "), /empty/);
}

function testShareLink(): void {
  const text = `${SAMPLE_ITEM}\r\nMórrigan's Insight — ünïcödé ✓`;
  assert.equal(decodeItem(encodeItem(text)), text, "share link round-trips UTF-8 and CRLF");
  assert.match(encodeItem(text), /^[A-Za-z0-9_-]+$/, "base64url alphabet, no padding");
  const q = shareQuery(SAMPLE_ITEM);
  assert.ok(q, "sample item fits in a link");
  const params = new URLSearchParams(q);
  assert.deepEqual([params.get("tab"), params.get("tool")], ["craft", "moves"]);
  assert.equal(decodeItem(params.get("item") ?? ""), SAMPLE_ITEM);
  assert.equal(shareQuery("x".repeat(SHARE_MAX_BYTES + 1)), null, "over 4 KB → no link");
  assert.equal(shareQuery("é".repeat(SHARE_MAX_BYTES / 2 + 1)), null, "the limit counts UTF-8 bytes, not characters");
  assert.throws(() => decodeItem("not base64!"), /base64url/);
  assert.throws(() => decodeItem("e"), "a truncated link (impossible base64 length) fails loudly");
  assert.throws(() => decodeItem(encodeItem("é").slice(0, 2)), "a cut UTF-8 sequence fails loudly, not as mojibake");
}

export function runRankCases(cat: CraftCatalog): void {
  testOpenPrefixRing(cat);
  testFullRare(cat);
  testCheapestAndVariants(cat);
  testTierClassification();
  testEssenceCollapse(cat);
  testAlloyCard(cat);
  testMagicAndNormalCards(cat);
  testLockedAndContract(cat);
  testOutcomeText(cat);
  testShareLink();
}
