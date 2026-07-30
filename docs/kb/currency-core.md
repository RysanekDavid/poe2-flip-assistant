# PoE2 Core Currency & Craft Sequences — Patch 0.5.x "Runes of Aldur"

**Patch stamp:** Covers 0.5.0 "Return of the Ancients" (league launched 2026-05-29) through hotfixes 0.5.1–0.5.4b (latest observed build 0.5.4b, ~2026-07-02). Sources dated pre-0.5 (0.1–0.4) are flagged explicitly — mod-level floors, essence tuning, Alloys, and the Fluxes/Aldur-runes system all changed at or after 0.5.0.

---

## 1. Currency application matrix

| Currency | Normal | Magic | Rare | Unique | Corrupted | Effect |
|---|---|---|---|---|---|---|
| Orb of Transmutation | ✓ →Magic | ✗ | ✗ | ✗ | ✗ | Normal→Magic, adds 1 mod |
| Orb of Augmentation | ✗ | ✓ (1-mod item only) | ✗ | ✗ | ✗ | Adds a 2nd mod to a single-mod Magic item |
| Orb of Alchemy | ✓ →Rare | ✗ | ✗ | ✗ | ✗ | Normal→Rare, guarantees **4 modifiers** [CONFIRMED — poewiki.net/wiki/Orb_of_Alchemy, u4n.com/news/poe-2-orb-of-alchemy-guide-when-to-use-it-and-when-to-save-it.html] |
| Regal Orb | ✗ | ✓ →Rare | ✗ | ✗ | ✗ | Magic→Rare, **keeps the existing 1–2 magic mods and adds one new random mod** — does not reroll or discard them [CONFIRMED — poewiki.net/wiki/poe2wiki:Regal_Orb, gamerblurb.com/articles/path-of-exile-2-regal-orb-guide-and-how-to-get, boostmatch.gg/blog/poe-2/articles/poe2-currency-guide-patch-050-runes-of-aldur] |
| Chaos Orb | ✗ | ✗ | ✓ only | ✗ | ✗ | Removes one random existing mod, adds one new random mod [CONFIRMED — domistae.github.io/poe2-leveling/poe2_crafting_codex.html, u4n.com/news/poe-2-chaos-orb-guide-how-it-works-and-when-to-use-it.html]. Whether the new mod can land back in the *same family* just removed is **[unverified]** — no source states an exclusion. |
| Exalted Orb | ✗ | ✗ | ✓ (needs open affix slot) | ✗ | ✗ | Adds one new mod, no removal — the mid/late-game "slam" workhorse [CONFIRMED — boostmatch.gg, domistae.github.io crafting codex] |
| Annulment Orb | ✗ | ✓* | ✓ | ✗ | ✗ | Removes one random existing mod. Rare-item use is [CONFIRMED]; Magic-item applicability is **[single-source/unverified]** in 0.5-specific material — treat as PoE-standard behavior carried over, not independently re-confirmed for 0.5. |
| Divine Orb | ✗ | ✓ | ✓ | ✗ (see §7) | ✗ | Rerolls the **numeric values** of existing mods within their current tier's range — does **not** change which mods or tiers are present [CONFIRMED — boostmatch.gg, domistae.github.io] |
| Orb of Chance | ✓ only | ✗ | ✗ | (outcome) | ✗ | PoE2-specific behavior differs sharply from PoE1: takes a Normal item and either turns it into a **random Unique of that exact base**, or **destroys the item** outright — there is no Magic/Rare middle outcome [CONFIRMED — u4n.com/news/how-does-orb-of-chance-work, dving.net/guides/path-of-exile-2-guides/orb-of-chance, pathofexile.com/forum/view-thread/3613718] |
| Orb of Scouring | ✗ | ✓ →Normal | ✓ →Normal | ✗ | ✗ | Strips all mods, resets Magic/Rare back to Normal (used to loop Chance-scour gambling) [CONFIRMED — poewiki.net/wiki/Orb_of_Scouring, boostmatch.gg] |
| Fracturing Orb | ✗ | ✗ | ✓ (4+ mods) | ✗ | ✗ | Permanently locks one random existing explicit modifier so later Chaos/Exalt/Essence crafts can't touch it [single-source — domistae.github.io crafting codex] |
| Vaal Orb | ✓ | ✓ | ✓ | ✓ | ✗ (blocks all further mods once applied) | Corrupts; see full outcome tables in §8 [CONFIRMED — multiple, §8] |
| Essence (any) | ✓ →Magic | ✓ →Rare (Greater) | ✗ | ✗ | ✗ | See §6 |
| Imbued/Runic Alloy | ✗ | ✗ | ✓ | ✗ | ✗ | See §6 |
| Flux (Blazing/Chilling/Void/Crackling) | ✗ | ✓ | ✓ | ✗ (explicitly excluded) | ✗ | See §7 |

---

## 2. Minimum-modifier-level floors (Greater / Perfect tiers)

| Currency family | Greater floor | Perfect floor |
|---|---|---|
| Transmutation / Augmentation | **ilvl 44** | **ilvl 70** |
| Exalted | **ilvl 35** | **ilvl 50** |
| Regal | **ilvl 35** | **ilvl 50** |
| Chaos | **ilvl 35** | **ilvl 50** |

