# Live Search — browser extension / userscript plán

Cíl: **instantní** hunt alerty (jako desktop overlay tooly typu Sidekick), bez desktop appky.

## Proč to server neumí

Oficiální live WebSocket `wss://www.pathofexile.com/api/trade2/live/poe2/{league}/{searchId}`:

- vyžaduje **SAVED search na účtu** (jinak 404),
- vyžaduje cookies `POESESSID` + `cf_clearance` + `POETOKEN`, `Origin: https://www.pathofexile.com` a User-Agent shodný s tím, komu byla `cf_clearance` vydána,
- a hlavně **browser TLS fingerprint (JA3/JA4)** — Cloudflare zabíjí plain Node/axios/ws klienty ~10 s po connectu, i s platnými cookies (zdokumentováno u sniperwiz; obcházejí to `curl_cffi` impersonací Chrome).

Server-side proto zůstává 30s poll-diff (`HUNT_SCAN_SEC`), což je strop pro web deployment. Rate limity search: 5/10 s, 15/60 s, 30/300 s (sustained 1 search/10 s, per-account i per-IP).

## Architektura extension vrstvy

**Browser extension (MV3) nebo Tampermonkey userscript běžící na trade2 stránce.**

Proč to funguje: script běží v reálném Chromu na doméně pathofexile.com → správný TLS fingerprint, cookies i Origin **zadarmo** — je to doslova browser, který dělá přesně to, co dělá trade site sám.

Tok:

1. Uživatel má v prohlížeči otevřený (klidně pinnutý) tab s trade2.
2. Script si z naší appky stáhne aktivní hunty (`GET /api/hunts`, auth přes API key uživatele).
3. Pro každý hunt POSTne search na trade2 (stejné query jako `huntToQuery`), z odpovědi vezme `searchId` a otevře oficiální live WS — přesně jako to dělá tlačítko „Activate Live Search" na webu.
4. Nový listing z WS (frame `{"result": "<JWT>"}` v 0.5.x, dřív `{"new": [ids]}`) → fetch detailů přes `/api/trade2/fetch/...` → **POST do naší appky** (nový endpoint, např. `POST /api/hunts/push`), která hit uloží do `hunt_hits` a alertuje jak je zvyklá (feed, zvuk, browser notifikace).
5. Server-side 30s poll běží dál jako fallback pro zavřený prohlížeč — dedupe podle `listing_id` zajistí, že se vrstvy nepobijou.

## Limity

- Běží jen když je prohlížeč otevřený (pinnutý tab stačí).
- Max **20 souběžných live WS** na účet (GGG cap) — connecty stagger po ~2,5 s, jinak close code 1013.
- WS server pinguje ~30 s; reconnect s exponential backoffem.

## Co postavit (odhad ~1 den pro userscript verzi)

- [ ] `POST /api/hunts/push` — přijme hit z extensionu (auth API key), insert do `hunt_hits` + `fireAlert`, dedupe podle `listing_id`.
- [ ] Userscript (Tampermonkey): hunt sync, search POST → WS open per hunt, parse frames, fetch detaily, push do appky, reconnect/backoff, stagger connectů.
- [ ] Status ping (`extension alive` chip v HuntPanel status baru — např. poslední push timestamp v `hunt_runtime`).
- [ ] Volitelně později: plnohodnotná MV3 extension (service worker, options page s API key + URL appky).

## Reference

- sniperwiz (Python/curl_cffi PoE2 sniper) — dokumentace WS protokolu a Cloudflare chování
- 5k-mirrors/poe-live-search-manager — `wss .../api/trade2/live/poe2` base URL, 20-conn limit
- zizouqi/poe2-trade — Node WS manager, heartbeat 31 s, connect throttle 2,2–2,5 s
- Detailní research (rate limity, header semantika, payload tvary): session 2026-07-03
