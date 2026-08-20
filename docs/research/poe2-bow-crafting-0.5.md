# PoE2 high-end bow crafting — patch 0.5.4 (Runes of Aldur)

Deep-research report, web-verified 2026-08-20. Cross-checked against
`docs/research/poe2-crafting-knowledge.md` (local verified KB). Every claim carries a confidence
tag: **verified-multi-source**, **single-source**, or **unresolved**. Nothing here may be promoted
into Coach recommendations without honoring those tags.

Patch state: current live patch is **0.5.4 "Return of the Ancients"** (0.5.0 shipped 2026-05-28;
0.5.5 expected after Gamescom late Aug 2026). Three 0.5 changes invalidate most older bow advice:

1. **Recombination is gone for the whole league** (Recombinator disabled, Omen of Recombination
   removed).
2. **One crafted (essence/alloy) modifier and one desecrated modifier per item** (was up to 6
   desecrated pre-0.5).
3. **`Bow Attacks fire additional Arrows` no longer exists as a craftable prefix** — the craftable
   arrow mod is now a suffix: `+(x)% Surpassing chance to fire an additional Arrow Attack`
   (top tier "of Many", mod level 82).

---

## 1. Bow bases (poe2db, Runes of Aldur v0.5)

| Base | Lvl req | Dex | Phys dmg | APS | Crit | Implicit / catch | When it wins |
|---|---|---|---|---|---|---|---|
| **Obliterator Bow** | 78 | 163 | **62–115** | **1.1** (nerfed from 1.15 in 0.5.0) | 5% | 50% reduced Projectile Range | Highest raw phys — phys-crit and phys non-crit single-target |
| **Warmonger Bow** | 77 | 163 | 56–84 | 1.2 | 5% | none | Balanced: no range downside, +9% APS vs Obliterator |
| **Gemini Bow** | 78 | 163 | 39–72 | 1.15 | 5% | **+50% chance to fire an additional Arrow** | Clear/proj-count builds (LA, Ice Shot) |
| **Twin Bow** | 54 | 96 | 32–60 | 1.15 | 5% | +50% additional Arrow | Cheap arrow-count base |
| **Dualstring Bow** | 28 | 52 | 19–35 | 1.15 | 5% | +50% additional Arrow | Levelling / budget arrow-count |
| **Fanatic Bow** | 79 | 163 | 47–79 | 1.2 | 5% | 28–64 hidden Chaos dmg | Chaos/poison |
| **Guardian Bow** | 77 | 163 | 53–88 | 1.15 | 5% | 25–35% Chain chance | Chain-clear niche |
| **Greatbow** | 52 | 92 Str/Dex | 40–82 | 1.15 | **6.5%** | none | Only above-5% implicit crit (low ilvl ceiling) |
| **Artillery Bow** | 45 | 80 | 39–72 | 1.1 (nerfed) | 5% | 50% reduced Projectile Range | Low-level Obliterator analogue |

Confidence: verified-multi-source for Obliterator/Warmonger/Gemini/Dualstring (poe2db table +
Maxroll 0.5.0 notes confirm the 1.15→1.1 APS nerfs). Rest: single-source (poe2db).

**Base-choice rule:** raw-DPS archetypes (phys crit / phys non-crit) → Obliterator, or Warmonger
for attack speed; projectile-count archetypes (Lightning Arrow, Ice Shot) → Gemini/Dualstring/Twin,
because the 50% implicit + a Surpassing-chance suffix crosses the 100% threshold. Do **not** state
a DPS ranking between these without a PoB — sources disagree and none show numbers.

0.5 introduced **Runeforged base variants** via Verisium Runeforging; poe2db lists Runeforged bow
bases, but no reachable source documents what Runeforging does to *weapons* (guides cover armour
Runic Ward only). **Unresolved — the app must not claim a Runeforged bow is better.**

---

## 2. Affix targets and ilvl gates

