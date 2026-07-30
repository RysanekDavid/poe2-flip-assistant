# PoE2 Crafting Knowledge Base

**Patch stamp: 0.5.x (Runes of Aldur, 2026).** Built 2026-07-14 from two research rounds:
a targeted per-recipe verification (2026-07-13) and a 105-agent deep-research sweep with
3-vote adversarial verification per claim (23 sources → 112 claims → 25 verified: 21 confirmed,
4 refuted). Every entry carries confidence + sources. **Re-verify everything at patch 0.6** —
0.5.0 changed currency floors, 0.5.1 hotfixed fracture bypasses mid-league; pre-0.5 sources
actively contradict current values.

Purpose: the rules a profit-crafter must know BEFORE spending currency. Feeds the craft-margin
recipes/guides and (later) the RAG craft agent.

---

## 1. Currency — minimum modifier-level floors (CONFIRMED, unanimous)

Floors are **PER CURRENCY ITEM, not per tier**. Blanket "Greater=X / Perfect=Y" was
explicitly refuted (0-3 and 1-2 adversarial votes).

| Currency | Min modifier level | Notes |
|---|---|---|
| Greater Orb of Transmutation / Augmentation | **44** | lowered from 55 in patch 0.5.0 |
| Perfect Orb of Transmutation / Augmentation | **70** | GGG-moderator confirmed |
| Greater Exalted Orb | **35** | |
| Perfect Exalted Orb | **50** | stack 20, drop lvl 79 |
| Greater/Perfect Regal & Chaos | **UNVERIFIED** | no surviving claim — look up per item on poe2db before encoding |

Sources: poe2db.tw (data-mined), poe2wiki item pages, GGG 0.5.0 patch notes verbatim,
GGG moderator forum thread 3863869.

**Floors are SOFT — the safety valve (CONFIRMED, unanimous):** a floor never excludes a
modifier FAMILY entirely. If every tier of a family sits below the floor, the family's highest
tier (respecting ilvl) stays eligible (e.g. Light Radius top tier lvl 30 still rolls under a
70 floor; ES Recharge lvl 48 rolled from a Perfect Exalt — GGG-confirmed intended).
→ Tool warnings must say "cannot roll tiers below N", never "mod X cannot appear".
Sources: identical exception wording on all poe2wiki min-level currency pages; forum 3863566.

**Other currency facts:**
- **Chaos Orb (PoE2)** removes ONE random existing modifier and adds one new — NOT a full
  reroll. Targeted removal side: Omen of Sinistral (prefix) / Dextral (suffix) Erasure.
  (CONFIRMED 2026-07-13 round; u4n, Fextralife.)
- **Divine Orb** rerolls numeric values of ALL existing mods within their current tiers —
  cannot change tiers, cannot target a subset. (CONFIRMED; game8, mmojugg.)
- **Orb of Augmentation family** works on MAGIC items with an open affix only.

## 2. Fracturing Orb (CONFIRMED, unanimous)

- Target must be **RARE with ≥4 modifiers**; never unique/magic/normal/already-fractured.
- **One fracture per item, ever.**
- **Desecrated mods can't be fractured but DO count toward the 4-mod minimum** → the
  1/4→1/3 odds trick (keeper + 2 junk + 1 desecrated) is real and optimal.
- Fractured mod **values are Divine-proof** (bug fixed 0.2.0e). 0.5.1 hotfixes closed every
  un-fracture bypass (Runeforging; Fluxes; Passion/Breath/Ire/Betrayal of Aldur transforms).

Sources: poe2wiki Fracturing_Orb (edit history through 0.5.1), timesaver 0.5.4, vulkk, mobalytics.

## 3. Item-level → tier gates (partially CONFIRMED)

| Mod | Top tier | ilvl gate | Confidence |
|---|---|---|---|
| Fire/Cold/Light res (T1, +41–45%) | of Tzteosh/Haast/Ephij | **82** | CONFIRMED (poe2db+wiki tables) |
| Ele res T2 (+36–40%) | of Magma etc. | **71** | CONFIRMED |
| Chaos res top (+24–27%, of Bameth) | 6 tiers, ~5.3× rarer than ele res | **81** | CONFIRMED |
| Boots % Movement Speed | T1 35% @ **82**, T2 30% @ **65**, T3 25% @ 46 | data-mined | CONFIRMED (scrape:poe2db) |
| Ring flat fire/cold/light to Attacks | T1 @ **75** (9 tiers) | data-mined | CONFIRMED (scrape:poe2db) |

