# curio dig: placement and first run (design)

Status: approved by Sam on 2026-11-07. The research and walkthrough findings behind it are in `2026-11-07-dig-placement-plan.md`, which is not committed and lives in the main checkout. Part C (pipeline difficulty levers) is out of scope because another session owns `scripts/dig/`.

## Decisions

| Question | Decision |
|---|---|
| Nav: "Dig" item or a "Play" hub | A plain **Dig** item after Puzzle. Revisit a hub when there is a third game. |
| Today strip for signed-out readers | **Yes, for everyone.** Ticks come from localStorage. |
| Timer on the first visit | **Off until one dig is finished**, then offered as an opt-in. Players who already chose keep their choice. |
| Today strip shape | **Two rows (puzzle, dig)** under the existing "Read the full story" button, not three rows. That avoids a second story link and any new "read" tracking. |

## Release 1: make it findable

1. **Header nav.** `app/layout.tsx` passes `digOpen={isDigOpen()}` to `Header`, and the nav becomes `Today · Puzzle · Dig · Collection · Sign in/Account`. The link is `/dig?from=nav`, with the active state on `/dig` and below. No badge or dot. The row must wrap cleanly at 320px and 375px. The root layout is static, so the gate is read at build time. That is fine because every deploy rebuilds and the launch date (2026-11-07) has passed.
2. **"Also today" on `TodayHero`.** The secondary "Play today's puzzle" button goes. Under the primary story button, a new client component `TodayStrip` shows:
   - **The puzzle**: "Guess the word from three clues." Links to `/play`. A tick shows when `curio:play:<today>` has status `solved` or `failed`.
   - **curio dig** (only when `digOpen`): "Name words for seven prompts. Rarer ones dig deeper." Links to `/dig?from=home`. A tick shows when `curio:dig` has a game for today.
   - Ticks render only after hydration (`useClientOnlyValue`, server value false). It covers today only, with no counts and no "not yet" wording. A tick is a small check icon with the sr-only text "done today".
   - `app/page.tsx` passes `digOpen` through `HomeContent`.
3. **`ArrivalHero`.** Under "Or play today's puzzle →", add "Or try curio dig, today's word game →" linking to `/dig?from=arrival` (when `digOpen`). It calls `markOnboarded()` like its neighbours.
4. **Cross-links.**
   - The dig end screen (today only) gets a new first row in its link list, "Today's word on Curio" with the line "Read where today's word came from.", linking to `/`. The existing "Cool down with a clue puzzle" row stays.
   - The `StoryView` footer gets "Or play today's dig →" (`/dig?from=story`) under "Play today's puzzle →", when `digOpen` (passed from the static story page; build-time read as above).
   - The /play end-screen line keeps its wording, and its link becomes `/dig?from=play`.
5. **Funnel `source`.** There is a new client helper, `sendViaOnce()` in `lib/dig/client.ts`. On `/dig` it reads `from` (`nav|home|arrival|play|story`), sends `{ kind: "via", from }` once per tab session per value, and removes the param with `history.replaceState` so shared links stay clean. The server parses it in `parseDigEvent` and counts it in the funnel hash as `via:<from>`. `summarizeDigFunnel` adds `via: Record<string, number>` per row, and `DigFunnelTable` shows it as a "via" column ("nav 3 · home 2"). The table is admin-only and exempt from the design system. Email and social arrivals keep counting as `land:email` and so on.

## Release 2: a welcoming first run

1. **Intro.** Two plain lines plus the fruit example:
   - "Name a word that fits each prompt."
   - "Everyday words count. Rarer ones dig deeper."

   Fossil, bedrock and cross-section come out of the rules. The timer line becomes conditional, as in point 2.
2. **Timer default.** `settings.noTimer` becomes `boolean | undefined` in the store, with undefined meaning not chosen. The effective value is the stored choice, or, when unset, no timer for a player with no finished games and the timer for one who has finished a game (today's behaviour). Stores that already hold `false` or `true` from an earlier toggle keep it. The existing parser coerces to a boolean, so the code must keep "absent" distinct from false. The toggle on a never-finished intro reads "Add a 25-second timer". After the first finished dig, the end screen shows one line, "Want more of a challenge? Add a timer next time.", which sets `noTimer: false` when tapped.
3. **First-answer coaching (once per device).** Store flags `coached: { hit?: true; miss?: true }` in `curio:dig`.
   - After the first accepted answer, the reveal adds: "Nice. Everyday words count; rarer ones dig deeper."
   - After the first rejected guess, the prompt shows "Not on our list. Try another." in `text-ink-soft`, never an error colour.
4. **End screen copy.**
   - Lead with what was found: "You found N words and reached the <deepest tier>." Then the depth.
   - The fossil appears as a reveal ("Today's fossil was …").
   - No comparison to the maximum.
   - The new copy goes through `lib/dig/copyAudit`.
5. **Review before shipping.** Run `ux-reviewer` on mobile.

## Archive, never backlog

- The strip shows only ticks for today.
- Nothing says "not played", nothing is counted, and there are no streaks.
- The nav item is a plain link.
- Coaching shows once per device and never refers to missed days.

## Testing

- **Vitest:** strip tick logic (pure `todayTicks(playState, digStore, today)`), `via` parsing and its funnel field, `summarizeDigFunnel` via column, timer-default resolution, coaching flags, store parse of an absent `noTimer`.
- **Browser:** local dev at 375px and desktop.
- **Release 1 done means:** merged to master, deployed, and checked on curioword.com at 375px and desktop. The checks are the nav item, the strip and its ticks, the arrival line, the story link, the end-screen row, and a `via:` count after a click (read through `/admin`, which Sam opens signed in).