[CONFIRMED — Greater/Perfect Transmutation+Augmentation numbers corroborated across boostmatch.gg/blog/poe-2/articles/poe2-currency-guide-patch-050-runes-of-aldur and domistae.github.io/poe2-leveling/poe2_crafting_codex.html, both citing the 0.5.0 change down from a prior 55 floor. Greater/Perfect Exalted=35/50 corroborated by domistae codex + boostmatch + poe2wiki search-index snippets (poe2wiki.net/wiki/Greater_Regal_Orb, Perfect_Regal_Orb). Greater/Perfect **Regal** = 35/50 and Greater/Perfect **Chaos** = 35/50 are corroborated by two independent aggregator syntheses (poe2db-sourced search snippets + domistae codex) but I could not independently WebFetch poe2db.tw directly (site returned an index page, not the specific item page, on every fetch attempt) — treat the exact Regal/Chaos numbers as **[single-source-strength CONFIRMED]**, i.e. consistent across sources but ultimately traceable to the same poe2db data rather than triangulated from an independent primary reading.]

Meaning: a "Greater Exalted Orb" used on an item will only roll mods whose native tier requires ilvl ≥35 to appear at all; "Perfect" pushes that to ilvl ≥50. This doesn't guarantee top tier — it just prunes the low-level chaff out of the weighted pool.

## 3. Soft-floor safety valve

The min-modifier-level floor is **not a hard filter that can empty a modifier family**. If enforcing the floor would remove every possible roll for a given mod family (e.g., a family whose only tiers sit below the floor), the game keeps the **highest tier available for that family** instead of excluding it entirely. Practical effect: low-max-tier families like Light Radius can still show up even under a Perfect-tier currency, because the alternative would be deleting the family from the pool altogether. [single-source — domistae.github.io/poe2-leveling/poe2_crafting_codex.html; independently phrased the same way across several aggregator search syntheses that all appear to trace back to this document or the same underlying poe2db data, so treat as single-source despite multiple restatements]

## 4. Essence catalogue, one-crafted-mod rule, Imbued Alloys

**Mechanics:** A regular Essence used on a Normal item makes it Magic with a guaranteed mod of that essence's type. A **Greater Essence** used on a Magic item upgrades it directly to Rare while keeping the guaranteed mod [CONFIRMED — mobalytics.gg/poe-2/guides/essences, boostmatch.gg]. Essences cannot be used on Rare or Unique items.

**Known essence types and effects** (compiled from mobalytics.gg/poe-2/guides/essences, poewiki.net/wiki/Essence, pathofexile2.wiki.fextralife.com/Essences, playfunc.com item library — [CONFIRMED] for the entries independently corroborated across ≥2 of these, [single-source] otherwise):