**The authority for ALL tier/ilvl gates is now `src/data/poe2dbTiers.json`** — 2,851 mod
families across 16 item-class pages, scraped straight from poe2db (data-mined game files) via
`npm run scrape:poe2db`. Re-run per patch. Prose sources got these wrong repeatedly; the
earlier "82/70 for all bases" guide claim resolves to 82/65.

→ ilvl-81 base can top chaos res but never top ele res. PoE2 in-game tier numbers count
UPWARD — "T1" in this doc = highest tier (PoE1 vernacular). A systematic poe2db scrape of
headline mods (MS, T1 life, %phys, flat ele) is still needed (open question).

## 4. Omens (verified subset)

- **Sinistral = prefix, Dextral = suffix** — applies to Exaltation, Annulment, Erasure,
  Crystallisation, Necromancy families. (CONFIRMED both rounds.)
- **Omen of Greater Exaltation**: next Exalt adds TWO mods.
- **Omen of Catalysing Exaltation**: next Exalt consumes ALL catalyst quality → tag-weight
  multiplier **5× at 20% quality, 7.5× at 40%** (40% only on Breach Rings). Weighted bias,
  NOT a guarantee. Counter-claim "figures unknown" refuted 0-3. Base catalyst quality alone
  only buffs mod MAGNITUDE, never roll weights.
- **Omens of the same action family STACK** (medium confidence, 2-1 vote): Dextral Exaltation +
  Greater Exaltation on one Perfect Exalt → two suffixes, both floor-50. Same documented for
  Sinistral + Greater Annulment. Reddit round adds: Whittling works ONLY with Chaos Orb (not
  Annulment); Whittling + Sinistral/Dextral Erasure stack; Necromancy+Liege+bone triple works;
  Necromancy does NOT pair with Essence of the Abyss (that wants Crystallisation — naming trap).
  **DISPUTE**: Catalysing + Greater Exaltation — wiki says the bias hits both added mods, multiple
  player reports say FIRST ONLY. Budget as first-only. See docs/kb/community-reddit.md §2.
- **Omen of Whittling — WALLET-KILLER (CONFIRMED, unanimous)**: removes the mod with the lowest
  **modifier LEVEL** (hidden in-game), NOT the lowest displayed tier. Unrevealed desecrated
  mods count as level 1 → always whittled first. Since 0.1.1: hovering the item with the omen
  active PREVIEWS the removal target — always check the preview.
- **Omen of Putrefaction**: next desecration replaces ALL mods with up to 6 unrevealed
  (desecrated-pool) mods **AND CORRUPTS the item** — quality + sockets must go on BEFORE.
- **Omen of Abyssal Echoes**: ONE reroll of the three offered reveal options (insurance, not
  auto-best-pick). (CONFIRMED 2026-07-13 round; Game8 quote.)
- **Omen of the Liege**: forces Amanamu desecrated mod, blocks Ulaman/Kurgal; weapons +
  jewellery only. (2026-07-13 round.)
- **Omen of Homogenising Exaltation**: drop-disabled in 0.4.0 — gone for current-league tooling.

## 5. Desecration (CONFIRMED core + gaps)

