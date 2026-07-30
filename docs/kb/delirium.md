> NOTE ON SOURCING: PoE2 has no traditional patch-note wiki with full itemized text for every currency mod. Several claims below come from AI-summarized aggregations of guide sites (returned by WebSearch) rather than a directly-fetched primary page — these are marked accordingly. Direct fetches of poe2wiki.net and poe2db.tw were blocked (HTTP 403/522) during research; where a fact could only be sourced from a fextralife/game8/aggregator summary, it is marked [single-source] even if the underlying site is normally considered authoritative, because the raw page text could not be independently verified.

# Delirium — Liquid Emotions & Fog Farming
**Patch: 0.5.x "Runes of Aldur" (league launched 2026-05-29; delirium overhaul in 0.5.0, further tuned in 0.5.1–0.5.4). All facts below are 0.5-era unless noted.**

---

## 1. Core fog mechanic

- You trigger Delirium by walking through a **Delirium Mirror** in a map; this opens an expanding fog ring. You must stay inside the fog as it spreads — stepping out ends the encounter early. Depth reached inside the fog sets a **Deliriousness%** value for that map region, which increases monster count/damage/toughness and improves rewards. [CONFIRMED] (timesaver.gg/blog/poe2-delirium-farming-guide, game8.co/games/Path-of-Exile-2/archives/605040)
- Maps start at **10% Deliriousness**. Deliriousness **carries over and stacks across fog-connected maps** (via Grand Mirror chaining, see below), up to a cap of **200%**. [CONFIRMED] (game8.co/archives/605040, timesaver.gg/blog/poe2-delirium-farming-guide)
- 0.5.0 rebuilt Delirium end-to-end: new quest ("Strange Reflections"), new hub (**The Withered Willow**), new pinnacle boss (Tangmazu), a new Delirium Atlas passive tree, Liquid Emotions for jewel crafting, and 16 new amulet-only Notables. [CONFIRMED — official-tier aggregator] (pathofexile.gg/0-5-3-patch-notes/ context + WebSearch synthesis of maxroll.gg/poe2/news/path-of-exile-2-0-5-3-patch-preview)
- **Grand Mirror**: after killing a map boss while standing in Delirium fog, a Grand Mirror has a chance to spawn on a **nearby Atlas map**, containing a **reflected duplicate of that map's boss**. You must kill both the original and the reflection to clear it. [CONFIRMED] (timesaver.gg/blog/poe2-grand-mirror-guide, WebSearch official-patch synthesis)
- Clearing a Grand Mirror unlocks the **"Trial of Madness"**: interacting with the mirror lets you paint Delirium fog for free (no tablet) onto an adjacent, glowing-circle-marked Atlas map, chaining fog across multiple maps and ramping shared Deliriousness from 10% toward 200%. [CONFIRMED] (timesaver.gg/blog/poe2-grand-mirror-guide, game8.co/archives/605040)
- At/near **200% Deliriousness**, difficulty is described as "comparable to or higher than Pinnacle boss encounters" — rare monsters can out-tank/out-damage actual pinnacle bosses. Reward quality (loot volume + rarity, chance at Liquid Emotions/Simulacrum Splinters/uniques) scales up continuously with Deliriousness%. [CONFIRMED] (game8.co/archives/605040, timesaver.gg/blog/poe2-delirium-farming-guide)
- 0.5.3 patch changes (official-tier source): Simulacrum Maps no longer spawn immediately when fog is spread — they spawn only once a region hits 100% Deliriousness. Fog *scaling* itself was halved for early-endgame difficulty, offset by Delirium Tablets now scaling fog effect when multiple tablets are used (3 tablets restores pre-0.5.3 scaling). The old "double tablet effect in Grand Mirror areas" notable Atlas passive was replaced with "areas with Grand Mirrors also have a Delirium Mirror." [CONFIRMED — official] (pathofexile.gg/0-5-3-patch-notes/)
- **"Delirium cities" — could not confirm this term.** No source in this research used it. The real 0.5 terminology for the chained-fog/ramp-to-200% system is **"Trial of Madness"**. Treat "delirium cities" as either an informal community nickname not indexed by search, or a misremembering — see Open Questions.

---

## 2. Liquid Emotions — full catalogue

Naming convention observed across sources: base noun is **"Liquid [Emotion]"**, prefixed by a tier adjective (**Diluted / [no prefix] / Concentrated / Potent / Ancient Potent**). Some guide sites use **"Distilled Emotion"** as an apparently-interchangeable synonym for the same items (particularly in amulet-anoint context) — this could not be independently confirmed as a distinct item class vs. just alternate phrasing. [unverified naming nuance]

### 2.1 Tier ladder (13 base emotion "families")

