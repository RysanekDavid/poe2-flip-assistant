# Regex golden corpus

Real clipboard pastes the stash-search emulator (`testRegexEmulator.ts`) and the header spellings
(`src/core/tools/regex/pools/headers.ts`, `verified: "corpus"`) are checked against. Only add text
copied from the game client (Ctrl+C / Ctrl+Alt+C) — never reconstructed or edited lines.

| File | Source |
|------|--------|
| `sidekick-1276-waystone.advanced.txt` | Sidekick issue #1276 (github.com/Sidekick-Poe/Sidekick/issues/1276), T15 rare corrupted waystone, advanced copy as posted |
| `sidekick-1276-waystone.txt` | The same paste in normal-copy form: `{ … }` modifier headers and `(min-max)` roll ranges removed, nothing else changed |
