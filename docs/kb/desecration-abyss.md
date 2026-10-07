# Desecration & Abyss — PoE2 0.5.x ("Runes of Aldur")

Patch stamp: current as of **0.5.4**, Runes of Aldur league. Access checked **2026-08-02**. Desecration/Abyss is the 0.5 flagship crafting system, carried over and iterated from its 0.3 introduction through 0.4 into 0.5. Where a fact is only confirmed for an older patch and no 0.5 source contradicts it, it is noted as legacy-but-presumed-current.
**Corrections 2026-10-01 (sources):** citations to real-money-trading shops were removed; facts that lost their only independent source were re-sourced from the committed RePoE 4.5.5.2 catalog, poe2db (Abyss, Gaze pages) and the official 0.5.3 patch notes, or downgraded to [single-source] / [unverified]; the Ancient-bone source claim was corrected per the 0.5.3 notes; conquestcapped.com (also a currency seller) was removed too, its omen facts re-sourced to RePoE item text, poe2db and poe2wiki. Independent fact-check, same day: the Kulemak bone line now quotes the 0.5.3 patch notes verbatim.
**Corrections 2026-10-02 (partial, craft theory):** the Ancient bone floor now quotes poe2db; the full-rare removal line, the Well of Souls reveal flow (0.3.0 "three different options", faction omens (official text singular; community: normally all three), mod-group blocking of a faction pool, the Echoes re-reveal bug) and wallet warnings 6 and 10 were updated from the 0.3.0 notes, forum threads and creator footage graded inline. The rest of the file is unchanged.

Sources are cited inline. The two annulment omen pages below were directly accessible on 2026-08-02 and are cross-checked against committed RePoE **4.5.4.7** item descriptions.

---

## How it works (overview)

Desecration is a two-step crafting loop [CONFIRMED, multiple sources]:

1. **Apply an Abyssal Bone** to a matching Rare item. This adds a hidden **Desecrated modifier** (shown as a green glyph/matrix symbol at the end of the mod list) that has no effect yet. [CONFIRMED — game8.co/archives/547417; RePoE 4.5.5.2 omen text treats desecrated mods as "Unrevealed" until revealed (Omen of Putrefaction: "creating an item with up to 6 Unrevealed modifiers")]
2. **Take the item to the Well of Souls** (Act 2 hub area) and Reveal it. The Well shows **three modifier options**; you pick one, and the choice is permanent. [CONFIRMED — game8.co/archives/547417 & /547001, mmoso.com, poe2craft.com]