| Tier | Emotions | Legal targets |
|---|---|---|
| Diluted | Ire, Guilt, Greed | Amulet (anoint ingredient), Waystone (instill), Rare **Basic** Jewel (crafting) |
| Standard (no tier prefix) | Paranoia, Envy, Disgust, Despair | same as above |
| Concentrated | Fear, Suffering, Isolation | same as above |
| **Potent** (new in 0.5) | Contempt, Ferocity, Melancholy | Amulet (unlocks 16 *exclusive* Notables not on the passive tree), Rare Basic Jewel (crafting) |
| **Ancient** (new in 0.5; one Ancient version of every one of the 13 above — "10 Ancient" + "3 Ancient Potent") | Ancient [any of the 13] | **Rare Time-Lost Jewels ONLY** — cannot instill amulets or Waystones |

[CONFIRMED — tier list cross-matches across 3 independent sources] (dadsofexile.com/liquid-emotions, aoeah.com/news/4633, WebSearch synthesis of official 0.5.0 patch summary). Each emotion exists at exactly one non-Ancient potency tier — there is no "Diluted Contempt" or "Potent Ire". [single-source] (dadsofexile.com/liquid-emotions)

### 2.2 Waystone instilling — per-emotion effect (10 base emotions)

Right-click a Liquid Emotion → place a Waystone in the top slot → drag up to **3 emotions** into the slots below → Instill. This adds a Deliriousness% baseline plus a reward-modifier to the map. [CONFIRMED] (timesaver.gg/blog/poe2-distilled-emotions-guide, game8/aggregator context)

| Emotion | Deliriousness added | Bonus effect |
|---|---|---|
| Ire | 7% | 20% increased Magic Monsters |
| Guilt | 9% | 8% increased Pack Size |
| Greed | 10% | 8% increased Item Rarity |
| Paranoia | 12% | 15% increased Rare Monsters |
| Envy | 15% | 30% increased Waystones found |
| Disgust | 18% | 30% increased Precursor Tablets |
| Despair | 20% | 30% increased Splinter Stack Size |
| Fear | 22% | 25% chance for an extra Rare modifier |
| Suffering | 25% | 1 additional Unique modifier |
| Isolation | 50% | Pure Deliriousness (no other bonus) |

[single-source, numeric table] (timesaver.gg/blog/poe2-distilled-emotions-guide) — **critical caveat from the same source**: a Waystone that is *itself* instilled with Delirium will **not** drop Distilled/Liquid Emotions back, because its fog never naturally dissipates. Farm your emotion supply on un-instilled maps; spend them on maps you intend to juice for loot.

**Open question**: whether the 3 new Potent emotions (Contempt/Ferocity/Melancholy) can also go into Waystone instilling slots is not explicitly confirmed by any source — only their amulet and jewel uses are documented.

### 2.3 Amulet instilling ("anointing")

- Location: **Decanter of Madness** at **The Withered Willow** hub, unlocked via the "Strange Reflections" quest. [CONFIRMED] (game8.co/games/Path-of-Exile-2/archives/604018, WebSearch synthesis via multiple guides)
- Mechanic: place an amulet in the top slot, **exactly 3** Liquid/Distilled Emotions in the slots below. The specific 3-emotion combination — **and their order** — determines the Notable Passive granted. The same 3 emotions in a different order can produce a **different** Notable. [CONFIRMED] (timesaver.gg/blog/poe2-how-to-anoint-amulet, mobalytics.gg/poe-2/guides/distilled-emotions via WebSearch)
- **How to look up a combo**: open the Passive Skill Tree (P), hover any Notable, hold **Alt** (or Inspect/R3 on controller) — the game shows the exact emotion combination and order required. [CONFIRMED] (multiple sources, WebSearch synthesis)
- Regular tree Notables (any of the ~600+ possible via standard emotion combos) can be instilled this way, functioning like a deterministic PoE1-style anoint. New **Twisted** and **Distorted** amulet bases can drop *pre-instilled* with 2 Notables already applied. [single-source] (timesaver.gg/blog/poe2-delirium-farming-guide)
- **Potent emotions unlock 16 exclusive Notables** that do not exist anywhere else on the passive tree — this is the dedicated new content of 0.5's anoint system, not just "same tree, deterministic." [CONFIRMED] (WebSearch synthesis of official patch summary + dadsofexile.com/liquid-emotions paraphrase). Only two named examples surfaced in research: **Storm's Rebuke** and **Kaom's Blessing** [single-source, weak] (WebSearch/mobalytics "Hidden Anoints 0.5" guide, page itself 403'd on fetch).
- Cannot instill **corrupted, mirrored, or sanctified** items. One instillment applies per amulet by default; re-instilling replaces the previous Notable. [single-source] (timesaver.gg/blog/poe2-delirium-farming-guide)
- Example standard-tree anoint recipes actually confirmed (illustrative, not exhaustive):