| Mod | Side | Archetype | ilvl / mod-level gate | Confidence |
|---|---|---|---|---|
| `#% increased Physical Damage` (local) | prefix | both phys paths — biggest multiplier | **T1 needs ilvl 82**; ilvl 75+ OK for T2 | guide-consensus (timesaver, aoeah, mmoexp 0.5) — not data-verified |
| `Adds # to # Physical Damage` | prefix | both phys paths | Greater Essence of Abrasion writes **(16–24)–(28–42)** at mod level 48 (bows use the ONE-HANDED value row) | verified-multi-source |
| `+(x)% Surpassing chance to fire an additional Arrow Attack` | **suffix** | all bow builds, hardest chase | of Surplus 46 (25–50%), of Splintering 55 (75–100%), of Shards 66 (125–150%), **of Many 82 (175–200%)** | single-source (poe2db `Additional arrow` page) |
| `+#% to Critical Hit Chance` (local) | suffix | crit | Greater Essence of Seeking guarantees **+(3.11–3.8)%**, mod level 35 | verified-multi-source (matches KB §7) |
| `#% increased Attack Speed` | suffix | all | natural tiers unresolved; **desecrated Amanamu = 12–18%**, Ulaman = 8–13%, mod level 65 | verified-multi-source |
| `+#% to Critical Damage Bonus` | suffix | crit | unresolved for PoE2 | unresolved |
| `+# to Level of all Projectile Skills` | side disputed | all | unresolved — exile.pub (0.4.0) says bow suffix; Maxroll 0.5.4 phrases as "Projectile Gems" | unresolved |
| `Adds # to # Cold Damage` | prefix | elemental | Greater Essence of Ice = **(31–38)–(47–59)** (one-handed row) | single-source |
| `+# to Accuracy Rating` | prefix | filler | Greater Essence of Battle = **+(237–346)**, prefix, mod level 46 (Battle is ACCURACY, not the 0.1-era "additional arrows" essence) | single-source |
| Desecrated bow options (mod lvl 65) | mixed | situational | Ulaman prefix `Projectiles deal (60–79)% incr. Damage vs enemies >6m`; Amanamu suffix `(12–18)% incr. Attack Speed`; Amanamu suffix `(40–60)% Pierce`; Kurgal prefix `(30–40)% incr. Quiver bonuses`; Kurgal suffix `(25–34)% incr. Crit vs enemies >6m` | verified-multi-source |

**Hard warning:** no reachable web source has PoE2 per-tier ilvl tables for flat phys, %phys,
attack speed, crit on bows. poeaffix.net is **PoE1 data** (do not ingest). exile.pub is 0.4.0.
The authority is the project's own RePoE snapshot
(`src/data/poe2/repoe/manifest.json`, RePoE 4.5.4.7, synced 2026-07-30) — decompress
`catalog-*.json.gz` and read `mods_by_base` for bows to resolve every tier/ilvl gap above from
data instead of prose.

---

## 3. Craft sequences

Shared 0.5 constraints (verified-multi-source: Maxroll 0.5.0, bugfree, domistae codex, local KB):

- One crafted modifier per item (essence/Perfect essence/Alloy share the slot).
- One desecrated modifier per item.
- No Recombinator, no Omen of Recombination, no Omen of Corruption in 0.5.
- Perfect currency floors: Perfect Exalt min mod level 50, Perfect Transmute/Aug 70; Greater
  Exalt 35, Greater Transmute/Aug 44. Greater/Perfect Regal & Chaos = 35/50 per domistae —
  **single-source, do not encode as fact yet** (KB §10 open question 1).
- Fracture: rare with ≥4 mods, one per item ever, fractured values are Divine-proof.

### (a) Physical NON-crit — budget / league-start

1. Buy a **magic** Obliterator/Warmonger with the highest `#% increased Physical Damage`
   affordable (T2 is the value pick; T1 needs ilvl 82 and prices like a finished item). *%phys is
   the multiplier you can never add later without burning the one crafted slot.*
2. **Orb of Augmentation** if single-mod. *Essences upgrade magic→rare and add their mod; carry
   the second magic affix for free.*
3. **Greater Essence of Abrasion** → rare, guarantees flat phys prefix.
4. **Preserved Jawbone + Omen of Sinistral Necromancy** (prefix-side desecration) → reveal at the
   Well of Souls; take a damage prefix. **Omen of Abyssal Echoes** = one reroll insurance.
   *Jawbone is the weapon/quiver bone; Sinistral forces prefix side.*
5. Fill with **Greater/Perfect Exalts**, ideally under **Omen of Dextral Exaltation**
   (suffix-only) chasing attack speed / crit / Surpassing chance. **Omen of Greater Exaltation**
   = one Exalt adds two mods.
6. Cleanup: **Orb of Annulment** under **Omen of Sinistral/Dextral Annulment**, or Chaos under
   **Omen of Sinistral/Dextral Erasure** (PoE2 Chaos removes one mod, adds one — not a reroll).
7. Quality 20% → sockets/runes → **Divine to max** → corrupt last if at all.

Unveil-target conflict: aoeah says "high flat elemental, cold best"; mmoexp says "flat physical
best". **Report both; decide by the build's conversion.**

### (b) Physical CRIT — high end

1. **ilvl 82 Obliterator/Warmonger with high %phys.** Preferred: buy a **fractured** base with T1
   %phys (best), flat phys, or crit fractured. *Fracture is Annulment-immune → every cleanup step
   safe.*