Abyssal Bones are obtained from Abyss encounters (Abyssal Depths, Abyssal Troves, Abyssal Commander bosses). [CONFIRMED — game8.co; [official 0.5.3 patch notes](https://www.pathofexile.com/forum/view-thread/3968601) accessed 2026-10-01: "Tasgul, Swallower of Light will now always drop Desecrated Currency", "The final Large Abyssal Trove in Abyssal Depths will now always contain Desecrated Currency"]

**Well of Souls location**: Act II, reached via the Lightless Passage in the Mastodon Badlands; unlocking it is tied to the "Horn of the Vastiri" campaign questline. In Standard league (outside the current challenge league) the Well was reported unavailable as of 0.3.0 patch notes — unclear if this restriction persists into 0.5 Standard. [single-source — game8.co/archives/547001]

---

## Bone types by slot

Five bone families, each gated to a specific equipment category [CONFIRMED — domistae.github.io/poe2-leveling crafting codex, poe2craft.com; [verified-primary] [poe2db Abyss](https://poe2db.tw/us/Abyss) accessed 2026-10-01: Jawbone "Desecrates a Rare Weapon or Quiver", Rib "Desecrates a Rare Armour", Collarbone "Desecrates a Rare Amulet, Ring or Belt", Cranium "Desecrates a Rare Jewel", Vertebrae "Desecrates a Rare Waystone"]:

| Bone | Applies to |
|---|---|
| **Jawbone** | Weapons & Quivers |
| **Rib** | Armour (body armour, helmet, gloves, boots, and armour-class shields) |
| **Collarbone** | Amulets, Rings, Belts |
| **Cranium** | Jewels (**Preserved tier only** — no Gnawed/Ancient Cranium) [CONFIRMED — poe2craft.com; poe2db Abyss lists only Preserved Cranium] |
| **Vertebrae** | Waystones — **Preserved tier only**, and reportedly **drop-disabled since 0.4.0** [single-source — poe2wiki Preserved_Vertebrae per the adversarial check below; not re-openable 2026-10-01 (wiki bot-wall); poe2db lists the item without a drop-disabled flag] |

An **Altered Collarbone** exists: "Desecrates a Rare Amulet, Ring or Belt with a chance for otherworldly modifiers". [verified-primary — [poe2db Abyss](https://poe2db.tw/us/Abyss) accessed 2026-10-01; RePoE 4.5.5.2 `Metadata/Items/Currency/AbyssalBenchTicketBreach`] Its source (reported as the Breach "Genesis Tree") and what the "otherworldly" mods are: [unverified].

All bones stack to 20 in inventory. [single-source — domistae codex]

---

## Bone tiers

| Tier | Rule | Drop level (approx) |
|---|---|---|
| **Gnawed** | Only usable on Rare items **item level ≤ 64** | ~25 [single-source] |
| **Preserved** | No item-level cap — the endgame-standard bone | ~61 [single-source] |
| **Ancient** | No item-level cap, but guarantees a **minimum modifier level of 40**, i.e. biases toward higher-tier rolls | ~75 [single-source] |

The ilvl-64 Gnawed cap and the Ancient min-mod-level-40 rule are [CONFIRMED] across at least 2 independent sources each (domistae codex, gamerant.com Ulaman/Amanamu/Kurgal article; poe2db Abyss bone list shows the Gnawed max item level 64 and Ancient minimum modifier level 40). The Ancient item text reads "Minimum Modifier Level: 40 … Desecrates a Rare Weapon or Quiver" [verified-primary — [poe2db Ancient_Jawbone](https://poe2db.tw/us/Ancient_Jawbone), accessed 2026-10-02]. Exact drop-level numbers (25/61/75) are [single-source — domistae codex] only.

**Important consequence**: the powerful Lich-exclusive (Ulaman/Amanamu/Kurgal) modifiers require item level 65+ to roll at all, which means **Gnawed bones can never pull them** — you need Preserved or Ancient. [CONFIRMED — gamerant.com; RePoE 4.5.5.2 Abyss Lich mods (`AbyssMod*Ulaman*/Amanamu*/Kurgal*`) carry required_level 65]

### Exact failure / gating messages

- Desecrating an item that already has a Desecrated modifier (revealed or not): **"Failed to apply item: Item already has a revealed modifier."** [single-source, reported via search synthesis attributed to poe2wiki.net — could not directly verify wording by fetching the wiki page itself; treat message text as approximate]
- Desecrating a Rare that already has 6 (max) modifiers: the bone **randomly removes one existing affix first** to make room, rather than failing outright. [single-source — domistae codex; a forum player says the same: "If modifiers are full then a random modifier is also removed" ([forum 3854165](https://www.pathofexile.com/forum/view-thread/3854165), 2025-09-15, n=1)] No source documents a same-side rule. With Omen of Sinistral Necromancy armed, the removed mod was a prefix [creator-demonstrated — [qATcKacI83o](https://www.youtube.com/watch?v=qATcKacI83o) 2:54–2:59, n=1].
- Abyssal Bones cannot be applied to Corrupted or Sanctified items. [single-source — search synthesis, unverified wording]
- Some item classes have no exclusive Lich prefixes and/or suffixes at all: Body Armours, Helmets, Gloves, and Boots reportedly have **no exclusive desecrated prefixes**, and Sceptres have **neither** exclusive prefixes nor suffixes. [single-source — search-engine synthesis, likely poe2wiki-derived; unverified directly]

---

## Well of Souls reveal flow — in detail

Confirmed mechanics [CONFIRMED, 3+ sources: game8.co, mmoso.com, poe2craft.com, gamerant.com]:
- Reveal presents **exactly three modifier options**. Three distinct options (GGG: "choose to transform it by selecting one of three different options") [verified-primary — 0.3.0 patch notes, [forum 3826682](https://www.pathofexile.com/forum/view-thread/3826682), accessed 2026-10-02]; whether they are distinct families/groups is unverified.
- Faction omens (Sovereign/Liege/Blackblooded): **Official** — each guarantees *a* random Ulaman/Amanamu/Kurgal modifier, singular [verified-primary — poe2db [Omen_of_the_Sovereign](https://poe2db.tw/us/Omen_of_the_Sovereign) / [Omen_of_the_Liege](https://poe2db.tw/us/Omen_of_the_Liege) text, accessed 2026-10-02; RePoE wording below]. **Community** (forum 3956293 seaman; Gamerant 2025-09-02): on jewellery all 3 options are normally from the faction — "the resulting three Desecrated modifiers that appear on said item at the Well of Souls will only be from the Ulaman Desecrated modifier pool" [single-source secondary — [Gamerant](https://gamerant.com/path-of-exile-2-ulaman-amanamu-kurgal-modifiers-explained/), 2025-09-02]. Creators treat the target faction mod as a near-certain hit (ASaVeQ [IgQX6EZtUyo](https://www.youtube.com/watch?v=IgQX6EZtUyo) 11:51–12:29; [hQm2IwebFws](https://www.youtube.com/watch?v=hQm2IwebFws) 7:40–7:48), which is not evidence for "all 3 options". **Existing mod groups can block faction mods**, in which case none are offered: Omen of the Liege on a wand already holding spell damage and physical spell damage offered three options with no Amanamu mod — "Amanamu's mods shared the same mod group as spell dmg and phy spell dmg" [community — [forum 3956293](https://www.pathofexile.com/forum/view-thread/3956293), 2026-06-08, n=1 plus a player's explanation] — so mod-group exclusion applies to reveals.
- You choose **one**; the other two are discarded, and the choice is **permanent** (no re-roll after picking, short of removing the mod entirely — see below).
- At least one of the three offered options will be a **Lich-exclusive (Ulaman/Amanamu/Kurgal) modifier**, provided the item is ilvl 65+ and there's at least one eligible exclusive mod for that item class still available to roll. [single-source, but consistent across two independent search syntheses — poe2wiki-derived and gamerant.com]
- **Jewels have no faction mods.** A Preserved Cranium's desecrated-only options are the jewel exclusives — all modifier level 1, single-tier: regular jewels 29 prefixes + 3 suffixes ("(1–2)% increased Strength / Dexterity / Intelligence"), Time-Lost jewels their own 12 radius exclusives (`AbyssModRadiusJewel*`, e.g. "1% increased maximum Mana") — so poe2db's note that the exclusives exist only on regular jewels is contradicted by the game data [verified-primary — poe2db "Jewels Desecrated Mods /32"; game data in the craft catalog]. Whether a jewel reveal always includes one jewel-exclusive option is **unconfirmed**: the "at least one" claim above is framed at ilvl 65, the faction mods' level, and Hax's 8 Crania for the Time-Lost 1% maximum Mana prefix ([qATcKacI83o](https://www.youtube.com/watch?v=qATcKacI83o) 2:40–3:51, n=1) fit three open draws better. Test: 10 reveal screens on a cheap regular jewel with Dextral Necromancy + Preserved Cranium — if every screen has a (1–2)% Str/Dex/Int option, one is guaranteed.
- Desecrated mods obey **standard affix-group exclusion**: a mod that shares a "mod group" with an affix already on the item cannot appear as one of the three options. This is the normal PoE rare-affix rule (no two mods from the same group on one item), not something abyss-specific. [single-source — search synthesis]

**#1 open question (unresolved despite extensive search): does picking a mod at the Well "block" that mod's Lich family from later reveals** — either (a) on the *same item* if you desecrate it again after removing the first desecrated mod, or (b) across *different items/attempts* by that character. No source found — not poe2wiki, not mobalytics, not any Reddit thread surfaced in search, not YouTube guide summaries — makes an explicit claim either way. The only related, *confirmed* rule is the standard same-mod-group exclusion described above, which is a different mechanic (it's about what's already on the item, not about reveal history). **Do not assume family-blocking exists; treat it as unverified until directly tested or a dev/wiki source is found.** Reddit itself could not be searched directly in this pass (`reddit.com` is blocked from the search tool's allowed domains in this environment) — a follow-up pass with direct Reddit access is the fastest way to close this.

### Ordering / sequencing rules that ARE confirmed
- Sinistral Necromancy / Dextral Necromancy (prefix/suffix-forcing omens) and the three Lich-forcing omens (Liege/Sovereign/Blackblooded) are consumed **when you apply the bone** (i.e., they shape which pool the eventual three-option reveal draws from), not at the reveal step itself. [verified-primary — RePoE 4.5.5.2: the Necromancy omens act on "your next Desecration attempt" ("will add only prefix/suffix modifiers"), the Lich omens on "your next Weapon or Jewellery Desecration attempt" ("will guarantee a random Ulaman/Amanamu/Kurgal modifier"), while Abyssal Echoes acts "the next time you reveal Desecrated modifiers"]
- Omen of Abyssal Echoes is consumed **at the reveal step** to discard the offered three and generate one fresh set of three. It is a **single reroll**, not repeatable, and you still pick one of the (new) three — it does not let you cherry-pick across both sets. [CONFIRMED for the single reroll at reveal — mobalytics.gg synthesis; RePoE 4.5.5.2 `OmenOnAbyssRerollOptions`: "the next time you reveal Desecrated modifiers you can reroll the options once". The no-cherry-pick detail is [single-source — mobalytics.gg synthesis]]. **Bug** (report, n=1): reveal, walk away, arm Echoes, re-open the Well and re-reveal — the reroll option is missing, and removing the item from the Well eats the armed omen: "will eat up the omen even though you never got to actually use it" [community bug report — [forum 3861139](https://www.pathofexile.com/forum/view-thread/3861139), 2025-09-28, 0.3-era, n=1]. Arm it before the first reveal.

---

## One-desecrated-mod cap & removal

- **Cap**: a Rare item can normally carry only **1 desecrated modifier** at a time (revealed or unrevealed) — you cannot desecrate an item a second time until the existing desecrated mod is gone. [CONFIRMED — domistae codex; poe2wiki Desecrated_modifier as quoted in the adversarial check below: "An item can only usually have one desecrated modifier through crafting"]
- **Exception**: **Omen of Putrefaction** replaces **all** modifiers on the item with up to 6 desecrated modifiers in one action, and **corrupts the item** in the process (ending further crafting on it). This is a one-shot special case, not a contradiction of the 1-mod cap under normal iterative crafting. [CONFIRMED — mobalytics.gg synthesis; RePoE 4.5.5.2 `OmenOnAbyssVeilAllAndCorrupt`: "your next Desecration attempt will replace all modifiers on the item creating an item with up to 6 Unrevealed modifiers and Corrupting the item"]
- **Removing a desecrated mod**: an ordinary **Orb of Annulment** or **Chaos Orb** can strip a desecrated mod like any other affix (it is *not* protected) — but untargeted, meaning you risk removing a different mod instead. [single-source — poe2craft.com: "not protected: a stray Chaos or Annulment can remove it"]
- **Omen of Light**: makes your **next Orb of Annulment remove only the Desecrated modifier**, giving you a safe, targeted way to scrub a bad reveal without risking the rest of the item. [CONFIRMED — multiple sources: mobalytics synthesis, domistae codex, RePoE `OmenOnAnnulRemoveAbyssMod`]

### Omen of Light vs Sinistral Annulment — deterministic scope

- **Omen of Light**: RePoE 4.5.4.7 says the next Orb of Annulment will remove only **Desecrated modifiers**. The current wiki gives the same scope and says it applies to both exclusive and general-pool Desecrated modifiers. [CONFIRMED — committed RePoE `Metadata/Items/Currency/OmenOnAnnulRemoveAbyssMod`; [poe2wiki](https://www.poe2wiki.net/wiki/Omen_of_Light)]
- **Omen of Sinistral Annulment**: RePoE 4.5.4.7 says the next Orb of Annulment will remove only **prefix modifiers**. It does not promise to select a particular prefix. The current wiki has the same tooltip and lists it as a Ritual reward. [CONFIRMED — committed RePoE `Metadata/Items/Currency/OmenOnAnnulRemovePrefixes`; [poe2wiki](https://www.poe2wiki.net/wiki/Omen_of_Sinistral_Annulment)]
- Therefore, use Light when the required target is specifically a Desecrated modifier; use Sinistral only when every acceptable removal target is on the prefix side and the risk among multiple prefixes is understood. These are targeting constraints, not guarantees that a complete multi-step craft is valid.
- **Time-Lost limitation**: neither tooltip proves that removing a temporary "+1 Suffix Modifier allowed" prefix preserves an over-cap suffix set, nor that a particular historical liquid/annul sequence still works in patch 0.5.4. Coach must not guarantee that exact interaction without a separate current primary or in-game source. [UNVERIFIED INTERACTION — explicit stop condition]

---

## Ulaman / Amanamu / Kurgal — the three Lich mod pools

Three "Abyssal Lich" factions, each with an exclusive modifier pool that **cannot be obtained any other way** (not via alchemy/chaos spam, not via essences). Exclusive mods require **item level 65+** [CONFIRMED, 2 sources: gamerant.com, RePoE 4.5.5.2 required_level 65].

The primary modifier table supports an elemental mapping. Treat broad guide-site role labels as unreliable shorthand, not game-data categories:

| Lich | Forcing Omen | Directly observed modifier bias | Evidence boundary |
|---|---|---|---|
| **Ulaman, Sovereign of the Well** | Omen of the Sovereign | Lightning/Physical | The primary table includes Lightning penetration/Shock and Physical entries; it does not define an "offense" category. |
| **Amanamu, Liege of the Lightless** | Omen of the Liege | Fire | The primary table includes Fire penetration and Ignite entries; it does not define a "defense" category. |
| **Kurgal, the Blackblooded** | Omen of the Blackblooded | Cold | The primary table includes Cold penetration and Freeze entries; it does not define an "ailment" category. |

Source: the exact entries in [poe2wiki's List of desecrated modifiers](https://www.poe2wiki.net/wiki/List_of_desecrated_modifiers), checked 2026-08-02. The table is the supported scope; it does not prove that every modifier in a family follows one theme.

### Per-slot mod pool example — Bows (the only class with a fetched roll-range table)

[verified-primary — committed [RePoE 4.5.5.2](src/data/poe2/repoe/catalog-dbaf8e1f41e441b6.json.gz) `sources.mods`, ids `AbyssModBowSpear*` / `AbyssModBowKurgalPrefixIncreasedQuiverStats`, all required_level 65; checked 2026-10-01. The roll ranges also match the poe2wiki List of desecrated modifiers excerpts quoted in the adversarial check below.] Rows from the shared Bow/Spear pool also spawn on spears; Amanamu's companion rows also spawn on talismans.

| Lich | Slot | Mod (approx roll) |
|---|---|---|
| Ulaman | Prefix (ilvl 65) | Projectiles deal (60–79)% increased Damage with Hits against Enemies further than 6m |
| Ulaman | Suffix (ilvl 65) | Projectile Attacks have a (10–18)% chance to fire two additional Projectiles while moving |
| Ulaman | Suffix (ilvl 65) | (8–13)% increased Attack Speed; (8–13)% increased Attack Speed while your Companion is in your Presence |
| Amanamu | Prefix (ilvl 65) | Companions deal (40–59)% increased Damage; (40–59)% increased Damage while your Companion is in your Presence |
| Amanamu | Prefix (ilvl 65) | (12–23)% increased Area of Effect for Attacks |
| Amanamu | Suffix (ilvl 65) | (12–18)% increased Attack Speed; Companions have (12–18)% increased Attack Speed |
| Amanamu | Suffix (ilvl 65) | (40–60)% chance to Pierce an Enemy |
| Kurgal | Prefix (ilvl 65) | Projectiles have (25–35)% chance to Chain an additional time from terrain |
| Kurgal | Prefix (ilvl 65) | (30–40)% increased bonuses gained from Equipped Quiver |
| Kurgal | Suffix (ilvl 65) | Projectiles have (25–34)% increased Critical Hit Chance against Enemies further than 6m |
| Kurgal | Suffix (ilvl 65) | (25–34)% increased Immobilisation buildup |

For weapon/armour/jewellery classes beyond bows, read the exact rows from the committed RePoE catalog (`sources.mods`, ids starting `AbyssMod`, with `spawn_weights` per base tag) or poe2db / poe2wiki's List of desecrated modifiers — not from guide summaries.

---

## Omens (Desecration-related) — full list

| Omen | Effect | Confirmation |
|---|---|---|
| **Omen of Abyssal Echoes** | Rerolls the three offered options at the Well of Souls once, into a fresh set of three | [CONFIRMED — mobalytics synthesis, game8.co, RePoE `OmenOnAbyssRerollOptions` ("you can reroll the options once")] |
| **Omen of Sinistral Necromancy** | Forces the desecrated mod to land as a **prefix** | [CONFIRMED — mobalytics synthesis, game8.co, domistae codex] |
| **Omen of Dextral Necromancy** | Forces the desecrated mod to land as a **suffix** | [CONFIRMED — same sources] |
| **Omen of Putrefaction** | Replaces **all** modifiers on the item with up to 6 desecrated modifiers, then **corrupts** the item | [CONFIRMED — mobalytics synthesis + RePoE `OmenOnAbyssVeilAllAndCorrupt`] |
| **Omen of Light** | Your next Orb of Annulment removes **only** a Desecrated modifier, ignoring the rest | [CONFIRMED — mobalytics synthesis, domistae codex, RePoE `OmenOnAnnulRemoveAbyssMod`, [poe2db Omen_of_Light](https://poe2db.tw/us/Omen_of_Light) accessed 2026-10-01] |
| **Omen of the Sovereign** | Forces the next Weapon/Jewellery desecration to pull from **Ulaman's** pool | [CONFIRMED — gamerant.com, RePoE `OmenOnAbyssGuarenteeLichTypeMod1` ("guarantee a random Ulaman modifier")] |
| **Omen of the Liege** | Forces the next Weapon/Jewellery desecration to pull from **Amanamu's** pool | [CONFIRMED — gamerant.com, RePoE `OmenOnAbyssGuarenteeLichTypeMod2`, [poe2db Omen_of_the_Liege](https://poe2db.tw/us/Omen_of_the_Liege) accessed 2026-10-01 ("guarantee a random Amanamu modifier")] |
| **Omen of the Blackblooded** | Forces the next Weapon/Jewellery desecration to pull from **Kurgal's** pool | [CONFIRMED — gamerant.com, RePoE `OmenOnAbyssGuarenteeLichTypeMod3` ("guarantee a random Kurgal modifier")] |

A search synthesis of the poe2wiki Omen of the Blackblooded page described the three faction-forcing omens as scoped to "Weapon or Jewellery" desecration specifically (not armour) — the primary item text settles the scope: "your next Weapon or Jewellery Desecration attempt will guarantee a random Ulaman/Amanamu/Kurgal modifier" [verified-primary — RePoE 4.5.5.2 `OmenOnAbyssGuarenteeLichTypeMod1/2/3`, checked 2026-10-01], and poe2wiki (quoted in the adversarial check below) adds that it has no effect on armour, jewels or waystones.

Note: the task brief's framing "which boss each forces" is a **misconception worth correcting** — the Liege/Sovereign/Blackblooded omens force which **Lich's mod pool** your desecration draws from; they do not force which **boss** spawns or drops. The bosses (Amanamu-loyal Void rares, Ulaman/Sovereign-of-the-Well, Kurgal-the-Blackblooded) are separate encounters that themselves drop these omens and other loot — see below.

---

## Abyss bosses & the encounters that matter for farming

- **Amanamu-loyal rares ("Void" rares)**: spawn with a Lichborn modifier ("Amanamu's Void") that conjures a darkness cloud. Kill **inside** the cloud → **Omen of the Liege** is the only omen that can drop. Kill **outside/after luring out of the cloud** → the other five non-Lich Abyss omens can drop instead, including **Omen of Light** and Omen of Abyssal Echoes. [single-source — [poe2wiki Omen_of_the_Liege](https://www.poe2wiki.net/wiki/Omen_of_the_Liege) accessed 2026-10-01, citing GGG: "Omen of the Liege is the only Omen that can drop if the monster is killed within the cloud created by the modifier, and the other five non-Lich Abyss omens …"; docs/kb/drop-sources.md lists the same split] Because Omen of Light is the pricier omen ([poe2db](https://poe2db.tw/us/Omen_of_Light) showed a 24h value of ~6.6 Divine on 2026-10-01; check poe.ninja), luring the rare out of its cloud before the kill is worth doing. The earlier "~1 Alchemy Orb" value for Omen of the Liege is [unverified] and was dropped.
- **Ulaman, Sovereign of the Well**: found as the Lichborn boss ending an Abyssal Depths (more reliable in ilvl 79+ / T15+ maps). Fight is a DPS-check: retreats to a sub-zone with a Stygian Spire at 75/50/25% HP, must be killed within a 90s timer that carries across all three phases; near-entirely physical damage. Drops reportedly include a rare Stygian Vise belt, Darkness Enthroned (unique belt), a chance at **Ulaman's Gaze**, plus Preserved/Ancient bones. [unverified — the fight description and drop list came only from a real-money-trading shop guide (citation removed 2026-10-01); its "~50% Darkness Enthroned" figure was dropped. poe2db's Ulaman's Gaze flavour text names "The Sovereign of the Well" but gives no drop source.]
- **Kurgal, the Blackblooded**: two-phase fight with a darkness sub-phase, circular arena with crystal totems that bounce projectiles/provide light/fire lasers; primarily physical damage with 15–20% chaos conversion (second-phase beams 80% lightning/20% chaos). Also exists as a legacy Delve (Azurite Mine, depth 90+) encounter. [single-source, detailed — search synthesis of poewiki/poe2wiki Kurgal pages]
- **Tasgul, Swallower of Light** and **Vandroth, Blackblooded Enslaver**: Abyssal bosses listed by poe2db ([poe2db Abyss](https://poe2db.tw/us/Abyss) accessed 2026-10-01). As of **0.5.3**, both **always drop Desecrated Currency**: "Tasgul, Swallower of Light will now always drop Desecrated Currency" / "Vandroth, Blackblooded Enslaver will now always drop Desecrated Currency". [verified-primary — [official 0.5.3 patch notes](https://www.pathofexile.com/forum/view-thread/3968601) accessed 2026-10-01] The rest — that they are "Abyssal Commanders" gating **Kulemak's Invitation**, spawn at the end of an Abyssal Depths in ilvl 79+ maps, their Freeze/darkness themes, and forcing them via an "Abysses lead to an Abyssal Boss" map modifier — is [unverified]; its only source was a real-money-trading shop guide.

---

## Gaze items (Amanamu's / Ulaman's / Kurgal's / Tecrod's Gaze)

All four are **"Ancient Augment"** items (an Augment / "Abyssal Eye" class distinct from PoE1's Abyss Jewels), and each carries "Limited to: 1 Ancient Augment", i.e. a **combined limit of one equipped at a time** regardless of which Gaze it is. [verified-primary — poe2db [Amanamus_Gaze](https://poe2db.tw/us/Amanamus_Gaze), [Ulamans_Gaze](https://poe2db.tw/us/Ulamans_Gaze), [Tecrods_Gaze](https://poe2db.tw/us/Tecrods_Gaze) accessed 2026-10-01; Kurgal's Gaze page not opened]

Each Gaze grants **different effects depending on which item slot it's socketed into** (Helmet / Gloves / Boots / Body Armour), roughly matching its Lich's theme:

- **Amanamu's Gaze**: Helmet — remove a damaging ailment on Command Skill use; Body Armour — +2 Armour per 1 Spirit; Boots — "1% increased Movement Speed per 15 Spirit, up to a maximum of 40%". [verified-primary — [poe2db Abyss](https://poe2db.tw/us/Abyss) accessed 2026-10-01; the earlier "only applies to non-Sprint MS" detail is [unverified]]
- **Ulaman's Gaze**: Helmet — "+1 to Accuracy Rating per 1 Item Evasion Rating on Equipped Helmet"; Gloves — "Critical Hit chance is Lucky against Parried enemies"; Body Armour — "Prevent +3% of Damage from Deflected Hits". [verified-primary — poe2db Abyss / Ulamans_Gaze]
- **Kurgal's Gaze**: Helmet — Increases and Reductions to Life Regeneration Rate also apply to Mana Regeneration Rate; Gloves — 40% increased effect of Arcane Surge on you; Boots — 15% increased Mana Cost Efficiency if you haven't Dodge Rolled Recently. [verified-primary — poe2db Abyss]
- **Tecrod's Gaze**: Body Armour — regenerate 1.5% max Life/sec; Gloves — 25% increased Life Cost Efficiency; Boots — 10% increased Movement Speed when on Low Life. [verified-primary — poe2db Abyss / Tecrods_Gaze]

**Why they're expensive**: they are **boss-exclusive drops**, not craftable and not purchasable via any currency-based crafting path.
- Ulaman's Gaze reportedly drops from the **Ulaman, Sovereign of the Well** fight specifically. [unverified — only source was a real-money-trading shop guide; docs/kb/drop-sources.md lists the Gazes as drops of the Abyssal Liches in Abyssal Depths branch zones]
- Tecrod's Gaze drops from encountering a Lich Boss inside an Abyssal Depths generally (Tecrod himself is a separate, independent Abyssal figure — "the Hated Slave," not one of the three Kulemak-serving Liches, still active post-campaign). Historically (0.4-era) reported trading around **~250 Divine**; treat as stale/illustrative only, not a current 0.5 price. [single-source — YouTube title snippet + poe2wiki search synthesis; price figure is old-patch and likely inaccurate for 0.5]
- Amanamu's Gaze reportedly traded around **~1 Divine** (via a ~70 Exalt / 90:1 Exalt-Divine rate conversion) per a currency-guide mention — again treat as a loose, dated data point rather than a current market fact. [single-source — mobalytics currency guide]

**poe.ninja economy pages exist** for these under `poe.ninja/poe2/economy/<league>/abyssal-bones/<item>` but returned JS-shell-only content to the fetch tool (client-rendered SPA) — could not pull live 0.5 Runes-of-Aldur prices directly. Recommend the trading tool itself hit poe.ninja's JSON API endpoints (same pattern as the currency-exchange endpoint already used elsewhere in this codebase) rather than scraping the HTML page.

---

## Abyss farming economics

- Reported income figures vary wildly by source and gearing, from **~1.16 Divine per 50 maps** (conservative baseline) up to **40–45 Divine/hour** with an optimized strategy, and anecdotal reports of **400+ Divine over "a couple of days"** of dedicated farming, or "400–500+ divines per character" over a season with a well-built setup. **Treat all of these as wide, unverified ranges** — they come from farming-guide content (mobalytics.gg guide-author posts and real-money-trading shop marketing pages, whose citations were removed 2026-10-01), not controlled data, and none cross-verify each other's methodology. [unverified — do not treat any single number as reliable]
- **0.5.3 patch change**: Desecrated Currency became a **guaranteed drop** from Tasgul and Vandroth, and "The final Large Abyssal Trove in Abyssal Depths will now always contain Desecrated Currency." [verified-primary — [official 0.5.3 patch notes](https://www.pathofexile.com/forum/view-thread/3968601) accessed 2026-10-01]
- **Bone sources**: bones of all tiers come from Abyssal Troves found by completing Abyss encounters or inside Abyssal Depths [single-source — poe2wiki Preserved_bone as quoted in the adversarial check below]. **Correction 2026-10-01:** the earlier claim "Ancient Bones only drop from Abyss chests, not monsters" is refuted — since 0.5.3 "Conquering the Vessel of Kulemak now has a chance to drop Ancient Jawbones, Ancient Ribs and Ancient Collarbones." [verified-primary — [0.5.3 patch notes](https://www.pathofexile.com/forum/view-thread/3968601), accessed 2026-10-01]. Whether character item rarity affects bone drops is [unverified].
- Atlas-tree levers named by guides (**Lightless Legions**, "Hearts of the Well", Abyss spawn-chance / monster-count / desecrated-modifier-count nodes): [unverified] — the only source was a real-money-trading shop guide set, and these node names do not appear in the Abyss passive list in src/data/poe2/strategies/abyss-depths-omens.json.
- Value capture is mostly **indirect**: Abyss "prints" Omens, Abyssal bones, Gaze augments and chase uniques (e.g. Darkness Enthroned), which are then converted to Divine via Currency Exchange/trade — not direct currency drops. [single-source — [poe2db Abyss](https://poe2db.tw/us/Abyss) accessed 2026-10-01 lists these item groups plus the uniques Undying Hate, Grip of Kulemak, Heart of the Well and The Unborn Lich; the "mostly indirect" framing is our inference. Stygian Vise belts and Abyss Jewels, named by the earlier source, do not appear on that page and were dropped]

---

## Wallet warnings

1. **Desecrating a full (6-mod) rare will randomly delete one of its existing affixes** to make room — never desecrate a finished item unless you've priced in losing a random mod (or are deliberately using it as a "reroll one mod" tool). [single-source — domistae codex]
2. **An item with a desecrated mod (revealed or not) cannot be desecrated again** — trying will hard-fail. Don't buy/stack multiple bones onto the same item expecting to "layer" desecrations; you need Omen of Putrefaction (all-or-nothing, corrupts) for more than one. [CONFIRMED]
3. **Gnawed bones physically cannot roll the valuable Lich-exclusive mods** (ilvl 65 floor) — using Gnawed bones on anything you actually want an Ulaman/Amanamu/Kurgal mod on is wasted currency; always use Preserved or better once past ilvl 64/65 gear. [CONFIRMED]
4. **Removing a bad desecrated roll with a plain Chaos/Annulment is a gamble** — it can strip a *different* mod instead of the desecrated one. Always pair with **Omen of Light** for a targeted removal, or accept the risk consciously. [single-source but mechanically consistent with base-game annul/chaos behavior]
5. **The faction-forcing omens (Liege/Sovereign/Blackblooded) only apply to Weapon/Jewellery desecration** (item text: "your next Weapon or Jewellery Desecration attempt") — don't buy one expecting to force a Lich pool on armour. [verified-primary — RePoE 4.5.5.2]
6. **Omen of Abyssal Echoes only rerolls once** — it's not a "reroll until happy" loop; budget accordingly and don't buy stacks expecting repeated rerolls per reveal. Arm it before the first reveal: arming it later and re-revealing can eat it unused (forum 3861139, see the reveal flow).
7. **Vertebrae (waystone desecration) is reportedly drop-disabled since 0.4.0** (poe2wiki per the adversarial check below; poe2db shows no such flag) — don't farm/buy expecting to use it until confirmed live in your league. [single-source]
8. **Gaze items share a single "Ancient Augment" slot limit of one** — buying a second Gaze (or a Gaze plus another Ancient Augment) expecting them to stack is a wasted purchase.
9. Reported abyss farming income figures span a 40x range across sources (1.16 Div/50 maps to 40+ Div/hour) — **don't plan a build/investment around any single cited number**; check your own per-map return before scaling up bone/omen purchases.
10. **A faction omen can't beat mod-group exclusion** — if the item already holds mods in the same group as the Lich's mods (e.g. spell damage on a wand for Amanamu), the Well can offer zero faction mods and the omen is spent (forum 3956293, n=1, see the reveal flow). Check the item's mod groups first.

---

## Profit angles

1. **Sell Omens rather than use them, if you don't need the specific effect.** Omen of Light in particular is a high-value omen — [poe2db](https://poe2db.tw/us/Omen_of_Light) showed a 24h value of ~6.6 Divine on 2026-10-01 [single-source; check the current price on poe.ninja] — and luring Amanamu-loyal rares out of their darkness cloud before the kill is how you get a shot at it (see the Abyss bosses section).
2. **Sell bones/desecration services to buyers who can't reach the Well of Souls setup themselves** — a classic PoE crafting-service model; desecrated-but-unrevealed items or completed Lich-mod items on ilvl65+ bases are valuable because the Lich pool is otherwise unobtainable.
3. **Target-farm Ulaman, Sovereign of the Well specifically** if going for Ulaman's Gaze / Darkness Enthroned / Stygian Vise value — it's a fixed, repeatable boss encounter (not a random rare), so it's the most "farmable" of the Gaze sources. [unverified — only source was a real-money-trading shop guide]
4. **Craft-and-flip weapon/jewellery bases with forced Lich mods** using the Sovereign/Liege/Blackblooded omens — since these mods are otherwise unattainable, verify the exact base-specific modifier in the primary table instead of assuming an offense/defense/ailment family role.
5. **Guaranteed-drop bosses (Tasgul/Vandroth) as a stable desecrated-currency income floor** post-0.5.3 — since these now *always* drop Desecrated Currency, running T15+ maps with "Abysses lead to an Abyssal Boss" forced is a lower-variance version of general Abyss farming versus hoping for randomly-spawned Abyssal Depths bosses.
6. **Ancient Bones come mainly from Abyssal Troves** (plus, since 0.5.3, a chance from Kulemak's Vessel) — so Abyss trove/reward levers matter more than random monster kills. Whether character item rarity affects bone income is [unverified]; the earlier "chest-only, rarity-independent" claim came from a real-money-trading shop page and is contradicted by the 0.5.3 patch notes.

---

## Open questions

1. **[Primary, unresolved] Does picking a mod at the Well of Souls block that mod (or its whole Lich family) from being offered again** — on the same item across repeat desecrations, or across a character's future desecrations generally? No source found makes this claim in either direction. This needs either (a) a direct Reddit/forum search from an environment where reddit.com isn't blocked, (b) a controlled in-game test (desecrate the same item repeatedly after removing the desecrated mod each time via Omen of Light, log which mods appear), or (c) a GGG dev post/patch note reference.
2. ~~Do the Liege/Sovereign/Blackblooded faction-forcing omens work on armour?~~ **Answered 2026-10-01:** no — the item text limits them to "Weapon or Jewellery" desecration (RePoE 4.5.5.2). Open remainder: is there any way to target a specific Lich's mod on armour at all?
3. Full, verified per-slot Ulaman/Amanamu/Kurgal mod tables with exact roll ranges for weapon classes other than bows, and for armour/jewellery — the bow table pulled here is single-source and came through an automated summarizer, not a direct poe2db read. Needs a direct poe2db.tw scrape (browser-rendered, since the site 403'd a plain fetch).
4. Current (0.5.4, Runes of Aldur) live market prices for Preserved/Ancient bones and all four Gaze items — poe.ninja's SPA blocked scraping in this pass; the ~250 Div Tecrod's Gaze and ~1 Div Amanamu's Gaze figures found are stale (0.4-era) and should not be trusted for current pricing.
5. Exact wording of the "Failed to apply item" and Corrupted/Sanctified-blocking error messages — reported only via search-engine synthesis of a wiki page that could not be directly fetched; needs in-client or direct-wiki verification.
6. Whether Preserved Vertebrae (waystone desecration) is still drop-disabled in the current 0.5.3/0.5.4 patch, or was re-enabled.
7. Where the "Altered Collarbone" comes from (reported as the Breach Genesis Tree) and what its "otherworldly modifiers" are — the item itself is confirmed by poe2db/RePoE (2026-10-01).
8. Whether Cranium (jewel desecration) truly has no Gnawed/Ancient variants, or whether this is a current-patch gap that could change.

---

> Built 2026-07-14 by the poe2-kb-build workflow (research + adversarial verify). Patch 0.5.x.

## Adversarial verification (post-research)

- confirmed — 1. Exact error message "Failed to apply item: Item already has a revealed modifier." is verbatim correct.
  → No change needed — now backed by a direct page fetch, not just search synthesis. poe2wiki's Desecrated_modifier article states verbatim: 'Attempting to desecrate an item that already has a desecrated modifier, regardless of whether the desecrated modifier is revealed or not, will result in an error message: "Failed to apply item: Item already has a revealed modifier."' The KB can now cite this as a directly-fetched primary source rather than a search-engine-synthesized claim. (https://www.poe2wiki.net/wiki/Desecrated_modifier)
- unverifiable — 2. Picking a mod at the Well of Souls blocks that mod's Lich family (Ulaman/Amanamu/Kurgal) from appearing in later reveals on other items or future visits.
  → Still genuinely open — no primary source (poe2wiki, poe2db, GGG notes) addresses cross-item or cross-visit Lich-family blocking. Two adjacent but distinct mechanics were found that should NOT be conflated with this: (a) an item that already has a (revealed or unrevealed) desecrated modifier cannot be desecrated again at all — a per-item lock, not a family-specific one; and (b) standard PoE mod-group exclusion (an item cannot roll two mods from the same mod group), which is a general crafting rule, not a Lich-family-specific behavior tied to Well of Souls selection history. The KB entry should flag the claim as unresolved and explicitly distinguish it from these two look-alike mechanics rather than treating any of them as evidence either way. (https://www.poe2wiki.net/wiki/Desecrated_modifier (documents the per-item lock only; no family-blocking mechanic described))
- unverifiable — 3. The bow desecrated-mod roll-range table for Ulaman/Amanamu/Kurgal (exact percentages) is accurate, sourced via an automated summarizer of a secondary source rather than a direct poe2db/poe2wiki read.
  → Cannot confirm or refute specific percentages without the KB's original numbers to diff against — none were supplied. However, a canonical, directly-fetchable primary source now exists and should replace the secondary-source summarizer citation: poe2wiki's 'List of desecrated modifiers' page lists the full prefix/suffix table with exact roll ranges and per-base-type (including bow) spawn weights, e.g. bow-tagged entries like 'Ulaman's — Projectiles deal (60-79)% increased Damage with Hits against Enemies further than 6m' and 'Kurgal's — Projectiles have (25-35)% chance to Chain an additional time from terrain'. The KB should re-derive its bow table directly from this page (or poe2db) instead of a summarized secondary source, since the raw data is fetchable. (https://www.poe2wiki.net/wiki/List_of_desecrated_modifiers)
- confirmed — 4. Gnawed/Preserved/Ancient bone drop levels are 25/61/75.
  → No change needed. poe2wiki's 'Preserved bone' page directly confirms: Gnawed Collarbone/Jawbone/Rib — drop level 25; Preserved Collarbone/Jawbone/Rib — drop level 61; Ancient Collarbone/Jawbone/Rib — drop level 75 (Preserved Cranium alone sits at drop level 65). This is now cross-verified beyond the single domistae-codex source. (https://www.poe2wiki.net/wiki/Preserved_bone)
- confirmed — 5. Faction-forcing omens (Liege/Sovereign/Blackblooded) are restricted to Weapon/Jewellery desecration and cannot target armour.
  → Upgrade from 'inferred pattern' to explicitly stated fact. poe2wiki's Omen of the Sovereign page states outright: 'This Omen only works when desecrating weapons and jewellery; it does not have any effect on armour items, jewels, or waystones.' Add one important nuance the KB is currently missing: the restriction is keyed to the *desecration currency type* used, not the base item's category — e.g. belts (not classed as jewellery) can still be targeted with these omens because Preserved/Gnawed/Ancient Collarbone counts as the eligible currency type. So the rule is better phrased as 'restricted to whichever bases the Jawbone/Collarbone-family currencies can target' rather than a literal 'Weapon/Jewellery slot' restriction. (https://www.poe2wiki.net/wiki/Omen_of_the_Sovereign)
- confirmed — 6. Reported abyss farming income figures (1.16 Div/50 maps, 40-45 Div/hour, 400+ Div/couple days, 400-500 Div/season) are wildly divergent and none are cross-verified.
  → The divergence itself is real and confirmed, not a KB artifact — current guide content spans everything from 'a few Divine per hour' on a budget setup up to '50 Divines Per Hour,' '80 Divines Profit in 20 Maps,' '11+ Divine per map' on juiced Breach+Delirium builds, and a dedicated '400+ Divines in Two Days' strategy piece for patch 0.5. The KB should present these as setup-dependent outliers (budget vs. juiced vs. multi-day session totals) rather than as comparable single numbers, and should not average or reconcile them into one 'true' rate — they measure different things (per-map, per-hour, per-session, per-season) with unstated investment levels. (source was a real-money-trading shop page, citation removed 2026-10-01)
- **REFUTED** — 7. Tecrod's Gaze ~250 Divine and Amanamu's Gaze ~1 Divine are current 0.5 price points.
  → Both figures look stale/mismatched. Live tracker data (POE2 Scout) puts Amanamu's Gaze at roughly 3.39 Divine in the current league, not ~1 Divine — over 3x the claimed figure. For Tecrod's Gaze, available guide data describes it trading at only 8-10 Divine 'in the early league' with prices climbing only mid-league due to Temple-farming inflation — nowhere near the claimed ~250 Divine; that figure is likely a late-league spike or a different, unrelated item's price misattributed. Also note the current active economy league is 'Fate of the Vaal,' not 'Runes of Aldur' — if the KB's figures were pulled under a Runes of Aldur league context, they are now league-stale regardless of era. The KB should re-pull both prices from poe.ninja's live 'Fate of the Vaal' abyssal-bones pages rather than reusing old figures. (https://poe2scout.com/poe2/vaal/economy/currencies/abyss/4391/Amanamu's-Gaze?referenceCurrency=divine)
- confirmed — 8. Cranium bone exists only in the Preserved tier (no Gnawed/Ancient Cranium).
  → No change needed. poe2wiki's 'Preserved bone' master table lists Preserved Cranium (drop level 65, desecrates a Rare Jewel) as the only Cranium-type bone; no Gnawed Cranium or Ancient Cranium appears in the main table, the miscellaneous-bones list, or the drop-disabled list. This is confirmed as a real game-design gap (Jewels only get one bone tier), not a coverage gap in the domistae source. (https://www.poe2wiki.net/wiki/Preserved_bone)
- corrected — 9. The former offense/defense/ailment family shorthand was removed. The primary modifier list directly supports Amanamu=Fire, Kurgal=Cold, and Ulaman=Lightning/Physical as a useful bias, while still requiring exact base-specific lookup. (https://www.poe2wiki.net/wiki/List_of_desecrated_modifiers)
- **REFUTED** — 10. Omen of Putrefaction giving up to 6 desecrated mods while corrupting is not overridden/nerfed by the 0.5 one-mod cap; doubted as possibly Standard-only legacy behavior.
  → The doubt is unfounded — this is confirmed current, non-legacy behavior. poe2wiki's live Omen of Putrefaction page (not a legacy/archived section) describes the exact current tooltip: 'your next Desecration attempt will replace all modifiers on the item creating an item with up to 6 Unrevealed modifiers and Corrupting the item,' and its version history shows only an 'Introduced 0.3.0' entry with no subsequent nerf or removal. The companion Desecrated_modifier page explicitly frames it as the intended exception to the one-desecrated-mod rule: 'An item can only usually have one desecrated modifier through crafting (except through the use of Omen of Putrefaction or certain unique items).' The KB should remove the Standard-only-legacy caveat entirely. (https://www.poe2wiki.net/wiki/Omen_of_Putrefaction)
- confirmed — 11. Ancient Bones drop only from Abyss chests (not monsters) and are unaffected by character rarity.
  → Directionally correct but the KB overstates it as Ancient-tier-specific. poe2wiki's Preserved_bone page states this chest-sourcing applies to preserved bones generally: they 'can be obtained from Abyssal Troves that can be found by completing Abyss encounters or inside of an Abyssal Depths' — i.e., all tiers (Gnawed/Preserved/Ancient) are chest/trove-sourced, not uniquely the Ancient tier. On the rarity point, community guidance attributes better bone/reward yield to *map item-rarity modifiers on Abyss Precursor Tablets*, not the character's personal Rarity stat — consistent with the claim that character Rarity doesn't move the needle here, though this is corroborated only by guide consensus, not an explicit GGG statement. Recommend rephrasing the KB entry to 'all preserved-bone tiers are chest/trove-sourced' rather than singling out Ancient. (https://www.poe2wiki.net/wiki/Preserved_bone)
- confirmed — 12. Preserved Vertebrae (waystone bone) is currently drop-disabled, patch-version uncertain.
  → Confirmed, and the patch-version uncertainty can be resolved. poe2wiki's Preserved Vertebrae page lists it under 'Acquisition: Drop disabled' and its version history pins the exact patches: disabled as of 0.4.0 ('Preserved Vertebrae no longer drop'), following the 0.3.1f end of the Rise of the Abyssal league it was exclusive to; introduced in 0.3.0. It remains drop-disabled in the current 0.5.x wiki snapshot, obtainable only by trading on permanent Standard/Hardcore leagues. The KB should update 'patch-version uncertain' to '0.4.0 onward' and cite the version-history table. (https://www.poe2wiki.net/wiki/Preserved_Vertebrae)
- 2026-10-01 (sources) — real-money-trading shop citations removed. Notable changes: bow Lich-mod table [unverified] -> [verified-primary] (committed RePoE 4.5.5.2; two rows gained their companion-presence second line); omen sequencing and Lich-omen Weapon/Jewellery scope -> [verified-primary] (RePoE item text); Gaze shared limit and slot effects -> [verified-primary] (poe2db); Altered Collarbone existence -> [verified-primary] (poe2db/RePoE), its Genesis Tree source stays [unverified]; 0.5.3 Tasgul/Vandroth/trove guarantees -> [verified-primary] (official patch notes); "Ancient Bones only from chests, not monsters" REFUTED by the 0.5.3 notes (Kulemak's Vessel can drop Ancient bones); full-rare random-affix removal [CONFIRMED] -> [single-source]; Amanamu Void-rare lure and Abyss value-capture [CONFIRMED] -> [single-source]; Ulaman fight/drops, Ulaman's Gaze source, Tasgul/Vandroth gating details and the Lightless Legions atlas levers [single-source]/[CONFIRMED] -> [unverified]; Vertebrae drop-disabled now rests on poe2wiki only (could not be re-opened); income-figure range -> [unverified]. conquestcapped.com (currency seller) also removed: Abyssal Echoes/Putrefaction/Lich-omen rows keep [CONFIRMED] on RePoE item text + remaining guides; Echoes "no cherry-pick across both sets" -> [single-source]; Amanamu Void-rare split re-sourced to poe2wiki Omen_of_the_Liege, its "~1 Alchemy" Liege value and the "6–10 Divine" Omen of Light figure dropped (poe2db 24h value ~6.6 Divine instead, [single-source]); Abyss value-capture re-sourced to poe2db Abyss, Stygian Vise / Abyss Jewels dropped from that list.
- 2026-10-02 (craft theory) — re-check of the reveal flow and bone facts. Ancient min mod level 40 [CONFIRMED] -> also [verified-primary] (poe2db Ancient_Jawbone item text). "Three options" now quotes the 0.3.0 notes ("one of three different options", forum 3826682); distinct families stays [unverified]. Faction omens filling all three options added [single-source secondary — Gamerant 2025-09-02, consistent with creator footage]; the theory-gap note that forum 3956293 "says all 3" was wrong — that thread shows the opposite failure (no Amanamu option when spell-damage mods held the group) and is cited for that instead. Echoes re-reveal bug added (forum 3861139, n=1). Fact-check applied: "three distinct options" with families/groups unverified; faction omens now official singular text + community "normally all 3" + creators only for a near-certain target hit; Echoes bug reworded as a missing reroll option. Full-rare random removal gained a forum source (3854165) and a creator observation (Sinistral Necromancy -> prefix removed); no same-side rule.