| Recipe (order matters) | Notable | Effect |
|---|---|---|
| Greed, Greed, Greed | Life from Death | Recover 3% of Life on Kill |
| Envy, Envy, Envy | Heavy Drinker | 30% increased Flask Effect Duration + life recovery |
| Envy, Paranoia, Ire | Critical Exploit | 25% increased Critical Chance |
| Ire, Greed, Greed | Sharpened Claw | 25% increased Attack Damage |
| Ire, Ire, Greed | High Alert | 50% increased Evasion at Full Life |
| Ire, Ire, Ire | Insulated Treads | Ailment Threshold = lower of Armour/Evasion (boots) |
| Ire, Guilt, Guilt | Stance Breaker | 50% reduced Enemy Chance to Block Sword Attacks |
| Guilt, Guilt, Ire | Open Mind | 25% increased Mana Regeneration Rate |
| Paranoia, Paranoia, Paranoia | Hunter's Talisman | +1 Charm Slot |
| Despair, Despair, Despair | Sand in the Eyes | 10% increased Attack Speed, 15% chance to Blind on Hit |
| Suffering, Suffering, Suffering | Ancestral Artifice | Attack Skills +1 to maximum Summoned Totems |
| Fear, Fear, Fear | Lightning Quick | 14% increased Lightning Damage, 8% increased Attack/Cast Speed |

[single-source, all from one aggregator] (aoeah.com/news/3726, timesaver.gg/blog/poe2-how-to-anoint-amulet) — treat as illustrative, not verified against in-game text.

### 2.4 The Potent emotions — amulet effects (non-Ancient tier)

- **Melancholy** (amulet Notable): grants one of three conditional on-hit effects depending on which **jewel colors are socketed in your passive tree**: Debilitate Enemies on Hit (Emerald+Sapphire socketed), Inflict Elemental Exposure on Hit (Ruby+Emerald socketed), or Blind Enemies on Hit (Ruby+Sapphire socketed). [single-source, but corroborated by 2 independent guide summaries] (WebSearch synthesis citing aoeah.com/news/4633 + mobalytics.gg/poe-2/guides/distilled-emotions)
- **Ferocity** (amulet Notable): reported as **(40–60)% increased Suffix Effect** as a prefix roll, and **(40–60)% increased Prefix Effect** as a suffix roll — i.e. it amplifies your other modifiers. [single-source] (aoeah.com/news/4633) — **conflicts with a second source** (game8.co/archives/603308) which instead describes Ferocity's amulet effect as flat elemental/chaos resistance keyed to Ruby/Sapphire/Emerald/Diamond Notable color (+5–7% resistance). These two descriptions cannot both be the same mod; not resolved in this research — see Open Questions.
- **Contempt** (amulet Notable): reported as **+1 extra Suffix Modifier slot** (as a prefix roll) or **+1 extra Prefix Modifier slot** (as a suffix roll), across all Notable "gem colors." [single-source] (aoeah.com/news/4633) — this specific claim was NOT corroborated by the game8 Contempt page, which only described the **Ancient/jewel** version's +1 slot effect (see 2.5). Treat the amulet-side +1-slot claim as single-source and lower confidence than the jewel-side version, which is CONFIRMED.

### 2.5 Jewel crafting (0.5 addition) — regular vs. Ancient

- **Regular tier (Diluted through Potent)** applied to a **Rare Basic Jewel**: "removes a random existing modifier and augments the jewel with a new guaranteed Crafted modifier" drawn from that specific emotion's mod pool (similar in spirit to PoE1 Essences). Exact per-emotion mod pools were not confirmed — poe2db pages returned errors on fetch. [CONFIRMED mechanic, mod pools unverified] (dadsofexile.com/liquid-emotions, aoeah.com/news/4633)
- **Ancient tier** applied to a **Rare Time-Lost Jewel** only: same "remove random mod, add guaranteed crafted mod" base mechanic, but gated behind Delirium Atlas passive unlocks and generally far pricier due to jewel scarcity/power. [CONFIRMED] (dadsofexile.com/liquid-emotions, game8.co/archives/603308, game8.co/archives/603309)
- **Ancient Potent Liquid Contempt** — the flagship craft: removes a random modifier and adds a guaranteed **"+1 Prefix Modifier allowed"** or **"+1 Suffix Modifier allowed"** to a Rare Time-Lost Jewel, raising its total mod cap. This is the item the task brief's "Contempt = +1 prefix/suffix slot" refers to, and it is a **Time-Lost Jewel** craft, not an amulet effect. [CONFIRMED — 3 independent sources] (dadsofexile.com/liquid-emotions, game8.co/archives/603309, WebSearch synthesis of aoeah.com/news/4633)
- **Ancient Potent Liquid Ferocity** and **Ancient Potent Liquid Melancholy**: same generic remove+guaranteed-mod craft on Time-Lost Jewels, but **without** the +1 slot bonus — hence they price far below Contempt. [single-source per item, consistent mechanic] (game8.co/archives/603308, dadsofexile.com/liquid-emotions)
- Both Ancient Contempt and Ancient Ferocity require the target item to be at **maximum quality** before use. [single-source, stated on both game8 pages] (game8.co/archives/603308, game8.co/archives/603309)
- **Time-Lost Jewel base types**: Ruby (martial/armour), Emerald (evasion/ranged), Sapphire (energy shield/caster), plus a unique Diamond variant; these jewels grant no inherent stats themselves — they modify other passives inside their radius. [single-source] (dadsofexile.com/liquid-emotions)
- **Drop gating**: Ancient emotions only drop after unlocking the relevant Delirium Atlas passive node(s). One node referenced by name across both game8 Ferocity/Contempt pages, **"I know your childhood fears…"**, grants "20% chance to be Ancient" whenever a Liquid Emotion drops. [single-source, same site both times] (game8.co/archives/603308, game8.co/archives/603309)
- A separate node, **"You Can't Scare Me Anymore,"** is reported to unlock the 3 Potent emotions (Melancholy/Ferocity/Contempt) dropping from **unique monsters** specifically. [single-source, aggregator] (timesaver.gg/blog/poe2-delirium-farming-guide via WebSearch synthesis)
- Ancient/Potent items are also purchasable from the **Currency Exchange** NPC, available in every Act after completing Act 3. [single-source, stated on both game8 pages] (game8.co/archives/603308, game8.co/archives/603309)

