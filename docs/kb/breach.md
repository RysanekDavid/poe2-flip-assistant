# PoE2 Breach — Catalysts, Breach Rings, Genesis Tree, Chayula/Xesht

Patch stamp: **0.5.0 "Runes of Aldur"** (released 2026‑05‑29) through **0.5.4** hotfixes, as of 2026‑07‑14. Breach was fully reworked in 0.5.0 (Genesis Tree replaced the old Breachlord/domain flow) — pre‑0.5 guides describing catalyst drops from monsters, 50% breach ring quality, or Chayula as the breach pinnacle boss are **stale and contradict current mechanics**.

**Corrections 2026-09-29 (0.5.5 "Forbidden Rites"):** the Hiveblood cost table and cap (§3) were checked against poe2db, and the 0.5.5 Unstable Breach changes were folded in (§7) from the [0.5.5 patch notes](https://www.pathofexile.com/forum/view-thread/4000864), accessed 2026-09-29. Everything else in this file is still the 0.5.4-era research.

**Corrections 2026-10-01 (sources):** citations to real-money-trading shops were removed; facts that lost their only independent source were re-sourced from poe2db (Breach, Xesht, Uul-Netol's Embrace, Hiveblood, Rathpith Globe), maxroll and poe-vault (accessed 2026-10-01), or downgraded to [single-source] / [unverified]; RMT-only price and Divine/hour figures were deleted.

**Corrections 2026-10-02 (partial, catalysts and quality):** §1.1 the Catalysing multiplier is now graded as a community model (not GGG); §1.2 adds the community per-catalyst quality formula; §1.3 adds the infuser item text and the 60% Breach Ring path (owner trade observation + creator footage); §2.4 step 2, the Catalysing wallet warning and the §8 open question follow. Independent fact-check (2026-10-02): infuser fail model scoped to armour observations, CZepweLtKwA citation narrowed to the Dusk Ring pattern (the 60% sum is inferred). The rest of the file is unchanged.

---

## 0. Correction to the brief — read this first

The task brief asks to cover "Chayula boss loot table" and a rumored "double mana mod" Breach Ring. Both leads turned out to be dead ends / conflations, confirmed via poe2wiki (primary source, [CONFIRMED]):

- **There is no standalone "Chayula, Who Dreamt" pinnacle fight in PoE2.** That boss exists in the original Path of Exile (PoE1); searches for it return PoE1 Maxroll/wiki pages. In PoE2, Chayula is represented only as: a Catalyst name (Chayula's Catalyst, chaos-tag quality), the "Flame of Chayula" remnants from the Acolyte of Chayula ascendancy's `Into the Breach` skill, and flavor text ("with a blessing from Chayula...") for the Breach Hive mechanic. The actual Breach pinnacle boss in 0.5.x is **Xesht, We That Are One**, gated behind Breachstones → Breach Domains → defeating Esh and Tul → a Realmgate next to the Ziggurat Refuge. [CONFIRMED] — poe2wiki Breachstone page ("Breachstones were initially used as the key to access the pinnacle boss, Xesht, We That Are One"), corroborated by poe2db's Breach page ("Defeating Tul and Esh will give you a key to access the existing Breach Pinnacle boss"; Xesht is fought in the Twisted Domain) and 404 on poe2wiki for any "Chayula, Who Dreamt" article.
  - Source: https://www.poe2wiki.net/wiki/Breachstone , https://poe2db.tw/us/Breach (accessed 2026-10-01)
- **The "increased Damage per 100 max Mana" / "increased Crit Chance per 100 max Mana" mods are not Breach Ring mods.** They are **Vaal Cultivation modifiers exclusive to Rathpith Globe**, a unique Sacred Focus (caster off-hand), obtainable only by using a Vaal Cultivation Orb on a *Corrupted* Rathpith Globe to reroll one of its explicit mods. Rathpith Globe's base (non-cultivated) explicit mods are Life-based, not Mana-based ("3% increased Crit Chance per 100 max Life", "6% increased Damage per 100 max Life" as of 0.4.0/0.5.0). Breach Rings have no mana-doubling or "per 100 mana" mods at all — their mod pool is the standard ring affix pool plus a few Genesis‑Tree‑exclusive caster/minion mods (see §3). [CONFIRMED] — poe2wiki Rathpith Globe page.
  - Source: https://www.poe2wiki.net/wiki/Rathpith_Globe

Everything below is written against actual 0.5.x mechanics, not the brief's assumptions.

---

## 1. Catalysts

### 1.1 What quality actually does

Catalysts are Breach‑exclusive currency that add a special **Quality type** to Rings, Amulets, or Jewels. This quality **scales the magnitude of matching modifiers only** — it does NOT bias which mods roll or their weight in the affix pool by itself. [CONFIRMED] — poe2wiki Catalyst page: "Catalysts add a special quality types to rings, amulets, or jewels that enhance the magnitude of modifiers of a specified type." poe2db's catalyst text agrees: "Adds quality that enhances [type] modifiers on a ring or amulet", and the quality "replaces other quality types". The exact per-percent magnitude scaling was not confirmed by a primary source. [unverified]
Source: https://www.poe2wiki.net/wiki/Catalyst , https://poe2db.tw/us/Catalysts (accessed 2026-10-01)

**Weight bias exists only via Omen of Catalysing Exaltation** — this confirms the brief's suspicion exactly. Right-clicking this Ritual Omen arms it; your next Exalted Orb then **consumes all Catalyst Quality on the item** and multiplies the weight of modifiers matching that catalyst's tag:
- At 20% quality: **5x weight** multiplier for the tagged mod family.
- At 40% quality: **7.5x weight** multiplier.
[unverified — community model, corrected 2026-10-02] — poe2wiki Omen of Catalysing Exaltation page, repeated by Game8 and Mobalytics omen guides; none of them cites GGG, and the omen's own text gives no number: "your next Exalted Orb will consume all Catalyst Quality to increase the chance of the corresponding type of Modifier" [verified-primary — entity catalog `src/data/poe2/entities.json.gz`, game data 0.5.5b]. Craft of Exile's model, ×(1 + 0.2·Q) up to Q = 20 then +0.12 per quality point above 20, gives ×5 at 20%, ×7.4 at 40% and ×8.0 at 45% — it agrees at 20% and differs by 0.1 at 40% [unverified — community model].
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

GGG publishes no per-use number. A community formula — Craft of Exile's, as reproduced in [huythinh2507/poe2crafting PR 6](https://github.com/huythinh2507/poe2crafting/pull/6), which notes GGG does not publish it — is gain = round(clamp(30·e^(−ilvl/30) − 0.3, 1, 20)), with a 1 becoming 2 about one time in five: roughly 4%+ per catalyst at ilvl ≤61, 3% at 62–71, 2% at 72–84 and 1% at 85+ [unverified — community model]. Creator counts roughly fit it (Diztoh bought 18 Tul's Catalysts to reach 20%, [GDLDxn6yxEs](https://www.youtube.com/watch?v=GDLDxn6yxEs) 4:26–4:47). Pages claiming a flat "5% per catalyst" are wrong.

**0.5.0 source change**: Catalysts can no longer drop from monsters at all — they are now obtained **solely from the Genesis Tree** (Currency Womb, birthed from Lavish Wombgifts). [CONFIRMED] — multiple 0.5.0 patch summaries (poebuilds.net, poe2wiki Catalyst page confirms Genesis-Tree-only sourcing).
Source: https://www.poe2wiki.net/wiki/Catalyst

### 1.3 Quality caps

- Normal Rings/Amulets: default max **20%** quality. [CONFIRMED]
- **Breach Ring**: implicit raises the cap to **40%** (not 50% — that was a pre-0.2.0 legacy value; several stale 0.2-era guides still circulating quote 50%, which is wrong for 0.5.x). [CONFIRMED] — poe2wiki Breach Ring page version history: "0.2.0: Breach Rings now have the Implicit modifier of Maximum Quality is 40% (previously 50%). Existing items can be updated using a Divine Orb."
- **Refined Breach Ring** (a rarer Genesis Tree output, see §3): implicit is **+25% to Maximum Quality**, giving a **45%** cap. [CONFIRMED] — poe2wiki Refined Breach Ring / Quality page.
- Jewels: same 20% default, raised via Refined catalysts' own mechanic (jewels normally can't take quality at all outside catalysts — poe2wiki Quality page lists Jewels among the item types that need Refined Catalysts specifically to get quality).
- Other ways past 20% that stack with the above: **Essence of the Breach** (Genesis Tree Currency Womb output) crafts a guaranteed "+20% to Maximum Quality" modifier onto a Rare piece of jewellery — meaning even a *non*-Breach-Ring rare ring/amulet can reach a 40% *effective* cap by combining default 20% + this essence's +20%. Infusers add a further +10% (stacks, chance to corrupt). [CONFIRMED] — poe2wiki Quality page.
Source: https://www.poe2wiki.net/wiki/Breach_Ring , https://www.poe2wiki.net/wiki/Quality
- **Infuser text**: "Improves the quality of a ring or amulet, exceeding maximum quality by up to 10% with a chance of Corrupting it … Can only be used on items at or above maximum quality." (Vaal Catalysing Infuser) [verified-primary — entity catalog, game data 0.5.5b]; 0.5.0: "All Infusers can only be used on items at or above 20% Quality." [verified-primary — [0.5.0 patch notes](https://www.pathofexile.com/forum/view-thread/3932540), accessed 2026-10-02]. The failure model — each 1% above the item's max adds ~5% fail (corrupt) chance, so the first infuser at exactly max never fails, and about one use in five gives +2% — is a creator estimate [creator, observed on armour infusers; assumed to carry over to Catalysing — Belton [c86fCKMMShI](https://www.youtube.com/watch?v=c86fCKMMShI) 12:30–13:00, 14:41–15:01].
- **Breach Ring + Essence of the Breach = 60%**: 20% default + the ring's +20% implicit + the essence's +20% mod. The essence mod can then be removed and the quality stays [owner trade observation 2026-10-02 — 60% Breach Rings are common (several listings at 1–2 Divine) and show no Essence of the Breach mod; ASaVeQ [CZepweLtKwA](https://www.youtube.com/watch?v=CZepweLtKwA) 11:33–13:05 shows the pattern on a Dusk Ring (Essence of the Breach, catalyse to 40, infuser to 41, Whittling strips the essence mod); 60% on a Breach Ring = 20+20 implicit+20 essence is inferred, seen in the owner's T12 trade listings, not shown by the creator]. The highest seen is **70%** (2 listings) ≈ 60% + the infusers' +10% [owner trade observation 2026-10-02]. Essence of the Breach is a Rare-only "Removes a random modifier and augments a Rare item with a new guaranteed modifier" essence [verified-primary — entity catalog] and holds the item's one crafted-mod slot until removed.

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
2. Apply the matching catalyst (e.g. Reaver Catalyst for attack-damage rings) up to the 40/45% cap (60% with Essence of the Breach, §1.3).
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
- Hiveblood cost scales with Wombgift level. poe2db's "Level | Resource" table: 67 → 136, 68 → 210, 75 → 745, 78 → 979, 79 → 1058, 80 → 1137, 81 → 1217, and a flat 1297 for every level 82–100 — a steady ~75–80 per level from 68 up, with no 78→79 jump. [verified-primary] — [poe2db Hiveblood](https://poe2db.tw/us/Hiveblood) accessed 2026-09-29, re-checked 2026-10-01. The table does not name what "Level" is (Wombgift item level is the likely reading), so the per-level mapping is [unverified].
- "The maximum amount of Hiveblood you can have is 100,000." [verified-primary] — [poe2db Hiveblood](https://poe2db.tw/us/Hiveblood) accessed 2026-09-29 (the wiki had flagged it `[confirmation needed]`).
- Genesis Tree Currency Womb (Lavish Wombgift) outputs: Catalysts, **Essence of the Breach** (crafts +20% max quality onto Rare jewellery), **Altered Collarbone** (desecrates a Rare Amulet/Ring/Belt with a chance for "otherworldly" modifiers), **Breach Splinters**, and standard currency (Chaos/Exalted/Divine/Regal/Annulment/etc, each with dedicated bias nodes). [CONFIRMED]
Source: https://www.poe2wiki.net/wiki/The_Genesis_Tree

---

## 4. Breachstones / Flawless Breachstones

- **Breach Splinter**: stack size 300; combining 300 auto-forms a **Revelatory Wombgift** (not a Breachstone directly). [CONFIRMED]
- **Breachstone**: drop level 68, "drop restricted" — as of 0.5.0 acquired only by birthing a Revelatory Wombgift at the Genesis Tree. Required to reveal a **Breach Fortress/Domain** on the Atlas. [CONFIRMED]
  - History: originally (0.1.0) the key to the Xesht pinnacle fight directly → 0.3.0 pinnacle-boss-access rework switched entry to raw splinter stacks (choose-your-difficulty at the Realmgate) and disabled Breachstone drops entirely → 0.5.0 brought Breachstones back with a new function: revealing Breach Domains on the Atlas, via the splinter→Revelatory Wombgift→Genesis Tree pipeline. [CONFIRMED]
Source: https://www.poe2wiki.net/wiki/Breachstone
- **Flawless Breachstone**: poe2db lists five Flawless Breachstones (Xoph's, Tul's, Esh's, Uul-Netol's, Chayula's) with lines including "Area has 4 additional random Modifiers", "250% more Monster Life", "60% increased Rarity of Items found in this Area", "60% increased Pack Size" and "200% increased Experience Gain". [verified-primary that the items exist in game data] — [poe2db Breachstone](https://poe2db.tw/us/Breachstone) accessed 2026-10-01. Whether they drop in 0.5.x, how they are made (the earlier "Breach blessing" upgrade and shorter-timer description is the PoE1 mechanic), and the claim that Flawless domains drop only upgraded Breach uniques are **[unverified]** — poe2db states no unique restriction; verify in-game before relying on it for a trading tool.

---

## 5. Breach pinnacle content — Xesht, We That Are One (not Chayula)

Access chain: poe2db's Breach page says "Defeating Tul and Esh will give you a key to access the existing Breach Pinnacle boss"; Breachstones come from Breach Splinters, go into the Realm Gate, and Xesht is fought in the Twisted Domain. [verified-primary] — [poe2db Breach](https://poe2db.tw/us/Breach) accessed 2026-10-01. Maxroll agrees on the last step: "Put your Breachstone in the Realmgate on your Atlas", which opens the Twisted Domain. — [maxroll Xesht](https://maxroll.gg/poe2/bosses/xesht) accessed 2026-10-01. The 0.5.x order is: defeat **It That Was Esh & It That Was Tul** first, then use the Breachstone at the Realmgate (see the adversarial log, poe2wiki The Dreamer). The exact splinter → Revelatory Wombgift → Genesis Tree path to the Breachstone is §4.

Difficulty tiers. **[cf] — unresolved:**
- poe-vault: "use Breach Splinters in the Realmgate"; 50 / 100 / 150 splinters give 2.90M / 6.48M / 14.5M HP, and "The more Breach Splinter is used to open to Xesht, the more challenging he becomes" (more arms in Arm Slam). [single-source] — [poe-vault Xesht guide](https://www.poe-vault.com/poe2/guides/xesht-we-that-are-one-boss-guide) accessed 2026-10-01 (page undated).
- maxroll: difficulty 0 = 6M HP, +6M per level up to difficulty 4 = 32M HP. [single-source] — [maxroll Xesht](https://maxroll.gg/poe2/bosses/xesht), accessed 2026-10-01, but marked as last updated in early 2025, so it may be stale.
Neither is a 0.5.x primary source; verify in-game before using HP or splinter cost in a pricing tool.

Mid-fight boss note: **Vruun, Marshal of Xesht** is a Stabilised Breach boss, not the Realmgate pinnacle. poe2db's Breach page: "Added new Boss to Stabilised Breach: Vruun, Marshal of Xesht". Don't confuse Vruun encounters in open-world Stabilised Breaches with the Xesht Realmgate fight. [verified-primary] — [poe2db Breach](https://poe2db.tw/us/Breach) accessed 2026-10-01.

Loot highlights (chase items), Xesht pinnacle:
- **Uul-Netol's Embrace** — Lineage Support gem, level 65, "Dropped by Xesht, We That Are One"; supported skills gain 40% of Physical damage as extra Chaos damage and Break Armour equal to 20% of Chaos damage dealt (buffed from 20% in 0.4.0). [verified-primary] — [poe2db Uul-Netol's Embrace](https://poe2db.tw/us/Uul-Netol's_Embrace) accessed 2026-10-01. The claim that it trades for "hundreds of Divine Orbs" came only from real-money-trading shops. [unverified] — pull a live price.
- **Hand of Wisdom and Action** (Spiral Wraps unique gloves) — on Xesht's drop list in both poe2db and maxroll. [CONFIRMED] — [poe2db Xesht](https://poe2db.tw/us/Xesht%2C_We_That_Are_One), [maxroll Xesht](https://maxroll.gg/poe2/bosses/xesht), accessed 2026-10-01. That it is "popular for Invoker/Deadeye builds" is [unverified].
- Defeating Xesht "grants Atlas Breach points". [single-source] — poe-vault (above). The item name (**Otherworldly Book of Knowledge**) and "2 points per difficulty tier cleared for the first time" are [unverified].
- Whether higher difficulty raises Xesht's unique drop chances: [unverified] — neither maxroll nor poe-vault says so.

Other Breach-exclusive uniques confirmed on poe2wiki's Breach navbox (drop sources not itemized per-boss in this pass): Beyond Reach (quiver), Choir of the Storm (amulet), Controlled Metamorphosis (jewel), Hand of Wisdom and Action (gloves), Nightfall (shield), Skin of the Loyal (body armour), and **Grasping Mail** — a level‑65 body armour that can roll Ring modifiers and take Catalysts, obtainable by trading in 60 Breach Rings via the "Grasping Orchid" (mechanic name single-source, needs verification). [CONFIRMED item existence via poe2wiki navbox; the 60-ring exchange mechanic is single-source]
Source: https://www.poe2wiki.net/wiki/Breachstone (navbox)

---

## 6. Wallet warnings

- **Don't apply catalysts to high-ilvl bases if you're chasing max quality cheaply.** Higher ilvl = less quality per application; you'll burn far more catalyst stock hitting 40% on an ilvl 84 base than an ilvl 75 one. [CONFIRMED mechanic, poe2wiki Quality page]
- **Applying a different catalyst type wipes your existing quality outright.** There's no partial conversion — switching from Reaver to Sibilant on the same ring zeroes your invested currency's quality progress. Decide your damage-type/stat family before you start catalysing.
- **Omen of Catalysing Exaltation consumes ALL catalyst quality on the item in one shot**, whether or not the resulting Exalted mod is the one you wanted. It only biases weight (~5x at 20%, ~7.4–7.5x at 40% per community models, §1.1) — it does not guarantee the mod. Don't fire it on a ring you haven't otherwise finished prefixes/suffixes on, and don't fire it if you're not prepared to lose all accumulated quality on a miss.
- **Breach Rings stopped dropping from Breach encounters and from Xesht in 0.5.0.** If you're valuing/pricing based on old encounter-drop assumptions (pre-0.5 guides, or bots scraping stale wiki caches), your model is wrong — the only 0.5.x source is the Genesis Tree Signet Wombgift + Otherworldly Clutch node, at a 10% birth chance.
- **Many web guides (0.2-era, uncorrected) still state Breach Ring quality caps at 50%.** The live cap is 40% (45% for Refined Breach Ring). This single number difference is enough to break an automated flip-value calculator that hard-codes an old cap.
- **Genesis Tree Hiveblood cost scales steeply with Wombgift level** (poe2db: 210 at level 68 rising to a 1,297 plateau from level 82, see §3) — birthing at max ilvl to "save time" can be a currency sink if you haven't unlocked the Womb's passive nodes yet; low-ilvl gifts are far cheaper for the mandatory ~10 birthings needed just to unlock a Womb's node tree.
- **"Vruun" is not the pinnacle boss** — don't sell/buy Breachstone-adjacent carries assuming a Vruun kill is equivalent to clearing Xesht; they're different encounters at different points in the Breach progression.

---

## 7. Profit angles

1. **Genesis Tree Lavish Wombgift → Catalyst arbitrage.** Feed Lavish Wombgifts (from Breach Splinter farming / breach chests) into the Currency Womb with nodes biased toward Catalyst output (`Catalyst Chance`, `Additional Different Catalyst Chance`, `Additional Duplicate Catalyst Chance`). Which catalysts are worth the most, and how their prices move over a league, came only from real-money-trading shops. [unverified] — pull live prices from the market API, never hard-code them.
2. **Altered Collarbone + Annulment Orb bulk-selling.** Altered Collarbones and Annulment Orbs are both Currency Womb outputs (§3). The claim that they are the two reliable high-value outputs, and their prices, came only from a real-money-trading shop. [unverified]
3. **Tablet-optimized Breach mapping.** Earlier Divine/hour figures and the "mandatory" tablet suffix advice came only from real-money-trading shops and were removed. [unverified] — treat any Div/hour number as build/luck/session dependent.
   **0.5.5 changes to the stabilised-rares loop:** "When stabilising an Unstable Breach, it now spawns the Rare Monsters in waves of 5, instead of spawning them all at once." The "of the Invasion" Breach Tablet modifier "now grants Unstable Breaches in Map spawn 1-2 additional Rare Monsters when stabilised (previously 1-3)." [verified-primary] — [0.5.5 patch notes](https://www.pathofexile.com/forum/view-thread/4000864) accessed 2026-09-29.
4. **Breach Ring crafting/flipping.** Because the 40-45% quality cap amplifies otherwise-normal top-tier ring affixes, a well-rolled catalyzed Breach Ring (double/triple flat elemental damage, or life/mana/attribute stacking depending on catalyst) commands a premium over an equivalent normal ring purely from the quality multiplier. This is a crafting-service niche: buy cheap low-ilvl Breach Ring bases + bulk catalysts, sell finished 40%+ quality rings. [single-source strategic framing] Source: poe2fun.com, mobalytics.gg crafting guides.
5. **Xesht kills for Uul-Netol's Embrace.** The gem drops only from Xesht (poe2db, §5). Whether farming him for it pays depends on its live price and drop rate, neither of which a non-shop source gave; the "better drop odds at higher difficulty" claim is also unsourced. [unverified]

---

## 8. Open questions

- Exact quality per catalyst application at a given ilvl — no GGG figure; a community formula exists (§1.2) but has not been tested in game.
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
  → 2026-10-02 re-check: the implicit cap stands; with Essence of the Breach the ring reaches 60% and keeps it after the essence mod is removed (owner trade observation 2026-10-02; ASaVeQ CZepweLtKwA 11:33–13:05 shows the Dusk Ring pattern, the 60% sum is inferred), up to 70% with infusers. §1.3.
- confirmed — Catalyst quality scales only modifier magnitude; weight/chance bias comes exclusively from Omen of Catalysing Exaltation (5x at 20% quality, 7.5x at 40% quality) which consumes all quality on use
  → Correct. Catalyst quality on rings/amulets/jewels normally only scales the magnitude of matching modifiers (it stopped affecting roll chance/weight before this era of the game). Omen of Catalysing Exaltation is the sole mechanism that converts that stored quality into a weight bias on your next Exalted Orb: 5x multiplier at 20% quality, 7.5x at 40% quality, and it consumes all Catalyst quality on the item when used. (https://www.poe2wiki.net/wiki/Omen_of_Catalysing_Exaltation)
  → 2026-10-02 re-check: the magnitude-only and consume-all parts stand (the omen's item text says it "will consume all Catalyst Quality"). The 5x/7.5x figures are poe2wiki's, not GGG's — the item text has no number — so §1.1 now grades them [unverified — community model] beside Craft of Exile's ×7.4 at 40%. (entity catalog `src/data/poe2/entities.json.gz`, game data 0.5.5b)
- confirmed — There is no Chayula, Who Dreamt boss fight in PoE2 — the Breach pinnacle boss is Xesht, We That Are One, reached via Breachstone -> Breach Domain -> defeating Esh and Tul -> Realmgate
  → The 'no Chayula boss fight, Xesht is the pinnacle' part is correct — in PoE2 Chayula was demoted from a fightable Breachlord (as she was in original PoE1 as 'Chayula, Who Dreamt') to 'The Dreamer', a lore NPC/questgiver you talk to at the Genesis Tree, not a boss encounter. However, the described access chain has the order and terminology wrong: you first defeat the Hive Colony boss pair 'It That Was Tul' and 'It That Was Esh' to obtain the Breachlord Sac, hand it to the Dreamer to unlock the Genesis Tree/Twisted Domain, then place a Breachstone (built from Breach Splinters via the Genesis Tree) into the Realmgate near the Ziggurat Refuge to open the Twisted Domain and fight Xesht. There is no separate area called 'Breach Domain', and Esh/Tul are defeated before the Breachstone/Realmgate step, not after. (https://www.poe2wiki.net/wiki/The_Dreamer)
- confirmed — Rathpith Globe's 'per 100 max Mana' spell damage/crit mods are Vaal Cultivation Orb rerolls on a corrupted item, not innate, and are not Breach Ring mods at all
  → Correct. Rathpith Globe is a Sacred Focus unique whose base mods are "Non-Channelling Spells have 3% increased Critical Hit Chance per 100 maximum Life" and "Non-Channelling Spells deal 6% increased Damage per 100 maximum Life"; the Vaal Cultivation version has the same lines per 100 maximum Mana. It is unrelated to Breach Ring modifiers. (https://poe2db.tw/us/Rathpith_Globe, accessed 2026-10-01; the original verifier cited a real-money-trading shop that gave 5%/5% and "Spirit Shield", which poe2db contradicts)
- confirmed — Breach Rings no longer drop from Breach encounters or from Xesht as of 0.5.0 — sole source is Genesis Tree Signet Wombgift with Otherworldly Clutch node (10% birth chance)
  → Correct as stated. As of the 0.5.0 Breach rework, Breach Rings are not direct monster/encounter drops; they are birthed at the Genesis Tree by feeding a Signet Wombgift with the Atlas passive 'Otherworldly Clutch' allocated, giving birthed items a 10% chance to be a Breach Ring. (Players can otherwise only acquire them via the trade market, which is downstream of this same production source.) (https://www.poe2wiki.net/wiki/Breach_Ring)
- confirmed — Catalysts can no longer drop from monsters as of 0.5.0 — sole source is the Genesis Tree Currency Womb
  → Correct. All Catalyst types in the 0.5.0 Breach rework are no longer monster/loot drops; they are produced exclusively through the Genesis Tree's Currency Womb branch (fed with Hiveblood/wombgifts), which also introduced additional Catalyst types for jewel crafting. (https://www.poe2wiki.net/wiki/The_Genesis_Tree)
- confirmed — Xesht difficulty tiers cost 50/100/150 splinters for roughly 2.9M/6.5M/14.5M boss HP
  → Correct, per multiple independent boss guides: 50 Breach Splinters → ~2.90M HP, 100 → ~6.48M HP, 150 → ~14.5M HP (higher tiers also add extra arms during his Arm Slam attack, up to 4 at max tier). Note some later-patch sources (e.g. a 0.5.4-era Maxroll page) describe a differently-scaled 5-level 'Difficulty 0–4' Atlas-node system topping out around 32M HP, so this exact 50/100/150-splinter figure should be treated as accurate for the 0.5.0–0.5.3 window rather than assumed unchanged for all later 0.5.x patches. (https://www.poe-vault.com/poe2/guides/xesht-we-that-are-one-boss-guide)
- confirmed — Uul-Netol's Embrace (Xesht drop) trades for 'hundreds of Divine Orbs'
  → Correct as a general characterization — Uul-Netol's Embrace, Xesht's chase Lineage Support Gem drop, has traded for hundreds of Divine Orbs during the Runes of Aldur league, though the exact price fluctuates with supply (it trends down over the league as more players farm Xesht), so treat 'hundreds' as a snapshot rather than a fixed number, and check poe.ninja for current pricing. (source was a real-money-trading shop, removed 2026-10-01)
  → 2026-10-01: downgraded to [unverified] in the body; poe2db confirms only that the gem drops from Xesht. (https://poe2db.tw/us/Uul-Netol's_Embrace)
- confirmed — Tablet-optimized Breach mapping yields roughly 30-60 Divine/hour as a realistic floor-to-ceiling range in 0.5.3
  → Roughly correct as a floor-to-ceiling range for well-tablet-optimized Breach farming in 0.5.3: guides put the realistic floor around 30 Div/hour (dropping toward ~35 Div/hour net after subtracting Wombgift feed costs) scaling up to 60+ Div/hour with strong tablet rolls and/or party play. Budget/unoptimized setups instead land much lower, around 6-26 Div/hour, and headline '50+ Div/hour' claims represent the optimized ceiling, not a typical run. (source was a real-money-trading shop, removed 2026-10-01)
  → 2026-10-01: all Breach Div/hour figures removed from the body and tagged [unverified]; no non-shop source was found.
- confirmed — Flawless Breachstone domains cannot drop un-upgraded Breach uniques, only upgraded ones
  → Correct. Breachlord bosses fought via a Flawless Breachstone (upgraded from a normal Breachstone using a Breach Blessing) can no longer drop Breach Blessings or un-upgraded Breach uniques — they instead have a chance to drop the upgraded versions of those uniques (and, for Uul-Netol specifically, a chance at a fractured-modifier Grasping Mail). (https://www.poewiki.net/wiki/Breach_blessing)
- confirmed — Grasping Mail is obtained by exchanging 60 Breach Rings via a 'Grasping Orchid' mechanic
  → Correct. Grasping Mail (a low-defense chest base that can roll Ring modifiers and accept Catalysts) is obtained by feeding up to 60 Breach Rings (of any of the five Breach Ring base types) into the Grasping Orchid, a hidden Genesis Tree mechanic unlocked via the 'Flesh Flower' Atlas node by defeating Vruun, Marshal of Xesht, and turning in his head. (https://www.poe2wiki.net/wiki/Grasping_Mail)
- confirmed — Genesis Tree Hiveblood cost for Lavish Wombgifts scales roughly 734/1269/1364 for item levels 78/79/80
  → Correct as stated — a Lavish Wombgift costs 734 Hiveblood at item level 78, jumping to 1,269 at item level 79, and 1,364 at item level 80, i.e. a large jump from 78→79 and a much smaller one from 79→80. (source was a real-money-trading shop, removed 2026-10-01)
  → 2026-09-29 re-check: [cf] poe2db's Hiveblood "Level | Resource" table gives 78 → 979, 79 → 1058, 80 → 1137 and a 1297 plateau for 82–100, not 734/1269/1364; poe2db wins, body §3 now shows both. (https://poe2db.tw/us/Hiveblood)
  → 2026-10-01: the 734/1,269/1,364 side was dropped from the body (its only source was a real-money-trading shop); §3 now shows poe2db alone.
- 2026-10-01 (sources) — real-money-trading shop citations removed. Re-sourced: Xesht access chain and Vruun as a Stabilised Breach boss (poe2db Breach), Uul-Netol's Embrace and Hand of Wisdom and Action as Xesht drops (poe2db, maxroll), Xesht splinter tiers (poe-vault, now [cf] against maxroll's difficulty 0–4 model). Downgraded to [unverified]: Uul-Netol's Embrace value, Xesht first-clear book and difficulty-loot scaling, Flawless Breachstone unique restriction, catalyst price snapshots, Altered Collarbone loop, Breach Div/hour figures; the +60→+72 catalyst example was deleted.