2. Augment to two affixes if magic.
3. **Greater Essence of Seeking** → guaranteed +(3.11–3.8)% crit suffix. **Never Perfect Essence
   of Seeking** — its Perfect mod is a body-armour defensive mod, not weapon crit (verified,
   poe2db item page).
4. Flat phys: Greater Abrasion if crafted slot free, else natural via exalts. Perfect-tier
   alternative: **Perfect Essence of Abrasion** = `Gain (15–20)% of Damage as Extra Physical` on
   bows (one-handed row) but **removes a random mod** — pair with **Omen of Dextral
   Crystallisation** to force the removal onto suffixes. *Naming trap: Sinistral Crystallisation
   removes PREFIX mods (poe2db item page); one aggregated listing shows it inverted — trust the
   item page.*
5. **Preserved Jawbone + Omen of Dextral Necromancy + Omen of the Liege** (forces Amanamu pool)
   for the 12–18% attack-speed desecrated suffix. Omen stacking within a family = **medium
   confidence — test on a cheap base first**.
6. **Omen of Greater Exaltation + Perfect Exalt** for last slots (mod level ≥50 guaranteed).
7. Optional **Fracturing Orb** at 4-mod state with the KB's desecrated-mod trick: keeper + 2 junk
   + 1 desecrated → 1-in-3 instead of 1-in-4 (desecrated mods can't be fractured but count toward
   the 4-mod minimum).
8. Quality → sockets → **Divine to max** → optional **Omen of Sanctification** on the Divine. In
   0.5 Sanctify *multiplies* current values (not a reroll) — divining to max first is mandatory;
   sanctifying locks further crafting.

### (c) Elemental (Lightning Arrow / Ice Shot)

LA converts phys → lightning, so an ele bow still wants flat phys + flat ele. Maxroll 0.5.4 bow
priority: high phys → ele damage roll → additional-arrow → +level projectile gems → flat ele/phys
→ attack speed.

1. **Gemini / Dualstring / Twin** at highest affordable ilvl (or Obliterator if single-target
   matters more than proj count).
2. Aug → **Greater Essence of Ice** (guaranteed cold prefix) or Greater Abrasion for converters.
3. Chase **Surpassing-chance suffix** — "of Many" (175–200%) needs ilvl 82; "of Shards" at 66
   (125–150%) is the budget target. With the 50% implicit, ≥50% Surpassing guarantees one extra
   arrow.
4. Suffix exalts under **Omen of Dextral Exaltation** for AS/crit; prefixes for flat ele + %phys.
5. Quality → runes (Storm Rune for LA per Maxroll) → Divine → optional Sanctify.

---

## 4. Costs and break-even framing

Live anchors (2026-08-20): poe2scout `/api/poe2/Leagues` → Runes of Aldur DivinePrice = 347.3 ex,
ChaosDivinePrice = 11.16. Timesaver ~375 ex/div (2026-08-19). dadsofexile board shows 598 ex/div —
**~60% divergence; use dadsofexile ratios only, never absolutes.**

Consumables in divine-equivalents within the dadsofexile board (divergence cancels):

| Item | ex | ≈ div |
|---|---|---|
| Greater Essence of Abrasion | 0.98 | ~0.002 |
| Greater Essence of Seeking | 3.61 | ~0.006 |
| Perfect Essence of Abrasion | 4.83 | ~0.008 |
| Perfect Exalted Orb | 1,708 | ~2.9 |
| Fracturing Orb | 7,287 | ~12.2 |

Guide-stated (mmoexp 2026-06-18): Preserved Jawbone + Necromancy omens ~3 ex each; Ancient
Jawbone 1–2 div. ("10+ div league-start essences" figure is stale.)

Tiers:

- **Budget (<~5 div):** ilvl 75+ magic Warmonger/Obliterator with T2–T3 %phys, Greater Abrasion,
  1 Jawbone desecration, Greater Exalts. The base is the cost.
- **High end (~20–100+ div):** ilvl 82 or fractured-T1-%phys base (dominant cost), Greater
  Seeking, Liege-forced Amanamu AS, Perfect Exalts under Greater Exaltation, optional Fracturing
  Orb (~12 div).
- **Mirror-chase (100s of div):** 0.5 meta = "guarantee 1–2 mods, then exalt-and-pray; a miss
  costs 100+ div in Whittlings and Omens of Light" (XTheFarmerX league review). No published hit
  rates.

**No source publishes per-step probabilities — the app must never state one.** Break-even instead:

```
p_breakeven = cost_of_one_attempt / (value_if_hit − value_if_miss)
```

