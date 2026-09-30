# PoE2 Crafting Knowledge Base

**Patch stamp: 0.5.x (Runes of Aldur, 2026).** Built 2026-07-14 from two research rounds:
a targeted per-recipe verification (2026-07-13) and a 105-agent deep-research sweep with
3-vote adversarial verification per claim (23 sources → 112 claims → 25 verified: 21 confirmed,
4 refuted). Every entry carries confidence + sources. **Re-verify everything at patch 0.6** —
0.5.0 changed currency floors, 0.5.1 hotfixed fracture bypasses mid-league; pre-0.5 sources
actively contradict current values.

**Corrections 2026-09-29 (partial):** the Orb of Alchemy and Orb of Annulment targets (§1) and the
Lesser/regular/Greater essence target (§7) were added from datamined item text in the entity catalog `src/data/poe2/entities.json.gz` (game data 0.5.5b)
and poe2db. The rest of the file is unchanged.

**Corrections 2026-09-30 (partial):** §7 — whether a Lesser/regular/Greater essence keeps a magic
item's mods moved from [unverified] to verified-secondary (Maxroll + the Regal Orb item text); the
essence-vs-existing-family case stays open. The rest of the file is unchanged.

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
- **Orb of Alchemy** works on a NORMAL **or** MAGIC item and makes it rare with 4 random mods; a
  magic item's own mods are discarded, not kept. Item text: "Upgrades a Normal or Magic item to a
  Rare item with 4 random modifiers" / "Right click this item then left click a normal or magic
  item to apply it. Current modifiers are not retained." [verified-primary — entity catalog `src/data/poe2/entities.json.gz` (game data 0.5.5b);
  [poe2db Orb_of_Alchemy](https://poe2db.tw/us/Orb_of_Alchemy), accessed 2026-09-29]
- **Orb of Annulment** removes one random mod from a MAGIC **or** RARE item. Item text: "Removes a
  random modifier from an item" / "Right click this item then left click on a magic or rare item
  to apply it." [verified-primary — entity catalog `src/data/poe2/entities.json.gz` (game data 0.5.5b);
  [poe2db Orb_of_Annulment](https://poe2db.tw/us/Orb_of_Annulment), accessed 2026-09-29]

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
| Boots % Movement Speed | T1 35% @ **82**, T2 30% @ **65**, T3 25% @ 46 | data-mined | CONFIRMED (RePoE snapshot) |
| Ring flat fire/cold/light to Attacks | T1 @ **75** (9 tiers) | data-mined | CONFIRMED (RePoE snapshot) |

**The authority for tier/ilvl gates is the complete versioned RePoE snapshot under
`src/data/poe2/repoe/`.** Refresh it with `npm run sync:poe2-data`. It includes all base items,
modifiers, base mappings, classes, skills, augments, tags and uniques rather than selected HTML
pages. Re-run per patch. Prose sources got these wrong repeatedly; the
earlier "82/70 for all bases" guide claim resolves to 82/65.

→ ilvl-81 base can top chaos res but never top ele res. PoE2 in-game tier numbers count
UPWARD — "T1" in this doc = highest tier (PoE1 vernacular). Headline-mod coverage now comes from
the complete RePoE modifier and base-mapping exports rather than a selected PoE2DB HTML scrape.

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
- **Potent Liquid Contempt** (non-Ancient) on a rare BASIC jewel (Ruby/Sapphire/Emerald/Diamond):
  "Removes a random modifer and Augments a Rare Basic Jewel with a new guaranteed Crafted
  modifier" (sic). The crafted mod is **"+1 Suffix Modifier allowed"** (occupies a PREFIX slot)
  or **"+1 Prefix Modifier allowed"** (occupies a SUFFIX slot), on all four colours.
  (CONFIRMED 2026-09-28, two sources: [poe2db Potent_Liquid_Contempt](https://poe2db.tw/us/Potent_Liquid_Contempt)
  accessed 2026-09-28; our datamined RePoE catalog `src/data/poe2/repoe/catalog-*.json.gz` →
  `base_items["Metadata/Items/Currency/EndgameDistilledEmotion3"].properties.description`, same
  text, plus `mods.CraftedJewelAdditionalSuffixAllowed` = text "+1 Suffix Modifier allowed",
  `generation_type: prefix`, and `mods.CraftedJewelAdditionalPrefixAllowed` = "+1 Prefix Modifier
  allowed", `generation_type: suffix`; both group `MaxPrefixMaxSuffix`, domain `misc`, spawn
  weight 0 = currency-granted only.) Slot placement: poe2db's "Prefix: +1 Suffix Modifier
  allowed" / "Suffix: +1 Prefix Modifier allowed" labels + RePoE `generation_type`. That it then
  opens the OTHER side rests on one primary source (RePoE stat ids
  `local_maximum_suffixes_allowed_+` / `…prefixes…`) plus creator in-game demos [S4, S20] —
  single-primary-source interpretation. **REFUTES** the 2026-07-15 entry that said non-Ancient
  Contempt grants a fixed colour-keyed damage prefix and that "+1 Modifier allowed" is
  Ancient/Time-Lost only — the "(7–13)% chaos damage" it quoted is the ordinary natural Sapphire
  prefix `JewelChaosDamage`, not a Contempt mod.
- **Potent Liquid Ferocity** (non-Ancient) on a rare BASIC jewel: same removal wording; crafted
  mod **"(40–60)% increased Effect of Suffixes"** (PREFIX slot) or **"(40–60)% increased Effect
  of Prefixes"** (SUFFIX slot), all four colours. (CONFIRMED 2026-09-28: [poe2db
  Potent_Liquid_Ferocity](https://poe2db.tw/us/Potent_Liquid_Ferocity) accessed 2026-09-28 + RePoE
  `EndgameDistilledEmotion2` description and `mods.CraftedJewelSuffixEffect` (prefix) /
  `CraftedJewelPrefixEffect` (suffix).)
- **Potent Liquid Melancholy** (non-Ancient, basic jewel): colour-keyed conditional SUFFIX —
  Ruby "Debilitate … Emerald and Sapphire socketed", Sapphire "Elemental Exposure … Ruby and
  Emerald", Emerald "Blind … Ruby and Sapphire". (poe2db Potent_Liquid_Melancholy accessed
  2026-09-28 + RePoE `CraftedJewel*OnHitWhile*Socketed` mods.) RePoE also holds
  `CraftedJewelMaximumChaosResistance` ("+1% to Maximum Chaos Resistance", suffix, currency-only)
  with no colour on poe2db's Melancholy page — plausibly Diamond Potent Melancholy, but
  UNATTRIBUTED (no source links it to any liquid). All three Potent liquids also
  instil amulets at The Withered Willow (catalog `directions` text).
- Ancient Potent Liquid **Contempt** (rare Time-Lost jewels): the same "+1 Suffix Modifier
  allowed" (prefix slot) / "+1 Prefix Modifier allowed" (suffix slot) pair on all four colours —
  the catalog has ONE mod per side, shared by both tiers. (poe2db Ancient_Potent_Liquid_Contempt
  accessed 2026-09-28 + RePoE `EndgameDistilledEmotionTimeLost3`.)
- Ancient Potent Liquid **Ferocity** (rare Time-Lost jewels): **NOT** "Effect of Suffixes" (the
  earlier entry was wrong) — a colour-keyed radius SUFFIX "Notable Passive Skills in Radius also
  grant +(5–7)% to Fire/Cold/Lightning Resistance" (Diamond: +(4–5)% Chaos per poe2db and RePoE
  `CraftedJewelRadiusChaosResistance`; Game8 says (5–7)% — CONFLICT, trust the datamine). Ancient
  **Melancholy** = "Upgrades Radius to Very Large" (prefix). (poe2db Ancient_Potent_Liquid_Ferocity
  / _Melancholy accessed 2026-09-28 + RePoE `CraftedJewelRadius*Resistance` /
  `CraftedJewelRadiusExtraLargeSize`.)
