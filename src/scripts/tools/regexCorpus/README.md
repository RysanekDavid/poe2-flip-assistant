# Regex golden corpus

Real clipboard pastes the stash-search emulator (`testRegexEmulator.ts`) and the header spellings
(`src/core/tools/regex/pools/headers.ts`, `verified: "corpus"`) are checked against. Only add text
copied from the game client (Ctrl+C / Ctrl+Alt+C) — never reconstructed or edited lines.

| File | Source |
|------|--------|
| `sidekick-1276-waystone.advanced.txt` | Sidekick issue #1276 (github.com/Sidekick-Poe/Sidekick/issues/1276), T15 rare corrupted waystone, advanced copy as posted |
| `sidekick-1276-waystone.txt` | The same paste in normal-copy form: `{ … }` modifier headers and `(min-max)` roll ranges removed, nothing else changed |

## In-game checklist (still open)

Things the corpus cannot settle. When one is confirmed, add the paste here and move the header in
`headers.ts` to `verified: "corpus"`.

- [ ] **Tooltip format of the unverified property headers.** `Monster Effectiveness: +#%`,
  `Pack Size: +#%` (waystones), `Uses Remaining: #` (tablets) and `Quality: +#%` (vendor) are
  guesses: the label spelling, whether a `+` is printed, and the spacing after the colon. The
  property tokens use the `label:.*range%` form so a missing `+` or different spacing still
  matches, but a different label word would not. Confirm each with a Ctrl+C paste and a search
  such as `ess:.*([1-9].|\d..)%` on a waystone with Monster Effectiveness.
- [ ] **A parenthesised quality label on vendor stock.** Does any equipment print something like
  `Quality (Attack Modifiers): +20%` instead of `Quality: +20%`? The vendor token `lity:.*…%`
  needs `lity:` right before the colon, so it would miss that line.
- [ ] **`.` never crosses tooltip lines.** The emulator assumes each line is searched on its own
  (see `searchEmulator.ts`). Check: on a waystone with `Item Rarity: +40%` and
  `Monster Rarity: +103%`, `"m rarity:.*1..%"` must stay dark.
- [ ] **A negative header value.** `label:.*range%` would read `-30%` as 30. No waystone header is
  known to print a minus; confirm none does.
