# Golden set: crafts the planner cannot express (2026-10-07)

Real creator crafts that did not get a golden file, or got one with part of the target left out. Each line says what blocks it.

## No golden file: the planner cannot express the target

| Craft | Source | Blocker |
|---|---|---|
| Bow / spear / quarterstaff Amanamu craft (owner's guide series) | ZEXG6K_7Nyg (XTheFarmerX) | Planner classes are Rings, Amulets, Belts, Jewels only |
| Putrefaction slot machine, boots / body armour (owner's guide series) | Gdc5I2BmBGY (XTheFarmerX) | Class not planned; Omen of Putrefaction + rib has no planner method |
| Belton's 70% quality caster Breach Ring ("one mirror ring") | x_Wt8jOXVtY | Base carries drop-only "+1 to Level of all Spell Skills" (Genesis tree) and ring "mana cost efficiency", neither in the planner ring pool; quality 70% needs Vaal infusers (no method). Counted: 76 Omens of Light, 15-17 Hinekora's Locks |
| Fre drik's rarity-fracture attack ring | nyLcWFR3gHg | No natural ring attack speed in the catalog (0.5.5b); he shows Swift Alloy + Dextral Crystallisation, the source is unresolved (essence or alloy, archetype.json) and the planner has no method for it; the video also states no count or cost |
| LilBotQ budget Emeralds (niche + Twister) | Hcb_HcWDUOA 3:35-9:16 | Concentrated Liquid Fear crafted suffix has no planner method; the bought base carries 3 wanted mods (a bought start carries at most 2) |
| Hax 5-mod mana Time-Lost jewel | qATcKacI83o 8:13-9:30 | Ancient Potent Liquid Contempt over-cap on Time-Lost (8:54-8:57) + Ancient Potent Liquid Melancholy radius: no planner method; route described, not demonstrated |
| Clickachu +2 minion belt | C6GkrzWDI3I | Genesis-tree lottery on Banded Wombgifts, not a currency route |
| SaVeQ double/triple T1 res belts | MyrG8KvLRX8 | Recombination + Omen of Homogenising Exaltation: likely out of patch: the 0.5.0 notes put Homogenising omens on the Currency Exchange in Standard leagues only (whether they still drop is not stated) |
| Breach Ring recombinator / homogenising routes | Mk5YeGU8wb8, ZYSD4tpH1p0 | Out of patch (Recombinators, Homogenising omens) |
| XTheFarmerX triple-flat rarity ring (catalysed Perfect Exalts, Ancient Collarbone) | kE8Tn32yNp0 | Uploaded 2025-12-18: patch 0.4 (Fate of the Vaal), outside the 0.5.x golden scope (entry dropped after fact-check) |

## Golden file kept, part of the target left out

| Entry | Left out | Why |
|---|---|---|
| jewel-emerald-5mod-fubgun, jewel-emerald-5mod-lilbotq, jewel-sapphire-budget-pavel, jewel-sapphire-fractured-pavel | Liquid Ferocity "(40-60)% increased Effect of Suffixes" prefix, and the second ordinary prefix | Ferocity's crafted mod is not in the jewel pool. After the over-cap Contempt route (3 suffixes) the planner refuses any prefix target ("adding to the other side afterwards is untested", even with include-unverified). The entries plan the 3 suffixes; the creators' prefix steps are not costed |
| same four jewel entries | creator's start | The planner cannot start from a bought base with an unfractured carried mod on an over-cap jewel, or from a rare with two same-side carried mods ("a magic base holds one prefix and one suffix"). They use `startMode: compare` |
| jewel-time-lost-sapphire-mana-hax | Melancholy "Upgrades Radius to Very Large" prefix; the two bought suffixes as a carried start | Ancient Liquid Melancholy and the Very Large radius mod are not in the planner catalog; the two-suffix bought start is refused as above (`startMode: compare`) |
| ring-caster-mana-operatorotter, ring-caster-mana-hax | Fractured "increased Mana Cost Efficiency" prefix and its base + fracture cost | Not in the Mnemonic Ring planner pool; the planner treats that slot as a fractured non-target anchor, so both sides leave it out |
| ring-attack-flat-saveq-dusk-four-flat | Swift Alloy attack speed suffix (+ intelligence filler) | No ring attack speed in the planner (see Fre drik) |

## Skipped for missing data (expressible, but no usable counts or cost)

- XTheFarmerX beginner amulet (4 div, one lucky try) and expert Spirit amulet (single-run counts such as ~30 chaos to T2 spirit plus a 70 div total, but one lucky run): J7PxG6k6gts
- LilBotQ Absent Amulet +4 melee / T1 Spirit: chaos (~250) and fracture (5-6 tries) counts, but no prices or total: 8Brn0LtOZZo
- Misfractured +skill amulet fixes: running totals only, base never named: 8boqwYQZv5s
- Diztoh rarity Gold Rings: cheap single tries with no total: GDLDxn6yxEs
- SaVeQ and WesDesu mana-stacker rings: no total cost: 9kKdoq0tZXg, NONk-ePkUd8
- Noob Exile and Scorpius Time-Lost Sapphires: partial itemisation only (Scorpius ~9 div to the chaos step; Noob Exile title says under 30 div): udlEA8MTCZE, W4RuaAJYoZc
- Spicysushi 5-mod jewels (~900 div Time-Lost Diamond): captions too garbled to cost: PMGOrmZWHLY
- ASaVeQ league-start belt: route only, no prices: IgQX6EZtUyo
- "My 1K Div Crafting Session": no ordered route or base names: mkU3tDVSsUs
