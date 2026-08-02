# PoE2 Flip Assistant — obsolete historical bootstrap spec

> **STOP:** the material below is an early bootstrap transcript and is not an implementation
> contract. It contains obsolete units, architecture, endpoints, and security assumptions. Follow
> `AGENTS.md`, the root `README.md`, `deploy/README.md`, and current code/tests instead. In
> particular: `primaryValue` is Divine per item and must not be inverted; authentication is
> mandatory; POESESSID is per-user encrypted data; no automated trade action is supported.

## Co to dělá

Real-time trading assistant pro PoE2 Currency Exchange (Ange). Sleduje ceny z poe.ninja,
počítá cross-pair spready, detekuje price spiky a alertuje kdy a za co kupovat/prodávat.

Uživatel má full atlas endgame, 10kk+ gold, hraje SC Runes of Aldur ligu.
Flip loop: kup item za Exalted → prodej za Chaos → konvertuj Chaos → Exalted → opakuj.

---

## Tech stack

- **Runtime**: Node.js 20+ s TypeScriptem
- **Frontend**: Next.js 15 + React (jednoduchý dashboard)
- **DB**: SQLite přes better-sqlite3 (price history, trade log, watchlist)
- **Styling**: Tailwind CSS
- **Notifikace**: node-notifier (OS desktop notif) + zvuk přes beep
- **Scheduler**: node-cron (polling každých 5 minut)
- **HTTP**: axios s rate limiterem

---

## Struktura projektu

```
poe2-flip-assistant/
├── src/
│   ├── api/
│   │   ├── ninjaClient.ts       # poe.ninja API client
│   │   ├── types.ts             # TypeScript typy
│   │   └── rateLimiter.ts       # Max 12 req / 5 min
│   ├── core/
│   │   ├── priceEngine.ts       # Chaos equiv výpočty
│   │   ├── spreadCalc.ts        # Cross-pair spread detection
│   │   ├── alertEngine.ts       # Alert threshold logika
│   │   └── trendDetector.ts     # 7d trend analýza
│   ├── db/
│   │   ├── database.ts          # SQLite init + migrate
│   │   ├── schema.sql           # Tabulky
│   │   └── queries.ts           # Typed queries
│   ├── scheduler/
│   │   └── poller.ts            # Cron job, fetch + process
│   ├── app/                     # Next.js app dir
│   │   ├── page.tsx             # Dashboard
│   │   ├── api/
│   │   │   ├── prices/route.ts  # GET aktuální ceny
│   │   │   ├── alerts/route.ts  # GET/POST alerty
│   │   │   └── trades/route.ts  # Trade log CRUD
│   │   └── layout.tsx
│   └── components/
│       ├── SpreadTable.tsx       # Tabulka spreadů
│       ├── PriceChart.tsx        # 7d chart (recharts)
│       ├── AlertFeed.tsx         # Live alert feed
│       ├── TradeLog.tsx          # Manuální trade log
│       └── WatchlistEditor.tsx   # Co sledovat
├── .env.local
├── package.json
├── tsconfig.json
└── CLAUDE.md                    # tento soubor
```

---

## poe.ninja API

### PoE2 Currency Exchange endpoint (undocumented, stable)

```
GET https://poe.ninja/poe2/api/economy/currencyexchange/overview
  ?leagueName=Runes of Aldur
  &overviewName=Currency
```

Response:
```json
{
  "lines": [
    {
      "id": "divine",
      "primaryValue": 1.0,
      "volumePrimaryValue": 1480
    },
    {
      "id": "exalted",
      "primaryValue": 0.000559,
      "volumePrimaryValue": 1920
    }
  ],
  "items": [
    { "id": "divine", "name": "Divine Orb", "icon": "..." },
    { "id": "exalted", "name": "Exalted Orb", "icon": "..." }
  ]
}
```

### Výpočet chaos equivalent

```typescript
// primaryValue >= 1 → přímá chaos hodnota
// primaryValue < 1 → items per chaos (invertuj!)
const chaosEquiv = (line: NinjaLine): number =>
  line.primaryValue >= 1
    ? line.primaryValue
    : 1 / line.primaryValue;
```

### Kategorie k fetchovat

```typescript
const CATEGORIES = [
  { overviewName: 'Currency',   endpoint: 'currencyexchange/overview' },
  { overviewName: 'Fragment',   endpoint: 'currencyexchange/overview' },
  { overviewName: 'Essence',    endpoint: 'overview' },
  { overviewName: 'Rune',       endpoint: 'overview' },
];
```

### Rate limit

Max **12 requestů / 5 minut**. Použij bottleneck nebo vlastní token bucket.
Cache responses na 1 hodinu (poe.ninja update frequency).

---

## Core logika

### 1. Cross-pair spread kalkulace

