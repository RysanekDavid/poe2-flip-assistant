# src/assets

Every image the UI shows is self-hosted from this folder and imported statically — nothing is
hotlinked at runtime.

## Game art (GGG)

`items/` and `leagues/` hold Path of Exile 2 art by Grinding Gear Games, used under fan-site
terms. The app shows the required notice in the root layout footer ("This product isn't
affiliated with or endorsed by Grinding Gear Games in any way.", pinned by
`src/scripts/testLegalNotice.ts`). Downloaded once on 2026-09-29 (one request at a time, Node
`fetch` with a descriptive User-Agent, no browser); `P` =
`https://web.poecdn.com/gen/image/` (the path segment after it carries a server-checked hash, so
copy it exactly).

| File | Used for | Source |
|------|----------|--------|
| `items/waystone.png` | Farm tab + Tul & Esh unmodelled waystones, Regex › Waystone | Waystone (Tier 15): P + `WzI1LDE0LHsiZiI6IjJESXRlbXMvTWFwcy9FbmRnYW1lTWFwcy9FbmRnYW1lTWFwMTUiLCJzY2FsZSI6MSwicmVhbG0iOiJwb2UyIn1d/36fdc2dffa/EndgameMap15.png` (URL from `api/trade2/data/static` entry `waystone-15`) |
| `items/coffer-relic.png` | Regex › Relic | Coffer Relic: `https://cdn.poe2db.tw/image/Art/2DItems/Relics/RelicBase2x2.webp` (from poe2db.tw/us/Coffer_Relic; webp → png, margin trimmed) |
| `items/emerald-jewel.png` | Regex › Jewel | P + `WzI1LDE0LHsiZiI6IjJESXRlbXMvSmV3ZWxzL1NwZWNpYWxFbWVyYWxkSmV3ZWwiLCJ3IjoxLCJoIjoxLCJzY2FsZSI6MSwicmVhbG0iOiJwb2UyIn1d/9acdb9443b/SpecialEmeraldJewel.png` |
| `items/gold.png` | Regex › Vendor | Gold: `https://cdn.poe2db.tw/image/Art/2DItems/Currency/Ruthless/CoinPileTier2.webp` (from poe2db.tw/us/Gold; webp → png, margin trimmed) |
| `items/ravens-reflection.png` | Farm › Tangmazu entry, Simulacrum drop | Raven's Reflection: `https://cdn.poe2db.tw/image/Art/2DItems/Maps/TangamazuKey.webp` (no poecdn URL: ninja `image` is null, absent from trade2 data/static; webp → png, margin trimmed, squared) |
| `items/shattered-triskelion.png` | Farm › Olroth drop | Shattered Triskelion: `https://cdn.poe2db.tw/image/Art/2DItems/QuestItems/DamagedKalguuranTriskellion.webp` (same reason and treatment, downscaled to 128 px) |
| `items/the-triskelion-reforged.png` | Farm › Aberration entry | The Triskelion Reforged: `https://cdn.poe2db.tw/image/Art/2DItems/QuestItems/KalguuranTriskellion.webp` (same reason and treatment, downscaled to 128 px) |
| `items/djinn-barya.png` | Farm › Zarokh entry + drop | Djinn Barya: `https://cdn.poe2db.tw/image/Art/2DItems/Currency/Sanctum/BalbalaCoin1.webp` (not on ninja or trade2 data/static; same treatment) |
| `items/overseer-tablet.webp` · `breach-tablet.webp` · `delirium-tablet.webp` · `ritual-tablet.webp` · `abyss-tablet.webp` · `expedition-tablet.webp` · `irradiated-tablet.webp` · `temple-tablet.webp` | Farm › Strategies tablet rows, by base (`components/farm/strategies/tabletArt.ts`), Regex › Tablet type chips | `https://cdn.poe2db.tw/image/Art/2DItems/Currency/PrecursorTablets/<file>.webp` with `<file>` = `PrecursorTabletBoss`, `…Breach`, `…Delirium`, `…Ritual`, `…Abyss`, `…Expedition`, `…Generic` (Irradiated), `…Incursion` (Temple) — the RePoE 0.5.5b `visual_identity.dds_file` of each base. Kept as the original webp (no poecdn URL: base tablets are not in trade2 data/static) |
| `items/regex-tablet.webp` | Regex › Tablet filter card, the Regex › Tablet and Farm › Strategies sub-tab icons | Same file as `irradiated-tablet.webp` (`PrecursorTabletGeneric.webp`), a neutral base tablet |
| `items/mastered-domain.png` | Farm › Strategies, unique Mastered Domain | P + `WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvUHJlY3Vyc29yVGFibGV0cy9QcmVjdXJzb3JUYWJsZXRNYXN0ZXJlZERvbWFpbiIsInciOjEsImgiOjEsInNjYWxlIjoxLCJyZWFsbSI6InBvZTIifV0/b9d8f1bd46/PrecursorTabletMasteredDomain.png` (the unique's own art; it used to stand in for every tablet as `precursor-tablet.png`, removed 2026-09-29) |
| `items/visions-of-paradise.png` | Farm › Strategies, unique Visions of Paradise | P + `WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvUHJlY3Vyc29yVGFibGV0cy9QcmVjdXJzb3JUYWJsZXRHZW5lcmljVW5pcXVlMyIsInciOjEsImgiOjEsInNjYWxlIjoxLCJyZWFsbSI6InBvZTIifV0/6fffa18e78/PrecursorTabletGenericUnique3.png` (URL from poe2db.tw/us/Visions_of_Paradise) |
| `items/cruel-hegemony.png` | Farm › Strategies, unique Cruel Hegemony | P + `WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvUHJlY3Vyc29yVGFibGV0cy9QcmVjdXJzb3JUYWJsZXRPdmVyc2VlclVuaXF1ZTIiLCJ3IjoxLCJoIjoxLCJzY2FsZSI6MSwicmVhbG0iOiJwb2UyIn1d/b80eae0441/PrecursorTabletOverseerUnique2.png` (URL from poe2db.tw/us/Cruel_Hegemony) |
| `items/divine-orb.png` | Regex › Price | P + `WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lNb2RWYWx1ZXMiLCJzY2FsZSI6MSwicmVhbG0iOiJwb2UyIn1d/2986e220b3/CurrencyModValues.png` |
| `leagues/runes-of-aldur.png` | League picker | banner emblem cut from `https://web.poecdn.com/public/news/2026-05-11/RunesLogin.png` |
| `leagues/forbidden-rites.png` | League picker | banner emblem cut from `https://web.poecdn.com/public/news/2026-08-31/ForbiddenRitesLoginScreen.png` |

GGG publishes league emblems only inside login-screen art. The two above were cropped from the
banner, keyed off the blue cloth by hue (cloth R−B ≤ −20, gold ≥ −10), gradient-mapped to gold
and fitted into 64×64 transparent PNGs. Standard/Hardcore have no emblem; HC/SSF variants reuse
the parent league's emblem with a text badge (`src/lib/leagueEmblem.ts`). A new league needs its
emblem cut the same way, a line in `leagueEmblem.ts` and a line in `components/LeagueEmblem.tsx`.

## Owner-supplied art

The remaining top-level PNGs (tab icons, `logo/`, `Section Icons/`) were supplied by the owner.
The Regex and Patches tabs use lucide glyphs (`Search`, `ScrollText`) until owner art exists;
swapping one is a one-line `art(...)` change in `src/components/shell/tabIcons.ts`.
