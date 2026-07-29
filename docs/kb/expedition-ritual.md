# Expedition & Ritual — PoE2 0.5.x Money Machines

**Patch stamp:** Path of Exile 2 0.5.0 "Return of the Ancients" (Runes of Aldur league), launched 2026-05-29, hotfixed through 0.5.4. Facts are dated to source patch where the source specifies one. Both mechanics got substantial reworks at 0.5.0 — treat anything not explicitly re-confirmed for 0.5.2+ as provisional.

---

## EXPEDITION

### The loop, one paragraph
Explore an ocean island, detonate charges to dig up **Remnants**, kill the monster waves they summon, collect **Artifacts** (four faction currencies) and **Logbooks**. Take Logbooks to **Dannig** to open standalone "Grand Expedition" instances, which can reveal faction bosses and, at the top, the pinnacle boss **Olroth**. Spend Artifacts at the four faction vendors. [single-source: timesaver.gg/blog/poe2-expedition-farming-guide; corroborated by mobalytics.gg grand-expeditions-and-logbooks search snippet — treat as CONFIRMED for the broad loop]

### Logbooks
- Drop from Runic Monsters, mainly in **Tier 10+ maps**; open a portal to a standalone Grand Expedition area. [single-source: timesaver.gg/blog/poe2-expedition-farming-guide]
- Logbook area level scales payout; **~ilvl 79+** Logbooks have realistic odds of spawning Olroth. [single-source: timesaver.gg]
- 0.5.2: Tier 14+ Logbooks filter out low-value 3-socket Remnants, guaranteeing at least one Grand Expedition reward per logbook section ("no more dead logbooks"). [single-source: switchbladegaming.com/path-of-exile-2/expedition-guide]
- Logbooks contain "rumours" revealing specific content — e.g. the **Fallen Stars** rumour reveals unique map **Moor of the Fallen Skies**, a guaranteed high-slot Verisium Remnant, used as the practical farm route for Aldur's Saga materials. [single-source: timesaver.gg/blog/poe2-aldurs-saga-guide]