```typescript
interface SpreadResult {
  item: string;
  buyExalt: number;       // kolik Exaltů zaplatím
  sellChaos: number;      // kolik Chaos dostanu
  buyChaosEquiv: number;  // buy přepočtený na Chaos
  spreadChaos: number;    // sellChaos - buyChaosEquiv
  spreadPct: number;      // (spread / buyChaosEquiv) * 100
  profitable: boolean;    // spreadPct >= threshold
}

function calcCrossPairSpread(
  itemChaosValue: number,   // z poe.ninja (chaos equiv itemu)
  exaltChaosRate: number,   // kolik Chaos = 1 Exalt
  buyExaltDiscount: number, // 0.9 = kupuj 10% pod market
  sellChaosBonus: number    // 1.1 = prodávej 10% nad market
): SpreadResult
```

### 2. Trend detection

```typescript
interface TrendSignal {
  item: string;
  change7d: number;     // % změna za 7 dní
  change24h: number;    // % změna za 24h
  volumeRatio: number;  // current vol / avg vol (spike detection)
  signal: 'BUY' | 'SELL' | 'WATCH' | 'IGNORE';
  reason: string;
}

// BUY signal:  change7d > 50% AND change24h > 0 (trend pokračuje)
// SELL signal: change7d > 100% AND change24h < -5% (vrchol, začíná klesat)
// WATCH:       change7d > 30% (roste, sleduj)
// IGNORE:      change7d < 0 (padá)
```

### 3. Alert engine

```typescript
interface Alert {
  id: string;
  type: 'SPREAD' | 'SPIKE' | 'TREND_REVERSAL' | 'VOLUME';
  item: string;
  message: string;
  value: number;        // konkrétní číslo (spread %, change %)
  threshold: number;    // threshold který byl překročen
  timestamp: Date;
  seen: boolean;
}

// Thresholds (konfigurovatelné přes .env nebo UI):
const ALERT_THRESHOLDS = {
  spreadPct: 15,          // alert pokud spread >= 15%
  priceChange7d: 50,      // alert pokud 7d change >= 50%
  priceChange24h: 20,     // alert pokud 24h change >= 20%
  volumeSpike: 3.0,       // alert pokud volume >= 3x avg
  trendReversal: -10,     // alert pokud cena klesne >= 10% od maxima
};
```

---

## SQLite schema

```sql
-- Price snapshots (každý fetch)
CREATE TABLE price_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id TEXT NOT NULL,
  item_name TEXT NOT NULL,
  category TEXT NOT NULL,
  chaos_equiv REAL NOT NULL,
  volume INTEGER,
  fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Watchlist (co sledovat)
CREATE TABLE watchlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id TEXT UNIQUE NOT NULL,
  item_name TEXT NOT NULL,
  category TEXT NOT NULL,
  buy_threshold_pct REAL DEFAULT 15,  -- min spread % pro buy alert
  sell_threshold_pct REAL DEFAULT 10, -- min spread % pro sell alert
  active INTEGER DEFAULT 1,
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Alerts log
CREATE TABLE alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  item_id TEXT NOT NULL,
  message TEXT NOT NULL,
  value REAL,
  threshold REAL,
  seen INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Trade log (manuální záznamy)
CREATE TABLE trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id TEXT NOT NULL,
  item_name TEXT NOT NULL,
  side TEXT NOT NULL,            -- 'BUY' | 'SELL'
  currency TEXT NOT NULL,        -- 'CHAOS' | 'EXALT' | 'DIVINE'
  rate REAL NOT NULL,            -- kolik currency za 1 item
  quantity INTEGER NOT NULL,
  total_currency REAL NOT NULL,
  profit_chaos REAL,             -- null pokud to je BUY
  traded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  notes TEXT
);

-- Indexes
CREATE INDEX idx_snapshots_item_time ON price_snapshots(item_id, fetched_at DESC);
CREATE INDEX idx_alerts_seen ON alerts(seen, created_at DESC);
```

---

## Dashboard UI komponenty

### SpreadTable
- Zobrazuje všechny itemy z watchlistu
- Sloupce: Name | Buy (Exalt) | Sell (Chaos) | Spread % | Volume | Action
- Color coding: zelená >= 15%, žlutá 5-15%, červená < 5%
- "Add to Log" button pro rychlý trade záznam

### PriceChart (recharts LineChart)
- 7d price history pro vybraný item
- Dual axis: Chaos value (left) + Exalt value (right)
- Highlight spike body (červená zóna) a tvůj buy/sell (tečky)

### AlertFeed
- Real-time feed nových alertů (polling /api/alerts každých 30s)
- Badge s počtem unread alertů
- Desktop notification přes Web Notifications API

### TradeLog
- Tabulka všech tradů
- Running P&L počítaný automaticky
- Export do CSV

