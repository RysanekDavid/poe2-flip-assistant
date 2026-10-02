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

**Corrections 2026-10-01 (partial):** §6 "Still UNVERIFIED" (a) — Contempt's removal rule now
quotes GGG's 0.5.0 Liquid Emotions note and poe2db, states the likeliest model as unverified, and
restates the creator odds as estimates (S4 unsure between 33/66 and 50/50); an untested 3-mod
Contempt idea is logged there. The rest of the file is unchanged.

**Corrections 2026-10-01 (sources):** citations to real-money-trading shops were removed. The Chaos
Orb and Divine Orb facts (§1) were re-sourced from poe2db item text; the jewel affix cap (§6) is now
single-source (Maxroll) and the Time-Lost 3 + 3 claim is [unverified].

**Corrections 2026-10-01 (partial, crafts wave 3):** from the independent fact-check of nine creator
crafts — §1 Perfect Regal floor 50; §2 crafted alloy mods fracturable [single-source] and the
unrevealed-blocker note; §3 Dusk/Gloam Ring affix allowances; §4 Omen of Crystallisation on alloys
[unverified, creator/player-demonstrated], the omen being consumed by any essence, the Liege on belts,
Omen of Corruption no longer obtainable, Omen of Sanctification; §5 re-desecrating without Omen of
Light REFUTED; §7 the Astrid's Creativity exception [verified-primary]; §10 question 1 narrowed. The
rest of the file is unchanged.

**Corrections 2026-10-01 (partial, craft planner data):** §3 lists every base whose RePoE implicit
changes the prefix/suffix limits (not only Dusk/Gloam Rings); §8 adds the Refined Breach Ring's
"+25% to Maximum Quality" implicit and its literal 45% catalyst cap. The rest of the file is unchanged.

