# ring-attack-flat: synthesis (Stage S, 2026-10-06)

Inputs: the 6 extractions in `extractions/` (Keyson TWgmQuiLeHA, Alohaa kPBToE_G5t8, SaVeQ
m_n2htaTr98, Fre drik nyLcWFR3gHg, XTheFarmerX kE8Tn32yNp0 + _sSjC5LX_Ck), `archetype.json`,
`candidates.json`, `market-sample.json`, and the crafting KB (`docs/research/poe2-crafting-knowledge.md`).
Outputs: `src/data/poe2/craft/routes/ring-attack-flat.json` (5 templates, all `draft`) and
`src/data/poe2/craft/priors/{global,rings}.json` (5 priors). `npm run research:validate` passes.
A fact-check pass against the transcripts (15 fixes) was applied after the first draft.

Every number below comes from an extraction line, cited as `videoId at`. None of the videos has a
confirmed `publishedAt`, so every price is "at upload" with only the league or patch the creator
names. Treat prices as dated fixtures, never as live values. Five distinct creators. XTheFarmerX's
two videos count as one creator for grading. SaVeQ (transcript 33) and ASaVeQ (transcripts 23, 27,
30) are very likely the same creator, so they must never be counted as two.

## 1. Route templates

| Template | Tier | Start | Creators | Evidence grade |
|---|---|---|---|---|
| `ring-attack-flat-budget-magic` | budget | bought magic ring with a flat (asks the player) | XTheFarmerX (2 videos) | ss |
| `ring-attack-flat-mid-rarity-fracture` | mid | bought ring with a T1 rarity suffix, self-fractured (asks the player; a pre-fractured ring is the alternative) | Fre drik | ss |
| `ring-attack-flat-high-self-fracture` | high | clean (rolls the flat, desecrated blocker, fracture) | Alohaa | ss (the durability claim is vs, on shared mechanics only) |
| `ring-attack-flat-high-dusk-four-flat` | high (a T3 mid-budget stop is built in) | clean, four flats on a Dusk Ring (base inferred) | SaVeQ | ss |
| `ring-attack-flat-high-bought-fracture` | high | bought Gold Ring ilvl 82 with a fractured T1 flat (asks the player) | Keyson | ss |

Target roles are groups. The core role is **3 of {physical, fire, cold, lightning} attack flats**,
with T3 as the worst tier still accepted and the creators' ladder T1 → T2 → T3 at the last prefix.
The exceptions are budget (2 flats, with a third as upside), Fre drik (2 flats + T1 prefix rarity)
and SaVeQ's Dusk Ring (4 flats, a fourth prefix slot; the base is inferred, see §6). Suffix sets:

- high bought: 2 × T1 elemental res + 1 of {all-res, rarity}
- high self / Dusk four-flat: 2 of {fire, cold, lightning, all res, rarity}
- budget: T1 rarity (essence) + a resistance
- Fre drik: fractured rarity + attack speed (alloy)

SaVeQ's route is a **Dusk Ring four-flat craft**, not a 3-flat Breach craft: four flat prefixes
(4:07–4:40 has three, 9:04–9:10 reveals the fourth), quality to 40% (3:42–3:44, 5:19). It sits in its
own template with the T1 cost and sale bands (120–200 div → 500–690) and the T3 mid-budget bands
(50–80 div → 100–150). The old `ring-attack-flat-mid-t3` template was folded into it.

### Skeleton coverage in today's planner

| Phase kind | Method | Where |
|---|---|---|
| Chaos for a T1 flat | `chaos-loop` | all except budget |
| Self-fracture of a bought ring (the main Fre drik flow) | `fracture` | mid rarity |
| Placeholder suffix + Essence of the Breach (Dextral Crystallisation) | `slam-fill` + `breach-quality` | high ×3, mid ×1 |
| Catalysed Perfect/Greater slams | `slam-fill` | all |
| Attack (Reaver) quality before the quality mod is whittled off | `catalyse-finish` | high ×3 |
| Whittle the quality mod off, then whittle suffixes | `whittle-loop` | high ×3 |
| Desecrated blocker → Fracturing Orb | `blocker` + `fracture` | high self |
| Remove the desecrated blocker before the final desecration (one desecrated mod per item; Alohaa 1:35–1:37 states a removal, the method is unstated) | `unsupported` | high self |
| Regular Essence of Opulence (magic → rare, T1 rarity) | `essence-greater` (**gap:** the method offers Greater essences only) | budget |
| **Desecrate for an ordinary mod (a flat) + Omen of Light loop** | `unsupported` (P1) | the last prefix of all 5 templates |
| **Desecrate any ilvl ≥ 75 mod as a Whittling anchor** | `unsupported` (P1) | high bought, phase 7 |
| Swift Alloy steered by Dextral Crystallisation (attack speed) | `unsupported` | mid rarity |

