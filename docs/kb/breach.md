# PoE2 Breach — Catalysts, Breach Rings, Genesis Tree, Chayula/Xesht

Patch stamp: **0.5.0 "Runes of Aldur"** (released 2026‑05‑29) through **0.5.4** hotfixes, as of 2026‑07‑14. Breach was fully reworked in 0.5.0 (Genesis Tree replaced the old Breachlord/domain flow) — pre‑0.5 guides describing catalyst drops from monsters, 50% breach ring quality, or Chayula as the breach pinnacle boss are **stale and contradict current mechanics**.

---

## 0. Correction to the brief — read this first

The task brief asks to cover "Chayula boss loot table" and a rumored "double mana mod" Breach Ring. Both leads turned out to be dead ends / conflations, confirmed via poe2wiki (primary source, [CONFIRMED]):

- **There is no standalone "Chayula, Who Dreamt" pinnacle fight in PoE2.** That boss exists in the original Path of Exile (PoE1); searches for it return PoE1 Maxroll/wiki pages. In PoE2, Chayula is represented only as: a Catalyst name (Chayula's Catalyst, chaos-tag quality), the "Flame of Chayula" remnants from the Acolyte of Chayula ascendancy's `Into the Breach` skill, and flavor text ("with a blessing from Chayula...") for the Breach Hive mechanic. The actual Breach pinnacle boss in 0.5.x is **Xesht, We That Are One**, gated behind Breachstones → Breach Domains → defeating Esh and Tul → a Realmgate next to the Ziggurat Refuge. [CONFIRMED] — poe2wiki Breachstone page ("Breachstones were initially used as the key to access the pinnacle boss, Xesht, We That Are One"), corroborated by timesaver.gg Xesht guide and 404 on poe2wiki for any "Chayula, Who Dreamt" article.
  - Source: https://www.poe2wiki.net/wiki/Breachstone , https://timesaver.gg/blog/poe2-xesht-guide
- **The "increased Damage per 100 max Mana" / "increased Crit Chance per 100 max Mana" mods are not Breach Ring mods.** They are **Vaal Cultivation modifiers exclusive to Rathpith Globe**, a unique Sacred Focus (caster off-hand), obtainable only by using a Vaal Cultivation Orb on a *Corrupted* Rathpith Globe to reroll one of its explicit mods. Rathpith Globe's base (non-cultivated) explicit mods are Life-based, not Mana-based ("3% increased Crit Chance per 100 max Life", "6% increased Damage per 100 max Life" as of 0.4.0/0.5.0). Breach Rings have no mana-doubling or "per 100 mana" mods at all — their mod pool is the standard ring affix pool plus a few Genesis‑Tree‑exclusive caster/minion mods (see §3). [CONFIRMED] — poe2wiki Rathpith Globe page.
  - Source: https://www.poe2wiki.net/wiki/Rathpith_Globe

Everything below is written against actual 0.5.x mechanics, not the brief's assumptions.

---

## 1. Catalysts

### 1.1 What quality actually does

Catalysts are Breach‑exclusive currency that add a special **Quality type** to Rings, Amulets, or Jewels. This quality **scales the magnitude of matching modifiers only** — it does NOT bias which mods roll or their weight in the affix pool by itself. [CONFIRMED] — poe2wiki Catalyst page: "Catalysts add a special quality types to rings, amulets, or jewels that enhance the magnitude of modifiers of a specified type." Example given by timesaver.gg: a +60 Life roll becomes +72 at 20% Flesh Catalyst quality (60 × 1.20). [single-source magnitude example, but mechanic itself is CONFIRMED]
Source: https://www.poe2wiki.net/wiki/Catalyst , https://timesaver.gg/blog/poe2-catalysts-guide

**Weight bias exists only via Omen of Catalysing Exaltation** — this confirms the brief's suspicion exactly. Right-clicking this Ritual Omen arms it; your next Exalted Orb then **consumes all Catalyst Quality on the item** and multiplies the weight of modifiers matching that catalyst's tag:
- At 20% quality: **5x weight** multiplier for the tagged mod family.
- At 40% quality: **7.5x weight** multiplier.
[CONFIRMED] — poe2wiki Omen of Catalysing Exaltation page, corroborated by Game8 and Mobalytics omen guides.
Source: https://www.poe2wiki.net/wiki/Omen_of_Catalysing_Exaltation

Acquisition: Omen of Catalysing Exaltation drops from the endgame variant of The King in the Mists, or can be bought with Ritual Tributes. [single-source] Source: Game8.

Practical consequence: quality on a catalyzed ring/amulet is a **one-shot resource** if you plan to use this Omen — the Exalt burns it all in one application, win or lose on what mod you actually get (weight bias, not guarantee).

### 1.2 Full catalyst list (13 ring/amulet + 13 jewel "Refined" mirrors)

All confirmed directly off the live poe2wiki Catalyst page (authoritative, matches current 0.5.2+ patch — Necrotic Catalyst added 0.5.2). [CONFIRMED]
Source: https://www.poe2wiki.net/wiki/Catalyst

| Catalyst (Ring/Amulet) | Tag enhanced | Drop level | Refined (Jewel) counterpart | Jewel drop level |
|---|---|---|---|---|
| Adaptive Catalyst | Attribute (Str/Dex/Int) | 30 | Refined Adaptive Catalyst | 50 |
| Carapace Catalyst | Armour, Evasion, Energy Shield | 30 | Refined Carapace Catalyst | 50 |
| Chayula's Catalyst | Chaos | 30 | Refined Chayula's Catalyst | 50 |
| Esh's Catalyst | Lightning | 30 | Refined Esh's Catalyst | 50 |
| Flesh Catalyst | Life | 30 | Refined Flesh Catalyst | 50 |
| Necrotic Catalyst *(added 0.5.2)* | Minion | 30 | Refined Necrotic Catalyst | 50 |
| Neural Catalyst | Mana | 30 | Refined Neural Catalyst | 50 |
| Reaver Catalyst | Attack | 30 | Refined Reaver Catalyst | 50 |
| Sibilant Catalyst | Caster | 30 | Refined Sibilant Catalyst | 50 |
| Skittering Catalyst | Speed | 30 | Refined Skittering Catalyst | 50 |
| Tul's Catalyst | Cold | 30 | Refined Tul's Catalyst | 50 |
| Uul-Netol's Catalyst | Physical | 30 | Refined Uul-Netol's Catalyst | 50 |
| Xoph's Catalyst | Fire | 30 | Refined Xoph's Catalyst | 50 |

All catalysts stack to 10. Applying a **different** catalyst type wipes/replaces the item's current quality — you can only carry one flavour of quality per item at a time. [CONFIRMED] — item tooltip text "Replaces other quality types" on every catalyst, poe2wiki.

**Item-level interaction**: the higher the item's ilvl, the less quality each application grants — lower-ilvl bases are cheaper to catalyst to max quality. [CONFIRMED] — poe2wiki Quality page: "When applying Quality to an item using Currency, the Equipment's Item Level will determine how much Quality you get. The higher the Item Level, the less Quality each Currency Item will apply."
Source: https://www.poe2wiki.net/wiki/Quality

**0.5.0 source change**: Catalysts can no longer drop from monsters at all — they are now obtained **solely from the Genesis Tree** (Currency Womb, birthed from Lavish Wombgifts). [CONFIRMED] — multiple 0.5.0 patch summaries (poebuilds.net, poe2wiki Catalyst page confirms Genesis-Tree-only sourcing).
Source: https://www.poe2wiki.net/wiki/Catalyst

### 1.3 Quality caps

- Normal Rings/Amulets: default max **20%** quality. [CONFIRMED]
- **Breach Ring**: implicit raises the cap to **40%** (not 50% — that was a pre-0.2.0 legacy value; several stale 0.2-era guides still circulating quote 50%, which is wrong for 0.5.x). [CONFIRMED] — poe2wiki Breach Ring page version history: "0.2.0: Breach Rings now have the Implicit modifier of Maximum Quality is 40% (previously 50%). Existing items can be updated using a Divine Orb."
- **Refined Breach Ring** (a rarer Genesis Tree output, see §3): implicit is **+25% to Maximum Quality**, giving a **45%** cap. [CONFIRMED] — poe2wiki Refined Breach Ring / Quality page.
- Jewels: same 20% default, raised via Refined catalysts' own mechanic (jewels normally can't take quality at all outside catalysts — poe2wiki Quality page lists Jewels among the item types that need Refined Catalysts specifically to get quality).
- Other ways past 20% that stack with the above: **Essence of the Breach** (Genesis Tree Currency Womb output) crafts a guaranteed "+20% to Maximum Quality" modifier onto a Rare piece of jewellery — meaning even a *non*-Breach-Ring rare ring/amulet can reach a 40% *effective* cap by combining default 20% + this essence's +20%. Infusers add a further +10% (stacks, chance to corrupt). [CONFIRMED] — poe2wiki Quality page.
Source: https://www.poe2wiki.net/wiki/Breach_Ring , https://www.poe2wiki.net/wiki/Quality