### WatchlistEditor
- Add/remove itemy
- Nastavit custom thresholds per item
- Bulk import ze screenshotů (text input)

---

## Scheduler (poller.ts)

```typescript
// Cron: každých 5 minut
cron.schedule('*/5 * * * *', async () => {
  for (const category of CATEGORIES) {
    const data = await ninjaClient.fetch(category);
    await db.upsertSnapshots(data);
    
    const watchlistItems = await db.getWatchlist();
    for (const item of watchlistItems) {
      const spread = spreadCalc.calculate(item, data);
      if (spread.profitable) {
        await alertEngine.fire('SPREAD', item, spread);
        notifier.notify({ title: 'PoE2 Flip Alert', message: item.name });
      }
      
      const trend = trendDetector.analyze(item, data);
      if (trend.signal === 'BUY' || trend.signal === 'SELL') {
        await alertEngine.fire('TREND', item, trend);
      }
    }
  }
});
```

---

## .env.local

```env
LEAGUE_NAME=Runes of Aldur
ALERT_SPREAD_PCT=15
ALERT_CHANGE_7D_PCT=50
ALERT_VOLUME_SPIKE=3.0
POLL_INTERVAL_MIN=5
DB_PATH=./data/poe2flip.db
```

---

## Package.json scripts

```json
{
  "scripts": {
    "dev": "next dev & tsx watch src/scheduler/poller.ts",
    "build": "next build",
    "start": "next start & node dist/scheduler/poller.js",
    "db:migrate": "tsx src/db/migrate.ts",
    "db:seed": "tsx src/db/seed.ts"
  }
}
```

---

## Klíčové závislosti

```json
{
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "better-sqlite3": "^9.0.0",
    "axios": "^1.7.0",
    "bottleneck": "^2.19.5",
    "node-cron": "^3.0.3",
    "node-notifier": "^10.0.1",
    "recharts": "^2.12.0",
    "date-fns": "^3.0.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0",
    "@types/better-sqlite3": "^7.6.0",
    "tsx": "^4.0.0",
    "tailwindcss": "^3.4.0"
  }
}
```

---

## Implementační pořadí pro Claude Code

1. **Fáze 1 — Data layer**
   - [ ] `src/api/ninjaClient.ts` — fetch + rate limit
   - [ ] `src/db/schema.sql` + `database.ts` — SQLite setup
   - [ ] `src/core/priceEngine.ts` — chaos equiv výpočty
   - [ ] `src/scheduler/poller.ts` — cron job

2. **Fáze 2 — Core logika**
   - [ ] `src/core/spreadCalc.ts` — cross-pair spreads
   - [ ] `src/core/trendDetector.ts` — 7d trend analýza
   - [ ] `src/core/alertEngine.ts` — thresholds + notif

3. **Fáze 3 — API routes**
   - [ ] `/api/prices` — snapshot data
   - [ ] `/api/alerts` — alert feed
   - [ ] `/api/trades` — trade log CRUD
   - [ ] `/api/watchlist` — watchlist management

4. **Fáze 4 — Dashboard UI**
   - [ ] `SpreadTable` — hlavní view
   - [ ] `AlertFeed` — live alerts
   - [ ] `TradeLog` — manuální záznamy
   - [ ] `PriceChart` — historical chart
   - [ ] `WatchlistEditor` — nastavení

---

## Současný kontext (z konverzace)

**Aktuální flip:** Kulemak's Invitation
- BUY: 170 Exalt (= 7.39 Chaos @ 23 Exalt/Chaos)
- SELL: 9 Chaos
- Spread: +22%

**Aktuální kurzy (Jun 20, 2026):**
- 1 Divine = 10 Chaos
- 1 Exalt = 1/23 Chaos ≈ 0.043 Chaos
- 1 Divine = 229-231 Exalt

**Aktivní watchlist:**
- Kulemak's Invitation (spike +1040% za 7d)
- Greater Rune of Alacrity (+118% 7d)
- Ancient Crisis Fragment (+125% 7d)
- Masterwork Rune (+78% 7d, 1.1k vol/hod)

**Strategie:**
- Cross-pair: kup item za Exalt, prodej za Chaos, konvertuj zpět
- Swing: buy trending items, sell na vrcholu
- Standing orders přes Ange, ne instant trades

---

## Notes pro Claude Code

- Všechny price výpočty musí být in Chaos Orb jako base unit
- poe.ninja update frequency je ~1 hodina, pollovat každých 5 min je safe
- Rate limit: **12 req / 5 minut** — používej bottleneck s minTime: 25000ms
- League name je case-sensitive: "Runes of Aldur" (ne "runesofaldur")
- UI by mělo být dark theme (hráč má hru otevřenou vedle)
- Žádná autentizace nepotřeba, lokální tool
- Desktop notifikace jako primární alert (ne email/discord)