### 2.6 Reforging Bench

- A Reforging Bench (reported location: entrance of the Trial of Sekhemas) lets you combine **3 identical emotions of the same tier** into **1 emotion of the next tier up** — the primary way to manufacture specific rare emotions from farmed common ones. [single-source, AI-aggregated search result, not independently fetched from a primary page] (WebSearch synthesis, no direct URL confirmed reliable enough to cite as primary)

---

## 3. Simulacrum & Splinters (Delirium's pinnacle gate)

- **Simulacrum Splinters** only drop from Delirium fog/bosses in **Tier 11+ maps**, and specifically require unlocking the Delirium Atlas passive **"Is This About Me or You?"** for them to drop at all in endgame (T75+) maps — described as the single most important Delirium Atlas point. [CONFIRMED] (timesaver.gg/blog/poe2-simulacrum-farming-guide, timesaver.gg/blog/poe2-delirium-farming-guide, WebSearch official-patch synthesis)
- **300 Splinters** combine into **1 Simulacrum** item, used directly on a 100%-Deliriousness map node like a currency item (not consumed as a Waystone). [CONFIRMED] (timesaver.gg/blog/poe2-simulacrum-farming-guide, WebSearch official-patch synthesis)
- The Simulacrum is a **7-wave encounter** (cut down from 15 waves pre-0.5). [CONFIRMED — multiple independent sources] (timesaver.gg/blog/poe2-simulacrum-farming-guide, WebSearch official patch summary, sportskeeda 0.5.3 coverage)
- Deliriousness scaling inside Simulacrum: originally intended to run 0%→100% across the 7 waves (~5%/wave), but this scaling was **bugged** and not applying correctly pre-0.5.3. As of **0.5.3**, Simulacrums now correctly **start at 100% Delirious and scale up to 200%** by wave 7. [CONFIRMED — official] (pathofexile.gg/0-5-3-patch-notes/, sportskeeda.com/mmo/path-exile-2-0-5-3-patch-notes, maxroll.gg/poe2/news/path-of-exile-2-0-5-3-patch-preview)
- Two unique Delirium bosses can spawn mid-run: **Omniphobia, Fear Manifest** (~wave 3+, melee) and **Kosis, The Revelation** (~wave 5+, tougher, telegraphed lethal attacks) — both drop bonus splinters and rewards. [single-source] (timesaver.gg/blog/poe2-simulacrum-farming-guide)
- Death penalty: generally **one free death**; a second death ends the run. [single-source] (timesaver.gg/blog/poe2-simulacrum-farming-guide)
- Completing wave 7 grants **2 Delirium Atlas Passive Points** plus a boss-key/shard fragment toward the pinnacle encounter, and a chance at Simulacrum-exclusive uniques. [single-source, numeric] (timesaver.gg/blog/poe2-simulacrum-farming-guide)
- 0.5.2 patch **halved** Unique-enemy Toughness gain and halved increased-damage for normal/magic/rare enemies inside fog, making deep Simulacrum waves materially easier than at 0.5.0 launch. [CONFIRMED — patch-level] (WebSearch synthesis referencing 0.5.2 patch notes, corroborated by timesaver.gg/blog/poe2-simulacrum-farming-guide)
- Splinters are **fully tradeable**; selling 300-stacks on the Currency Exchange is described as a legitimate strategy for players who can't clear deep waves. [CONFIRMED] (timesaver.gg/blog/poe2-simulacrum-farming-guide, timesaver.gg/blog/poe2-delirium-farming-guide)

---

## 4. Loathsome Mire & Fractured Mirror Shards