- **Max ONE desecrated modifier per item** (exception: Putrefaction's full replacement).
  A crafted (essence) mod and a desecrated mod CAN coexist.
- On a full 6-mod rare, a bone REMOVES a random mod (of the matching side) and replaces it.
- Bone → slot mapping (2026-07-13 round, single-source-ish): Jawbone=weapons/quivers,
  Rib=armour, Collarbone=amulet/ring/belt, Cranium=jewels.
- Bone tiers (LIVE-CONFIRMED in-game 2026-07-13 + guides): **Gnawed = item level ≤64**
  ("Item Level is too high" on higher), Preserved = any ilvl, Ancient = min mod level 40.
- Boss pools: **Amanamu bow Attack Speed = 12–18%** (Ulaman = 8–13%; a transcription mixed
  them up once). Amanamu suffix pool on bows: Attack Speed, Pierce (spirit-reservation
  unattested). (2026-07-13 round, medium.)
- **OPEN**: Well of Souls reveal ordering; whether picking a mod blocks its family from later
  reveals (do NOT bank on either behaviour — test on cheap bases).

## 6. Liquid Emotions (medium confidence)

- Tiers: Diluted → Potent/Concentrated → **Ancient** variants.
- **Ancient emotions work ONLY on rare Time-Lost jewels** (cannot instill amulets/waystones);
  non-Ancient tiers don't work on Time-Lost jewels. Both directions = wasted currency.
- Ancient Potent Liquid **Contempt** (jewels): removes a random mod + grants
  "+1 Suffix Modifier allowed" OR "+1 Prefix Modifier allowed" (which side ~random —
  determinism by jewel colour unresolved).
- Ancient Potent Liquid **Ferocity** (jewels): removes a random mod + grants
  "(40–60)% increased Effect of Suffixes" OR "…of Prefixes".
- **Non-Ancient Potent Liquid Contempt** on a rare BASIC jewel: removes a random mod + grants a
  **fixed damage crafted PREFIX keyed to jewel colour** — Sapphire→(7–13)% chaos dmg,
  Ruby→(5–15)% global phys, Emerald→(5–15)% elemental. It does NOT grant "+1 Modifier allowed"
  (that mod is Ancient-tier/Time-Lost only). (CONFIRMED 2026-07-15: sanctuaryrelic verbatim
  in-game text + game8 + poe2dictionary; refutes the aoeah "+1 slot on basic jewel" claim.)
- **Regular rare jewels cap at 4 explicit mods** (5 only via corruption) → a "budget 5-mod
  basic jewel" craft is impossible; the 5-mod path is Time-Lost + Ancient Contempt only.
  The `jewel_desecrated_liquid` recipe was deleted 2026-07-15 for exactly this.
- Desecration DOES work on regular rare jewels (Preserved Cranium targets any rare jewel).
- Sources: dadsofexile, Fextralife, Game8, sanctuaryrelic, poe2dictionary — poe2db check pending.

## 7. Essences & crafted-mod slot (CONFIRMED)

- **Max ONE crafted (essence-guaranteed) mod per item** in 0.5.x — Greater then Perfect
  essence stacking is dead; Essences/Perfect Essences/Imbued Alloys all write the same slot
  (Perfect/Alloy remove-then-replace). Removable via Annulment/Chaos (list non-exhaustive).
- Essence of **Insulation = FIRE resistance** (not generic/cold). Check each essence's actual
  mod before buying.
- Greater Essence of Seeking: guaranteed crit, magnitude scales by base (martial weapon
  +3.11–3.8% crit; staff 70–79% spell crit …). (2026-07-13 round.)

## 8. Catalysts (CONFIRMED)

13 types; tags: Xoph's=Fire, **Tul's=Cold**, Esh's=Lightning, Uul-Netol's=Phys,
Chayula's=Chaos, Flesh=Life, Neural=Mana, Carapace=Defences, Reaver=Attack, Sibilant=Caster,
Skittering=Speed, Adaptive=Attributes, Necrotic=Minion (0.5.2). Quality cap 20% on
rings/amulets (40% Breach Rings); switching catalyst type wipes existing quality; quality
buffs matching-tag mod magnitude (e.g. +60 life @20% Flesh → ~+72 effective) — roll-weight
bias exists ONLY via Omen of Catalysing Exaltation (see §4).

## 9. In-game-confirmed burns (our own testing)

- Gnawed Rib on ilvl 82 boots → **"Item Level is too high"** (bone tier cap). Use Preserved.
- Perfect Orb of Augmentation refused on a low-ilvl ring → per-currency floor 70 + aug needs
  a MAGIC item with an open affix. Buy ilvl 75+ magic bases.
- Putrefaction bases: existing mods are wiped — never pay for good mods on a putrefaction base;
  desecrated prefix pools follow the base's defence type (ES base → ES-flavoured prefixes).

## 9b. League economy & farm meta — 0.5 retrospective (XTheFarmerX league review, 2026-07)

Source: creator league review (single-source, practitioner-grade — the "zero to mirror" runner).

- **Inflation is structural**: mirrors 2k → 4k div in a week, ~7k by month two; single days moved
  700+ div. Root cause per the review: PoE2 has no serious DIVINE SINK (PoE1's meta-mod bench
  eats divines; PoE2 divines pile up). Expect div-denominated prices to drift ALL league.
- **"Real inflation"** = price inflation minus wage inflation — farm income (div/h) rises too,
  so mirror +300% ≈ real +100–200%. Tool idea: mirror price sparkline as an economy barometer;
  long-horizon prices better read in mirror-relative terms late league.
- **Confirmed-profitable 0.5 farm archetypes** (validates FarmAdvisor baskets): Deli splinter
  farms + 200% fog (pre-nerf); Abyss budget → high-end (Omen of Light + raw currency); Breach
  budget/high "blood" farms + ground-loot currency; **Expedition = money machine** (all-sagas
  high end, alch-and-go low end); Ritual = omen-guaranteed profit + HH/MB lottery; Temple snakes
  / Itzli(?) rushing.
- **Chase uniques HELD value** this league (HH 200→350 div weeks in; Rocky Atlas 100+ div,
  Garukhan/It-zeros 4–500 div late) — flip/watchlist implications: chase uniques are viable
  swing holds in 0.5-style leagues, unlike earlier leagues' fast decay.
- **Crafting meta summary (endgame)**: guarantee 1–2 mods (essence/desecration) + maybe the
  crafted mod, then exalt-and-pray; a miss costs 100+ div in Whittlings/Omens of Light —
  matches our EV model's hitRate framing.
- Tablets: ~40 div per juice setup, unsellable once partially used (9-use tablets have no
  market) — cost of juiced farming is front-loaded.

## 10. Open questions (next research round)

1. Greater/Perfect Regal & Chaos floors (poe2db lookup).
2. Per-base ilvl breakpoints for headline mods (systematic poe2db scrape — candidate for a
   `scrape:poe2db` script feeding this KB).
3. Well of Souls reveal ordering + family-blocking.
4. Omen compatibility matrix beyond documented pairs.
5. Vaal corruption outcome table; rune tiers/values; soul cores (nothing survived verification).
6. Creator tricks (Fubgun/XTheFarmerX/CzechCloud) — none verified yet; YouTube transcripts
   are the source material.

---

## TOP wallet-saving rules (ranked)

1. **Check the hover preview before Omen of Whittling** — it removes lowest modifier LEVEL,
   not lowest tier; the preview (since 0.1.1) shows the victim. Repeat reddit wallet-killer.
2. **Key currency floors by exact item**: Perfect Aug=70, Greater Aug/Transmute=44,
   Perfect Exalt=50, Greater Exalt=35. Floors are soft (family top-tier survives).
3. **ilvl gates**: ele res T1 needs 82, chaos res top needs 81, ele T2 needs 71 — an ilvl-81
   base can never hit top ele res. Buy 82+ when res tiers matter.
4. **Gnawed bones die above ilvl 64** — Preserved for endgame bases.
5. **Ancient liquids ↔ Time-Lost jewels only**; normal liquids don't touch those jewels.
   Buying the wrong tier = pure loss.
6. **Putrefaction corrupts** — quality + sockets FIRST; base's existing mods are irrelevant
   (buy the cheapest correct-defence-type rare).
7. **Fracture with a desecrated blocker**: 4-mod rare incl. 1 desecrated → 1-in-3 on the
   keeper instead of 1-in-4. One fracture per item, ever; fractured values are Divine-proof.
8. **PoE2 Chaos ≠ reroll** — it eats one random EXISTING mod. Filling empty slots = Exalts;
   removals under Sinistral/Dextral Erasure omens only.
9. **One crafted mod + one desecrated mod per item** — plan the whole sequence around those
   two slots before the first click.
10. **Divine rerolls everything** — only divine when every mod on the item deserves a reroll.
11. **Catalyst weight bias exists only through Omen of Catalysing Exaltation** (5×/7.5×);
    raw quality just inflates numbers (still worth 20 ex before listing — better filter hits).
12. **Abyssal Echoes = one reroll, not a guarantee** — budget it as insurance on already-good
    items, not as a per-reveal staple.