Safe example phrasing: "A Preserved Jawbone + Omen of Dextral Necromancy attempt costs ~6 ex
≈ 0.017 div. If hitting Amanamu 12–18% attack speed raises sale value by 15 div, the step pays
above a ~0.1% hit rate. A Perfect Exalt (~2.9 div) slam on a bow selling 40 vs 25 div needs
better than roughly 1-in-5."

---

## 5. Traps / stale-advice corrections (encode in Coach guardrails)

1. "Essence of Battle forces additional arrows" (0.1-era) — **false in 0.5**: Battle = accuracy;
   craftable arrow mod is the Surpassing-chance suffix; `fire additional Arrows` exists only as
   corrupted/unique implicit.
2. "Expert Dualstring Bow" naming is pre-0.3; endgame bases are Obliterator/Warmonger/Gemini/
   Fanatic/Guardian.
3. **Perfect ≠ stronger Greater.** Perfect Abrasion changes the mod entirely; Perfect Seeking is
   a body-armour mod. Always check the Perfect variant's actual mod.
4. **Bows use the ONE-HANDED essence value row** (confirmed on Abrasion + Ice). Crossbows get
   ~45% more flat.
5. **Omen of Whittling removes the lowest modifier LEVEL**, not displayed tier; unrevealed
   desecrated mods count as level 1 — always read the hover preview (KB, unanimous).
6. **Omen of Putrefaction corrupts the item**; 0.5 caps desecrated mods at 1; pre-0.5 "6
   desecrated mods" articles are stale.
7. **Sanctify multiplies current values in 0.5** — Divine to max first; locks the item.
8. **Homogenising Exaltation drop-disabled since 0.4.0**; poe2db still lists it — never put it in
   a 0.5 recipe.

---

## 6. Suggested local follow-ups

- `src/core/craftTargets.ts` (~146–157): `bow_attack` target lists only +proj-level and attack
  speed — missing `%increased Physical Damage`, flat phys, and the additional-arrow suffix that
  every 0.5 source ranks above attack speed. `ilvlMin: 80` → **82** for the top-tier variant
  (T1 %phys and "of Many" gate at 82); keep a 75 budget variant. Consider splitting into
  `bow_phys_crit`, `bow_phys_noncrit`, `bow_elemental`.
- `docs/research/poe2-crafting-knowledge.md`: §10 open question 1 (Greater/Perfect Regal & Chaos
  floors) has a single-source candidate (35/50, domistae) — needs poe2db confirmation before
  promotion. §4 should gain the Crystallisation naming-trap note and the 0.5 removals
  (Recombination, Omen of Corruption). Essence section can gain the verified bow values above.
- Decompress the RePoE catalog and read `mods_by_base` for bows — resolves every unresolved
  tier/ilvl gap from data rather than prose.

---

## Sources (accessed 2026-08-20)

Official/patch tier:
- https://maxroll.gg/poe2/news/0-5-0-patch-notes-return-of-the-ancients (0.5.0 notes)
- https://maxroll.gg/poe2/build-guides/lightning-arrow-deadeye (patch 0.5.4, upd. 2026-06-25)

Database tier:
- https://poe2db.tw/us/Bows · /Additional_arrow · /Greater_Essence_of_Abrasion ·
  /Perfect_Essence_of_Abrasion · /Greater_Essence_of_Seeking · /Perfect_Essence_of_Seeking ·
  /Greater_Essence_of_Battle · /Greater_Essence_of_Ice · /Essence · /Omen ·
  /Omen_of_Sinistral_Crystallisation · /Omen_of_Sanctification · /Desecrated_Modifiers
- https://www.u4n.com/news/list-of-poe-2-bow-desecrated-modifiers.html (2025-09-03)

Guide tier:
- https://timesaver.gg/blog/poe2-fractured-phys-crit-bow-crafting-guide (2026-06-12/24, 0.5)
- https://www.aoeah.com/news/4613--poe-2-05-best-bow-crafting-crit--non-crit (2026-06-02)
- https://www.mmoexp.com/News/path-of-exile-2-the-complete-guide-to-crafting-your-endgame-crit-bow.html (2026-06-18)
- https://domistae.github.io/poe2-leveling/poe2_crafting_codex.html (0.5 codex)
- https://bugfree.gg/guides/poe2-crafting-changes-0-5-0 (2026-05-23)
- https://dadsofexile.com/recombinator · /prices (ratios only)

Market:
- https://poe2scout.com/api/poe2/Leagues (2026-08-20)

Rejected as stale/wrong-game:
- poeaffix.net (PoE1), exile.pub bow page (0.4.0), Steam guide 3415604016 (0.1),
  game8.co 547417 (pre-0.5 desecration)