- **Fractured Mirror Shards** are a special variant of the fog-progress "Mirror Shard" markers found deep in the fog; the fog-progress meter shows how deep you must go to reach one. They can add extra Liquid Emotions to nearby monsters, or summon a **"Mirrored boss"** encounter. [single-source, AI-aggregated] (WebSearch synthesis of poe2wiki.net/wiki/Loathsome_Mire + game8.co/archives/603918)
- **Loathsome Mire**: an optional side-area that can spawn from a **red** Fractured Mirror Shard. It's a large swamp escape room — you must reach and interact with an **Unethical Offering** on a central island before the rising muck kills you. Standing in the muck applies a **stacking DoT debuff** (physical + chaos, up to **10 stacks**). Reaching the Offering rewards a **Distorted Amulet or Twisted Amulet pre-instilled with 2 random Notables**, and opens a portal out. [single-source, AI-aggregated] (WebSearch synthesis of poe2wiki.net/wiki/Loathsome_Mire + game8.co/archives/603918)

---

## 5. Pinnacle: Tangmazu, the Raven Trickster

- Access chain (**"Strange Reflections"** questline): defeat 5 Delirium map bosses → defeat a twinned Grand Mirror boss pair → consume "Strange Fruit" to spread fog → complete a Simulacrum → place the resulting **Raven's Reflection** shard into the mirror at The Withered Willow. [single-source] (dadsofexile.com/tangmazu)
- Health pool: **~7 million** across multiple phases. Fought in a separate portal arena called **The Paracosm**. [single-source, but the 7M figure independently echoed by a second aggregator search result] (dadsofexile.com/tangmazu, WebSearch synthesis of gamerant.com Tangmazu guide)
- Unique drops: **Raven-Touched Shard** (helmet augment — the money item), **Sadist's Mercy** (Flanged Mace), **Veilpiercer** (Amethyst Ring). [single-source] (dadsofexile.com/tangmazu)
- Raven-Touched Shard traded at roughly **10.2k Exalted (~80 Divine)** mid-league with deep trade volume, per one source; note it **cannot be recovered** once socketed into a helmet, so guides advise selling unless it's going into your final helmet base. Estimated drop rate ~2%, described as unconfirmed/low-confidence even by the source itself. [single-source, self-flagged low confidence] (dadsofexile.com/tangmazu)

---

## Wallet warnings

1. **Instilling a Waystone with Delirium kills its own emotion income** — a Delirium-instilled map does not drop Distilled/Liquid Emotions back because the fog never naturally dissipates. Farm emotions on plain maps; spend them on maps you intend to juice for other loot. [single-source] (timesaver.gg/blog/poe2-delirium-farming-guide)
2. **Order matters on amulet instills.** The same 3 emotions in a different sequence can produce a *different* (or no) Notable. Always check the preview before committing — a botched instill burns rare emotions with zero refund. [CONFIRMED]
3. **Cannot instill corrupted, mirrored, or sanctified amulets.** Verify item state before spending emotions. [single-source] (timesaver.gg/blog/poe2-delirium-farming-guide)
4. **Ancient emotions require max-quality target items** and are one-shot, irreversible crafts. Confirm your Time-Lost Jewel base and quality before applying — especially Ancient Potent Contempt at ~8.5 Divine a pop. [single-source, both game8 pages state the quality requirement]
5. **Ancient emotions don't drop at all until you unlock the correct Delirium Atlas passive node.** Don't stockpile currency to buy Time-Lost Jewel crafts before confirming your Atlas tree actually generates the matching Ancient emotions — check the specific node text in your own tree, since exact node names/wording are only single-sourced here.
6. **Simulacrum has a hard 2-death cap.** A second death ends the run outright — pushing wave 6–7 on a build that hasn't proven it can survive that Deliriousness band risks losing splinters and boss-key progress for nothing. [single-source] (timesaver.gg/blog/poe2-simulacrum-farming-guide)
7. **Post-0.5.3, Simulacrums start at 100% Delirious, not 0%.** If you're using older (pre-0.5.3) guide numbers for wave-by-wave difficulty planning, they're stale — the whole run is now uniformly harder from wave 1. [CONFIRMED — official]
8. **Reforging (3→1 tier-up) is one-directional with no downgrade path.** Bulk-converting cheap common emotions into a specific rare one is efficient, but there's no way to reverse a mis-click — know exactly which top-tier emotion you need before feeding the bench. [single-source, low-confidence sourcing]
9. **The Raven-Touched Shard can't be un-socketed.** Selling it outright is usually correct unless you have your genuinely final helmet ready — socketing prematurely destroys ~80 Divine of value. [single-source] (dadsofexile.com/tangmazu)

## Profit angles