The ring desecrated pool in the craft catalog (0.5.5b) has **no attack flats**, yet every creator
desecrates for a flat (TWgmQuiLeHA 16:59–17:10, kPBToE_G5t8 6:17–6:31, m_n2htaTr98 5:49–6:25,
nyLcWFR3gHg 0:58–1:08, _sSjC5LX_Ck 5:42–5:48). Desecration reveals draw from the ring's ordinary pool
plus faction-exclusive mods (poe2db Desecrated_Modifiers: "Reveal desecrated modifiers may include base
modifiers", checked 2026-10-06). Flats were revealed on screen in 5 videos (Keyson 10:07, SaVeQ
8:07–9:07, kE8Tn32yNp0 10:49 and 11:08, _sSjC5LX_Ck 11:30 and 12:03, Fre drik 1:32). The P1
`desecrate` method must therefore include ordinary-pool flats; at least 1 of the 3 options is
faction-exclusive at ilvl ≥ 65 (poe2wiki excerpt, unconfirmed). The planner's `desecrate` method only
targets desecrated-pool mods today. This is the largest gap: every high-route cost tail sits in that loop.

## 2. Cost and sale bands per tier (creator claims, dated "at upload")

| Tier | Base ask | Craft cost | Sale / listing |
|---|---|---|---|
| budget | 60 ex (kE8Tn32yNp0 7:42–7:45); 1–2 div (_sSjC5LX_Ck 0:49–0:53); 25–30 ex (9:02–9:07) | ~3 div per ring incl. materials (15:35–15:42); 4–5 div showcase (kE8Tn32yNp0 0:13–0:16) | misses 1 div (7:45–7:50, 12:06–12:11), 3–4 div (_sSjC5LX_Ck 15:11–15:15); hits 13 (13:15–13:19), 30–40 (0:11–0:19), 70–75 listed vs ~80 comparable, unsold after 17 h (7:53–8:01); triple flat + rarity "≥ 20" (kE8Tn32yNp0 11:36–11:40) |
| mid, rarity fracture (Fre drik) | — | none stated | none stated |
| high, self-fracture (Alohaa) | — | 200 div minimum bankroll (kPBToE_G5t8 0:20–0:27); second T1 flat 200–300 Chaos (1:41–1:46) | 200–600 div (kPBToE_G5t8 6:37–6:46) |
| high, Dusk four-flat (SaVeQ) | — | T1 flats: 120–200 div (m_n2htaTr98 0:03–0:07); mid budget with T3 flats: 50–80 div "if not picky" (12:45–12:50) | T1 ring price-checked 690, listed 650, expects 500–600 (10:02–10:20); T3 ring 100–150 div (12:20–12:35) |
| high, bought fracture (Keyson) | 60–70 div (TWgmQuiLeHA 7:52–7:58) | 300–400 expected **in total, including the 60–70 div base** ("we started with 400", 18:10; 18:20–18:24), 200–700 range (0:44–0:52); his second flat ~600 Chaos (2:46–2:54) | going rate 400–500 (0:52–0:59); his ring 550, copy at 625, about 100–150 div made (21:10–21:47); profitable only at 800–900, early league (18:26–18:32) |

Keyson says the bought-fracture route is **not** a profit craft late in the league (0:26–1:01).
Fre drik's "200d profit" is only in the title. The transcript has no number, so the mid-rarity
template carries no cost or sale claims. A cost band is a whole-craft total: Keyson's 300–400
contains his 60–70 div base, so adding the base on top would double count it.

### Dated material prices (market-reality fixtures, not inputs)