### Remnants & Runesmithing — the actual 0.5 rework
0.5 turned Remnants from a pure "explosive quantity mod" mechanic into a socket-puzzle crafting system:
- A Remnant has **2–10 rune slots** (9–10 are very rare), scaled by area level. [CONFIRMED — aoeah.com/news/4606, poe2wiki search snippet, dadsofexile.com/remnants all agree on the 2–10(rare up to 10) range]
- Click the Remnant → pick a known **Runesmithing recipe** ("Runeshape Combination") → it auto-fills its slots with the required runes → spawns a monster wave per rune (waves = slots − 1) → clear the wave(s) to claim the recipe's output. Dying forfeits the reward. [single-source, detailed: dadsofexile.com/remnants]
- Wave/difficulty scaling by slot count (dadsofexile's framing): 2–3 slots trivial-easy (always attempt), 4–5 moderate-tough, 6 hard (a reasonable "safe ceiling" for non-juiced characters), 7–8 very hard/brutal (geared only), 9–10 punishing/extreme (min-max only). [single-source: dadsofexile.com/remnants — unverified against a second source, treat as directional not exact]
- Recipe output categories: **Currency** (Orbs/Whetstones/Etchers/Scraps/Fluxes, up to Divine Orbs and Mirror of Kalandra at the highest slot counts), **Runes** (Lesser/regular/Greater/Warding/Ancient/Mythical), **Alloys** (Essence-like targeted-mod crafting materials), **Gems** (Uncut Skill/Spirit/Support + exclusive Kalguuran skills), **Uniques** (slot-specific uniques from 4 runes up, scaling to rare/very-rare uniques at higher counts). [single-source: WebSearch aggregate of aoeah.com/news/4606, boostmatch.gg remnants guide, poe2wiki search snippet — consistent across all three, treat as CONFIRMED for the category taxonomy, NOT for exact numbers]
- **Verisium** is a new currency spent exclusively on "Runeforging" crafting, not a general tradable currency. **Runic Ward** is a defensive layer forgeable onto armor via this system (absorbs damage, regenerates when you avoid hits). [single-source: dadsofexile.com/remnants]
- Specific rune-combo recipe examples circulating (e.g. "Death+Soul+Power+Life" = 4-slot Divine Orb; a 9-slot "Power+Opulent+Time+Oath+Death+Soul+Bond+Earth+Stone" = Mirror of Kalandra) are **[unverified]** — only one aggregator source (aoeah.com/news/4606) surfaced exact rune lists, they read as plausible but suspiciously clean/marketing-flavored, and no wiki or maxroll source corroborated the specific rune names or the "9-slot → Mirror" claim in this research pass. Do not hardcode these into a pricing/craft engine without a second confirmation.

### "All the sagas" — Expedition Sagas explained
Sagas are **Omens** (per-Expedition consumables) obtained from crafting on Verisium Remnants that force a specific boss/reward outcome on your *next* Logbook or Remnant use:
- **Aldur's Saga**: consumed on your next Logbook; the Grand Expedition areas it reveals roll bonus modifiers guaranteeing higher rune-slot-count Verisium Remnants (thresholds seen: "at least 5/6/7/8 slots", rarer tiers guaranteeing 7/8/9). It is "the core of the current Verisium and divine farming meta." Obtained via a runeword on a 7-slot Rune Remnant socketed with Wisdom, Vision, Life, Ward, Power, Arcane, Time runes. [single-source: timesaver.gg/blog/poe2-aldurs-saga-guide, corroborated in framing by the earlier WebSearch aggregate — treat recipe-existence as CONFIRMED, exact rune list as single-source]
- **Medved's Saga**: guarantees Medved, the Fallen Seer on the next Logbook ocean biome — the first boss in the Grand Expedition progression chain, mandatory to unlock further directional Logbooks. Recipe: Moon + Rage + Bloodletting + Vision + Wisdom + Time runes. [single-source: WebSearch aggregate — game8.co/archives/604420, poe2wiki, instant-carry.com product page]
- **Vorana's Saga**: guarantees Vorana, Last to Fall; slightly better drop weight than Medved, mid-tier rune combos + decent Verisium. Recipe: Moon + Toxic + Vision + Wisdom + Bond + Time. [single-source, same aggregate]
- **Olroth's Saga**: guarantees Olroth, Origin of the Fall (the expedition pinnacle-adjacent boss) — improved drop pool vs Vorana/Medved. Recipe: Vision + Celestial + Tempest + Wisdom + Power + Time. [single-source, same aggregate]
- **Uhtred's Saga**: guarantees Uhtred, the Stardrinker — described as "one of the most valuable expedition bosses." Recipe: Ward + Stone + Arcane + Vision + Wisdom + Time. [single-source, same aggregate]
- All five Saga recipes/effects above came from a single WebSearch synthesis (game8.co archive pages 604419–604423 + poe2wiki + timesaver), not independently cross-checked page-by-page — tag the whole Saga sub-section **[single-source cluster]** even though internally consistent.

### Faction vendors (the four Artifact sinks)
| Vendor | Faction | Artifact currency | Function |
|---|---|---|---|
| **Tujen** | Black Scythe Mercenaries | Black Scythe / Exotic Coinage | Haggle for currency, gems, jewelry, belts, maps at a discount |
| **Rog** | Order of the Chalice | Order Artifact | Deterministic step-by-step armor/shield crafting |
| **Gwennen** | Druids of the Broken Circle | Broken Circle Artifact | Gambles unidentified weapons/foci/quivers — the unique lottery |
| **Dannig** | Knights of the Sun | Sun Artifact / Burial Medallion | Hub: opens Logbooks, converts between artifact types |
[CONFIRMED — this faction/artifact mapping is consistent across timesaver.gg, switchbladegaming.com, and the mobalytics/maxroll search snippets]

**Tujen haggling mechanic**: he offers a non-equipment item for X Artifacts; you can pay it, or counter-lower. A lowball can be (a) accepted, (b) met with a counteroffer, or (c) cause him to get offended and pull the item entirely — he has "a short temper." [CONFIRMED — poewiki.net/wiki/Tujen search snippet + WebSearch aggregate agree independently]
- Ranked buy priority per one guide: Divine Orbs, Stacked Decks, and 21/20 gems highest; Regal Orbs/scarabs medium and mainly early-league. [single-source: maxroll.gg/poe/currency/logbook-farming-guide — **CAUTION: this URL is maxroll's PoE1 (not PoE2) currency section, last substantively written Jan 2024/2025 — flag as likely stale/wrong-game and do not trust for 0.5 specifics**]
- Beginner guidance: Tujen is the lowest-variance way to turn artifacts into orbs; start here before Rog. [single-source: timesaver.gg/blog/poe2-expedition-farming-guide]

**Rog crafting mechanic** (armor/shields only — boots, gloves, helmets, chest, shields; no weapons, no jewelry): you're offered a menu of actions per craft step:
- **Upgrade** the item's current (shown) modifiers for a cost
- **Reroll Modifiers** — removes highlighted mods, adds new ones
- **Reroll Modifier Values** — like a targeted Divine Orb on existing mods
- **Add Modifier** — like a targeted Exalted Orb
- Hard rule: **you cannot skip two consecutive crafts** — if you decline an offer you must take the next one or abandon the item. [CONFIRMED — WebSearch aggregate (initial Rog search) + switchbladegaming.com independently describe the same action set and the "no two consecutive skips" rule]
- Cost/profitability guidance (single source, numeric — treat as directional): a 5-action craft sequence typically costs **4–9 Exalted-equivalent Artifacts** in materials/rerolls; only worth crafting if the finished item sells for **12+ Exalted**. Target combos cited: resist+life on gloves/boots, %ES on chest, spell damage+life on helmets. [single-source: switchbladegaming.com/path-of-exile-2/expedition-guide]
- Rog is explicitly framed as the **higher-skill, deterministic** counterpart to Gwennen's pure gamble — you see the options and steer, but only pays off with a specific target mod and a hard cost ceiling set in advance. [single-source: WebSearch aggregate]

**Gwennen gamble mechanic**: sells unidentified weapon/focus/quiver bases; the item is revealed (identified) the moment you buy it. Item level scales to your character level, so gambling while leveling is close to pointless — value shows up at endgame character level where her rolls can hit best-in-slot unique bases or be complete junk. Strategy: buy every offer of a base tied to a currently-in-demand unique (meta chase item) rather than gambling blind. [CONFIRMED for the core "ilvl scales to character, reveal-on-buy" mechanic — WebSearch aggregate citing poewiki.net/wiki/Guide:Gwennen_gambling directly, consistent with general PoE Gwennen behavior carried into PoE2]

**Dannig**: hub vendor — decodes/opens Logbooks, converts between the other three artifact types (at a rate/fee not specified by any source found), and general trading works best when paired with the other three factions rather than used alone. It's "always worth it" to buy Exotic Coinage from him for resale. [single-source: maxroll.gg/poe/currency/logbook-farming-guide — **same stale/PoE1-flagged source as above, low confidence**]

### Remnant mods that matter — safety and priority
Priority ranking for remnant reward mods (higher = better to chain first): **Duplicated Runic Monsters > Logbook Quantity > increased Rare Monster spawns > Item Quantity > Item Rarity.** A Remnant's bonus modifiers only apply to monsters that spawn *after* that Remnant detonates — so the correct detonation sequence is: blow up the *reward* Remnants first, then let the blast chain into the Runic Monster markers, so the "+quantity/+rarity/+artifacts" buffs land on the packs you're about to fight. [CONFIRMED — WebSearch aggregate (priority ranking + sequencing rule) independently matches switchbladegaming.com's "detonation order" framing]

Danger tiers (single detailed source, switchbladegaming.com — not independently cross-checked, tag **[single-source]**):
- **Hard-avoid / run-ending**: "Monsters Immune to [your damage type]", "Monsters Have Guaranteed Critical Strikes", Elemental Penetration stacked with Elemental Damage amp, "Cannot Evade Attacks"
- **Manageable with caution**: Increased Monster Life, "Cannot Be Leeched From" (only hard-stops leech-dependent builds), a single Increased Monster Damage mod (dangerous only at 3+ stacked), ailment infliction (needs flask/res coverage)
- **Safely stackable**: monster loot-type restrictions, standalone Increased Movement Speed, Increased Area of Effect
- Rule of thumb some experienced players use: cap damage-increase mods at **two per chain**; a third is treated as hard-avoid regardless of the reward attached.

### Expedition income numbers (0.5.3/0.5.4-era)
No source gave a clean "alch-and-go Expedition" number in isolation; the best cross-mechanic ladder found (timesaver.gg's div/hour breakdown, itself a single source but internally consistent, cited twice independently by two different timesaver articles):
- Fresh/unjuiced T1–T10: **~1–3 div/hr**
- Comfortable, basic Atlas, T15 maps: **~3–6 div/hr**
- Disciplined, stacked T15+, fast build (general juiced-map baseline, not Expedition-specific): **10–20 div/hr**
- "Optimized ceiling" — full Atlas mastery + fast clear build + aggressive Currency Exchange bulk-selling: **~50 div/hr**, explicitly framed as "real but a ceiling, not a baseline." [single-source: timesaver.gg/blog/poe2-50-divines-per-hour-farming]
- Separately, general "Alch & Go" (four-mod, no juice) is cited at **~15 div/hr** in one WebSearch snippet — this conflicts somewhat with the "1–3 div/hr fresh" figure above and likely reflects different gear/build assumptions between articles. **[unverified / internally inconsistent across sources]** — do not treat either number as authoritative without reconciling build/investment level.
- Grand Expedition specifically (juiced loop) is estimated by community consensus at **10–20 div/hr**, with ~50 div/hr as an optimized ceiling requiring full Atlas + fast build + tablet sustain. [single-source aggregate: WebSearch synthesis citing timesaver.gg's farming-strategies-0-5-3 tier list]
- A separately-titled mobalytics guide claims "**500 Divine daily income**" from an updated 0.5.4 Expedition endgame strategy — headline only, not fetched/verified in this pass (URL returned 403 on WebFetch). **[unverified]**

---

## RITUAL

### Tribute mechanics
- Each map spawns **three or four Ritual Altars**. Clear the monsters standing in the runed circle, activate the Altar, and the same monsters respawn angrier — kill them again to earn **Tribute**. [CONFIRMED — WebSearch aggregate + boostmatch.gg + mmoexp.com all describe the same two-kill structure]
- **0.5.0 key change**: monsters killed at one Altar also respawn at *every subsequent* Altar in the same map, so Tribute compounds across the whole run instead of resetting per-altar. [CONFIRMED — independently stated by the WebSearch aggregate summary and referenced again in the mmogah "400+ divines" search snippet]
- Tribute is **strictly per-map**: unspent Tribute is lost the instant you leave the map. [CONFIRMED — stated identically by timesaver.gg, the WebSearch aggregate, and boostmatch.gg's summary]
- Each monster revival cycle reduces Tribute earned by **25%** per cycle by default; the Atlas notable **Reinvigorated Sacrifices** removes this penalty entirely, worth roughly **+28% total Tribute** on a four-altar map. [single-source: timesaver.gg/blog/poe2-ritual-farming-guide]

### Favours: buy, defer, reroll
- At the Ritual reward page you can **buy** a Favour outright with Tribute, **defer** it, or **reroll** the whole page.
- **Defer cost**: paying 15% of an item's Tribute price defers it — it reappears at a later Ritual (different map) for **10% cheaper**. Repeatable, so expensive chase items can be walked down in price across several maps. [single-source, but stated identically in two separate timesaver.gg articles (ritual-farming-guide and mageblood-headhunter-ritual-farming) — tag **single-publisher, internally consistent**, not independently cross-checked against a second site]
- **Reroll** spends Tribute to refresh the offered Favours page, revealing a new set of items/omens — useful for hunting Omens specifically rather than settling for the first page. [CONFIRMED — WebSearch aggregate + timesaver.gg agree]
- Practical guidance: bank Tribute early in a map rather than spending on low-value early-page items, and keep roughly **1,000 Tribute in reserve** to be able to defer high-value late-map discoveries. [single-source: timesaver.gg/blog/poe2-ritual-farming-guide]
- As of 0.5.0, all endgame Ritual rewards are **exclusively Uniques or Omens** (no more generic currency/rare-item favours at endgame), and any Tribute left unspent at the end of a map's rituals can instead be poured toward **An Audience with the King** progress. [single-source, but detailed and specific: WebSearch aggregate citing boostmatch.gg + mmoexp.com]

### Omens — acquisition and value
- In live 0.5 ("Return of the Ancients"), **Ritual is the only source of Omens**, with one carve-out: **Expedition Sagas** (see above) are Omens obtained from Expedition/Remnant crafting, not Ritual. [CONFIRMED — timesaver.gg omens guide explicitly states this, consistent with the Expedition section's Saga sourcing found independently]
- Ritual-exclusive Omens with real trade demand (available "nowhere else in meaningful quantities"): **Omen of Dextral/Sinistral Annulment, Omen of Dextral/Sinistral Erasure, Omen of Whittling**. Dextral/Sinistral Erasure reportedly sell for "multiple Divine Orbs each." [single-source: timesaver.gg/blog/poe2-omens-guide]
- Full functional omen catalog (categories, not exhaustive of every omen in game, [single-source: timesaver.gg/blog/poe2-omens-guide]):
  - **Chaos Orb control**: Whittling (removes lowest-level mod), Sinistral Erasure (prefix only), Dextral Erasure (suffix only)
  - **Exalted Orb control**: Greater Exaltation (2 random mods), Sinistral/Dextral Exaltation (prefix/suffix only), Homogenising Exaltation (matches an existing mod's type)
  - **Annulment control**: Greater Annulment (removes 2 mods), Sinistral/Dextral Annulment (prefix/suffix only)
  - **Other crafting**: Blessed (Divine rerolls implicits only), Corruption (Vaal Orb always changes something), Sinistral/Dextral Coronation (Regal adds prefix/suffix only), Sinistral/Dextral Alchemy (max prefixes/suffixes on Alch result), Chance (Orb of Chance won't destroy the item on failure), the Ancients (upgrades an item to a random Unique of the same class)
  - **Endgame utility**: Amelioration (prevents 75% of XP loss on death), Resurgence (full life/mana/ES recovery at low life), Refreshment (full flask/charm recovery at low life)
  - **Waystone Omens**: rarity/quantity/monster-count/effectiveness variants
  - **Desecration Omens**: guarantee specific boss modifiers
- **Atlas passive Ominous Portents** increases Omen appearance rate on Favour pages. [single-source: timesaver.gg/blog/poe2-ritual-farming-guide]
- 0.5.2 buff: the Atlas notable **Mysterious Rites** node (see Queen's Ritual below) grants **+10 additional Omens** in the first Favours set of a Queen's Ritual. [single-source, cited in two separate timesaver.gg articles: poe2-ritual-farming-guide and poe2-ritual-types]

### King in the Mists / Audience with the King
- **An Audience with the King** is a boss-access fragment filled by spending/offering Tribute at Ritual altars; once filled it reveals the **Crux of Nothingness** Atlas node where the **King in the Mists** boss resides. [CONFIRMED — WebSearch aggregate, consistent phrasing across two independent snippet sources (mmoexp.com, u4n.com titles + synthesis)]
- Two Atlas passives accelerate the fragment: **Royal Tithe** (more progress per Tribute offered) and **Prayer and Pledge** (a share of Tribute *spent* on Favours also counts toward the fragment, not just Tribute sacrificed directly). [single-source: WebSearch aggregate synthesis]

### Rite of the Nameless / The Bodach
- **Rite of the Nameless** is a 0.5 Atlas mechanic: choose a chain of **5 maps** to run as one continuous Ritual. Monsters (including map bosses) killed in one Ritual **carry over and reappear** in the next map's Ritual in the sequence, and each map's final Ritual in the chain spawns a unique boss. Failing to complete any map in the chain **resets all progress**. [CONFIRMED — WebSearch aggregate synthesis, phrasing consistent across two independent snippets]
- Completing the full 5-map chain awards **Call of the Shadows**, used to access **The Bodach**, described as the Ritual pinnacle boss — a multi-phase fight staged in darkness. [single-source: timesaver.gg/blog/poe2-ritual-types]

### Queen's Ritual
- The Atlas notable **Mysterious Rites** gives each standard Ritual roughly an **8% chance** to upgrade into a **Queen's Ritual**, culminating in a fight against **The Queen in the Mists**, who drops one of three **Corrupted Idols**. [single-source: timesaver.gg/blog/poe2-ritual-types, with the 8% figure echoed independently in the earlier WebSearch omens-guide synthesis — treat the existence of Queen's Ritual and the ~8% figure as reasonably solid, tag overall single-publisher for exact %]
- 0.5.2 buffed Queen's Ritual to include **+10 Omens** in its first Favours page (see Omens section).

### Ritual Atlas/tablet setup for profit
Recommended node stack across sources (aggregate, largely single-publisher timesaver.gg but internally consistent across 3 of their articles):
1. **He Approaches** — boosts item rarity in Ritual rewards
2. **Ominous Portents** — increases Omen appearance rate
3. **Spreading Darkness** — guarantees four Altars per map instead of three
4. **Reinvigorated Sacrifices** — removes the 25%-per-cycle Tribute decay
5. **Mysterious Rites** — 8% Queen's Ritual chance + bonus Omens
6. **Royal Tithe** / **Prayer and Pledge** — accelerate King in the Mists access if that's a farm target
7. Stack **reroll-cost-reduction** nodes to flip through more Favour pages per map (hunting Omens/chase uniques)
- Use **Ritual Precursor Tablets** in Atlas Towers to force/guarantee Ritual spawns on nearby maps; pairing Ritual tablets with Delirium and Pack Size modifiers is recommended to raise both monster density (more Tribute) and reward quality simultaneously. [single-source: timesaver.gg/blog/poe2-ritual-farming-guide]
- A widely-circulated (unverified single anecdote) claim: a viral r/PathOfExile2 post showed **both Mageblood and Headhunter dropping from the same Ritual encounter**, used to argue Ritual is "the most targeted path" to either belt. This is an existence proof, not a rate claim — **[unverified, anecdotal]**.

### HH / MB "lottery" framing — read this before chasing chase-uniques
- Community EV testing (Orb of Chance on white/utility belt bases) converges on roughly **0.05%–0.1% per orb** for top-tier chase uniques like Mageblood/Headhunter — i.e., **1 in 1,000 to 1 in 2,000** orbs. [single-source cluster: WebSearch synthesis citing timesaver.gg/blog/poe2-orb-of-chance-guide + poecurrency.com — internally consistent, not independently verified against a wiki drop-rate table]
- At these odds, **expected currency cost of chancing exceeds the item's market price** in most cases — i.e., **negative EV**. The stated framing from multiple guides: "chance for the dream, not for profit"; if you want the item reliably, **buying it outright is cheaper in expectation** than farming bases + Chance Orbs. [CONFIRMED — this conclusion is stated near-identically by the WebSearch aggregate synthesizing timesaver.gg and poecurrency.com/mmogah content independently]
- Use **Omen of Chance** (prevents item destruction on failed Chance) or **Omen of the Ancients** (guarantees *some* random Unique of the base's class rather than nothing) to reduce the downside variance of a chance-gambling session, not to fix the EV. [single-source: timesaver.gg/blog/poe2-orb-of-chance-guide]
- There is **no credible "guaranteed profit from omens" lottery strategy** in the sources reviewed — the actual profit angle (below) is selling the Omens Ritual generates as crafting-consumable byproduct, not gambling on HH/MB drops.

---

## Wallet warnings

**Expedition:**
- Opening Logbooks below roughly Tier 10 area level wastes the investment — payout scales with area level, low-tier logbooks are largely a waste of the Dannig conversion. [single-source: switchbladegaming.com]
- Detonating explosives directly into monster markers instead of chaining through reward Remnants first **forfeits most of the quantity/rarity bonuses** — the #1 cited beginner mistake. [single-source: timesaver.gg/blog/poe2-expedition-farming-guide]
- Stacking 3+ dangerous remnant mods (guaranteed crits, elemental immunity matching your damage type, "cannot evade") **can end a juiced map instantly** — a greedy detonation chain is the single biggest currency-loss vector in Expedition. [single-source: switchbladegaming.com, echoed in timesaver.gg's framing]
- Crafting with Rog without a pre-decided modifier target and hard cost ceiling reliably loses currency — the "no skipping two consecutive crafts" rule means you can get locked into finishing a craft that's no longer profitable. [single-source: switchbladegaming.com]
- Gwennen gambling while leveling is close to pointless because item level scales to character level — the value only appears at endgame character levels. [single-source: WebSearch aggregate citing poewiki.net Gwennen guide]
- Exact numeric rune-recipe claims (e.g. specific rune combos for Divine Orb / Mirror of Kalandra output) come from a single low-authority aggregator and were not corroborated by wiki or maxroll sources found in this pass — **do not hardcode these into any automated pricing/crafting logic without independent confirmation.**

**Ritual:**
- Leaving a map with unspent Tribute **destroys it** — it does not carry over. Always dump remaining Tribute into rerolls, cheap Favours, or an Audience with the King sacrifice before portaling out. [CONFIRMED across sources]
- Spending Tribute on low-value early-page items before seeing the full page forecloses better options later in the same map — bank and reroll deeper is the recommended default. [single-source: timesaver.gg]
- Failing any single map in a **Rite of the Nameless** 5-map chain resets all accumulated progress toward The Bodach — don't start the chain under-geared or under-flasked. [single-source: WebSearch aggregate]
- Chasing Mageblood/Headhunter via Orb of Chance gambling is **negative-EV** at ~0.05–0.1% hit rate; treat it as entertainment spend, not a profit strategy — buying the belt outright is cheaper in expectation. [CONFIRMED, see HH/MB section]

---

## Profit angles

1. **Expedition — Tujen-first bootstrapping.** Lowest-variance artifact-to-currency conversion; recommended default for players without spare currency to risk on Rog or Gwennen. [single-source: timesaver.gg]
2. **Expedition — Rog deterministic crafting.** Pick a specific target mod combo (e.g. res+life on gloves/boots, %ES on chest) ahead of time, cap spend at a hard ceiling (~4–9 Exalted-equivalent for a 5-action sequence), only proceed if the finished item can sell for 12+ Exalted. Higher skill floor than Gwennen but more predictable ROI. [single-source: switchbladegaming.com]
3. **Expedition — Gwennen unique-fishing.** Not a general profit strategy (mostly junk), but targeted buying of bases tied to a currently-in-demand meta unique can hit big; treat as a variance play layered on top of a Tujen/Rog income base, not a primary income source.
4. **Expedition — Aldur's Saga / high-slot Verisium Remnant farming.** Currently described as "the core of the Verisium and divine farming meta" — farm the Fallen Stars rumour → Moor of the Fallen Skies unique map for guaranteed high-slot Remnants, run Aldur's Saga to push Grand Expedition remnant slot counts higher, cash out via Runesmithing recipes (currency/runes/alloys/gems/uniques). Framed as a **volume play across 10–15 Sagas** rather than a per-map guarantee — high variance. [single-source: timesaver.gg/blog/poe2-aldurs-saga-guide]
5. **Expedition — general juiced-map income ladder**: realistic range is 3–8 div/hr for low-investment approaches up to a **10–20 div/hr disciplined range**, with **~50 div/hr as an explicitly-labeled ceiling** requiring full Atlas mastery, a fast-clear build, and aggressive Currency Exchange bulk-selling — not a baseline expectation. [single-source cluster: timesaver.gg]
6. **Ritual — sell the Omens, skip the HH/MB lottery.** The actual reliable profit path: run a Ritual-heavy Atlas setup (He Approaches, Ominous Portents, Spreading Darkness, Reinvigorated Sacrifices, Mysterious Rites) with Ritual Precursor Tablets, defer/reroll aggressively to maximize Omen sightings per map, and sell the crafting-consumable Omens (Erasures, Whittling, Annulments) which reportedly move for multiple Divine Orbs each. This is explicitly the strategy multiple guides land on after rejecting HH/MB chancing as a profit method. [single-source cluster: timesaver.gg omens guide + ritual farming guide + mageblood-headhunter guide, internally consistent]
7. **Ritual — Queen's Ritual stacking.** Mysterious Rites' ~8% Queen's Ritual chance plus its 0.5.2 +10 Omens buff on the first Favours page makes Queen's Rituals disproportionately good Omen sources relative to standard Rituals — worth specifically building the Atlas tree around if Omens are the target. [single-source: timesaver.gg]

---

## Open questions

- Are the specific Runesmithing rune-combo recipes (e.g. "Death+Soul+Power+Life = 4-slot Divine Orb", 9-slot Mirror of Kalandra recipe) accurate, or is this aggregator content inflating/inventing recipe specifics for SEO? No wiki-grade source corroborated the exact rune lists in this research pass.
- What exactly is Dannig's artifact-to-artifact conversion rate/fee? No source specified numbers.
- Is the "Alch & Go ~15 div/hr" figure consistent with the same source's own "fresh/unjuiced 1–3 div/hr" figure — these appear to conflict and weren't reconcilable from available snippets (possibly different gear/investment assumptions, or different game phases).
- What is the real (dataset-backed, not "8%") Queen's Ritual upgrade chance, and does Mysterious Rites' rate differ by map tier or Atlas investment?
- Is "9-10 slot Verisium Remnant → Mirror of Kalandra" real, or a wildly rare/theoretical outcome being reported as a farmable strategy? No source gave an occurrence rate for 9-10 slot remnants beyond "very rare."
- Mobalytics' headline claim of "500 Divine daily income" from an 0.5.4 Expedition strategy was not independently verified (page blocked WebFetch with 403) — needs a follow-up fetch via a different method before trusting the number.
- Exact Tribute-to-Favour price curve (how many Tribute points a given Favour tier costs) was not found in any source in this pass — only relative mechanics (defer = 15% cost / 10% discount) were captured, not absolute Tribute economy numbers.
- Whether Corrupted Idols (Queen's Ritual drop) and Call of the Shadows (Rite of the Nameless reward) have independent trade/crafting value worth farming for, beyond gating pinnacle boss access, is undocumented in sources reviewed.

---

> Built 2026-07-14 by the poe2-kb-build workflow (research + adversarial verify). Patch 0.5.x.

## Adversarial verification (post-research)

- confirmed — 1. Specific rune-combo recipes for Divine Orb (4/5/6/9-slot) and Mirror of Kalandra (9-slot) via Verisium Remnants, from a single low-authority aggregator
  → The recipes check out and are NOT single-source. poe2db.tw's data-mined Runeshape Combinations table independently lists Mirror of Kalandra as a 9-slot recipe (Power, Opulent, Time, Oath, Death, Soul, Bond, Earth, Stone Runes) — an exact match to the aggregator's list — and shows Divine Orb as a graduated recipe series scaling from a 4-slot combo (yields 1x Divine) up to a 9-slot combo (yields 10x Divine), which is consistent with the '4/5/6/9-slot' description. KB should cite poe2db.tw as the primary corroborating source rather than flagging this as unverified single-aggregator content. (https://poe2db.tw/us/Runeshape_Combinations)
- confirmed — 2. Tribute defer costs 15% of item's Tribute and reappears 10% cheaper on a later map — stated only by one publisher (timesaver.gg) across two of its own articles
  → The 15%/10% figures are independently corroborated: the Path of Exile Fandom wiki's dedicated 'Defer' page states the same numbers — paying 15% of an item's cost defers it, and it reappears later discounted by 10%. Caveat for the KB: that wiki page documents the original PoE1 Ritual League defer mechanic; PoE2 0.5's Ritual encounters appear to reuse it unchanged (timesaver.gg's PoE2-specific articles report identical figures), but no PoE2-specific primary source (poe2wiki blocked our fetch with a 403) was reachable to confirm GGG didn't retune the percentages for PoE2. (https://pathofexile.fandom.com/wiki/Defer)
- unverifiable — 3. Mageblood/Headhunter Orb of Chance success rate is ~0.05%-0.1% per orb (1 in 1,000-2,000)
  → GGG has never published exact chance-orb-to-specific-unique odds, and none of these are extractable from poe2db as a fixed rate (unique drop weighting is dynamic/algorithmic, not a flat listed percentage). The official PoE forum thread on Headhunter/Orb of Chance odds only offers vague community language ('in the thousands unless RNG favors you') with no agreed number. Treat 0.05–0.1% as unverified community folklore repeated across guide sites, not a sourced fact — soften the KB's confidence language accordingly. (https://www.pathofexile.com/forum/view-thread/3726910)
- unverifiable — 4. Mysterious Rites gives ~8% chance per Ritual to upgrade to a Queen's Ritual
  → The 8% figure is repeated consistently across multiple guide sites, but the official 0.5.2 patch notes only confirm the passive was reworked and its Omen rewards increased — they do not state a percentage. No poe2db/poe2wiki page with a game-data-extracted trigger chance was reachable to independently confirm the number. Flag as a widely-repeated but unsourced community figure rather than a confirmed value. (https://www.pathofexile.com/forum/view-thread/3960375)
- unverifiable — 5. Aldur's Saga and the four boss Sagas (Medved's/Vorana's/Uhtred's/Olroth's) each require specific fixed 6-7 rune recipes as listed
  → Mixed result — Aldur's Saga's 7-rune recipe (Wisdom, Vision, Life, Ward, Power, Arcane, Time) is corroborated by two independent guide publishers (Game8 and separate aggregator sites) converging on an identical list, so that part checks out. The four boss Sagas' 6-rune recipes are reported consistently but only across guide-aggregator sites that likely share a common upstream source; the corresponding poe2wiki.net pages exist but returned 403 on fetch, so no independent/primary confirmation was reachable for Medved's, Vorana's, Uhtred's, or Olroth's specifically. Downgrade confidence on the four boss-Saga recipes until confirmed against poe2db or poe2wiki directly. (https://game8.co/games/Path-of-Exile-2/archives/604419)
- **REFUTED** — 6. Alch-and-go Expedition income is ~15 div/hr, which appears to conflict with the same source ecosystem's 'fresh/unjuiced 1-3 div/hr' figure
  → No PoE2 0.5.x source was found stating 'alch-and-go Expedition = 15 div/hr.' The only '15 div/hr alch-and-go' figure found in search results is from a Path of Exile 1 video (patch 3.27 — a different game/patch-numbering scheme), not PoE2. Timesaver.gg's own internally consistent PoE2 0.5.3 breakdown (fetched directly) gives only three tiers: fresh/unjuiced T1-T10, no Atlas passives = ~1-3 div/hr; disciplined tower-stacked T15+ = ~10-20 div/hr; optimized full-Atlas-mastery ceiling = ~50 div/hr. There is no 'alch-and-go = 15 div/hr' tier in that source. The '15 div/hr' figure appears to be a conflation with PoE1 content rather than a real conflict within the PoE2 guide ecosystem — correct the KB to remove the 15 div/hr alch-and-go figure entirely rather than flagging an internal contradiction. (https://timesaver.gg/blog/poe2-50-divines-per-hour-farming)
- confirmed — 7. 50 div/hr is achievable as an 'optimized ceiling' with full Atlas mastery + fast build + aggressive Currency Exchange selling
  → This matches timesaver.gg's own article near-verbatim: 'up to ~50 div/hr' requiring 'Full Atlas mastery + bulk flipping the Currency Exchange.' However this is that single publisher's own unverified estimate, not a cross-source consensus — a different guide (mmoexp.com) claims a higher 75-100 div/hr ceiling under 'maximum juice' Expedition farming, and no poe2db/GGG source publishes economic throughput figures at all. KB should attribute the 50 div/hr figure explicitly to timesaver.gg as one guide's estimate, not present it as an authoritative or agreed-upon ceiling. (https://timesaver.gg/blog/poe2-50-divines-per-hour-farming)
- **REFUTED** — 8. Reinvigorated Sacrifices Atlas node removes a 25%-per-revival-cycle Tribute decay, worth ~+28% total Tribute on a 4-altar map
  → Both the node name and its effect are wrong. The actual Atlas passive is named 'Invigorated Sacrifices' (not 'Reinvigorated Sacrifices'), confirmed by poe2db.tw and by an official PoE forum bug-report thread title. Its documented effect per poe2db is a partial reduction — 'Revived monsters from Rituals have 5% reduced penalty to Tribute granted' at one allocation and '50% reduced penalty' at a higher one — not a full removal of the decay. No source confirms a base '25%-per-revival-cycle' Tribute decay rate or the derived '+28% on a 4-altar map' figure; these appear to be fabricated or mis-derived. Correct the KB entry's node name and replace 'removes' with 'reduces by up to 50% (allocation-dependent)'. (https://poe2db.tw/us/Invigorated_Sacrifices)
- unverifiable — 9. Rog craft 5-action sequences cost 4-9 Exalted-equivalent and are only profitable if the item sells for 12+ Exalted
  → These specific figures (Order Artifacts 0.2-0.4 Exalted each, 5-action craft totaling 7-9 Exalted invested, breakeven around 12 Exalted sale price) appear consistently in web search results but trace back to low-authority guide aggregators, not poe2db/poe2wiki/GGG — crafting-cost economics are market-price-dependent estimates that no data wiki tracks, so this cannot be independently verified against a primary source. Label as an unverified community/guide estimate in the KB rather than a checked fact. (https://epiccarry.com/blogs/poe-2-expedition-crafting-guide/)
- **REFUTED** — 10. Mobalytics' claimed '500 Divine daily income' 0.5.4 Expedition strategy headline (page unreachable, unverified)
  → The page is not unreachable — it is a real, indexed Mobalytics guide with the URL slug 'poe-2-0-5-expedition-endgame-farming-guide-500-divine-daily-income,' and its '500+ Divine Daily' headline claim is corroborated by a companion YouTube video from the same creator (mattjestic) titled 'Make 500+ Divine Daily & DROPS MIRROR!' Our automated WebFetch got a 403 (bot-blocking), which is a tooling limitation, not evidence the page doesn't exist or that the claim is unverified — the headline figure is real and attributable, just not independently validated as an achievable rate (same caveat as claims 6/7: single-influencer figure, no cross-source confirmation of the actual div/hr rate). (https://mobalytics.gg/poe-2/profile/mattjestic-multiGaming/guides/poe-2-0-5-expedition-endgame-farming-guide-500-divine-daily-income)
- confirmed — 11. Verisium Remnant slot count scales 2-10 with 9-10 being very rare, and wave count equals slots minus one
  → Corroborated by convergence across multiple independent guide publishers (not a single source): Remnants carry 2-10 rune slots with 9-10-slot remnants called very rare, and wave count scales with slots used — a 10-slot Remnant produces 9 monster waves, a 7-slot Remnant produces 6 waves, matching the 'slots minus one' rule. Not directly poe2db-line-item verified, but cross-source agreement among otherwise-competing publishers (dadsofexile.com, boostmatch.gg, aoeah.com) gives reasonable confidence. (https://dadsofexile.com/remnants)
- confirmed — 12. Tier 14+ Logbooks in 0.5.2 filter out low-value 3-socket remnants guaranteeing a Grand Expedition per logbook section
  → Confirmed directly from GGG's official 0.5.2 patch notes: 'Every section of the Ocean revealed by an Expedition Logbook is now guaranteed to contain at least one Grand Expedition,' and 'Many of the 3 slot runic inscriptions no longer appear at these levels [Tier 14 Maps and above], or have a reduced chance to appear from Tier 10 Maps onwards.' Minor precision note for the KB: the patch notes say 'many' 3-socket remnants stop appearing at T14 (phased out starting at T10), not an absolute 100% filter — otherwise the claim is accurate and primary-sourced. (https://www.pathofexile.com/forum/view-thread/3960375)