- **Raw emotion flipping**: high-tier Liquid/Distilled Emotions sell direct — Isolation ≈ 10 Divine, Suffering ≈ 3 Divine, per two independent guide sources citing similar figures. Disgust/Despair are described as mid-tier value staples in popular instilling recipes; Guilt/Envy are cheap fillers. [single-source numbers, corroborated qualitatively by a second source] (WebSearch synthesis of mmopixel + timesaver.gg/blog/poe2-delirium-farming-guide)
- **Ancient Time-Lost Jewel crafting service**: Ancient Potent Contempt (+1 mod slot) at ~8.5 Divine, Melancholy ~27 Exalted, Ferocity <10 Exalted — buy the emotion, apply to a good Time-Lost Jewel base, resell the finished craft at a markup to players who don't want to gather Atlas points for the Ancient drop themselves. [single-source] (dadsofexile.com/liquid-emotions)
- **Splinter stack sales**: a 300-Splinter stack (a full, un-run Simulacrum) reportedly sells for ~6 Divine raw — a safe income floor for builds that can farm T11+ Delirium fog but can't clear deep Simulacrum waves. [single-source] (timesaver.gg/blog/poe2-delirium-farming-guide)
- **Simulacrum running (capable builds)**: tanky, fast-clearing builds that consistently reach wave 7 out-earn stack-selling by capturing the completion rewards (Atlas points, boss-key progress, exclusive uniques) plus all the mid-run emotion/currency drops per wave — one 7-wave clear reportedly yields many dozens of Distilled/Liquid Emotion drops in aggregate across a full run history. [single-source, qualitative] (timesaver.gg/blog/poe2-simulacrum-farming-guide)
- **200%-Deliriousness fog chaining**: using Grand Mirror + Trial of Madness to ramp a cluster of connected Atlas maps to 200% before farming them is called by one guide "the highest-ceiling currency farm in 0.5" — "nothing else drops a 10-Divine item from a single map kill the way a juiced Delirium can." No hard Divine/hour number was given by any source; treat as guide opinion, not a measured benchmark. [single-source, opinion, not a number] (timesaver.gg/blog/poe2-delirium-farming-guide)
- **Tangmazu pinnacle farming**: Raven-Touched Shard at ~80 Divine with an estimated (low-confidence) ~2% drop rate is the single largest per-kill payout documented in this domain — worth running for builds that can already clear the ~7M-HP fight, but access requires a long, non-repeatable-per-map gate (5 map bosses + Grand Mirror twin-boss + Simulacrum completion) so it isn't a tight per-hour loop. [single-source] (dadsofexile.com/tangmazu)
- **Combine mechanics**: Delirium fog stacks with Breach and Expedition content in the same map per one guide, letting a single juiced map pay out from three loot systems simultaneously — no numeric multiplier given. [single-source, qualitative] (timesaver.gg/blog/poe2-delirium-farming-guide)
- **Loathsome Mire jackpot**: guarantees a Distorted/Twisted amulet with 2 pre-instilled Notables from the Unethical Offering — a rare, non-farmable-on-demand bonus that can save an amulet-instilling trip entirely if the pre-rolled Notables happen to be good. [single-source] (WebSearch synthesis of poe2wiki.net/wiki/Loathsome_Mire + game8.co/archives/603918)

## Open questions

- **"Delirium cities" terminology could not be confirmed anywhere.** The actual 0.5 mechanic matching the brief's description (Grand Mirror chaining fog across connected maps toward 200%) is officially/community-named **"Trial of Madness."** Whether "delirium city/cities" is a real informal nickname this research simply failed to surface, or a mixup, is unresolved.
- **Exact per-emotion jewel modifier pools** (which specific crafted mod each of the 13 emotions rolls onto a Rare Basic or Time-Lost Jewel) are not documented in any source reached — poe2db.tw and poe2wiki.net (the two sites most likely to carry exhaustive mod tables) returned HTTP errors (403/522) on every fetch attempt.
- **Full list of the 16 exclusive Potent-only amulet Notables** is unconfirmed beyond two named examples (Storm's Rebuke, Kaom's Blessing); the source page (mobalytics "Hidden Anoints 0.5") 403'd on direct fetch.
- **Conflicting descriptions of Potent Liquid Ferocity's amulet effect**: one source says "(40–60)% increased Suffix/Prefix Effect," another (in an Ancient-Ferocity context) describes flat elemental/chaos resistance keyed to jewel-color Notables. These do not obviously describe the same mod; unresolved without an in-game/poe2db check.
- **Whether Potent (non-Ancient) emotions can be used in Waystone instilling** alongside the 10 base emotions is never explicitly stated either way by any source found.
- **No numeric Divine-per-hour benchmark for Delirium farming exists in any source reached** — all profitability claims in guides are qualitative ("highest ceiling," "best single-mechanic payout") rather than measured.
- **Reforging Bench** location/unlock condition rests on a single AI-aggregated search snippet with no independently fetchable primary source — needs in-game or wiki confirmation.
- **Delirium Atlas passive node names** ("Is This About Me or You?", "You Can't Scare Me Anymore", "I know your childhood fears…", "Are you sure you want to do that?") are sourced only from guide paraphrase/search-snippet text, not a verified in-game tree screenshot or official patch-note quote for every node — treat exact wording as approximate.