| Material | Claim | Where |
|---|---|---|
| Perfect Exalted Orb | ~2/3 div | kE8Tn32yNp0 3:15–3:21 |
| Perfect Exalted Orb | almost 3 div | _sSjC5LX_Ck 4:59–5:06 |
| Greater Exalted Orb | 10–11 ex | _sSjC5LX_Ck 5:03–5:09 |
| Tul's Catalyst | 5 ex | _sSjC5LX_Ck 3:41–3:48 |
| Reaver Catalyst | 30 ex | _sSjC5LX_Ck 3:48–3:52 |
| Omen of Abyssal Echoes | ~1.5 div | _sSjC5LX_Ck 10:52–10:56 |
| Omen of Light | ~4.5 div | _sSjC5LX_Ck 15:20–15:23 |
| Omen of Whittling | 3–4 div "when cheap", hypothetical early league | TWgmQuiLeHA 18:33–18:36 |
| Physical (Uul-Netol's) catalyst | 1.1 ex ("x" is exalts) | kE8Tn32yNp0 6:13–6:17 |
| Reaver catalyst | 12 ex (kE8Tn32yNp0 6:17–6:19) vs 30 ex (_sSjC5LX_Ck 3:48–3:52) | two different points in the league |
| One catalysing exalt | ~2 div (Reaver) and 20–29 ex (Physical) in kE8Tn32yNp0 6:21–6:32; ~7–8 div (Reaver) and under 1 div (cold) in _sSjC5LX_Ck 3:58–4:02 | dated; the Reaver gap is a price drift, not a mechanic |

## 3. Priors written (and the ones refused)

| Key | Value (point, band) | Basis | Grade | Why |
|---|---|---|---|---|
| `catalysing.multiplier@20` | 2 [2, 5] | creator_stated | cf | _sSjC5LX_Ck 2:48–3:04 says ×2, citing 300–400 attempts **by others** (no own count on screen → not measured). poe2wiki says ×5. The same creator says "like 5x" without a quality level (kE8Tn32yNp0 3:35–3:48). |
| `catalysing.multiplier@40` | 3 [3, 7.5] | creator_stated | cf | _sSjC5LX_Ck 3:01–3:04 says ×3; poe2wiki ×7.5, Craft of Exile ×7.4 (KB §4) |
| `reveal.options` | 3 [3, 3] | creator_stated | vp | TWgmQuiLeHA 17:41–17:47 + GGG 0.3.0 notes "one of three different options" (forum 3826682). Three options, rerolled once with Omen of Abyssal Echoes (his caption says "omen of light"; Light removes the desecrated mod). |
| `reveal.lightLoopAnchor.t1-attack-flat-or-rarity` (rings.json) | 10 [0, 15] | creator_stated | ss | TWgmQuiLeHA 17:48–17:55: "15 should be enough … usually less than 10". A **ceiling**: high 15, the usual case under 10; he gives no lower bound and the schema needs a number, so low 0 is a placeholder. |
| `brick.ring-attack-flat-budget-magic` (rings.json) | 0.25 [0.25, 0.5] | creator_measured, n=4 | ss | _sSjC5LX_Ck 14:26–14:44: his own second craft on four rings, one hard brick (1/4), a second ring also called a miss (2/4). One creator, thin n. |

Refused:

- **Weights the creators read off a tool.** These are `table_reading` and never become priors (rule 5):
  - every flat, resistance and all-res weight: TWgmQuiLeHA 13:36–13:45, 14:28–14:33, 17:25–17:36; _sSjC5LX_Ck 2:44–2:48
  - physical ×2 in the desecrated pool: m_n2htaTr98 1:12–1:32
  - 400 vs 200 for T1 physical vs elemental (kE8Tn32yNp0 caveat)
- **Counted attempts with no prior key:**
  - fracture 2/4 (m_n2htaTr98 2:05–2:15, n=4)
  - catalysed physical slam "something good" 2/3 (kE8Tn32yNp0 7:14–7:24, n=3)
  - catalysed Greater prefix slam: mana on 4/5 (_sSjC5LX_Ck 6:27–6:37) and 4/4 hits in the second craft (10:35–10:41)
- **No pooled brick prior.** The earlier "two bricks of five" caveat was not in the transcript and was
  deleted: 14:36–14:44 covers only the second craft (four rings). Only that n=4 is recorded, as
  `own_attempts`, and no other count is pooled into it.

## 4. Conflicts (all graded cf)

1. **Catalysing multiplier**: statement vs community model (see §3). There is no measurement on
   either side, so the point is the creator's quality-specific statement and the band spans the
   model. An owner in-game count settles it.
2. **Catalysing + Greater Exaltation on both mods**: _sSjC5LX_Ck 4:07–4:19 ("applies to both,
   tested last league") against forum 3849100 (0/3). KB §4 budgets first-mod-only, and the planner
   keeps that.
3. **Physical in the flat set**: Keyson excludes it from the chaosed second flat (2:01–2:09) but
   takes it at the last prefix. Alohaa, SaVeQ and XTheFarmerX keep or target it, and the owner's
   sample shows it on 4/5 rings. Resolution: physical is a member; Keyson's rule only sets the order.
4. **Chaos needed for the second T1 flat**: ~400 avg (TWgmQuiLeHA 2:20–2:26, his run 600) vs
   200–300 (kPBToE_G5t8 1:41–1:46). Keyson excludes physical, so his number is higher. The planner
   must land inside 200–600.
5. **Whittle orb**: Greater Chaos (kPBToE_G5t8 4:14–4:28) vs "normal, not greater"
   (m_n2htaTr98 5:28–5:46). The Greater Chaos floor is still an open KB question, so the planner
   prices plain Chaos.
6. **Perfect Exalt price**: 2/3 div (kE8Tn32yNp0 3:15–3:21) vs ~3 div (_sSjC5LX_Ck 4:59–5:06).
   The prices come from different points in the league. Choose Perfect or Greater from live prices.

Resolved without a conflict: Alohaa's "one in three with three mods" fracture (1:30–1:33) is
consistent with KB §2. With the desecrated blocker the ring has four mods and three of them can be
fractured.

## 5. What the planner must reproduce (market reality)

**Owner's 5-ring sample (2026-10-05, `market-sample.json`):**

- Breach Rings, ilvl 79–82, 60% Attack quality, implicit "+20% to maximum Quality"
- 4 of 5 have a fractured prefix flat; 1 (Carrion Turn) has a fractured leech suffix
- all 5 have three flats, physical on 4/5
- suffixes are "whatever useful": res 36–43%, all-res 15%, attack speed 14%, Dex 32, rarity 16%

The planner should:

1. **Offer** (with player consent) the bought-fractured-flat start for a 3-flat goal, and price it
   against the clean self-fracture route. Each listing matches one of the high templates.
2. Reach **60% Attack quality on a Breach Ring**: 20% + 20% implicit + 20% Essence of the Breach,
   then Reaver re-applied before the essence mod is whittled away (kPBToE_G5t8 3:26–3:40; KB §8).
3. Accept any 3-of-4 flat mix with physical allowed, and suffixes from the set without requiring
   T1. Elemental res 36–40% is T2, which needs only ilvl 71 (KB §3).
4. Land the chaos count for the second flat in **200–600 Chaos**. Land route totals inside the
   creator bands at era prices: budget ~3–5 div per ring; Dusk four-flat 120–200 div at T1 and
   50–80 div at T3; high self-fracture 200 div bankroll (Alohaa); high bought ~300–400 div **in
   total, including the 60–70 div base** (Keyson 18:10, 18:20).
5. Show attack speed's source as unresolved. Fre drik's Swift Alloy + Dextral Crystallisation is
   the only creator path, and it rests on undocumented omen behaviour.
6. Treat a fractured non-target suffix (Carrion Turn's leech) as a valid bought start. No template
   covers it yet.

## 6. Open questions

- **Last prefix**: desecrating for an ordinary flat with an Omen of Light loop is unsupported until
  P1, and it is the expensive tail of every high route.
- **Missing dates**: `publishedAt` is null for all six videos, so `patch.atUpload` is unknown and
  prices only carry "late 0.5 league" or "at upload".
- **SaVeQ base**: never named. Four flat prefixes need a Dusk Ring (KB §3), so the template says
  Dusk Ring as an inference. ASaVeQ's own Dusk Ring video (27, CZepweLtKwA 0:12–0:20) says the same
  but is the same creator, not a second source.
- **Keyson's quality**: the Attack-quality percentage is never stated. The template carries Reaver
  at most 40% as an inference (Gold Ring cap 20% + 20% Breach essence), not a quote.
- **Start kind of the mid-rarity template**: Fre drik buys an unfractured rare (at most 4 mods) and
  fractures it himself. `START_KINDS` has no "bought unfractured" kind, so the template uses
  `bought_magic_with_target` with an unfractured carried role and says so in a note.
- **Bone type**: unstated for Keyson and for Alohaa's blocker. Fre drik and kE8Tn32yNp0 use Ancient,
  SaVeQ and _sSjC5LX_Ck use Preserved.
- **Regular Essence of Opulence**: the `essence-greater` method has to learn it, or the budget
  route cannot be planned.
- **Catalysing multiplier**: an owner count at 20% and 40% would replace both cf priors.
- **Sources**: none are RMT. All are YouTube, poe2wiki or official forum threads.