**Corrections 2026-10-02 (partial, craft theory + owner in-game tests):** §1 Chaos "no space" and
Greater Exaltation refusals; §2 fracture pick, fractured crafted mods; §4 Whittling ties/unrevealed
(owner-tested), Catalysing multiplier + Greater dispute, Erasure, Homogenising (0.5.0), Greater
Annulment (0.3.0), Echoes bug; §5 full-rare bone removal ("of the matching side" dropped), Ancient
floor, Well options, faction omens; §6 liquid removal side (owner-tested), fractured-liquid block,
Time-Lost 2 + 2 (gold-seller 3 + 3 dropped); §7 essence family conflict (owner-tested), Perfect side;
§8 catalyst gain, infusers, 60% Breach Ring; §9, §10, wallet rules. The rest is unchanged. Grades:
[owner in-game test] (owner clicked it, n given), [owner trade observation], [owner recall] (not
re-tested), [creator-demonstrated] (video + timestamp), [community] (forum link + n). A later independent fact-check pass (same day)
re-worded and re-graded §4 Catalysing + Greater, Echoes bug and Homogenising availability; §5 Well options and
faction omens; §7 forum quotes and the Perfect-essence test scope; §8 infuser scope and the Breach Ring citation.

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
| Perfect Regal Orb | **50** | [CONFIRMED by the 2026-10-01 independent fact-check against poe2db item data, [Perfect_Regal_Orb](https://poe2db.tw/us/Perfect_Regal_Orb)] |
| Greater Regal, Greater/Perfect Chaos | **UNVERIFIED** | no surviving claim — look up per item on poe2db before encoding |

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
  Item text: "Removes a random modifier and augments a Rare item with a new random modifier"
  (CONFIRMED; poe2db Chaos_Orb accessed 2026-10-01, Fextralife.)
- **Chaos "no space"**: on a 5-mod jewel with 3 suffixes over a 2-suffix cap, a Chaos Orb that picks
  a suffix is refused — "item has no space for more mods", item unchanged; a prefix pick rerolls
  normally [creator-demonstrated — LilBotQ [Hcb_HcWDUOA](https://www.youtube.com/watch?v=Hcb_HcWDUOA)
  19:42–19:56 (S29); also S4, S20]. The refused orb is NOT consumed [owner recall 2026-10-02, 5-mod
  Sapphire craft, not re-tested] → a planner prices refused clicks at 0.
- **Omen of Greater Exaltation + one open slot**: the Exalt is refused, "Item has no space for more
  mods when still have empty suffix" [community — [forum 3956903](https://www.pathofexile.com/forum/view-thread/3956903),
  n=1]. Whether anything is consumed is not stated [unverified].
- **Divine Orb** rerolls numeric values of ALL existing mods within their current tiers —
  cannot change tiers, cannot target a subset. Item text: "Randomises the numeric values of
  modifiers on an item" (CONFIRMED; game8, poe2db Divine_Orb accessed 2026-10-01.)
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

- Target must be **RARE with ≥4 modifiers**; never unique/magic/normal/already-fractured. Item
  text: "Fracture a random modifier on a rare item with at least 4 modifiers" [verified-primary —
  entity catalog, game data 0.5.5b]. A uniform pick among the eligible (non-desecrated) mods is the
  standard community assumption, never tested [unverified]; 1-in-3-style odds rest on it.
- **One fracture per item, ever.**
- **Crafted mods can be fractured** [single-source — creator-only: a Fracturing Orb landed on a
  crafted alloy mod (cast speed) on Belton's +4 wand, docs/kb/sources/transcripts/25 at 1:54–2:47
  and 15:30–15:43]. No item text says so either way; budget a crafted-mod fracture as possible.
- **A fractured crafted mod still counts as the crafted mod**: Liquid Contempt was refused, "This
  item already has a crafted mod.", because the fractured mod had been crafted by Concentrated Liquid
  Fear [community — [forum 3967316](https://www.pathofexile.com/forum/view-thread/3967316), 2026-06-17,
  n=1]. Fracturing a crafted mod uses up the one crafted-mod slot (§7) for good.
- Creators fracture with the desecrated blocker still UNREVEALED (four 2026 videos,
  docs/kb/sources/transcripts/25, 27, 28, 30). The "counts toward 4" rule below is confirmed for a
  desecrated mod; that an unrevealed one behaves the same is creator-demonstrated only.
- **Desecrated mods can't be fractured but DO count toward the 4-mod minimum** → the
  1/4→1/3 odds trick (keeper + 2 junk + 1 desecrated) is real and optimal.
- Fractured mod **values are Divine-proof** (bug fixed 0.2.0e). 0.5.1 hotfixes closed every
  un-fracture bypass (Runeforging; Fluxes; Passion/Breath/Ire/Betrayal of Aldur transforms).

Sources: poe2wiki Fracturing_Orb (edit history through 0.5.1), vulkk, mobalytics.

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

**Affix-allowance rings** [verified-primary — RePoE snapshot `base_items` implicits, game data
0.5.5b]: **Dusk Ring** = "+1 Prefix Modifier allowed" / "-1 Suffix Modifier allowed" (4 prefixes,
2 suffixes); **Gloam Ring** is the mirror (−1 prefix / +1 suffix; auto-captions spell it "gloom ring"). A four-flat-prefix attack ring
needs the Dusk Ring.

**Every affix-allowance base** [verified-primary — RePoE snapshot `base_items` implicits, game data
0.5.5b, read from the craft catalog 2026-10-01]: Dusk Ring / Dusk Amulet +1 prefix −1 suffix;
Gloam Ring / Gloam Amulet −1 prefix +1 suffix; Penumbra Ring / Penumbra Amulet "+2 Prefix Modifiers
allowed" / "-2 Suffix Modifiers allowed"; Tenebrous Ring / Tenebrous Amulet the mirror (−2 / +2);
Absent Amulet −1 prefix −1 suffix; Lament Amulet and Twisted Amulet −1 prefix; Portent Amulet and
Distorted Amulet −1 suffix. The Craft moves tool adds each implicit to the rare 3 + 3 (e.g. Penumbra
5 prefixes + 1 suffix), the same literal reading as the Dusk Ring above; what the implicits do to a
MAGIC item's 1 + 1 is [unverified], so the tool leaves that limit unknown.

→ ilvl-81 base can top chaos res but never top ele res. PoE2 in-game tier numbers count
UPWARD — "T1" in this doc = highest tier (PoE1 vernacular). Headline-mod coverage now comes from
the complete RePoE modifier and base-mapping exports rather than a selected PoE2DB HTML scrape.

## 4. Omens (verified subset)

- **Sinistral = prefix, Dextral = suffix** — applies to Exaltation, Annulment, Erasure,
  Crystallisation, Necromancy families. (CONFIRMED both rounds.)
- **Omen of Greater Exaltation**: next Exalt adds TWO mods.
- **Omen of Catalysing Exaltation**: "your next Exalted Orb will consume all Catalyst Quality to
  increase the chance of the corresponding type of Modifier" [verified-primary — entity catalog
  0.5.5b] — no number. The multiplier is a **community model, not GGG**: poe2wiki 5× at 20%, 7.5× at
  40%; Craft of Exile ×(1 + 0.2·Q) to Q = 20, +0.12 per point above → ×5 / ×7.4 / ×8.0 at 20 / 40 / 45
  [unverified]. Weighted bias, NOT a guarantee. Catalyst quality alone only buffs mod MAGNITUDE.
- **Omens of the same action family STACK** (medium confidence, 2-1 vote): Dextral Exaltation +
  Greater Exaltation on one Perfect Exalt → two suffixes, both floor-50. Sinistral + Greater
  Annulment too, but **Omen of Greater Annulment can no longer be obtained** — 0.3.0: "The following
  Omens can no longer be obtained: Omen of Greater Annulment, …" [verified-primary — [forum
  3826682](https://www.pathofexile.com/forum/view-thread/3826682), accessed 2026-10-02; absent from the
  0.5.5b entity catalog]. Reddit round adds: Whittling works ONLY with Chaos Orb (not Annulment);
  Whittling + Sinistral/Dextral Erasure stack; Necromancy+Liege+bone triple works; Necromancy does
  NOT pair with Essence of the Abyss (that wants Crystallisation — naming trap).
- **Catalysing + Greater Exaltation**: can be armed together (Diztoh [GDLDxn6yxEs](https://www.youtube.com/watch?v=GDLDxn6yxEs) 5:01–5:36 (S26), n=1).
  [forum 3849100](https://www.pathofexile.com/forum/view-thread/3849100) (n=3): combined with Sinistral/Dextral/Greater Exaltation omens, 0/3 hit the
  catalysed tag; OP suspects a bug. Effectiveness when combined is **[conflicting, anecdotal]**. Bias on BOTH mods is **[cf], no data**: "the Omen's
  apply to both rolls" ([forum 3864526](https://www.pathofexile.com/forum/view-thread/3864526), n=1, untested) vs reddit "first only"
  (docs/kb/community-reddit.md §2). Budget **first-mod-only**.
- **Sinistral/Dextral Erasure** limits only the REMOVAL: "your next Chaos Orb will remove only prefix
  [suffix] modifiers" [verified-primary — entity catalog 0.5.5b]; the added mod can land on either side.
- **Omen of Whittling — WALLET-KILLER (CONFIRMED, unanimous)**: "your next Chaos Orb will remove
  the lowest level modifier" [verified-primary — entity catalog 0.5.5b] — lowest **modifier LEVEL**
  (hidden), NOT lowest tier; Chaos only. Since 0.1.1 the hover preview (omen active) shows the target.
  **Ties**: every tied lowest-level mod is highlighted yellow, footer "Modifiers in Yellow may be
  removed" — any of them can go [owner in-game test 2026-10-02: T15 Waystone, 6 same-level mods, all
  6 yellow; screenshot]. Uniform pick assumed [unverified] → P = 1 / (tied removable mods).
  **Unrevealed desecrated** = lowest: on a rare Prismatic Ring (ilvl 82) with an unrevealed Preserved
  Collarbone suffix, only that mod was highlighted [owner in-game test 2026-10-02, n=1]; guides say
  level 1 [single-source — dadsofexile].
- **Omen of Putrefaction**: next desecration replaces ALL mods with up to 6 unrevealed
  (desecrated-pool) mods **AND CORRUPTS the item** — quality + sockets must go on BEFORE.
- **Omen of Abyssal Echoes**: "you can reroll the options once" [verified-primary — entity catalog 0.5.5b] — one fresh set of three, not six options;
  insurance, not auto-best-pick. **Bug**: arm it after a reveal and re-reveal, the reroll option is missing, and removing the item from the Well "will
  eat up the omen even though you never got to actually use it" [community bug report — [forum
  3861139](https://www.pathofexile.com/forum/view-thread/3861139), 2025-09-28, n=1]. Arm it before the first reveal.
- **Omen of the Liege**: forces an Amanamu desecrated mod; weapons +
  jewellery only. (2026-07-13 round.) **Belts count as jewellery** for it [single-source —
  creator footage, ASaVeQ, docs/kb/sources/transcripts/23 at 12:58–13:34: Dextral Necromancy +
  Liege + Preserved Collarbone on a belt revealed fire + chaos resistance; consistent with RePoE's
  Amanamu belt suffix "+(13—17)% to Fire and Chaos Resistances", not stated in any item text].
- **Omen of Sinistral/Dextral Crystallisation on ALLOYS** [unverified — creator/player-demonstrated,
  not documented]: the omen text names only "your next Perfect or Corrupted Essence", yet players
  and creators steer Verisium alloys with it (forum
  [3949532](https://www.pathofexile.com/forum/view-thread/3949532); Belton's +4 wand at 0:51–1:20,
  ASaVeQ's Dusk Ring at 17:12–17:21 — docs/kb/sources/transcripts/25, 27). GGG may treat it as a
  bug; every recipe that relies on it lists that in its breaks_when.
- **A Crystallisation omen is consumed by ANY essence**, Greater included [single-source — forum
  [3851940](https://www.pathofexile.com/forum/view-thread/3851940)]: activate it only after the
  Greater essence step.
- **Omen of Corruption** ("your next Vaal Orb will always result in change", entity catalog 0.5.5b)
  still exists in the game data but **can no longer be obtained** [verified-primary — 0.5.0 patch
  notes, [forum 3932540](https://www.pathofexile.com/forum/view-thread/3932540), per the 2026-10-01
  fact-check]. Don't build a recipe on it.
- **Omen of Sanctification**: "your next Divine Orb used on a Rare item will Sanctify it"
  [verified-primary — entity catalog 0.5.5b]. Creators use it as an end gamble; values can roll
  down as well as up (creator footage, docs/kb/sources/transcripts/30 at 22:29–23:10).
- **Omen of Homogenising Exaltation / Coronation**: 0.5.0 — "The following items only appear on the Currency Exchange in Standard Leagues: Omen of
  Corruption, Omen of Homogenising Coronation, and Omen of Homogenising Exaltation." [verified-primary — [forum
  3932540](https://www.pathofexile.com/forum/view-thread/3932540), accessed 2026-10-02]. So: not listed on league Currency Exchange; whether they
  still drop in leagues is not stated (unverified); poe2wiki says drops stopped in 0.4.0. Omen of Corruption "can no longer be obtained".

## 5. Desecration (CONFIRMED core + gaps)

- **Max ONE desecrated modifier per item** (exception: Putrefaction's full replacement). The game
  refuses a second: "Items with Desecrated Modifiers cannot be Desecrated again"; the 0.5.0 notes
  limit items "to 1 Desecrated modifier" [verified-primary — game message and 0.5.0 patch notes
  ([forum 3932540](https://www.pathofexile.com/forum/view-thread/3932540)) as quoted in the
  2026-10-01 fact-check]. So **re-desecrating over an existing desecrated mod without Omen of Light
  does NOT work** — strip it first (Omen of Light + Orb of Annulment).
  A crafted (essence) mod and a desecrated mod CAN coexist.
- On a full 6-mod rare, a bone removes a random mod: "If modifiers are full then a random modifier
  is also removed" [community — [forum 3854165](https://www.pathofexile.com/forum/view-thread/3854165),
  n=1]; no same-side rule is documented. With Sinistral Necromancy the removed mod was a prefix
  [creator-demonstrated — [qATcKacI83o](https://www.youtube.com/watch?v=qATcKacI83o) 2:54–2:59, n=1].
- Bone → slot mapping: Jawbone=weapons/quivers, Rib=armour, Collarbone=amulet/ring/belt,
  Cranium=jewels [verified-primary — poe2db item text, docs/kb/desecration-abyss.md].
- Bone tiers (LIVE-CONFIRMED in-game 2026-07-13 + guides): **Gnawed = item level ≤64**
  ("Item Level is too high" on higher), Preserved = any ilvl, Ancient = "Minimum Modifier Level: 40"
  [verified-primary — [poe2db Ancient_Jawbone](https://poe2db.tw/us/Ancient_Jawbone), 2026-10-02].
- **Well of Souls**: three distinct options (0.3.0 notes: "selecting one of three different options") [verified-primary — [forum
  3826682](https://www.pathofexile.com/forum/view-thread/3826682)]; whether they are distinct families/groups is unverified. Mod-group exclusion
  applies — Belton reveals elemental damage to block fire/lightning/chaos % [creator-demonstrated —
  [j0FeuX0NZQI](https://www.youtube.com/watch?v=j0FeuX0NZQI) 2:50–3:06].
- **Faction omens**: **Official**: guarantees *a* random [faction] modifier (poe2db
  [Omen_of_the_Sovereign](https://poe2db.tw/us/Omen_of_the_Sovereign) / [Omen_of_the_Liege](https://poe2db.tw/us/Omen_of_the_Liege) text, singular)
  [verified-primary]. **Community** ([forum 3956293](https://www.pathofexile.com/forum/view-thread/3956293) seaman;
  [Gamerant](https://gamerant.com/path-of-exile-2-ulaman-amanamu-kurgal-modifiers-explained/) 2025-09-02): on jewellery all 3 options are normally
  from the faction. Creators: the target faction mod is a near-certain hit (ASaVeQ [IgQX6EZtUyo](https://www.youtube.com/watch?v=IgQX6EZtUyo)
  11:51–12:29; [hQm2IwebFws](https://www.youtube.com/watch?v=hQm2IwebFws) 7:40–7:48), which is not evidence for "all 3 options". **Existing mod groups
  can block faction mods**, in which case none are offered: Liege on a wand with spell + physical spell damage offered no Amanamu mod — "Amanamu's
  mods shared the same mod group as spell dmg and phy spell dmg" [community — forum 3956293, n=1] — so mod-group exclusion applies to reveals.
- Boss pools: **Amanamu bow Attack Speed = 12–18%** (Ulaman = 8–13%; a transcription mixed
  them up once). Amanamu suffix pool on bows: Attack Speed, Pierce (spirit-reservation
  unattested). (2026-07-13 round, medium.)
- **OPEN**: Well of Souls reveal ordering; whether picking a mod blocks its family from later
  reveals (do NOT bank on either behaviour). Creators loop Light → re-desecrate until the mod shows
  (LilBotQ S29 16:22–17:41) — fits "no lasting block", proves nothing.

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
- **Affix caps**: rare basic jewel = 2 prefixes + 2 suffixes, magic = 1 + 1 [single-source:
  Maxroll 0.5.2 jewel guide; researcher pass accessed 2026-09-29]. **Rare Time-Lost jewel = 2 + 2**
  too [owner trade observation 2026-10-02: rare Time-Lost Sapphires listed at 2 + 2, none at 3 + 3;
  creator-demonstrated — [qATcKacI83o](https://www.youtube.com/watch?v=qATcKacI83o) 2:25–2:34,
  8:13–9:00; LilBotQ S29 18:13]; no primary text. A 3rd suffix only via the over-cap Ancient Contempt
  route (one 3S + 2P listing, a prefix being crafted Ancient Melancholy). The gold-seller 3 + 3 is dropped.
- **5-mod basic jewel is possible**: basic jewels cap at 2 prefixes + 2 suffixes, but Contempt's
  crafted mod raises one side's cap by 1 while sitting on the other. Creator crafts [S4, S20 in
  docs/kb/creator-videos.md] then strip the crafted mod with Omen of Sinistral Annulment and
  keep 3 suffixes + 2 prefixes (chaos then shows "item has no space for more mods" on the suffix side, §1).
  The `jewel_desecrated_liquid` deletion (2026-07-15) rested on the refuted claim; the paths now
  live as `jewel_liquid_5mod_budget` / `jewel_fractured_5mod`.
- **Liquid removal side = the crafted mod's side.** 0.5.0: "Liquid Emotions can now be used to craft
  additional mods on Jewels. These work similarly to greater essences, each having a set of specific
  mods that will replace a random existing mod on the item." [verified-primary — [forum
  3932540](https://www.pathofexile.com/forum/view-thread/3932540), poe2db] — not WHICH mod. In play the
  crafted mod is picked among the sides that can take it, then a random removable mod goes from THAT
  side [owner in-game test, craft of 2026-10-01: 6× Potent Contempt on a Sapphire (fractured suffix,
  crit-chance suffix, 2 prefixes) — 5× "+1 Prefix" removed the crit suffix, 1× "+1 Suffix" removed a
  prefix, 6/6; creator-demonstrated ~8/8 — LilBotQ [Hcb_HcWDUOA](https://www.youtube.com/watch?v=Hcb_HcWDUOA)
  3:08–3:22, 20:21–20:32; S4; qATcKacI83o 2:25]. So "+1 Prefix" always costs the loose suffix. Odds
  ~50/50 [unverified estimate]; streaks of "10 or 11 in a row … + 1 Prefix every time" [community —
  [forum 3958506](https://www.pathofexile.com/forum/view-thread/3958506), 3 posters, mod lists not
  given] hint that some item states force an outcome [unverified inference].
- **UNKNOWN — Contempt at 3 mods, no removable suffix** (fractured suffix + 2 prefixes): untested
  (owner test T7). Not a recipe step.
- **Over-cap 3rd suffix survives removing "+1 Suffix"**: creator-demonstrated [S4, S20]; same stop
  condition as docs/kb/desecration-abyss.md "Time-Lost limitation".
- **Liquids obey the one-crafted-mod rule**: refused with "This item already has a crafted mod.",
  even by a FRACTURED liquid-crafted mod [community — forum 3967316, n=1, §2]. Strip Contempt before
  Ferocity.
- Desecration DOES work on regular rare jewels (Preserved Cranium targets any rare jewel).
  Cranium exists ONLY as the Preserved tier ("Desecrates a Rare Jewel" — RePoE
  `AbyssalBenchTicketJewel`; no Gnawed/Ancient Cranium in the catalog), and every bone's
  directions read "left click a Rare item" → bones are rare-only.
- Earlier sources: dadsofexile, Fextralife, Game8, sanctuaryrelic, poe2dictionary; superseded on
  the Potent/Ancient mod pools by poe2db + RePoE (above).

## 7. Essences & crafted-mod slot (CONFIRMED)

- **Max ONE crafted (essence-guaranteed) mod per item** in 0.5.x, **except with Astrid's
  Creativity**: that augment reads "All Equipment: Can have 1 additional Crafted Modifiers"
  [verified-primary — [poe2db Astrids_Creativity](https://poe2db.tw/us/Astrids_Creativity), accessed
  2026-10-01 in the fact-check; entity catalog: "Place into an empty Augment Socket in any
  Equipment"]. It is replaceable by another augment; whether the second crafted mod survives that
  swap is untested. Without it, Greater then Perfect essence stacking is dead; Essences/Perfect Essences/Imbued Alloys all write the same slot
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
  accessed 2026-09-30)]. The essence's own item text does not say so.
- **Same family on the item → Greater essence refused**: "Failed to apply item: This item already has a mod of this type." (exact wording from owner
  test T3), item unchanged [owner in-game test T3 2026-10-02: magic Amethyst Ring with an 18% rarity suffix + Greater Essence of Opulence,
  screenshots; community — [forum 3860648](https://www.pathofexile.com/forum/view-thread/3860648), player OP, no staff, "the item already has a mod of
  this type", n=1; Diztoh S26 6:20–6:33]. The thread's "suffix slot taken" reading loses to the Maxroll example above (Ruin adds a suffix next to a
  resistance suffix). Essence consumed? "Failed to apply" suggests not [unverified].
- **UNKNOWN — Perfect/corrupted essence on an item with that family**: untested (T3 covered Greater essences only).
- **Perfect essence removal side**: by default the side it adds to — "They remove either a suffix or prefix, depending on what they can add."
  [community, n=1 — [forum 3853903](https://www.pathofexile.com/forum/view-thread/3853903)]. Sinistral/Dextral Crystallisation overrides it: "your
  next Perfect or Corrupted Essence will remove only Prefix [Suffix] modifiers" [verified-primary — entity catalog 0.5.5b]; ASaVeQ: Dextral
  Crystallisation + Essence of the Breach (prefix) removes a suffix [creator-demonstrated — S27 11:40–11:49].
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
bias exists ONLY via Omen of Catalysing Exaltation (see §4). The Breach Ring's extra 20% is its
implicit "+20% to Maximum Quality"; the **Refined Breach Ring** carries "+25% to Maximum Quality"
[verified-primary — RePoE snapshot `base_items` implicits, game data 0.5.5b], so its cap reads as
45% [single-source — the implicit text read literally, not tested in game]. Above 40% quality only
the community Catalysing models exist (§4: ×7.4–7.5 at 40, ×8.0 at 45) [unverified].

- **Quality per catalyst** falls with item level (poe2wiki); GGG publishes no curve. Community
  formula (Craft of Exile via [huythinh2507/poe2crafting PR 6](https://github.com/huythinh2507/poe2crafting/pull/6)):
  round(clamp(30·e^(−ilvl/30) − 0.3, 1, 20)), a 1 becoming 2 about one time in five → ilvl ≤61 4%+,
  62–71 3%, 72–84 2%, 85+ 1% [unverified]. Creator counts roughly fit (Diztoh S26 4:26–4:47, 18 Tul's
  to 20%; ASaVeQ [8boqwYQZv5s](https://www.youtube.com/watch?v=8boqwYQZv5s) 21:03–21:14). "5% per use"
  sites are wrong. Don't show catalyst counts as facts.
- **Infusers**: "exceeding maximum quality by up to 10% with a chance of Corrupting it … Can only be used on items at or above maximum quality." (Vaal
  Catalysing Infuser) [verified-primary — entity catalog 0.5.5b]; 0.5.0: "All Infusers can only be used on items at or above 20% Quality."
  [verified-primary — forum 3932540]. Risk model: each 1% over max ≈ +5% fail (corrupt) chance (first use at max never fails), ~1 use in 5 gives +2%
  [creator, observed on armour infusers; assumed to carry over to Catalysing — Belton [c86fCKMMShI](https://www.youtube.com/watch?v=c86fCKMMShI)
  12:30–13:00, 14:41–15:01, his estimate]; ASaVeQ's "it will never corrupt" at exactly max (S27 12:39–12:46) fits it.
- **Breach Ring 60% path**: 20% + the +20% implicit + Essence of the Breach's +20% mod = **60%**; the essence mod can then be removed and the quality
  stays [owner trade observation 2026-10-02: 60% Breach Rings common (1–2 div), no essence mod shown; ASaVeQ
  [CZepweLtKwA](https://www.youtube.com/watch?v=CZepweLtKwA) 11:33–13:05 shows the pattern on a Dusk Ring (Essence of the Breach, catalyse to 40,
  infuser to 41, Whittling strips the essence mod). 60% on a Breach Ring = 20+20 implicit+20 essence: inferred, seen in the owner's T12 trade
  listings, not shown by the creator]. Max seen **70%** (2 listings) ≈ 60% + infusers [owner trade observation 2026-10-02].

## 9. In-game-confirmed burns (our own testing)

- Gnawed Rib on ilvl 82 boots → **"Item Level is too high"** (bone tier cap). Use Preserved.
- Perfect Orb of Augmentation refused on a low-ilvl ring → per-currency floor 70 + aug needs
  a MAGIC item with an open affix. Buy ilvl 75+ magic bases.
- Putrefaction bases: existing mods are wiped — never pay for good mods on a putrefaction base;
  desecrated prefix pools follow the base's defence type (ES base → ES-flavoured prefixes).
- 2026-10-01/02: same-family Greater essence refused (§7); Whittling preview ties and unrevealed
  desecrated mods (§4); 6 Contempt slams, removal always on the crafted mod's side (§6).

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

1. Greater Regal and Greater/Perfect Chaos floors (poe2db lookup). Perfect Regal = 50 (§1).
2. Verify per-base ilvl breakpoints for headline mods against each new RePoE snapshot.
3. Well of Souls reveal ordering + family-blocking; distinct-family options (owner test T8).
4. Omen compatibility matrix beyond documented pairs; Catalysing on both Greater mods (T10). Owner
   tests also open: 3-mod Contempt (T7), Perfect essence same family + essence consumption (T3),
   catalyst gain by ilvl (T4), fracture pick distribution (T9).
5. Vaal corruption outcome table; rune tiers/values; soul cores (nothing survived verification).
6. Creator tricks (Fubgun/XTheFarmerX/CzechCloud) — none verified yet; YouTube transcripts
   are the source material.

---

## TOP wallet-saving rules (ranked)

1. **Check the hover preview before Omen of Whittling** — it removes lowest modifier LEVEL,
   not lowest tier; if SEVERAL mods are yellow, any one can go (owner-tested, §4).
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
11. **Catalyst weight bias exists only through Omen of Catalysing Exaltation** (~5× at 20%,
    ~7.4–7.5× at 40%, community models); raw quality just inflates numbers (still worth 20 ex).
12. **Abyssal Echoes = one reroll, not a guarantee** — insurance on already-good items, not a
    per-reveal staple; arm it before the first reveal (§4).
13. **Same-family Greater essence = refused**; a fractured liquid-crafted mod blocks further
    liquids (§2, §6, §7).