- **Affix caps**: rare basic jewel = 2 prefixes + 2 suffixes, magic = 1 + 1 [verified-secondary:
  Maxroll 0.5.2 jewel guide, mmoexp; researcher pass accessed 2026-09-29]. Rare Time-Lost cap is
  UNRESOLVED (timesaver claims 3 + 3, uncorroborated).
- **5-mod basic jewel is possible**: basic jewels cap at 2 prefixes + 2 suffixes, but Contempt's
  crafted mod raises one side's cap by 1 while sitting on the other. Creator crafts [S4, S20 in
  docs/kb/creator-videos.md] then strip the crafted mod with Omen of Sinistral Annulment and
  keep 3 suffixes + 2 prefixes (chaos then shows "no space for modifiers" on the suffix side).
  The `jewel_desecrated_liquid` deletion (2026-07-15) rested on the refuted claim; the paths now
  live as `jewel_liquid_5mod_budget` / `jewel_fractured_5mod`.
- **Still UNVERIFIED** (no primary source, catalog can't settle it): (a) whether the removed mod
  is chosen first and the crafted mod then takes ITS side (creators report the "+1 Prefix"
  variant always costs a suffix — 50/50, or ~1-in-3 with a fractured suffix [S4]); (b) that the
  over-cap 3rd suffix survives removing the "+1 Suffix" mod (creator-demonstrated only — same stop
  condition as docs/kb/desecration-abyss.md "Time-Lost limitation"); (c) the crafted-mod limit:
  both liquids write a [Crafted] mod and §7 allows ONE per item, so Ferocity presumably can't be
  added while the Contempt mod is present — every documented path strips Contempt first; untested.
- Desecration DOES work on regular rare jewels (Preserved Cranium targets any rare jewel).
  Cranium exists ONLY as the Preserved tier ("Desecrates a Rare Jewel" — RePoE
  `AbyssalBenchTicketJewel`; no Gnawed/Ancient Cranium in the catalog), and every bone's
  directions read "left click a Rare item" → bones are rare-only.
- Earlier sources: dadsofexile, Fextralife, Game8, sanctuaryrelic, poe2dictionary; superseded on
  the Potent/Ancient mod pools by poe2db + RePoE (above).

## 7. Essences & crafted-mod slot (CONFIRMED)

- **Max ONE crafted (essence-guaranteed) mod per item** in 0.5.x — Greater then Perfect
  essence stacking is dead; Essences/Perfect Essences/Imbued Alloys all write the same slot
  (Perfect/Alloy remove-then-replace). Removable via Annulment/Chaos (list non-exhaustive).
- **Targets:** Lesser, regular and Greater essences upgrade a MAGIC item to rare, adding their
  guaranteed mod; no essence applies to a normal item. Item text on every one of them: "Upgrades a
  Magic item to a Rare item, adding a guaranteed modifier" / "Right click this item then left
  click a Magic item to apply it." Perfect essences and the Delirium, Horror, Hysteria, Insanity,
  Abyss and Breach essences read "Removes a random modifier and augments a Rare item with a new
  guaranteed modifier" / "… left click a Rare item to apply it." [verified-primary — entity catalog `src/data/poe2/entities.json.gz` (game data 0.5.5b),
  all 82 essences; [poe2db Essence_of_the_Body](https://poe2db.tw/us/Essence_of_the_Body),
  accessed 2026-09-29]. A Lesser/regular/Greater essence KEEPS the magic item's own mods and adds
  its guaranteed one, like a Regal Orb [verified-secondary — Maxroll "How to Craft in PoE2"
  (ZiggyD, last updated 2026-06-18, written for 0.5.2): "Greater Essences, act the same way as
  regals (upgrading Magic to Rare), but with a specific and guaranteed third Modifier!", with a
  worked example that keeps a magic boot's 35% Movement Speed and resistance suffix through a
  Greater Essence of Ruin ([maxroll](https://maxroll.gg/poe2/resources/how-to-craft-in-path-of-exile-2),
  accessed 2026-09-30); the Regal Orb item text it is compared to: "Current modifiers are retained
  and a new one is added" (entity catalog, game data 0.5.5b; [poe2db Regal_Orb](https://poe2db.tw/us/Regal_Orb),
  accessed 2026-09-30)]. The essence's own item text does not say so. NOT covered: what happens
  when the essence's guaranteed mod shares a family with a mod already on the item [unverified].
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
2. Verify per-base ilvl breakpoints for headline mods against each new RePoE snapshot.
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
