# Desecration & Abyss — PoE2 0.5.x ("Runes of Aldur")

Patch stamp: current as of **0.5.4**, Runes of Aldur league. Access checked **2026-08-02**. Desecration/Abyss is the 0.5 flagship crafting system, carried over and iterated from its 0.3 introduction through 0.4 into 0.5. Where a fact is only confirmed for an older patch and no 0.5 source contradicts it, it is noted as legacy-but-presumed-current.

Sources are cited inline. The two annulment omen pages below were directly accessible on 2026-08-02 and are cross-checked against committed RePoE **4.5.4.7** item descriptions.

---

## How it works (overview)

Desecration is a two-step crafting loop [CONFIRMED, multiple sources]:

1. **Apply an Abyssal Bone** to a matching Rare item. This adds a hidden **Desecrated modifier** (shown as a green glyph/matrix symbol at the end of the mod list) that has no effect yet. [CONFIRMED — game8.co/archives/547417, mmojugg.com]
2. **Take the item to the Well of Souls** (Act 2 hub area) and Reveal it. The Well shows **three modifier options**; you pick one, and the choice is permanent. [CONFIRMED — game8.co/archives/547417 & /547001, mmoso.com, poe2craft.com]

Abyssal Bones are obtained from Abyss encounters (Abyssal Depths, Abyssal Troves, Abyssal Commander bosses). [CONFIRMED — game8.co, timesaver.gg/blog/poe2-desecrated-currency-guide]

**Well of Souls location**: Act II, reached via the Lightless Passage in the Mastodon Badlands; unlocking it is tied to the "Horn of the Vastiri" campaign questline. In Standard league (outside the current challenge league) the Well was reported unavailable as of 0.3.0 patch notes — unclear if this restriction persists into 0.5 Standard. [single-source — game8.co/archives/547001]

---

## Bone types by slot

Five bone families, each gated to a specific equipment category [CONFIRMED — domistae.github.io/poe2-leveling crafting codex, poe2craft.com, mmojugg.com all agree]:

| Bone | Applies to |
|---|---|
| **Jawbone** | Weapons & Quivers |
| **Rib** | Armour (body armour, helmet, gloves, boots, and armour-class shields) |
| **Collarbone** | Amulets, Rings, Belts |
| **Cranium** | Jewels (**Preserved tier only** — no Gnawed/Ancient Cranium) [single-source, poe2craft.com] |
| **Vertebrae** | Waystones — **Preserved tier only**, and per one 0.5.3-era source this bone is currently **drop-disabled** [single-source — timesaver.gg/blog/poe2-desecrated-currency-guide] |

0.5-new: an **Altered Collarbone** exists for jewellery, sourced from the "Genesis Tree" (Atlas-tree-adjacent mechanic), rolling "otherworldly" mods distinct from the standard Ulaman/Amanamu/Kurgal pools. [single-source — timesaver.gg/blog/poe2-desecrated-currency-guide; not cross-verified, treat as [unverified] pending a second source]

All bones stack to 20 in inventory. [single-source — domistae codex]

---

## Bone tiers

| Tier | Rule | Drop level (approx) |
|---|---|---|
| **Gnawed** | Only usable on Rare items **item level ≤ 64** | ~25 [single-source] |
| **Preserved** | No item-level cap — the endgame-standard bone | ~61 [single-source] |
| **Ancient** | No item-level cap, but guarantees a **minimum modifier level of 40**, i.e. biases toward higher-tier rolls | ~75 [single-source] |

The ilvl-64 Gnawed cap and the Ancient min-mod-level-40 rule are [CONFIRMED] across at least 2 independent sources each (domistae codex, conquestcapped.com/guides/path-of-exile-2/poe-2-abyss-guide, timesaver.gg desecrated-currency-guide, gamerant.com Ulaman/Amanamu/Kurgal article). Exact drop-level numbers (25/61/75) are [single-source — domistae codex] only.

**Important consequence**: the powerful Lich-exclusive (Ulaman/Amanamu/Kurgal) modifiers require item level 65+ to roll at all, which means **Gnawed bones can never pull them** — you need Preserved or Ancient. [CONFIRMED — gamerant.com, conquestcapped.com, timesaver.gg ulaman-sovereign-of-the-well-guide]

### Exact failure / gating messages