---

> Built 2026-07-14 by the poe2-kb-build workflow (research + adversarial verify). Patch 0.5.x.

## Adversarial verification (post-research)

- confirmed — Potent Liquid Contempt's amulet effect is '+1 extra Suffix/Prefix Modifier slot' — single-sourced from aoeah.com and not corroborated by the game8 Contempt page, which only describes the Ancient/jewel version of this effect.
  → The sourcing gap is real, not a research artifact. aoeah.com states base-tier Potent Liquid Contempt instills an amulet notable granting '+1 extra Suffix Modifier slot' (Prefix-color gem) or '+1 extra Prefix Modifier slot' (Suffix-color gem). Direct fetch of game8's dedicated Contempt page (archives/603309) confirms it covers ONLY Ancient Potent Liquid Contempt's jewel effect ('+1 Suffix Modifier allowed OR +1 Prefix Modifier allowed' on a rare Time-Lost Jewel) and never mentions the base amulet version. No second source (poe2db, poe2wiki, official patch notes) with the exact amulet wording was found in this pass — flag the KB entry as single-sourced until a poe2db/wiki citation is added. (https://www.aoeah.com/news/4633--how-to-get-and-use-liquid-emotions-in-poe-2-05 ; https://game8.co/games/Path-of-Exile-2/archives/603309)
- confirmed — Potent Liquid Ferocity's amulet effect (40-60% increased Suffix/Prefix Effect) directly conflicts with a second source (game8) describing it as flat elemental/chaos resistance by jewel color — the two are likely describing different things or one is wrong.
  → Not a real conflict — the two sources describe two different items, exactly as the claim's own hedge suspected. aoeah's '(40-60)% increased Suffix Effect / Prefix Effect' (by Ruby/Sapphire/Emerald/Diamond gem color) is the BASE-tier Potent Liquid Ferocity amulet notable. game8's 'Notable Passive Skills in radius also grant +(5-7)% to Fire/Cold/Lightning/Chaos Resistance' (same four gem colors) is explicitly the ANCIENT Potent Liquid Ferocity jewel-radius effect, per direct fetch of game8 archives/603308. Split this into two separate KB entries (base amulet notable vs. Ancient jewel radius mod) instead of flagging a data conflict. (https://game8.co/games/Path-of-Exile-2/archives/603308 ; https://www.aoeah.com/news/4633--how-to-get-and-use-liquid-emotions-in-poe-2-05)
- confirmed — Ancient Potent Liquid Contempt price of ~1,089 Exalted (~8.5 Divine) is a single 'Day 14' snapshot from one aggregator and will be stale/wrong by the time this doc is used.
  → Confirmed single-source and confirmed volatile. dadsofexile.com/price/ancient-potent-liquid-contempt is the sole source found for the exact 1,089 Exalted / ~8.56 Divine figure, dated to roughly two weeks into the league (~Day 14, mid-June 2026). The same page notes the price 'has climbed hard this week, up about 175% over four days,' itself evidence the number will be stale quickly. No second aggregator was confirmed to match this exact figure. (https://dadsofexile.com/price/ancient-potent-liquid-contempt)
- **REFUTED** — The 16 exclusive Potent-only amulet Notables are asserted as a fixed count but only 2 are named (Storm's Rebuke, Kaom's Blessing); the full list was never retrieved.
  → The full list is publicly retrievable, contradicting the 'never retrieved' framing. game8's 'All Secret Passive Instill Recipes' page enumerates 16 named exclusive Notables: Augmented Flesh, Bastion of Light, Dark Entropy, Desert's Scorn, Dominion, Grace of the Ancestors, Growing Peril, Kaom's Blessing, Lord of the Squall, Magnum Opus, Mystic Avalanche, Paragon, Replenishing Horde, Storm's Rebuke, Thaumaturgic Generator, and Unfettered (note: the page's own header says '18 total' while listing only 16 names — flag that internal inconsistency in the KB). A 17th name, Zarokh's Gift (extra Sinister Jewel Socket), is documented separately (aoeah, gamerblurb) as Potent-exclusive, suggesting the true count may exceed 16 and needs reconciling against the '18 total' claim. (https://game8.co/games/Path-of-Exile-2/archives/604649 ; https://gamerblurb.com/articles/poe-2-zarokhs-gift-recipe-and-sinister-jewel-socket-explained)
- confirmed — Simulacrum now starts at 100% Deliriousness and scales to 200% by wave 7 (post-0.5.3) — this is a recent bugfix and could be re-tuned again in later 0.5.x hotfixes not covered here.
  → The 100%→200% numeric claim is confirmed verbatim in 0.5.3 patch material: 'Simulacrums now start at 100% Delirious, scaling up to 200%.' Coverage also frames this as a bugfix ('previously intended to be 0% scaling up to 100%, but was actually not working at all'). The 'by wave 7' detail is a reasonable but not verbatim inference — Simulacrum was cut from 15 to 7 total waves back in 0.5.0, so 200% is reached by the final (7th) wave, but the 0.5.3 note itself doesn't spell out 'wave 7' explicitly. The doc's caveat about later re-tuning is sound methodological hedging, not a checkable fact. (https://maxroll.gg/poe2/news/path-of-exile-2-0-5-3-patch-preview)
- **REFUTED** — Reforging Bench (3 same-tier emotions -> 1 next-tier emotion) mechanic and its location at Trial of Sekhemas rests on a single AI-search-aggregated snippet with no primary source fetched.
  → The mechanic itself is correct and multiply-sourced (maxroll: '3x Distilled Emotion of the Next Tier. Must be same Distilled Emotion. 3x Ire > 1x Guilt and so on'), but the LOCATION claim is wrong, not just under-sourced. The Reforging Bench is NOT located at Trial of Sekhemas — it's found in campaign Town Zones (specifically the Ziggurat Encampment in Act 3, next to the Salvage Bench) and can be placed in the player's hideout; it's unlocked via the Hammer of Kamasa / Mektul the Forgemaster questline ('Treasures of Utzaal') in Act 3. Trial of Sekhemas is merely a place where Relics (a different item reforged at the same bench) are useful — the bench itself is not sited there. Confirmed independently by maxroll, game8, and dving.net guides. (https://maxroll.gg/poe2/resources/reforging-bench-guide)
- **REFUTED** — 'Delirium cities' terminology requested in the task brief was never found in any source — it may not be real 0.5 terminology, or research failed to find it under a different name.
  → The underlying terminology is real and well-documented, just not usually written as the exact compound noun 'Delirium cities.' In the 0.5 Atlas biome rework, 'City' is a real biome type — a map adjacent to the main town that grants bonuses from two biomes at once — and pushing City-biome maps to 200% Deliriousness is a widely covered farming strategy referred to as 'Delirium City farming' (a common tablet setup is 3 Delirium tablets + 1 Overseer tablet, with the 4th slot coming from a city-biome Atlas node). Correct 'Delirium cities' to 'City (Atlas biome) + Delirium farming' rather than marking the concept as nonexistent. (https://www.poecurrency.com/news/poe-2-patch-0-5-0-biomes-atlas-tree-strategy-best-biomes-for-every-farming-method)
- confirmed — Tangmazu's Raven-Touched Shard value (~80 Divine, ~2% drop rate) comes from one blog's single mid-league price snapshot and self-flagged low-confidence drop rate estimate.
  → Confirmed precisely as described. dadsofexile.com/tangmazu gives the price as 'around 10.2k exalted, roughly 80 divine' as of two weeks into the league (~Day 14, mid-June 2026), noting it 'climbed hard this week, up about 170 percent over four days' (already stale/volatile). The same page explicitly self-flags the drop rate: 'Not confirmed. A roughly 2 percent figure circulates from a single video and we could not verify it in any second source,' adding 'treat the shard as a rare drop, not a guaranteed one per kill.' Other sources give conflicting figures (one YouTube video cites 73 Divine/2%, another guide ~100 Divine), reinforcing that no stable cross-checked number exists. (https://dadsofexile.com/tangmazu)
- **REFUTED** — Waystone-instilling per-emotion Deliriousness% and bonus-effect table (Ire 7%...Isolation 50%) comes from a single source (timesaver.gg) with no cross-check against a second numeric table.
  → A second, independent numeric table exists and matches exactly. The community calculator at 625th.github.io/poe2-emotion/ lists identical Deliriousness values for all ten Distilled Emotions: Ire 7%, Guilt 9%, Greed 10%, Paranoia 12%, Envy 15%, Disgust 18%, Despair 20%, Fear 22%, Suffering 25%, Isolation 50% — matching timesaver.gg's table exactly. Add this cross-check to the KB rather than describing the table as uncorroborated. (https://625th.github.io/poe2-emotion/ ; https://timesaver.gg/blog/poe2-distilled-emotions-guide)
- **REFUTED** — Whether the 3 Potent emotions can be used in Waystone instilling (vs. only amulets/jewels) was never explicitly confirmed either way by any source.
  → This was explicitly confirmed. dadsofexile's Liquid Emotions guide states base-tier Potent Liquid Emotions 'function identically to lower-tier emotions for Waystone instillation, adding Delirious effects and reward modifiers' — the jewel-only restriction applies solely to the ANCIENT tier ('Ancient Liquid Emotions cannot instill amulets or Waystones... right click the emotion, then left click a rare Time-Lost Jewel'). A second, independently-worded source corroborates: Potent Liquid Emotions 'instill amulets with Notable Passives, add Delirium to Waystones, and craft guaranteed modifiers onto regular Jewels.' Conclusion: base Potent emotions CAN instill Waystones; Ancient Potent emotions CANNOT (jewel-only). (https://dadsofexile.com/liquid-emotions)