---

## 2. Breach Ring — the item class

### 2.1 Base facts

- **Requires Level 40**, implicit **"+20% to Maximum Quality"** (this is the delta added to the base 20% cap, resulting in the 40% total quality cap described above — the wiki's own item-acquisition text says "increase the default maximum quality from catalysts from 20% to 40%"). [CONFIRMED]
- Metadata: Item class **Ring**, ID `Metadata/Items/Rings/FourRingBreach`.
- Drop level 40, but **drop is restricted** — as of 0.5.0 it **no longer drops from Breach encounters or from Xesht** at all. It is now **exclusively created by the Genesis Tree**, specifically: place a **Signet Wombgift** into the Ring Womb while the **Otherworldly Clutch** node is allocated (grants birthed items a 10% chance to be a Breach Ring instead of a normal ring/other Genesis-exclusive base). [CONFIRMED] — poe2wiki Breach Ring version history + Genesis Tree Ring Womb node list.
- **Refined Breach Ring**: a Ring Womb node called **Refined Grip** gives already-rolled Breach Rings a further 5% chance to birth as a Refined Breach Ring instead (45% quality cap, +25% implicit vs the base ring's +20%). [CONFIRMED]
Source: https://www.poe2wiki.net/wiki/Breach_Ring , https://www.poe2wiki.net/wiki/The_Genesis_Tree

### 2.2 Mod pool — it's a normal ring base, not a special affix pool

Breach Ring's modifier pool is the **standard "List of modifiers for rings"** pool (per its own wiki page, which just links out to the general ring mod list) — it does not have Breach-exclusive affixes baked into its base type. What IS Breach/Genesis-exclusive is a separate small family of **Genesis Tree caster and minion modifiers** that can roll on Rings and Belts (and separately on Amulets) when specific Ring-Womb passive nodes are allocated during birthing (e.g. `Buried Alive` = birthed item always has two Minion modifiers, `Overtaken by Power` = always has two Caster modifiers, `Natural Weaving` = always has a Caster modifier). [CONFIRMED] — poe2wiki Genesis Tree Ring Womb node table.
Source: https://www.poe2wiki.net/wiki/The_Genesis_Tree

So the "high-value Breach Ring mods" in practice are: whatever top-tier ring affixes you can hit (flat elemental/physical damage to attacks, spell damage %, life/mana, resistances, attribute stacking, etc.) at 40–45% quality via the matching catalyst, optionally biased with Omen of Catalysing Exaltation — the value proposition is the **higher quality ceiling amplifying normal top-tier mods**, not a unique mod pool. [single-source practical framing, aggregated from poe2fun/mobalytics crafting guides + confirmed mechanic above]
Source: https://poe2fun.com/guides/breach-ring-crafting-guide , https://mobalytics.gg/poe-2/guides/attack-breach-ring-craft

### 2.3 Other Genesis-Tree-exclusive ring bases (Signet Wombgift outputs, siblings of Breach Ring)

The Ring Womb can birth several other exclusive bases besides Breach Ring/Refined Breach Ring — useful to know these are NOT Breach Rings and don't get the 40% quality bonus:

| Base | Implicit |
|---|---|
| Biostatic Ring | +1% to all maximum Resistances |
| Vitalic Ring | (4–6)% increased maximum Life |
| Mnemonic Ring | (4–6)% increased maximum Mana |
| Kinetic Ring | Adds (6–9) to (11–15) Physical Damage to Attacks |
| Oneiric Ring | (11–23)% increased Chaos Damage |
| Grasping Ring | Gains bonuses from Socketed Items as though Gloves; has 1 hidden Augment Socket |

[CONFIRMED] — poe2wiki Genesis Tree page, Ring Womb section.
Source: https://www.poe2wiki.net/wiki/The_Genesis_Tree

Note: an earlier web summary claimed a special node "Otherworldly Clutch" gives 10% chance for birthed items to become Breach Rings specifically for **Vitalic Rings** ("For melee players chasing Vitalic Rings... Take Otherworldly Clutch") — cross-checking against the wiki's own node table, Otherworldly Clutch is the node that unlocks Breach Ring output generally, and Vitalic Ring comes from a different node ("Engorged": 10% chance for birthed items to be [Vitalic]). [single-source / minor discrepancy between community guide phrasing and the wiki node table — flagged, low stakes]

### 2.4 Crafting route (community-consensus, single-source aggregation)

1. Farm/buy an ilvl 75–78 Breach Ring base (lower ilvl = more quality per catalyst application, keep it below the point where "too much high-level mod pool clutter" appears). [single-source] Source: mobalytics.gg attack-breach-ring-craft guide.
2. Apply the matching catalyst (e.g. Reaver Catalyst for attack-damage rings) up to the 40/45% cap.
3. Fracture a T1 damage/defence mod to lock it in.
4. Use Omen-controlled Exalted Orbs (Omen of Catalysing Exaltation, burning the built-up quality) to bias in a second/third complementary high-tier mod of the same tag family.
5. Manage risk with targeted Annulment Orbs if an unwanted mod lands.
[single-source] Source: https://mobalytics.gg/poe-2/guides/attack-breach-ring-craft

---

## 3. Genesis Tree — the crafting system Breach revolves around in 0.5.x

- Located at the **Monastery of the Keepers**. Unlocked after your first Breach encounter. [CONFIRMED]
- Two resources: **Hiveblood** (auto-collected at end of Breach encounters based on Breach monsters killed) and **Wombgifts** (drop at end of Breach encounters or from Hive Fortress breach chests). [CONFIRMED]
- Four "Wombs" (Currency / Ring / Amulet / Belt) each take a specific Wombgift type (Lavish / Signet / Ornate / Banded respectively), plus a Wombless Breachstone conversion for Revelatory Wombgifts. [CONFIRMED]
- Each Womb has **10–15 allocatable passive points** (~1/6 of that Womb's full node tree) — free respec, no cost. Points come from the Breach questline, unlocking Womb passive nodes (by birthing ~10 times per womb to unlock the full node tree), and specific Breach Atlas passives (Diverse Control: +2 per womb; Exquisite Design: +5 Amulet womb; Growing Wealth: +5 Currency womb). [CONFIRMED]
- Hiveblood cost scales steeply with Wombgift item level: a level 78 Lavish Wombgift costs 734 Hiveblood, level 79 costs 1,269, level 80 costs 1,364. [single-source] Source: boostmatch.gg / rpgstash.
- The Genesis Tree can hold up to (reportedly) 100,000 Hiveblood — flagged `[confirmation needed]` on the wiki itself. [unverified]
- Genesis Tree Currency Womb (Lavish Wombgift) outputs: Catalysts, **Essence of the Breach** (crafts +20% max quality onto Rare jewellery), **Altered Collarbone** (desecrates a Rare Amulet/Ring/Belt with a chance for "otherworldly" modifiers), **Breach Splinters**, and standard currency (Chaos/Exalted/Divine/Regal/Annulment/etc, each with dedicated bias nodes). [CONFIRMED]
Source: https://www.poe2wiki.net/wiki/The_Genesis_Tree

---

## 4. Breachstones / Flawless Breachstones

- **Breach Splinter**: stack size 300; combining 300 auto-forms a **Revelatory Wombgift** (not a Breachstone directly). [CONFIRMED]
- **Breachstone**: drop level 68, "drop restricted" — as of 0.5.0 acquired only by birthing a Revelatory Wombgift at the Genesis Tree. Required to reveal a **Breach Fortress/Domain** on the Atlas. [CONFIRMED]
  - History: originally (0.1.0) the key to the Xesht pinnacle fight directly → 0.3.0 pinnacle-boss-access rework switched entry to raw splinter stacks (choose-your-difficulty at the Realmgate) and disabled Breachstone drops entirely → 0.5.0 brought Breachstones back with a new function: revealing Breach Domains on the Atlas, via the splinter→Revelatory Wombgift→Genesis Tree pipeline. [CONFIRMED]
Source: https://www.poe2wiki.net/wiki/Breachstone
- **Flawless Breachstone**: made by applying a "Breach blessing" to a regular Breachstone. The resulting Breachlord's Domain has increased item quantity/rarity, higher monster level/XP/pack size, but Flawless-tier domains spawn with additional modifiers and grant **less** additional time per monster kill (i.e., tighter timer pressure for more reward). Reported (uncross-verified against poe2wiki directly) that Flawless domains cannot drop un-upgraded Breach uniques, only upgraded ones. [single-source] Source: aggregated WebSearch snippet citing poewiki/aoeah, not independently confirmed on poe2wiki.net in this research pass — **treat as single-source, verify in-game before relying on it for a trading tool.**

---

## 5. Breach pinnacle content — Xesht, We That Are One (not Chayula)

Access chain (0.5.x): farm Breach Splinters in maps → auto-convert to Revelatory Wombgift → birth a Breachstone at the Genesis Tree → clear the Breach Domain ladder (Breach Hive → Sky Hive → Hive Fortress) → defeat the Breachlord sub-bosses **It That Was Esh & It That Was Tul** → gain access to a Realmgate next to the Ziggurat Refuge on the Atlas → choose a difficulty tier and enter. [single-source, timesaver.gg — but structurally consistent with poe2wiki's Breachstone/Genesis Tree pages, so treated as reliable]
Source: https://timesaver.gg/blog/poe2-xesht-guide

Difficulty tiers reported by timesaver.gg (splinter cost scales with boss HP/reward, exact numbers single-source, verify before using in a pricing tool):
| Tier | Splinter cost | Approx. boss HP |
|---|---|---|
| 1 | 50 | ~2.9M |
| 2 | 100 | ~6.5M |
| 3 | 150 | ~14.5M |

Mid-fight boss note: **Vruun, Marshal of Xesht** spawns during the Stabilised Breach process inside maps (not the Realmgate pinnacle) — community guidance explicitly states "he is not a pinnacle boss," i.e. don't confuse Vruun encounters in open-world Stabilised Breaches with the actual Xesht Realmgate fight. [single-source] Source: boostmatch.gg.

Loot highlights (chase items), Xesht pinnacle:
- **Uul-Netol's Embrace** — a Lineage Support Gem (40% of physical damage as extra chaos + armour break per one summary); described as trading for "hundreds of Divine Orbs," the single best/most sought Xesht-exclusive drop. [single-source, magnitude of value not independently corroborated — treat as directional only] Source: timesaver.gg, mobalytics "Xesht drop rates" page title.
- **Hand of Wisdom and Action** (Spiral Wraps unique gloves) — also droppable, popular for Invoker/Deadeye builds. [single-source]
- First-clear bonus: **Otherworldly Book of Knowledge** grants 2 Breach Atlas Passive Points per difficulty tier cleared for the first time. [single-source]
- Difficulty scaling increases rare-unique drop chances from Xesht's loot table. [single-source]
Source: https://timesaver.gg/blog/poe2-xesht-guide , https://mobalytics.gg/poe-2/guides/xesht-drop-rates

Other Breach-exclusive uniques confirmed on poe2wiki's Breach navbox (drop sources not itemized per-boss in this pass): Beyond Reach (quiver), Choir of the Storm (amulet), Controlled Metamorphosis (jewel), Hand of Wisdom and Action (gloves), Nightfall (shield), Skin of the Loyal (body armour), and **Grasping Mail** — a level‑65 body armour that can roll Ring modifiers and take Catalysts, obtainable by trading in 60 Breach Rings via the "Grasping Orchid" (mechanic name single-source, needs verification). [CONFIRMED item existence via poe2wiki navbox; the 60-ring exchange mechanic is single-source]
Source: https://www.poe2wiki.net/wiki/Breachstone (navbox)

---

## 6. Wallet warnings

- **Don't apply catalysts to high-ilvl bases if you're chasing max quality cheaply.** Higher ilvl = less quality per application; you'll burn far more catalyst stock hitting 40% on an ilvl 84 base than an ilvl 75 one. [CONFIRMED mechanic, poe2wiki Quality page]
- **Applying a different catalyst type wipes your existing quality outright.** There's no partial conversion — switching from Reaver to Sibilant on the same ring zeroes your invested currency's quality progress. Decide your damage-type/stat family before you start catalysing.
- **Omen of Catalysing Exaltation consumes ALL catalyst quality on the item in one shot**, whether or not the resulting Exalted mod is the one you wanted. It only biases weight (5x at 20%, 7.5x at 40%) — it does not guarantee the mod. Don't fire it on a ring you haven't otherwise finished prefixes/suffixes on, and don't fire it if you're not prepared to lose all accumulated quality on a miss.
- **Breach Rings stopped dropping from Breach encounters and from Xesht in 0.5.0.** If you're valuing/pricing based on old encounter-drop assumptions (pre-0.5 guides, or bots scraping stale wiki caches), your model is wrong — the only 0.5.x source is the Genesis Tree Signet Wombgift + Otherworldly Clutch node, at a 10% birth chance.
- **Many web guides (0.2-era, uncorrected) still state Breach Ring quality caps at 50%.** The live cap is 40% (45% for Refined Breach Ring). This single number difference is enough to break an automated flip-value calculator that hard-codes an old cap.
- **Genesis Tree Hiveblood cost scales steeply with Wombgift item level** (roughly 734 → 1,269 → 1,364 Hiveblood for ilvl 78/79/80 Lavish gifts per one source) — birthing at max ilvl to "save time" can be a currency sink if you haven't unlocked the Womb's passive nodes yet; low-ilvl gifts are far cheaper for the mandatory ~10 birthings needed just to unlock a Womb's node tree.
- **"Vruun" is not the pinnacle boss** — don't sell/buy Breachstone-adjacent carries assuming a Vruun kill is equivalent to clearing Xesht; they're different encounters at different points in the Breach progression.

---

## 7. Profit angles

1. **Genesis Tree Lavish Wombgift → Catalyst arbitrage.** Feed Lavish Wombgifts (from Breach Splinter farming / breach chests) into the Currency Womb with nodes biased toward Catalyst output (`Catalyst Chance`, `Additional Different Catalyst Chance`, `Additional Duplicate Catalyst Chance`). Community reporting (0.5.3): Reaver Catalysts ~22 Exalted, Sibilant Catalysts ~10 Exalted each at that point in the league; by mid-league, Sibilant reportedly ran up to 251 Exalted and Reaver 146 Exalted (Refined variants 1,600–3,000 Exalted). Catalyst prices clearly compound hard as league matures — early bulk selling vs. late-league Refined-catalyst hoarding are different strategies with very different payoffs. [single-source pricing snapshots, volatile — do not hard-code, pull live from market API] Source: boostmatch.gg, aggregated WebSearch pricing snapshot.
2. **Altered Collarbone + Annulment Orb bulk-selling.** One farming guide's stated core loop: target Altered Collarbones (~2.3–2.5 Divine each on the exchange) and Annulment Orbs as the two reliable high-value Currency Womb outputs, treat Chaos/Exalted/gold as bonus. [single-source] Source: boostmatch.gg.
3. **Tablet-optimized Breach mapping floor: ~30 Divine/hour, ceiling 60+ Divine/hour** with a correctly tuned tablet setup (mandatory suffixes: "Increased Rare Monsters when Stabilised" + "Quantity of Hive Blood Found"; city biomes for the 4th tablet slot; Doryani master path for passive Fracturing Orb income ≈5 per 5-hour session at 4-5 Divine each). Other sourced figures in the same search sweep ranged wildly (2 Divine/hour raw, 3 Divine/hour minmaxed-splinters-only, 4-11 Divine/hour boss-focused, up to a viral-but-unrepresentative 150 Divine/hour claim) — **treat any single Div/hour number as build/luck/session dependent, not a floor guarantee.** [multiple partially-conflicting single-source figures — median estimate ~30-60 Div/hr for a competent tablet-farming setup is the most corroborated range]
   Source: https://boostmatch.gg/blog/poe-2/articles/poe2-breach-farming-divines-per-hour-guide-05 , https://timesaver.gg/blog/poe2-50-divines-per-hour-farming , https://timesaver.gg/blog/poe2-breach-tablet-farming-divines-guide
4. **Breach Ring crafting/flipping.** Because the 40-45% quality cap amplifies otherwise-normal top-tier ring affixes, a well-rolled catalyzed Breach Ring (double/triple flat elemental damage, or life/mana/attribute stacking depending on catalyst) commands a premium over an equivalent normal ring purely from the quality multiplier. This is a crafting-service niche: buy cheap low-ilvl Breach Ring bases + bulk catalysts, sell finished 40%+ quality rings. [single-source strategic framing] Source: poe2fun.com, mobalytics.gg crafting guides.
5. **Xesht pinnacle carries/kills for Uul-Netol's Embrace.** If the hundreds-of-Divine valuation for this Lineage Support Gem holds, farming/selling Xesht kills (or the gem itself) at higher difficulty tiers (better drop odds) is a standalone income stream distinct from general Breach mapping. [single-source, unverified magnitude]

---

## 8. Open questions

- Exact numeric magnitude bonus curve per catalyst application (how many % quality per use at a given ilvl) — not found; only the qualitative "higher ilvl = less per use" relationship is confirmed.
- The "relative catalyst weights" estimate that poe2wiki's own Catalyst page links to (an external resource) was not retrieved in this pass — would clarify how contested/rare each catalyst-tag mod family is within the ring/amulet affix pool.
- Whether Flawless Breachstone's "cannot drop un-upgraded Breach uniques" claim is accurate for 0.5.x — sourced from a search-engine synthesis, not independently confirmed on poe2wiki.net directly.
- Exact mechanic/cost of the "Grasping Orchid" (60 Breach Rings → Grasping Mail) — only single-sourced from one WebSearch synthesis; not confirmed against poe2wiki's own Grasping Mail article text directly.
- Live, current (mid-July 2026) catalyst and Breach Ring/Refined Breach Ring/Uul-Netol's Embrace market prices — the pricing figures gathered here are scattered snapshots from different dates across the 0.5.x patch cycle and should be replaced with a live poe.ninja/poe2scout pull before being used in any actual flip-value calculation.
- Whether "Otherworldly Clutch" (Breach Ring node) and "Engorged" (Vitalic Ring node) are correctly distinguished — one community guide conflated them; the wiki's own node table should be treated as authoritative but wasn't re-verified against a second independent source for this specific node-to-output mapping.
- Full explicit mod pool differences (if any) between a plain Rare ring base and a Breach Ring base beyond the quality-cap implicit — the wiki explicitly defers to the generic "List of modifiers for rings" page, which was not fetched in this pass to check for any Breach-Ring-gated affixes.

---

> Built 2026-07-14 by the poe2-kb-build workflow (research + adversarial verify). Patch 0.5.x.

## Adversarial verification (post-research)

- confirmed — Breach Ring quality cap is 40% (45% for Refined Breach Ring) in current 0.5.x, not the 50% many guides quote
  → Correct as stated. Breach Rings carry an innate implicit that caps maximum quality at 40%; the Genesis Tree's Refined Breach Ring variant raises that cap to 45%. Any guide quoting a flat 50% cap for a standard Breach Ring is wrong (that figure may be bleeding over from generic PoE2 quality-cap discussion, e.g. Infuser-boosted items). (https://www.poewiki.net/wiki/poe2wiki:Breach_Ring)
- confirmed — Catalyst quality scales only modifier magnitude; weight/chance bias comes exclusively from Omen of Catalysing Exaltation (5x at 20% quality, 7.5x at 40% quality) which consumes all quality on use
  → Correct. Catalyst quality on rings/amulets/jewels normally only scales the magnitude of matching modifiers (it stopped affecting roll chance/weight before this era of the game). Omen of Catalysing Exaltation is the sole mechanism that converts that stored quality into a weight bias on your next Exalted Orb: 5x multiplier at 20% quality, 7.5x at 40% quality, and it consumes all Catalyst quality on the item when used. (https://www.poe2wiki.net/wiki/Omen_of_Catalysing_Exaltation)
- confirmed — There is no Chayula, Who Dreamt boss fight in PoE2 — the Breach pinnacle boss is Xesht, We That Are One, reached via Breachstone -> Breach Domain -> defeating Esh and Tul -> Realmgate
  → The 'no Chayula boss fight, Xesht is the pinnacle' part is correct — in PoE2 Chayula was demoted from a fightable Breachlord (as she was in original PoE1 as 'Chayula, Who Dreamt') to 'The Dreamer', a lore NPC/questgiver you talk to at the Genesis Tree, not a boss encounter. However, the described access chain has the order and terminology wrong: you first defeat the Hive Colony boss pair 'It That Was Tul' and 'It That Was Esh' to obtain the Breachlord Sac, hand it to the Dreamer to unlock the Genesis Tree/Twisted Domain, then place a Breachstone (built from Breach Splinters via the Genesis Tree) into the Realmgate near the Ziggurat Refuge to open the Twisted Domain and fight Xesht. There is no separate area called 'Breach Domain', and Esh/Tul are defeated before the Breachstone/Realmgate step, not after. (https://www.poe2wiki.net/wiki/The_Dreamer)
- confirmed — Rathpith Globe's 'per 100 max Mana' spell damage/crit mods are Vaal Cultivation Orb rerolls on a corrupted item, not innate, and are not Breach Ring mods at all
  → Correct. The base (uncorrupted) Rathpith Globe/Sacred Focus innately grants 5% increased Spell Critical Strike Chance and 5% increased Spell Damage per 100 Player Maximum Life — not Mana. A 'cultivated' Rathpith, produced by corrupting it with a Vaal Cultivation Orb, can reroll those tags to scale off Maximum Mana instead (e.g. ~3% crit chance per 100 max Mana plus a Mana-scaling spell damage line), which is what mana-stacking builds chase. It is a Spirit Shield unique, unrelated to Breach Ring modifiers. (https://www.eld.gg/News/path-of-exile-2-rathpith-globe-guide.html)
- confirmed — Breach Rings no longer drop from Breach encounters or from Xesht as of 0.5.0 — sole source is Genesis Tree Signet Wombgift with Otherworldly Clutch node (10% birth chance)
  → Correct as stated. As of the 0.5.0 Breach rework, Breach Rings are not direct monster/encounter drops; they are birthed at the Genesis Tree by feeding a Signet Wombgift with the Atlas passive 'Otherworldly Clutch' allocated, giving birthed items a 10% chance to be a Breach Ring. (Players can otherwise only acquire them via the trade market, which is downstream of this same production source.) (https://www.poe2wiki.net/wiki/Breach_Ring)
- confirmed — Catalysts can no longer drop from monsters as of 0.5.0 — sole source is the Genesis Tree Currency Womb
  → Correct. All Catalyst types in the 0.5.0 Breach rework are no longer monster/loot drops; they are produced exclusively through the Genesis Tree's Currency Womb branch (fed with Hiveblood/wombgifts), which also introduced additional Catalyst types for jewel crafting. (https://www.poe2wiki.net/wiki/The_Genesis_Tree)
- confirmed — Xesht difficulty tiers cost 50/100/150 splinters for roughly 2.9M/6.5M/14.5M boss HP
  → Correct, per multiple independent boss guides: 50 Breach Splinters → ~2.90M HP, 100 → ~6.48M HP, 150 → ~14.5M HP (higher tiers also add extra arms during his Arm Slam attack, up to 4 at max tier). Note some later-patch sources (e.g. a 0.5.4-era Maxroll page) describe a differently-scaled 5-level 'Difficulty 0–4' Atlas-node system topping out around 32M HP, so this exact 50/100/150-splinter figure should be treated as accurate for the 0.5.0–0.5.3 window rather than assumed unchanged for all later 0.5.x patches. (https://www.poe-vault.com/poe2/guides/xesht-we-that-are-one-boss-guide)
- confirmed — Uul-Netol's Embrace (Xesht drop) trades for 'hundreds of Divine Orbs'
  → Correct as a general characterization — Uul-Netol's Embrace, Xesht's chase Lineage Support Gem drop, has traded for hundreds of Divine Orbs during the Runes of Aldur league, though the exact price fluctuates with supply (it trends down over the league as more players farm Xesht), so treat 'hundreds' as a snapshot rather than a fixed number, and check poe.ninja for current pricing. (https://timesaver.gg/blog/poe2-xesht-guide)
- confirmed — Tablet-optimized Breach mapping yields roughly 30-60 Divine/hour as a realistic floor-to-ceiling range in 0.5.3
  → Roughly correct as a floor-to-ceiling range for well-tablet-optimized Breach farming in 0.5.3: guides put the realistic floor around 30 Div/hour (dropping toward ~35 Div/hour net after subtracting Wombgift feed costs) scaling up to 60+ Div/hour with strong tablet rolls and/or party play. Budget/unoptimized setups instead land much lower, around 6-26 Div/hour, and headline '50+ Div/hour' claims represent the optimized ceiling, not a typical run. (https://boostmatch.gg/blog/poe-2/articles/poe2-breach-farming-divines-per-hour-guide-05)
- confirmed — Flawless Breachstone domains cannot drop un-upgraded Breach uniques, only upgraded ones
  → Correct. Breachlord bosses fought via a Flawless Breachstone (upgraded from a normal Breachstone using a Breach Blessing) can no longer drop Breach Blessings or un-upgraded Breach uniques — they instead have a chance to drop the upgraded versions of those uniques (and, for Uul-Netol specifically, a chance at a fractured-modifier Grasping Mail). (https://www.poewiki.net/wiki/Breach_blessing)
- confirmed — Grasping Mail is obtained by exchanging 60 Breach Rings via a 'Grasping Orchid' mechanic
  → Correct. Grasping Mail (a low-defense chest base that can roll Ring modifiers and accept Catalysts) is obtained by feeding up to 60 Breach Rings (of any of the five Breach Ring base types) into the Grasping Orchid, a hidden Genesis Tree mechanic unlocked via the 'Flesh Flower' Atlas node by defeating Vruun, Marshal of Xesht, and turning in his head. (https://www.poe2wiki.net/wiki/Grasping_Mail)
- confirmed — Genesis Tree Hiveblood cost for Lavish Wombgifts scales roughly 734/1269/1364 for item levels 78/79/80
  → Correct as stated — a Lavish Wombgift costs 734 Hiveblood at item level 78, jumping to 1,269 at item level 79, and 1,364 at item level 80, i.e. a large jump from 78→79 and a much smaller one from 79→80. (https://boostmatch.gg/blog/poe-2/articles/poe2-genesis-tree-wombgifts-guide)