- Desecrating an item that already has a Desecrated modifier (revealed or not): **"Failed to apply item: Item already has a revealed modifier."** [single-source, reported via search synthesis attributed to poe2wiki.net — could not directly verify wording by fetching the wiki page itself; treat message text as approximate]
- Desecrating a Rare that already has 6 (max) modifiers: the bone **randomly removes one existing affix first** to make room, rather than failing outright. [CONFIRMED — mmojugg.com item pages, domistae codex both state this]
- Abyssal Bones cannot be applied to Corrupted or Sanctified items. [single-source — search synthesis, unverified wording]
- Some item classes have no exclusive Lich prefixes and/or suffixes at all: Body Armours, Helmets, Gloves, and Boots reportedly have **no exclusive desecrated prefixes**, and Sceptres have **neither** exclusive prefixes nor suffixes. [single-source — search-engine synthesis, likely poe2wiki-derived; unverified directly]

---

## Well of Souls reveal flow — in detail

Confirmed mechanics [CONFIRMED, 3+ sources: game8.co, mmoso.com, poe2craft.com, gamerant.com]:
- Reveal presents **exactly three modifier options**.
- You choose **one**; the other two are discarded, and the choice is **permanent** (no re-roll after picking, short of removing the mod entirely — see below).
- At least one of the three offered options will be a **Lich-exclusive (Ulaman/Amanamu/Kurgal) modifier**, provided the item is ilvl 65+ and there's at least one eligible exclusive mod for that item class still available to roll. [single-source, but consistent across two independent search syntheses — poe2wiki-derived and gamerant.com]
- Desecrated mods obey **standard affix-group exclusion**: a mod that shares a "mod group" with an affix already on the item cannot appear as one of the three options. This is the normal PoE rare-affix rule (no two mods from the same group on one item), not something abyss-specific. [single-source — search synthesis]

**#1 open question (unresolved despite extensive search): does picking a mod at the Well "block" that mod's Lich family from later reveals** — either (a) on the *same item* if you desecrate it again after removing the first desecrated mod, or (b) across *different items/attempts* by that character. No source found — not poe2wiki, not mobalytics, not any Reddit thread surfaced in search, not YouTube guide summaries — makes an explicit claim either way. The only related, *confirmed* rule is the standard same-mod-group exclusion described above, which is a different mechanic (it's about what's already on the item, not about reveal history). **Do not assume family-blocking exists; treat it as unverified until directly tested or a dev/wiki source is found.** Reddit itself could not be searched directly in this pass (`reddit.com` is blocked from the search tool's allowed domains in this environment) — a follow-up pass with direct Reddit access is the fastest way to close this.

### Ordering / sequencing rules that ARE confirmed
- Sinistral Necromancy / Dextral Necromancy (prefix/suffix-forcing omens) and the three Lich-forcing omens (Liege/Sovereign/Blackblooded) are consumed **when you apply the bone** (i.e., they shape which pool the eventual three-option reveal draws from), not at the reveal step itself. [CONFIRMED — timesaver.gg ulaman-sovereign-of-the-well-guide explicitly walks this sequence: "applying a qualifying bone at the Well of Souls with the Omen active" reveals three options exclusively from the forced pool]
- Omen of Abyssal Echoes is consumed **at the reveal step** to discard the offered three and generate one fresh set of three. It is a **single reroll**, not repeatable, and you still pick one of the (new) three — it does not let you cherry-pick across both sets. [CONFIRMED — mobalytics.gg synthesis, conquestcapped.com]

---

## One-desecrated-mod cap & removal

- **Cap**: a Rare item can normally carry only **1 desecrated modifier** at a time (revealed or unrevealed) — you cannot desecrate an item a second time until the existing desecrated mod is gone. [CONFIRMED — mmojugg.com item text, domistae codex, search-synthesis of poe2wiki]
- **Exception**: **Omen of Putrefaction** replaces **all** modifiers on the item with up to 6 desecrated modifiers in one action, and **corrupts the item** in the process (ending further crafting on it). This is a one-shot special case, not a contradiction of the 1-mod cap under normal iterative crafting. [CONFIRMED — mobalytics.gg synthesis + conquestcapped.com, matching wording]
- **Removing a desecrated mod**: an ordinary **Orb of Annulment** or **Chaos Orb** can strip a desecrated mod like any other affix (it is *not* protected) — but untargeted, meaning you risk removing a different mod instead. [single-source — poe2craft.com: "not protected: a stray Chaos or Annulment can remove it"]
- **Omen of Light**: makes your **next Orb of Annulment remove only the Desecrated modifier**, giving you a safe, targeted way to scrub a bad reveal without risking the rest of the item. [CONFIRMED — multiple sources: mobalytics synthesis, conquestcapped.com, domistae codex, timesaver.gg amanamu-farming-guide]