- Essence of the **Body** — flat maximum Life (prefix) [CONFIRMED]
- Essence of the **Mind** — flat maximum Mana (prefix) [CONFIRMED]
- Essence of **Enhancement** — Armour/Evasion/Energy Shield % (prefix) [CONFIRMED]
- Essence of **Flames** / **Ice** / **Electricity** — flat elemental damage of the respective type (prefix) [CONFIRMED]
- Essence of **Abrasion** — flat physical damage (prefix) [single-source]
- Essence of **Sorcery** — spell damage / +levels to spell skills [single-source]
- Essence of **Haste** — attack speed [single-source]
- Essence of **Alacrity** — cast speed [single-source]
- Essence of **Battle** — +N to level of attack skills [single-source; **0.5 nerf**: Perfect Essence of Battle reduced from +5→+3 levels on Two-Handed weapons and +3→+2 on One-Handed weapons — domistae.github.io crafting codex, single-source]
- Essence of **Seeking** — critical hit chance [single-source]
- Essence of **Ruin** — chaos resistance [single-source]
- Essence of **Command** — ally damage / aura magnitude [single-source]
- Essence of **Insulation** — Fire Resistance, **suffix**, valid ONLY on Armour, Belt, or Jewellery base types, +(21–25)% at base tier [CONFIRMED — pathofexile2.wiki.fextralife.com/Essence+of+Insulation, playfunc.com/en/poe2/items/essences-base/currencyessencefireresist]. This is the "trap": buying/using it against a Weapon or a slot outside Armour/Belt/Jewellery wastes the essence — it simply won't be a legal target.
- Essence of **Thawing** — Cold Resistance (suffix, same slot family as Insulation) [single-source, by analogy — pattern-matched from Insulation's documented behavior, not independently confirmed]
- Essence of **Grounding** — Lightning Resistance (suffix, same slot family) [single-source, same caveat]
- Essence of **Infinite** — flat to one or more attributes [single-source]
- Essence of **Opulence** — item rarity / quantity found (only applies to specific slots like belts) [single-source]

**Premium / endgame essences:**
- Essence of **Delirium** — notable-passive-style modifier, Body Armour only [single-source — domistae codex]
- Essence of **Hysteria** — Energy Shield recharge rate on Foci; **0.5 nerf**: 41–45% → 20–23% [single-source — domistae codex]
- Essence of **Horror** — 60% increased Socketed Augment (rune) effect, Gloves/Boots only [single-source]
- Essence of **Insanity** — item gains two enchantments on the next corruption [single-source]
- Essence of the **Breach** — +20% maximum Quality, jewellery only [single-source]
- Essence of the **Abyss** — removes one modifier and imprints a "Mark of the Abyssal Lord" meta-mod [single-source]

**One-crafted-modifier rule (0.5):** All crafted modifiers are now guaranteed-on-apply, but an item can hold only **one** crafted modifier at a time. Essences, Perfect Essences, and the new Imbued/Runic Alloys all write into that same single slot — applying one overwrites/blocks the others. Desecrated modifiers (from the Lich/bone system) no longer count against this crafted-slot cap, but items are separately capped at **one Desecrated modifier**. [CONFIRMED — domistae.github.io crafting codex, switchbladegaming.com/path-of-exile-2/crafting-guide-4]

**Imbued/Runic Alloys** — the new 0.5 essence-tier crafting currency. Obtained from **Verisium Remnants** after completing the Act 2 "Runeseeker" quest chain [CONFIRMED — u4n.com/news/poe-2-list-of-alloy-currency-items-how-to-get-and-use.html, boostmatch.gg/blog/poe-2/articles/path-of-exile-2-alloys-guide-patch-05, domistae codex]. Mechanically each Alloy behaves like a Perfect Essence: **removes a random modifier and writes a guaranteed modifier that is obtainable only through that specific Alloy**, and it occupies the item's single crafted-mod slot. Roughly 13 named types are documented, though the two best available source lists (domistae codex vs. u4n/boostmatch) don't fully agree on names — **[single-source, internally inconsistent]**, listed here as reported:
- Expansive Alloy — utility/AoE (Presence range, minion limit, mana efficiency)
- Swift Alloy — speed (cast/attack speed, flask charges, totem placement)
- Cyclonic Alloy — duration/debuff (ailment duration, slow-resist reduction)
- Prismatic Alloy — penetration/ailment magnitude/exposure
- Mystic Alloy — caster/area (spell AoE, +Spirit, chain, elemental infusion) — note: one source (u4n) reports this Alloy's gear-slot and guaranteed property as still **redacted on poe2db**, i.e. not yet public
- Sovereign Alloy — socketed-augment effect / Runic Ward / resistance magnitude
- Celestial Alloy — high-end caster/martial hybrid (staff/wand mana+spell levels; martial accuracy+attack speed)
- Transcendent Alloy — cast speed + cold conversion (casters) / phys + all-attributes (martial); **0.5.2 change: can no longer be applied to Foci or Wands** [single-source — u4n.com/news/list-of-poe-2-05-runic-recipes-runeshape-combinations.html, pathofexile2.wiki.fextralife.com/Transcendent+Alloy]
- The Runebinder's Alloy — elemental skill-limit, Puppet Master stacks, ballista totems, mark effect
- The Runefather's Alloy — martial weapon-specific (mace Glory retention, quarterstaff Tempest Bells, spear range, talisman lightning)
- Runic Alloy — appears in **two jewellery-specific variants**: a ring version (+25–30 flat max Runic Ward) and an amulet version (+6–10% Runic Barrier) [single-source]
- Adaptive Alloy, Protective Alloy — named only by the domistae codex; no corroborating detail found elsewhere [unverified]

## 5. Alchemy / Divine / Annulment / Regal quick reference

- **Alchemy Orb**: Normal → Rare, always exactly **4 modifiers** guaranteed [CONFIRMED, see §1].
- **Divine Orb**: only re-rolls the *numeric value* inside each existing mod's current range — cannot upgrade a mod's tier or change which mods are present [CONFIRMED, see §1].
- **Regal Orb**: keeps both existing Magic mods, adds a 3rd random mod (item is now Rare, max pool becomes 3 prefix/3 suffix = 6 total) [CONFIRMED, see §1].
- **Annulment Orb**: removes one random existing modifier with equal weighting across all present mods — no way to bias which mod is stripped without an Omen (Omen of Sinistral/Dextral Annulment restricts to prefix-only or suffix-only, per general PoE2 Omen mechanics referenced in several sources, e.g. switchbladegaming.com's Omen list) [single-source for the base mechanic in 0.5-specific material; the Omen-biasing behavior is carried-over general knowledge, not independently re-verified for 0.5].

---

## 6. Fluxes vs. the four "of Aldur" runes — these are TWO DIFFERENT MECHANICS

This is the most commonly confused part of the 0.5 kit. They are not the same item family, even though official patch notes group them in the same hotfix sentence.

### 6a. Fluxes (currency orbs — Blazing/Chilling/Void/Crackling Flux)

Right-click-apply currency, exclusive to Runes of Aldur league, that **transforms all resistance modifiers on an item to a single target element** (also converts hybrid-resistance and max-resistance mods of the covered types, but leaves "+X% to all Elemental Resistances" untouched).

| Flux | Converts FROM | Converts TO |
|---|---|---|
| Blazing Flux | Cold, Lightning res | Fire res |
| Chilling Flux | Fire, Lightning res | Cold res |
| Crackling Flux | Fire, Cold res | Lightning res |
| Void Flux | Fire, Cold, Lightning res | Chaos res |

**Legal targets: Magic or Rare items only. Explicitly does NOT apply to Unique items** — the item description gates it to "a magic or rare item." [CONFIRMED — poe2wiki.net/wiki/Flux (fetched via proxy), corroborated by u4n.com/news/how-to-get-and-use-resistance-fluxes-in-poe-2.html and independent WebSearch synthesis citing poe2wiki's Blazing/Chilling/Void Flux subpages]. Drop level 65, stack size 10, introduced 0.5.0.

**Answer to the Rathpith Globe question, for Fluxes specifically: NO.** Fluxes cannot be applied to any Unique item at all, full stop — this isn't specific to Rathpith Globe, it's a blanket rarity restriction. [CONFIRMED]

### 6b. Passion / Breath / Ire / Betrayal of Aldur (socketable Runes, NOT currency orbs)

These are **Augment-class Runes**, obtained exclusively via Runeword crafting at a **Verisium Remnant** (not drops, not the Currency Exchange as a primary source — one game8 source additionally lists Currency Exchange/trade as secondary acquisition post-Act 3, but flags this as unconfirmed by their own writers). Socketed into an empty Augment Socket on a **Weapon or Armour** piece.

| Rune | Weapon-socketed effect |
|---|---|
| Passion of Aldur | Transforms Cold+Lightning mods → equivalent Fire mods, grants 25% increased Fire Damage |
| Breath of Aldur | Transforms Fire+Lightning mods → equivalent Cold mods, grants 25% increased Cold Damage |
| Ire of Aldur | Transforms Fire+Cold mods → equivalent Lightning mods, grants 25% increased Lightning Damage |
| Betrayal of Aldur | Transforms Fire+Cold+Lightning mods → equivalent Chaos mods |

[CONFIRMED for Passion/Breath/Ire weapon effects — cross-checked across game8.co archives 603414/603415/603416 and poe2wiki.net subpages fetched via proxy; Betrayal's chaos-conversion is corroborated the same way but no source states a flat damage-% bonus for Betrayal, unlike the other three — **[single-source/unclear]** whether that's an intentional asymmetry or a documentation gap]. Armour-socketed effect is stated by one source to be "only the transformation, no damage bonus" but the actual resulting effect on Armour (which rarely carries direct elemental *damage* mods) is not clearly documented — **[unverified]** what these runes actually do when socketed into Armour pieces in practice.

Stack size 10, drop level 65, same as Fluxes. Once socketed, the rune "cannot be retrieved but can be replaced by another Augment item" — replacing destroys the original (see §9). [CONFIRMED across game8 archives 603414/603415/603417]

**Legal targets / unique-item question — the KEY QUESTION, unresolved:** No source directly states whether these runes can be socketed into Unique weapons/armour. General PoE2 socket rules (§9) say any rune can go into any empty Augment Socket, including on Uniques, unless that specific socket is flagged "socket-bound." By that generic rule, these four runes **probably can** be socketed into a Unique item that has an open socket — but this is inference, not a confirmed fact; **[unverified]**. Practically, even if socketable, **Rathpith Globe specifically has no elemental damage or resistance modifiers to transform** (its variable rolls are Life-scaling crit-chance/damage-% mods, not Fire/Cold/Lightning affixes), so socketing any of these four runes into it would very likely do nothing regardless of the socketability answer. This appears to be the practical resolution of the "can it reroll Rathpith Globe's variable mods" question: **no plausible mechanism exists for these runes (or Fluxes) to touch Rathpith Globe's roll — Fluxes are barred from uniques entirely, and even if the Aldur runes are permitted on uniques, Rathpith Globe's mods aren't the mod-type these runes transform.** Treat this synthesis as **[unverified]** pending a direct confirmation/test.

### 6c. 0.5.1 hotfix — fractured-mod interaction

**Hotfix 8** (~2026-06-09): "Fractured modifiers can no longer be transformed by Fluxes nor the Passion of Aldur, Breath of Aldur, Ire of Aldur, and Betrayal of Aldur." **Hotfix 2**: "Runeforging no longer un-Fractures mods." [CONFIRMED — game8.co/games/Path-of-Exile-2/archives/605090, corroborated by independent WebSearch synthesis of the official patch-note text, and poe2wiki.net/wiki/Version_0.5.1 index listing (page itself returned 403 on direct fetch, but its existence/title corroborates)]. Net effect: fracturing a resistance or elemental-damage mod now makes it immune to both Flux transformation and the four Aldur runes — fracture a mod first if you want to "lock" it against a bad Flux/rune conversion later, or don't fracture a mod you're planning to convert.

---

## 7. Vaal Orb — full outcome tables by item type

All four buckets below are reported as roughly **equal-weight, ~25% each** across independent sources (maxroll.gg/poe2/resources/corruption-outcomes, gamerant.com/path-of-exile-2-all-vaal-orb-outcomes-corruption-poe2, mobalytics.gg/poe-2/guides/vaal-corrupting) [CONFIRMED for the 4-bucket/25%-each structure]. Corruption always applies the "Corrupted" tag, which blocks all further currency application (Vaal itself included) regardless of bucket outcome.

**Rare gear (weapons/armour):**
1. No change besides becoming Corrupted (~25%)
2. Reroll — sources disagree on exact scope: described as "1–3 affixes randomized," ambiguous whether this rerolls values only or can also re-tier/re-pick mods entirely [unverified exact mechanic, CONFIRMED that *some* affix reroll bucket exists]
3. Add a Vaal-exclusive corrupted enchantment
4. Add +1 socket (helmets/gloves/boots/chest/shield/focus/martial weapons) OR raise quality up to 23% (wands/staves) — sources bundle this as one "special outcome" category [single-source structure — maxroll]

**Unique items:**
1. No change besides Corrupted (~25%)
2. Reroll numeric values of existing explicit mods, described as functionally similar to a Divine Orb but implemented in 0.5 as a **multiplier of 0.78×–1.22× on the current roll** rather than a fresh in-range reroll [single-source for the exact multiplier — domistae.github.io crafting codex; corroborated in general shape ("affixes divined") by maxroll.gg/poe2/resources/corruption-outcomes]
3. Add a Vaal-exclusive corrupted enchantment (new functionality/bonus not obtainable otherwise)
4. Add a socket to weapons/armour (even beyond the item's normal socket cap); **jewellery (rings/amulets/belts) gets no change from this bucket instead** [CONFIRMED — gamerant.com, maxroll.gg]

**Jewels:**
- Only **Cobalt, Crimson, and Viridian** jewel bases have valid corruption outcomes — all other jewel base types always resolve to "no effect" [CONFIRMED — gamerant.com/path-of-exile-2-all-vaal-orb-outcomes-corruption-poe2]
- Rare/Magic jewels: (1) no change/Corrupted only; (2) chaos-orb-like reroll applied 1–3 times; (3) add corrupted enchantment; (4) **add or remove a modifier ignoring the jewel's normal mod-count cap** — this is stated as **the only way to obtain a 5-modifier jewel in PoE2** [CONFIRMED — gamerant.com]
- Unique jewels: the "chaos-orb-like reroll" bucket **does nothing** (dead roll, ~25% wasted outcome) since unique jewels have no mod pool to reroll from; the other three buckets function normally, with the value-reroll bucket instead applying the 0.78×–1.22× magnitude multiplier [single-source — maxroll.gg, gamerant.com]

**Skill gems** (adjacent, not gear, but relevant to the same currency): outcomes are no change / +1 or -1 gem level / +1 or -1 socket / quality shift between -7% and +3% [single-source — maxroll.gg/poe2/resources/corruption-outcomes]

**Flasks & charms:** quality modified up to 23% [single-source — maxroll.gg]

---

## 8. Runes, Soul Cores, Artificer's Orbs — sockets and swap rules

- **Artificer's Orb**: adds one rune/Augment socket to an item, up to that item's cap. It is the entry point to the entire 0.5 runeforging system [CONFIRMED — timesaver.gg/blog/poe2-artificers-orb-guide, pathofexile2.wiki.fextralife.com/Artificer's+Orb].
- **Socket caps**: Body armour and Two-Handed weapons hold up to **2** sockets; One-Handed weapons and other armour pieces hold up to **1** [single-source — timesaver.gg/blog/poe2-artificers-orb-guide, corroborated in general shape by mobalytics.gg/poe-2/guides/runes-sockets].
- **Rune tiers**: Lesser → Normal (unqualified) → Greater → the new **Named/endgame runes added in 0.5** (e.g. the four "of Aldur" runes). Tier only changes magnitude, not stat category — e.g. Greater Body Rune gives +40 max Life on armour vs. +20 for Lesser [single-source — timesaver.gg].
- **Can runes be swapped/removed in 0.5? Yes, with a catch.** Since patch 0.1.1, socketing a **new** rune directly into an already-filled socket overwrites it — but this **destroys the original rune** in the process; there is no way to recover it that way [CONFIRMED — ssegold.com/socket-runes-can-be-replaced-poe2-patch-0-1-1, game8.co/games/Path-of-Exile-2/archives/604673, escorenews.com/en/article/64425]. This is unchanged behavior carried into 0.5 (the four "of Aldur" runes explicitly document the same "destroyed on replacement" rule, per game8 archives 603414/603415/603417).
- **Orb of Extraction**: can pull a rune/Augment **out intact** (not destroyed) — but doing so **destroys the host equipment item**, sacrificing the base to save the rune [single-source — game8.co/games/Path-of-Exile-2/archives/604673].
- **Socket-bound runes**: a subset of sockets/runes are flagged non-removable — cannot be extracted, replaced, or removed by any means once placed [single-source — game8.co/games/Path-of-Exile-2/archives/604673].
- **Soul Cores**: obtained from the Trial of Chaos; one guaranteed at rounds 4, 7, and 10 of the trial [single-source — domistae.github.io crafting codex].
- **Legacy runes**: a compatible Ezomyte or Kalguuran Unique item can be sacrificed/destroyed to produce a Legacy Rune carrying an effect based on the sacrificed unique [single-source — mmogah.com/news/path-of-exile-2/poe-2-05-rune-crafting-guide-how-to-become-a-runeseeker].

---

## 9. Recombinator and vendor 3-to-1 recipes

- **Recombinator does not exist as an active feature in 0.5.** It was a PoE1-originated / early-PoE2 device (combine two Magic/Rare items of the same class), and multiple 0.5.0 guides explicitly state it has been **disabled** — "Adjust your crafting plans accordingly" [CONFIRMED — boostmatch.gg/blog/poe-2/articles/poe2-050-return-of-the-ancients-beginner-guide, game8.co/games/Path-of-Exile-2/archives/507687].
- **Chromatic Orb / Jeweller's Orb / Orb of Fusing 3-to-1-style vendor recipes do NOT exist in PoE2 at all.** Every search for these returned only Path-of-Exile-**1** results. PoE2 removed the socket-color/link system entirely — skill gems and supports don't need colored/linked sockets, so there is no PoE2 equivalent currency or vendor recipe for socket colors/links. Sockets in PoE2 (per §8) are exclusively Rune/Soul Core augment sockets managed via Artificer's Orbs. **This is an important negative finding for the flip tool**: do not price or track Chromatic/Jeweller's/Fusing orbs as PoE2 currency — they aren't in the game. [CONFIRMED by absence — no PoE2-specific source found across multiple targeted searches]
- No other vendor 3-to-1 style recipe was found documented for 0.5-era PoE2 currency. **[open question]**

---

## Wallet warnings

- **Essence slot mismatches waste the whole essence.** Essence of Insulation/Thawing/Grounding (resistance essences) are suffix-only and restricted to Armour/Belt/Jewellery — using or buying them expecting a Weapon-applicable roll is a dead purchase. [CONFIRMED for Insulation; pattern-inferred for Thawing/Grounding]
- **Fluxes cannot touch Unique items, ever** — don't buy a Flux hoping to fix resistances on a unique piece; it will not apply. [CONFIRMED]
- **Fracture a mod before relying on Flux/Aldur-rune conversion if you want it protected — but fracture AFTER you're sure you don't want that mod converted**, since fractured mods are now immune to both Flux and the four Aldur runes as of 0.5.1 Hotfix 8. Fracturing the wrong mod first permanently blocks a conversion you may have wanted. [CONFIRMED]
- **One crafted-mod slot total.** Essences, Perfect Essences, and Imbued/Runic Alloys all fight over the same single slot — applying a second one overwrites the first, destroying prior essence/alloy investment. Plan crafting order so the *last* crafted-slot application is the one you actually want to keep. [CONFIRMED]
- **Socketing a new rune over an old one destroys the old rune with no refund** — don't casually "try" runes in a socket you might want to revert; use Orb of Extraction (which sacrifices the base item instead) only if the rune is worth more than the item. [CONFIRMED]
- **Chaos Orb is not full-reroll anymore** — it swaps exactly one mod, not the whole affix set, so don't budget Chaos spam the way older PoE1 intuition suggests; it's far more surgical (and slower per "reroll") than PoE1's Chaos Orb. [CONFIRMED]
- **Orb of Chance in PoE2 either hits a specific Unique or destroys the item outright** — there is no safety net of landing on Magic/Rare instead, unlike PoE1. Only chance bases where the Unique is actually worth more than the destroyed-item risk. [CONFIRMED]
- **Regal/Perfect Regal and Chaos/Perfect Chaos min-mod-level floors (35/50) are real gates** — using a base Exalted/Regal/Chaos orb below those floors is strictly worse expected value than saving up for the Greater/Perfect tier if the base item level supports it; but the soft-floor valve means you're never *fully* locked out of a family, so don't over-pay for Perfect tiers chasing a family that would show up anyway.
- **Chaos/Elemental Resistance T1 mods need high item level bases**: Chaos Resistance T1 requires ilvl 81, Elemental Resistance T1 requires ilvl 82 [single-source — switchbladegaming.com/path-of-exile-2/crafting-guide-4]. Slamming a low-ilvl base with a Perfect currency to chase T1 res is a wasted currency spend if the base itself can't roll it.
- **Do not track/flip Chromatic Orb, Jeweller's Orb, or Orb of Fusing as PoE2 currency** — they don't exist in this game; any "price" data claiming to be PoE2 for these is either mislabeled PoE1 data or a scam listing.

## Profit angles

- **Alloy arbitrage**: Imbued/Runic Alloys are gated behind an Act 2 quest chain (Runeseeker) and Verisium Remnant RNG, making them a supply-constrained, high-demand crafting input early in a league cycle — buying/farming Verisium Remnants and reselling specific in-demand Alloy types (Transcendent, Celestial) to crafters is a plausible early-league margin play, though no source gives concrete price data for this. [unverified numbers, structurally plausible]
- **Essence-to-Rare flipping**: because Alchemy Orb guarantees exactly 4 mods and Greater Essences guarantee a Rare with a locked-in useful mod, buying cheap essence-crafted bases in bulk and reselling the ones that roll well (especially with a desirable prefix/suffix pairing for a popular build) is a standard volume-based flip loop — no 0.5-specific numbers found, but the mechanic supports it directly.
- **Flux/Aldur-rune conversion service**: since Fluxes/Aldur-runes are gated to endgame-drop-level-65 items and many players don't understand the Unique-exclusion rule, there's a plausible niche in selling "resistance-fixed" magic/rare bases (converted via Flux) to players who want a specific single-resistance stack without re-rolling the whole item — margin comes from Flux cost vs. the value uplift of a "clean" single-element resist item.
- **Fracture-then-slam sequencing**: post-0.5.1, fracturing a valuable mod *before* using Chaos/Exalt to hunt for a second good mod, then optionally applying a Flux/Aldur rune to convert only the *unfractured* portion, is a more deterministic (lower-variance) crafting sequence than pre-0.5.1 — sellable as a "safe craft" service if the tool can automate the sequencing logic, since manual players are prone to fracturing the wrong mod given the new interaction.
- **Vaal-jewel 5-mod jewels**: since Vaaling a Cobalt/Crimson/Viridian jewel is the *only* route to a 5-mod jewel in PoE2, and only ~25% of Vaal attempts hit that bucket, pre-corrupted 5-mod jewels likely carry a large risk premium over 4-mod jewels — flipping the difference (buy 4-mod, Vaal in bulk, resell hits) is a numbers-game margin play, though no source gives concrete jewel base costs or hit-rate economics for 0.5.

## Open questions

1. Can Passion/Breath/Ire/Betrayal of Aldur actually be socketed into Unique items with open Augment Sockets? No source directly confirms or denies this — inferred plausible from general socket rules but unverified.
2. Does the "one crafted-mod slot" rule interact with Fracturing Orb (i.e., is a fractured mod exempt from ever being overwritten by a later essence/alloy, or does it just sit alongside the crafted-mod slot as a separate lock)?
3. Exact behavior of Passion/Breath/Ire/Betrayal of Aldur when socketed into **Armour** (as opposed to Weapon) — sources state "only the transformation applies" but don't specify what mod types on armour actually get transformed, since armour rarely carries direct elemental damage mods.
4. Does Annulment Orb work on Magic items in 0.5, or was it restricted to Rare-only alongside Chaos Orb's rare-only gating? No 0.5-specific source explicitly confirms Magic-item Annulment.
5. Full, verified 13-item Imbued/Runic Alloy list with exact guaranteed-mod text per equipment slot — the two best available sources partially disagree and at least one Alloy (Mystic) is reportedly still redacted on poe2db as of the sources checked.
6. Exact rare-gear Vaal Orb "affix reroll" bucket mechanic — is it a Divine-style value-only reroll, a Chaos-style single-mod swap repeated 1–3 times, or a full multi-mod re-tier? Sources use inconsistent language ("randomized," "similar to Chaos Orb applied 1-3 times").
7. Whether Chaos Orb's replacement mod can land in the same modifier family it just removed (full randomness vs. family-exclusion) is not stated by any source.
8. Whether any vendor recipe (3-to-1 or otherwise) for PoE2-native currency exists at all in 0.5 — none was found, but absence of evidence isn't proof of absence given search-engine bias toward PoE1 content for these query shapes.
9. Direct poe2db.tw item pages for Greater/Perfect Regal Orb and Greater/Perfect Chaos Orb could not be fetched directly in this research pass (site returned only an index/redirect page) — the 35/50 floors should be spot-checked against a live poe2db page before being treated as fully independently triangulated rather than aggregator-relayed.

---

> Built 2026-07-14 by the poe2-kb-build workflow (research + adversarial verify). Patch 0.5.x.

## Adversarial verification (post-research)

- confirmed — 1. Greater Regal Orb and Perfect Regal Orb enforce minimum modifier level floors of 35 and 50 respectively
  → Correct as stated, and independently verifiable — poe2wiki.net loaded fine via direct fetch (the earlier poe2db.tw block was a tooling issue, not a data-availability issue). Greater Regal Orb: 'Minimum Modifier Level: 35'. Perfect Regal Orb: 'Minimum Modifier Level: 50'. Mechanic note: at least one tier of a modifier type is always eligible even if it falls below the floor (e.g. Light Radius). (https://www.poe2wiki.net/wiki/Greater_Regal_Orb and https://www.poe2wiki.net/wiki/Perfect_Regal_Orb)
- confirmed — 2. Greater Chaos Orb and Perfect Chaos Orb enforce minimum modifier level floors of 35 and 50 respectively
  → Correct as stated. Greater Chaos Orb: 'Minimum Modifier Level: 35' (removes a random mod, adds a new one with that floor). Perfect Chaos Orb: 'Minimum Modifier Level: 50'. Same floors and same mechanic as the Regal-Orb pair. (https://www.poe2wiki.net/wiki/Greater_Chaos_Orb and https://www.poe2wiki.net/wiki/Perfect_Chaos_Orb)
- confirmed — 3. Fluxes (Blazing/Chilling/Void/Crackling) are restricted to Magic and Rare items only and explicitly cannot be applied to Unique items
  → Correct. All four Fluxes' item text reads 'Right click this item then left click on a magic or rare item to apply it' — Normal and Unique items are excluded by omission, not by an explicit 'cannot target Unique' clause, but the effect is the same: only Magic/Rare are valid targets. (https://www.poe2wiki.net/wiki/Flux)
- confirmed — 4. The four 'of Aldur' runes (Passion/Breath/Ire/Betrayal) are a mechanically distinct system from Fluxes despite being grouped in the same 0.5.1 hotfix note, and their unique-item socketability is unconfirmed
  → The distinctness is verifiable: Fluxes are direct-apply currency (right-click item, left-click magic/rare target, no socket consumed) that reroll resistance-tier magnitudes, while the four Aldur runes are Socket-bound Augments placed into an item's Augment Socket, granting both a transform effect and a separate 'Bonded' passive bonus (e.g. Passion of Aldur: transform + 'Bonded: Weapon: 25% increased Fire Damage') — a materially different item-interaction model. On socketability: unique items in PoE2 CAN carry Augment Sockets (e.g. Morior Invictus has 4 hidden sockets; Aldur's Legacy specifically requires a Kalguuran/Ezomyte unique with an empty Augment Socket), and the four transform-runes' tooltip text ('Place into an empty Augment Socket in a Weapon or Armour') does not textually exclude uniques — but no source directly confirms or denies it was tested/works on uniques, so that specific sub-point remains genuinely open, as the claim itself states. (https://www.poe2wiki.net/wiki/Passion_of_Aldur and https://www.poe2wiki.net/wiki/Augment_Socket)
- confirmed — 5. Rathpith Globe's variable rolls are Life-scaling crit/damage mods, not Fire/Cold/Lightning affixes, so no Flux or Aldur rune would have anything to transform on it even if socketable
  → The premise is directly verifiable, not just inferred: Rathpith Globe's explicit mods are 'Non-Channelling Spells cost an additional 6% of your maximum Life', '... have 3% increased Critical Hit Chance per 100 maximum Life', '... deal 6% increased Damage per 100 maximum Life', plus its Vaal-cultivation variable rolls (Ailment Magnitude/Mana, Crit/Mana, Life Cost Efficiency) — none are Fire/Cold/Lightning resistance or damage affixes. So the deduction that Fluxes/Aldur runes would have nothing to act on is correct; the 'even if socketable' hedge is appropriate since Foci socket eligibility for this specific base wasn't separately checked. (https://www.poe2wiki.net/wiki/Rathpith_Globe)
- confirmed — 6. 0.5.1 Hotfix 8 made fractured modifiers immune to transformation by both Fluxes and the four Aldur runes
  → Correct and precisely attributed. The official 0.5.1 Hotfix 8 patch note reads verbatim: 'Fractured modifiers can no longer be transformed by Fluxes nor the Passion of Aldur, Breath of Aldur, Ire of Aldur, and Betrayal of Aldur.' This is a distinct, later hotfix — not part of the base 0.5.1 patch notes. (https://www.poe2wiki.net/wiki/Version_0.5.1 (Hotfix 8 section))
- confirmed — 7. The 'one crafted modifier' rule means Essences, Perfect Essences, and Imbued/Runic Alloys all compete for a single shared crafted-mod slot on an item
  → Correct. poe2wiki has a dedicated 'Crafted modifier' entry stating outright: 'Since Patch 0.5 only 1 crafted modifier is allowed per item.' Alloys (Runic, Adaptive, Expansive, Protective, etc.) are documented as functioning 'similarly to essences' — i.e. guaranteed-modifier currencies that write into the same crafted slot, consistent with the claim. (https://www.poe2wiki.net/wiki/Crafted_modifier and https://www.poe2wiki.net/wiki/Alloy)
- confirmed — 8. Vaal Orb on rare gear and unique items each have four roughly-equal-weight (~25%) outcome buckets
  → Correct. Per poe2wiki's Corrupted article, non-unique equipment (covers rare) has exactly four top-level outcomes — no change / reroll up to 3 modifiers / add a Vaal enchantment / add an item socket — and unique equipment also has exactly four — no change / 0.78x–1.22x magnitude multiplier / add a Vaal enchantment / add an item socket (jewellery gets 'no change' instead of a socket). The wiki states 'the odds of each effect seem to be all equally likely,' i.e. ~25% each bucket, with weighted sub-rolls inside a bucket. (https://www.poe2wiki.net/wiki/Corrupted)
- **REFUTED** — 9. Only Cobalt, Crimson, and Viridian jewel bases have valid Vaal corruption outcomes, and Vaaling is the only way to get a 5-modifier jewel in PoE2
  → The base-type names are wrong for PoE2. PoE2's regular jewel bases are Ruby, Emerald, Sapphire, and Diamond ('Basic Jewels'), not Cobalt/Crimson/Viridian — those are Path of Exile 1 jewel-base names and do not exist as PoE2 jewel items. The second half is directionally right on its own: poe2wiki states jewels 'can only have a maximum of four affixes instead of the usual six, though corrupted jewels can have up to five,' consistent with corruption being the route past the 4-mod cap — but the claim as a whole is refuted because of the incorrect base-type names, which misidentify which jewels the mechanic even applies to. (https://www.poe2wiki.net/wiki/Jewel)
- **REFUTED** — 10. PoE2 has no Chromatic Orb / Jeweller's Orb / Orb of Fusing vendor-recipe system at all — sockets are purely Rune/Soul Core augment sockets
  → Chromatic Orb and Orb of Fusing are indeed absent from PoE2 (both 404 on poe2wiki; PoE2's own 'Differences from Path of Exile 1' article explicitly notes 'the concept of gem socket colors doesn't exist' in PoE2, i.e. Chromatic Orb's function was removed). However, Jeweller's Orb DOES exist in PoE2 — it was repurposed, not removed: Lesser/Greater/Perfect Jeweller's Orbs now set the number of Support Gem Sockets on a Skill Gem (3/4/5 respectively), rather than rerolling item link-sockets as in PoE1. So the claim's blanket 'no ... Jeweller's Orb ... at all' is false; only two of the three named currencies are actually gone, and item sockets for gear are indeed purely Rune/Soul Core/Augment sockets (that part is correct), separate from the still-existing Jeweller's Orb which now targets gem sockets instead. (https://www.poe2wiki.net/wiki/Jeweller%27s_Orb)
- confirmed — 11. The Recombinator is disabled/non-functional in patch 0.5
  → Correct. poe2wiki flags the Recombinator page itself as 'historical game content,' and its version history states outright: '0.5.0: The Recombinator has been disabled. The Omen of Recombination has been removed. Existing Omens of Recombination will be deleted upon logging in.' Third-party 0.5 guides corroborate this was considered the single biggest crafting-economy shock of the patch, with Verisium Runeforging/Runic Alloys/Genesis Tree introduced as its replacement systems. (https://www.poe2wiki.net/wiki/Recombinator)
- confirmed — 12. Regal Orb preserves both existing magic modifiers when upgrading a magic item to rare, rather than discarding them
  → Correct. Regal Orb's item text states verbatim: 'Upgrades a Magic item to a Rare item, adding 1 modifier ... Current modifiers are retained and a new one is added.' Since a Magic item can have at most 1 prefix + 1 suffix, this means both existing mods (if present) survive the upgrade and a third is added on top. The same retain-and-add behavior applies to Greater and Perfect Regal Orb. (https://www.poe2wiki.net/wiki/Regal_Orb)