### Omen of Light vs Sinistral Annulment — deterministic scope

- **Omen of Light**: RePoE 4.5.4.7 says the next Orb of Annulment will remove only **Desecrated modifiers**. The current wiki gives the same scope and says it applies to both exclusive and general-pool Desecrated modifiers. [CONFIRMED — committed RePoE `Metadata/Items/Currency/OmenOnAnnulRemoveAbyssMod`; [poe2wiki](https://www.poe2wiki.net/wiki/Omen_of_Light)]
- **Omen of Sinistral Annulment**: RePoE 4.5.4.7 says the next Orb of Annulment will remove only **prefix modifiers**. It does not promise to select a particular prefix. The current wiki has the same tooltip and lists it as a Ritual reward. [CONFIRMED — committed RePoE `Metadata/Items/Currency/OmenOnAnnulRemovePrefixes`; [poe2wiki](https://www.poe2wiki.net/wiki/Omen_of_Sinistral_Annulment)]
- Therefore, use Light when the required target is specifically a Desecrated modifier; use Sinistral only when every acceptable removal target is on the prefix side and the risk among multiple prefixes is understood. These are targeting constraints, not guarantees that a complete multi-step craft is valid.
- **Time-Lost limitation**: neither tooltip proves that removing a temporary "+1 Suffix Modifier allowed" prefix preserves an over-cap suffix set, nor that a particular historical liquid/annul sequence still works in patch 0.5.4. Coach must not guarantee that exact interaction without a separate current primary or in-game source. [UNVERIFIED INTERACTION — explicit stop condition]

---

## Ulaman / Amanamu / Kurgal — the three Lich mod pools

Three "Abyssal Lich" factions, each with an exclusive modifier pool that **cannot be obtained any other way** (not via alchemy/chaos spam, not via essences). Exclusive mods require **item level 65+** [CONFIRMED, 3+ sources: gamerant.com, conquestcapped.com, timesaver.gg].

The primary modifier table supports an elemental mapping. Treat broad guide-site role labels as unreliable shorthand, not game-data categories:

| Lich | Forcing Omen | Directly observed modifier bias | Evidence boundary |
|---|---|---|---|
| **Ulaman, Sovereign of the Well** | Omen of the Sovereign | Lightning/Physical | The primary table includes Lightning penetration/Shock and Physical entries; it does not define an "offense" category. |
| **Amanamu, Liege of the Lightless** | Omen of the Liege | Fire | The primary table includes Fire penetration and Ignite entries; it does not define a "defense" category. |
| **Kurgal, the Blackblooded** | Omen of the Blackblooded | Cold | The primary table includes Cold penetration and Freeze entries; it does not define an "ailment" category. |

Source: the exact entries in [poe2wiki's List of desecrated modifiers](https://www.poe2wiki.net/wiki/List_of_desecrated_modifiers), checked 2026-08-02. The table is the supported scope; it does not prove that every modifier in a family follows one theme.

### Per-slot mod pool example — Bows (the only class with a fetched roll-range table)

⚠️ These specific numbers come from a single secondary source (u4n.com) summarized via an automated fetch tool, not a direct poe2db table read — **treat exact ranges as [unverified]** pending direct poe2db confirmation, but the general structure (prefix/suffix split, ilvl 65 floor, one exclusive mod per Lich per slot-family) matches the confirmed mechanics above.

| Lich | Slot | Mod (approx roll) |
|---|---|---|
| Ulaman | Prefix (ilvl 65) | Projectiles deal (60–79)% increased Damage with Hits against Enemies further than 6m |
| Ulaman | Suffix (ilvl 65) | Projectile Attacks have (10–18)% chance to fire two additional Projectiles while moving |
| Ulaman | Suffix (Bow/Spear) | (8–13)% increased Attack Speed |
| Amanamu | Prefix (ilvl 65) | Companions deal (40–59)% increased Damage |
| Amanamu | Prefix (ilvl 65) | (12–23)% increased Area of Effect for Attacks |
| Amanamu | Suffix (Bow/Spear) | (12–18)% increased Attack Speed; Companions have (12–18)% increased Attack Speed |
| Amanamu | Suffix (Bow/Spear) | (40–60)% chance to Pierce an Enemy |
| Kurgal | Prefix (Bow/Spear) | Projectiles have (25–35)% chance to Chain an additional time from terrain |
| Kurgal | Prefix (ilvl 65) | (30–40)% increased bonuses gained from Equipped Quiver |
| Kurgal | Suffix (ilvl 65) | Projectiles have (25–34)% increased Critical Hit Chance against Enemies further than 6m |
| Kurgal | Suffix (Bow/Spear) | (25–34)% increased Immobilisation buildup |

For weapon/armour/jewellery classes beyond bows, no full per-slot table could be retrieved in this pass — **poe2db.tw's "Desecrated Modifiers" pages are the authoritative source** but returned 403/blank on direct fetch; a follow-up should scrape poe2db directly (browser-based, not the WebFetch tool used here) or pull u4n.com's per-class list articles (they appear to mirror poe2db).

---

## Omens (Desecration-related) — full list

| Omen | Effect | Confirmation |
|---|---|---|
| **Omen of Abyssal Echoes** | Rerolls the three offered options at the Well of Souls once, into a fresh set of three | [CONFIRMED — mobalytics synthesis, game8.co, conquestcapped.com] |
| **Omen of Sinistral Necromancy** | Forces the desecrated mod to land as a **prefix** | [CONFIRMED — mobalytics synthesis, game8.co, domistae codex] |
| **Omen of Dextral Necromancy** | Forces the desecrated mod to land as a **suffix** | [CONFIRMED — same sources] |
| **Omen of Putrefaction** | Replaces **all** modifiers on the item with up to 6 desecrated modifiers, then **corrupts** the item | [CONFIRMED — mobalytics synthesis + conquestcapped.com] |
| **Omen of Light** | Your next Orb of Annulment removes **only** a Desecrated modifier, ignoring the rest | [CONFIRMED — mobalytics synthesis, conquestcapped.com, domistae codex, timesaver.gg] |
| **Omen of the Sovereign** | Forces the next Weapon/Jewellery desecration to pull from **Ulaman's** pool | [CONFIRMED — conquestcapped.com, gamerant.com] |
| **Omen of the Liege** | Forces the next Weapon/Jewellery desecration to pull from **Amanamu's** pool | [CONFIRMED — conquestcapped.com, gamerant.com] |
| **Omen of the Blackblooded** | Forces the next Weapon/Jewellery desecration to pull from **Kurgal's** pool | [CONFIRMED — conquestcapped.com, gamerant.com] |

Two sources described the three faction-forcing omens as scoped to "Weapon or Jewellery" desecration specifically (not armour) [single-source pattern repeated twice — conquestcapped.com, search-synthesis of poe2wiki Omen of the Blackblooded page] — this implies armour desecration may not be able to be family-forced the same way, but this was **not explicitly confirmed or denied** for armour; flag as open question below.

Note: the task brief's framing "which boss each forces" is a **misconception worth correcting** — the Liege/Sovereign/Blackblooded omens force which **Lich's mod pool** your desecration draws from; they do not force which **boss** spawns or drops. The bosses (Amanamu-loyal Void rares, Ulaman/Sovereign-of-the-Well, Kurgal-the-Blackblooded) are separate encounters that themselves drop these omens and other loot — see below.

---

## Abyss bosses & the encounters that matter for farming

- **Amanamu-loyal rares ("Void" rares)**: spawn with a Lichborn modifier ("Amanamu's Void") that conjures a darkness cloud. Kill **inside** the cloud → guaranteed **Omen of the Liege** only (low value, ~1 Alchemy Orb-tier). Kill **outside/after luring out of the cloud** → the Liege omen is removed from the table and you instead roll into 5 other Abyss omens, headlined by **Omen of Light** (reported ~6–10 Divine) and Omen of Abyssal Echoes. **Dragging the rare out of its cloud before the kill is the single highest-value technique in Abyss farming.** [CONFIRMED — conquestcapped.com, timesaver.gg amanamu-farming-guide, both describe the same cloud/lure mechanic]
- **Ulaman, Sovereign of the Well**: found as the Lichborn boss ending an Abyssal Depths (more reliable in ilvl 79+ / T15+ maps). Fight is a DPS-check: retreats to a sub-zone with a Stygian Spire at 75/50/25% HP, must be killed within a 90s timer that carries across all three phases; near-entirely physical damage. Drops: guaranteed rare Stygian Vise belt, ~50% chance Darkness Enthroned (unique belt), chance at **Ulaman's Gaze**, plus Preserved/Ancient bones. [single-source, detailed — timesaver.gg ulaman-sovereign-of-the-well-guide]
- **Kurgal, the Blackblooded**: two-phase fight with a darkness sub-phase, circular arena with crystal totems that bounce projectiles/provide light/fire lasers; primarily physical damage with 15–20% chaos conversion (second-phase beams 80% lightning/20% chaos). Also exists as a legacy Delve (Azurite Mine, depth 90+) encounter. [single-source, detailed — search synthesis of poewiki/poe2wiki Kurgal pages]
- **Tasgul, Swallower of Light** and **Vandroth, Blackblooded Enslaver**: "Abyssal Commander" mini-bosses gating **Kulemak's Invitation**, spawning at the end of an Abyssal Depths in ilvl 79+ maps. As of **0.5.3**, both were patched to **always drop Desecrated Currency** (previously not guaranteed). Functionally interchangeable as loot gates; Vandroth leans Freeze/exploding corpses, Tasgul leans darkness mechanics. Forced via the "Abysses lead to an Abyssal Boss" map modifier + stacked Abyss-spawn-chance Atlas nodes. [CONFIRMED — timesaver.gg tasgul guide + vandroth guide, cross-referenced against 0.5.3 patch-note language]

---

## Gaze items (Amanamu's / Ulaman's / Kurgal's / Tecrod's Gaze)

All four are **"Ancient Augment"** items (a 0.5-era socketable/augment category distinct from PoE1's Abyss Jewels), and they share a **combined limit of one equipped at a time** regardless of which Gaze it is. [CONFIRMED — search synthesis citing multiple mmojugg/wiki item pages, consistent "shared limit of one" phrasing]

Each Gaze grants **different effects depending on which item slot it's socketed into** (Helmet / Gloves / Boots / Body Armour), roughly matching its Lich's theme:

- **Amanamu's Gaze**: Helmet — remove a damaging ailment on Command Skill use; Body Armour — +2 Armour per 1 Spirit; Boots — Movement Speed scaling with Spirit (cap 40%, only applies to non-Sprint MS). [single-source — search synthesis of mmojugg/poe2wiki item pages]
- **Ulaman's Gaze**: Helmet — Accuracy Rating scaling from equipped Helmet's Evasion; Gloves — Critical Hit chance made Lucky against Parried enemies; Body Armour — reduces Deflected-hit damage by 3%. [single-source]
- **Kurgal's Gaze**: Helmet — Life Regen also applies to Mana Regen; Gloves — 40% increased Arcane Surge effect; Boots — 15% increased Mana Cost Efficiency if you haven't Dodge Rolled recently. [single-source]
- **Tecrod's Gaze**: Body Armour — regenerate 1.5% max Life/sec; Gloves — 25% increased Life Cost Efficiency; Boots — 10% increased Movement Speed at Low Life. [single-source]

**Why they're expensive**: they are **boss-exclusive drops**, not craftable and not purchasable via any currency-based crafting path.
- Ulaman's Gaze drops from the **Ulaman, Sovereign of the Well** fight specifically. [single-source — timesaver.gg]
- Tecrod's Gaze drops from encountering a Lich Boss inside an Abyssal Depths generally (Tecrod himself is a separate, independent Abyssal figure — "the Hated Slave," not one of the three Kulemak-serving Liches, still active post-campaign). Historically (0.4-era) reported trading around **~250 Divine**; treat as stale/illustrative only, not a current 0.5 price. [single-source — YouTube title snippet + poe2wiki search synthesis; price figure is old-patch and likely inaccurate for 0.5]
- Amanamu's Gaze reportedly traded around **~1 Divine** (via a ~70 Exalt / 90:1 Exalt-Divine rate conversion) per a currency-guide mention — again treat as a loose, dated data point rather than a current market fact. [single-source — mobalytics currency guide]

**poe.ninja economy pages exist** for these under `poe.ninja/poe2/economy/<league>/abyssal-bones/<item>` but returned JS-shell-only content to the fetch tool (client-rendered SPA) — could not pull live 0.5 Runes-of-Aldur prices directly. Recommend the trading tool itself hit poe.ninja's JSON API endpoints (same pattern as the currency-exchange endpoint already used elsewhere in this codebase) rather than scraping the HTML page.

---

## Abyss farming economics

- Reported income figures vary wildly by source and gearing, from **~1.16 Divine per 50 maps** (conservative baseline) up to **40–45 Divine/hour** with an optimized strategy, and anecdotal reports of **400+ Divine over "a couple of days"** of dedicated farming, or "400–500+ divines per character" over a season with a well-built setup. **Treat all of these as wide, unverified ranges** — they come from farming-guide marketing content (aoeah.com, mmoexp.com, mobalytics.gg guide-author posts, timesaver.gg), not controlled data, and none cross-verify each other's methodology. [single-source each, conflicting — do not treat any single number as reliable]
- **0.5.3 patch change**: Desecrated Currency became a **guaranteed drop** from Abyssal Commanders (Tasgul/Vandroth) and from the "Large Abyssal Trove." [CONFIRMED — timesaver.gg tasgul/vandroth guides, cross-referenced with 0.5.3 patch-note language]
- **Ancient Bones only drop from Abyss chests, not monsters** — character/item rarity does nothing for them; only **chest rarity** and Abyss-specific reward Atlas modifiers matter. [single-source — mmoexp.com "farm ancient bones" article]
- Key Atlas-tree levers repeatedly named across guides: **Lightless Legions** (single most-recommended notable), Abyss spawn-chance nodes, monster-count-per-Abyss nodes, desecrated-modifier-count nodes, and "Hearts of the Well"/Lichborn-related nodes. [single-source, consistent internally within timesaver.gg's own guide set but not cross-checked against a second independent source]
- Value capture is mostly **indirect**: Abyss "prints" Omens, Abyss Jewels, Stygian Vise belts, and chase uniques (Darkness Enthroned, Gazes), which are then converted to Divine via Currency Exchange/trade — not direct currency drops. [CONFIRMED — conquestcapped.com, timesaver.gg both frame it this way]

---

## Wallet warnings

1. **Desecrating a full (6-mod) rare will randomly delete one of its existing affixes** to make room — never desecrate a finished item unless you've priced in losing a random mod (or are deliberately using it as a "reroll one mod" tool). [CONFIRMED]
2. **An item with a desecrated mod (revealed or not) cannot be desecrated again** — trying will hard-fail. Don't buy/stack multiple bones onto the same item expecting to "layer" desecrations; you need Omen of Putrefaction (all-or-nothing, corrupts) for more than one. [CONFIRMED]
3. **Gnawed bones physically cannot roll the valuable Lich-exclusive mods** (ilvl 65 floor) — using Gnawed bones on anything you actually want an Ulaman/Amanamu/Kurgal mod on is wasted currency; always use Preserved or better once past ilvl 64/65 gear. [CONFIRMED]
4. **Removing a bad desecrated roll with a plain Chaos/Annulment is a gamble** — it can strip a *different* mod instead of the desecrated one. Always pair with **Omen of Light** for a targeted removal, or accept the risk consciously. [single-source but mechanically consistent with base-game annul/chaos behavior]
5. **The faction-forcing omens (Liege/Sovereign/Blackblooded) reportedly only apply to Weapon/Jewellery desecration** — don't buy one expecting to force a Lich pool on armour; this is unconfirmed for armour and should be tested cheaply before committing expensive omens.
6. **Omen of Abyssal Echoes only rerolls once** — it's not a "reroll until happy" loop; budget accordingly and don't buy stacks expecting repeated rerolls per reveal.
7. **Vertebrae (waystone desecration) may currently be drop-disabled** per one 0.5.3-era source — don't farm/buy expecting to use it until independently confirmed live in 0.5.4.
8. **Gaze items share a single "Ancient Augment" slot limit of one** — buying a second Gaze (or a Gaze plus another Ancient Augment) expecting them to stack is a wasted purchase.
9. Reported abyss farming income figures span a 40x range across sources (1.16 Div/50 maps to 40+ Div/hour) — **don't plan a build/investment around any single cited number**; check your own per-map return before scaling up bone/omen purchases.

---

## Profit angles

1. **Sell Omens rather than use them, if you don't need the specific effect.** Omen of Light in particular reportedly trades at 6–10 Divine — multiple guides explicitly frame "lure Amanamu-loyal rares out of their darkness cloud before killing" as a technique aimed at flipping *this specific omen*, not at using it yourself. [pattern confirmed across 2 sources: conquestcapped.com, timesaver.gg]
2. **Sell bones/desecration services to buyers who can't reach the Well of Souls setup themselves** — a classic PoE crafting-service model; desecrated-but-unrevealed items or completed Lich-mod items on ilvl65+ bases are valuable because the Lich pool is otherwise unobtainable.
3. **Target-farm Ulaman, Sovereign of the Well specifically** if going for Ulaman's Gaze / Darkness Enthroned / Stygian Vise value — it's a fixed, repeatable boss encounter (not a random rare), so it's the most "farmable" of the Gaze sources. [single-source, timesaver.gg]
4. **Craft-and-flip weapon/jewellery bases with forced Lich mods** using the Sovereign/Liege/Blackblooded omens — since these mods are otherwise unattainable, verify the exact base-specific modifier in the primary table instead of assuming an offense/defense/ailment family role.
5. **Guaranteed-drop bosses (Tasgul/Vandroth) as a stable desecrated-currency income floor** post-0.5.3 — since these now *always* drop Desecrated Currency, running T15+ maps with "Abysses lead to an Abyssal Boss" forced is a lower-variance version of general Abyss farming versus hoping for randomly-spawned Abyssal Depths bosses.
6. **Ancient Bones are chest-drop-only and rarity-independent** — this means investing in **chest rarity / Abyss reward Atlas nodes**, not character Magic Find, is the correct lever for Ancient Bone income; don't waste currency stacking IIR gear for this specific farm.

---

## Open questions

1. **[Primary, unresolved] Does picking a mod at the Well of Souls block that mod (or its whole Lich family) from being offered again** — on the same item across repeat desecrations, or across a character's future desecrations generally? No source found makes this claim in either direction. This needs either (a) a direct Reddit/forum search from an environment where reddit.com isn't blocked, (b) a controlled in-game test (desecrate the same item repeatedly after removing the desecrated mod each time via Omen of Light, log which mods appear), or (c) a GGG dev post/patch note reference.
2. Do the Liege/Sovereign/Blackblooded faction-forcing omens work on **armour** desecration (Rib bone), or are they genuinely restricted to Weapon/Jewellery (Jawbone/Collarbone) as two sources suggested? If restricted, is there any way to target a specific Lich's mod on armour at all?
3. Full, verified per-slot Ulaman/Amanamu/Kurgal mod tables with exact roll ranges for weapon classes other than bows, and for armour/jewellery — the bow table pulled here is single-source and came through an automated summarizer, not a direct poe2db read. Needs a direct poe2db.tw scrape (browser-rendered, since the site 403'd a plain fetch).
4. Current (0.5.4, Runes of Aldur) live market prices for Preserved/Ancient bones and all four Gaze items — poe.ninja's SPA blocked scraping in this pass; the ~250 Div Tecrod's Gaze and ~1 Div Amanamu's Gaze figures found are stale (0.4-era) and should not be trusted for current pricing.
5. Exact wording of the "Failed to apply item" and Corrupted/Sanctified-blocking error messages — reported only via search-engine synthesis of a wiki page that could not be directly fetched; needs in-client or direct-wiki verification.
6. Whether Preserved Vertebrae (waystone desecration) is still drop-disabled in the current 0.5.3/0.5.4 patch, or was re-enabled.
7. Whether the "Altered Collarbone" (Genesis Tree jewellery bone) is real and current, or a misread/legacy mechanic — only one thin source found it.
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
  → The divergence itself is real and confirmed, not a KB artifact — current guide content spans everything from 'a few Divine per hour' on a budget setup up to '50 Divines Per Hour,' '80 Divines Profit in 20 Maps,' '11+ Divine per map' on juiced Breach+Delirium builds, and a dedicated '400+ Divines in Two Days' strategy piece for patch 0.5. The KB should present these as setup-dependent outliers (budget vs. juiced vs. multi-day session totals) rather than as comparable single numbers, and should not average or reconcile them into one 'true' rate — they measure different things (per-map, per-hour, per-session, per-season) with unstated investment levels. (https://www.mmogah.com/news/path-of-exile-2/poe-2-05-abyss-strategy-how-players-are-making-400-divines-in-two-days)
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
