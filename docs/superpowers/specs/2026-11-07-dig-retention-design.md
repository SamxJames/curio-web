# curio dig: retention release 1, design spec

Date: 2026-11-07. Author: product designer. Reports to: CEO. Audience: engineering lead and reviewers.
Status: final for Release 1. Genuine owner decisions are in the last section only.

Scope: five items, in the CEO's build order. All UI stays inside `app/dig` (the scoped brand: Libre Caslon display, red `accent-button` for actions only, ink links). Nothing here touches the site-wide brand migration.

| # | Item | Effort | Ships |
|---|---|---|---|
| 1 | Return counter | S | First, alone, today, away from 00:00 UTC and the 09:00 digest cron |
| 5 | Play-screen cleanup | S | In parallel with 4 |
| 4 | Dig line in the digest and social posts | S | In parallel with 5. Production push held until Sam answers the email-promise decision |
| 2 | Dig you watch grow (live strata, varied reveals, fossil moment) | M | After this spec |
| 3 | Postcard end screen with come-back row | M | After 2 (it reuses the strip's drawing) |

The numbering follows the CEO brief's feature list (1 counter, 2 strata, 3 postcard, 4 digest, 5 cleanup), not the build order above.

---

## 0. Design direction (shared by every item)

**Subject.** A daily word game about depth. The memorable thing is already in the product: the cross-section drawing. Release 1 spends its one bold gesture there: the drawing is no longer a prize at the end, it is the page's constant companion, and the finished drawing is something the player built. Everything else stays quiet and typographic.

**Plan (compact).**
- Colour: no new colours. Paper `#f5f1e8` / ink `#1c1a17` (scoped, inverted in dark). Strata `--stratum-1..5` (`#e9e1cf #d6c4a3 #b99a72 #7e6a52 #3a322a`), `--stratum-ink`, `--stratum-paper`. Red (`accent-button`) only on Start and Share. Links are ink with underline.
- Type: Libre Caslon 700 (`font-display`) for the answer, depth and headings; Work Sans (`font-sans`) for UI text; Newsreader (`font-serif`) for fossil facts. No all-caps labels, no eyebrows, no middle-dot meta strings in the new work (`Eyebrow` is not used).
- Layout: single 327px column at 375 (`max-w-page`, `px-6` as today). Left-aligned. Structure is encoded by the drawing and by hairline rules (`border-line`) that separate different jobs, never by repeated cards.
- Principles: the drawing leads; one action is red per screen; copy is plain and specific; motion answers the player's own action.

**Review against the defaults (what I changed).** First pass had the come-back row as three rounded cards with icons and a postcard with a stamp graphic: that is the SaaS-card kit and a decorative stamp. Revised: the row is a ruled list (hairlines, text first), and the postcard is one bordered surface whose only ornament is the real drawing. First-pass reveal copy used crowd phrases ("most people"): replaced with statements about the answer set only. First-pass motion had a stagger on the end screen: cut. One motion remains (the drop), plus one small pulse for a fossil.

**New tokens (justified, the only additions).** Registered in `app/globals.css` and added to the Motion table in `docs/design-system.md`.

| Token | Value | Use |
|---|---|---|
| `--duration-drop` | `420ms` | A marker dropping into its stratum |
| `--duration-found` | `700ms` | One ring pulse when the fossil is found |
| `--ease-settle` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | Both of the above |

Keyframes `dig-drop` and `dig-found` are defined in `globals.css` and only applied inside `@media (prefers-reduced-motion: no-preference)`. Under reduced motion the end state shows at once. No other new tokens. No arbitrary Tailwind values: sizes use the existing scale (`text-sm`, `text-3xl`, `min-h-11`, `max-w-form`) and the SVG sets geometry through its viewBox, not classes.

**Copy audit list (applies to all items; one shared module, `lib/dig/copyAudit.ts`, imported by every test).** None of these may appear in UI, email, share text, share image, OG image, aria labels or analytics labels a player sees: `streak`, `missed`, `you missed`, `in a row`, `played` (any use as a count or status), `haven't`, `you didn't`, `come back`, `N of N` patterns other than `Prompt N of 7`, `%` as completion, `countdown`, `opens in`, `hours left`, `don't break`, `catch up`, `unplayed`, `done`/`not done` marks, and crowd phrases (`most people`, `everyone`, `nobody else`). `Prompt N of 7` is allowed because it is progress through today's seven. The one allowed `%` is the existing depth-percentile line ("Deeper than N% of today's diggers"), which is a depth rank, not completion, and only shows above 100 finishers (section 3); the audit strips that exact phrase before matching.

**Guardrails for future releases (recorded so no one drifts).** The varied reveals and the fossil hunt are acceptable only because they stay inside one game: skill-based, seven prompts a day, nothing carried across days. No future release may add random or surprise rewards that carry across days or are tied to coming back, and none may add a counter the player sees that spans days.

---

## 1. Return counter

**Player story.** None. This is invisible. The player sees no change.

**What it measures.** Returning-start share: the share of today's dig starts from a device that holds a finished dig from an earlier calendar day (UTC). Aggregate only. Baseline unmeasured, read days 2 to 7 first. Target at least 30% by days 8 to 14. It undercounts (Safari 7-day script-storage expiry, private windows), so it is a floor.

**Definition (exact).** On Start of today's dig, the client reads the store it already holds (`readStore()`, no network):
- `ret` = true when any stored game has a `finishedAt` whose UTC date is earlier than today's `day.date`.
- Basing it on `finishedAt`, not the game's dig date, means someone who binges the archive on day 1 does not count as returning until day 2.
- Gap = whole UTC days from the most recent such `finishedAt` to today, bucketed `d1` (1 day), `d2_6` (2 to 6), `d7` (7 or more).
- Past-dig starts (`past`) never carry the flag. A resumed run sends no second start, so it adds nothing.

**Screens and states.**

| State | What happens |
|---|---|
| First visit | Store empty, no flag, event is a plain `start` as today |
| Mid-game | Nothing visible |
| End screen | Nothing visible |
| Returning same day | No start event (the finished day shows the postcard) |
| Returning next day | Start tapped, flag and bucket sent, player sees only the normal prompt screen |
| Past day | No flag |
| No-JS / slow load | No start can happen, so nothing counts. Storage blocked or empty: no flag (undercount) |
| Reduced motion | Not applicable |

**Mobile 375px.** No layout.

**Copy.** None. Admin only (admin copy is internal, not part of the audit).

**Wire format.** `start` event gains one optional field: `{ kind: "start", date, ret?: "d1" | "d2_6" | "d7" }`. `parseDigEvent` accepts only those three strings and otherwise drops the field (the start still counts). Server: `funnelField` stays `start`; one additional `HINCRBY` on `start:ret:<bucket>` goes in the same funnel pipeline call. No new reads, no new endpoints, no ids.

**Admin.** `DigFunnelTable` (exempt from the design system) adds columns Returning (sum of `start:ret:*`) and Return share (returning ÷ start, one decimal, blank when start is 0). `summarizeDigFunnel` gains `returning` per row. Gap buckets are shown in the row's expanded detail only if cheap; otherwise a tooltip. No chart.

**Accessibility.** None (no player UI). The admin table keeps its existing semantics.

**Data stored and where.** Redis funnel hash fields `start:ret:d1|d2_6|d7`. Nothing on the client beyond what exists. No change to `lib/dig/storage.ts`.

**Metrics.** This is the metric. Readout plan: read the share daily from day 2; review at day 7 and day 14; compare against 30%.

**Tests.** `events.test.ts` (valid buckets accepted, junk dropped, start still counts), `funnel.test.ts` (returning column and share), a client unit test for the gap bucket (boundaries 1, 2, 6, 7, same-day finish gives none, empty store gives none).

**Archive, never backlog check.** Pass. Internal analytics only. The player never sees a return count, gap or percentage, and nothing is stored about a person.

---

## 2. Dig you watch grow

**Player story.** "Every answer I give drops into the ground and I can see my dig getting deeper. Each reveal tells me something a little different, and I'm hunting for the fossil."

### 2.1 The strata strip

**What it is.** A slim version of the finished drawing, above every prompt and every reveal. Seven columns (one per prompt), five horizontal bands (topsoil to bedrock) in the stratum tokens. A filled marker sits in each answered column at its band's depth; the current column shows a small open ring at the surface; later columns show a faint dotted guide. It is the same `strataLayout()` geometry as the end drawing, squashed vertically, so the final drawing is literally the strip, grown.

**Component.** Extend `components/dig/Strata.tsx` with `compact?: boolean` (no band names, no word labels, default height 80 instead of 360, marker radius 5.5, fossil 7.5, stroke widths scaled in the viewBox), `height?: number` (viewBox height override; the postcard uses 240), `current?: number` (column showing the surface ring) and `justDropped?: number` (the column that animates). The end screen renders the same component un-compact at height 240. `Strata.test.tsx` gains compact cases.

**Geometry.** Compact viewBox `360 x 80`, `h-auto w-full max-w-form`. At 375 it renders about 327 x 73px. Bands 16 units each. Columns spaced as `strataLayout` does. (First draft was 64 units with radius 4.5 markers: about 8px across, too small to read and too close to the 3:1 non-text contrast limit.)

**Contrast (done means).** A test covers, in light and dark, the filled marker, the open ring and the fossil mark against every band (3:1, WCAG 1.4.11), using the checker in `strata.test.ts`. The dotted guide for unanswered columns is decorative (the strip is `aria-hidden`), but it must stay visible against each band.

**Wireframe, prompt screen at 375px (3rd prompt, two answered).** The visible "curio dig" h1 is dropped while a dig is in progress (it stays in the page as `sr-only`, so the heading outline is intact) to keep the input above the iOS keyboard.
```
+-----------------------------------+
| [strip, 73px tall, bands unnamed ] |   col1 marker in topsoil,
| [ .   o   .  :   :   :   :  ~~~~] |   col2 in clay, col3 ring at top
|                                    |
| Prompt 3 of 7                      |
| Name a beverage                    |   h2, font-display 3xl
|                                    |
| 18 seconds left        [No timer]  |   timer row (feature 5)
| [==========-----------]            |
|                                    |
| [ your answer            ] [ Dig ] |
| Not on today's list. Try another.  |
| Pass                               |
+-----------------------------------+
```
Keyboard rule: on focus the answer field is scrolled into view (`scrollIntoView({ block: "nearest" })`) so the Dig button and the error line stay visible with the iOS keyboard open. Acceptance includes a check at 375 x about 400 (keyboard-open height) in iOS Safari or its emulation: field, Dig and the error line all visible without scrolling.

**Wireframe, reveal at 375px (answer in clay).**
```
+-----------------------------------+
| [ strip, column 3 marker dropping ]|
| Prompt 3 of 7                      |
| cappuccino                         |   h2 display 4xl, focused
| Clay. A word you have to go        |
| looking for.                       |
| Rarer than most words that fit.    |   one fact (see 2.3), only at clay or deeper
| {points} points                    |   from TIER_POINTS
| ---------------------------------- |
| The fossil was                     |
| kvass                              |   display 2xl
| A drink English took from Russian  |   serif fact (existing presentableFact)
| [ Next prompt ]                    |
+-----------------------------------+
```

**Motion.** One motion: on lock, the new marker drops from the surface to its band centre in `--duration-drop` with `--ease-settle` (CSS `transform: translateY` on the marker group, `animation: dig-drop`). It starts on mount of Reveal, so it runs while the player reads. The text does not wait for it. No sound, no stagger, no loop. Reduced motion: marker is simply there. Passing or timing out puts an open ring at the surface with no drop. Resume after refresh: all markers render in place, nothing animates. `justDropped` is derived during render (not set in an effect, which would paint the marker at its final spot and then restart the animation, a visible flicker): it is the current index while the phase is `reveal`, unless that reveal is the one the run resumed into (remembered once in a ref at mount). Both `.dig-drop` and `.dig-found` set `transform-box: fill-box; transform-origin: center`. A pass or timeout (open ring) never animates.

**Slow load.** While the day loads, the strip renders as seven faint columns and five empty bands (`aria-hidden`) with the existing "Loading the dig…" line, so the layout does not jump.

**Accessibility.** The compact strip is `aria-hidden="true"` and carries no focus stop: the reveal already announces the answer, tier and points through the persistent live region, and "Prompt N of 7" is real text. The end screen drawing keeps `role="img"` and its full per-answer label. The strip must meet 3:1 for marker against band (existing tokens already do; the checker in `strata.test.ts` stays).

### 2.2 Reveals that differ

Wording varies by layer, and by how many times that layer has already been hit in this run (the nth occurrence uses variant n mod 3). That guarantees no two "Familiar" reveals in a run read the same, is deterministic, and survives a refresh because it derives from `results`. Tables live in a new `lib/dig/revealCopy.ts`, used only by `Reveal` and `announceReveal`. `TIER_LABEL`, `TIER_POINTS`, `STRATUM`, share text, share image and OG image are not touched, so they stay in sync by construction.

Rules for every line: it starts with the layer name (so the band vocabulary is taught on every reveal), and it describes the word or the player's own dig, never what other players do or say, and never talks down to common answers.

Line shown under the answer (full sentence, then the points on their own line as "30 points"):

| Tier (layer) | Variant 1 | Variant 2 | Variant 3 |
|---|---|---|---|
| common (topsoil) | Topsoil. Right on the surface. | Topsoil. The first place to look. | Topsoil. A word close to the surface. |
| popular (topsoil) | Topsoil. A well-worn answer. | Topsoil. A word English uses often. | Topsoil. Just under the grass, and a good one. |
| familiar (loam) | Loam. Familiar, and a little below the surface. | Loam. A word you know, one layer down. | Loam. Solid ground, one layer down. |
| uncommon (clay) | Clay. A word you have to go looking for. | Clay. Past the first words that come to mind. | Clay. Heavier digging. This one took thought. |
| rare (stone) | Stone. A hard one to find. | Stone. Few words that fit sit this low. | Stone. A proper find. |
| fossil (bedrock) | see 2.4 | see 2.4 | see 2.4 |

No answer: "Time's up" or "Passed" (unchanged), no layer line, no points line.

### 2.3 One fact per reveal

At most one fact line, chosen from data already in the payload, never from crowd numbers, never from the fossil:

1. **Rarity within the prompt.** Only when the answer is at clay (`uncommon`) or deeper, so it can never sit beside a "Familiar" or "Topsoil" line, and only when its tier ranks strictly above the median tier of the prompt's shown answers: the `secret.answers` entries with `core === 1` (accepted-only entries with `core: 0` are never shown to players and would skew the median). Line: "Rarer than most words that fit this prompt." (Computed client-side from the decrypted payload already in memory.)
2. **A Curio story exists** (`secret.stories[normalizeKey(answer)]`, the map is keyed by the normalised answer): "Curio has the story of {answer}." with a link whose text is "Read the story of {answer}" (descriptive out of context, WCAG 2.4.4) to `/story/{slug}`.
3. **Origin prompt confirmation** (prompt `kind === "origin"`): "English took {answer} from {Language}." where Language comes from a small `originLanguage(text)` parse of the prompt text ("took from X"). Returns null if the text doesn't match, then no fact.
4. Otherwise no fact line. Never on a miss.

Engineering note: a story link inside the reveal is a pull link, fine, and it uses the existing `onStory` event. `originLanguage` must have tests for each prompt phrasing in the current data.

### 2.4 The fossil moment

- **Found** (`result.tier === "fossil"`): one block, not two. In place of the layer line, the block header is the bone mark (inline SVG, `currentColor`, 20px, `aria-hidden`) and "You found the fossil.", followed by the fossil fact once (the word is already the `h2` above, so it is not repeated; if the answer is a different fossil-tier word, the header reads "You found a fossil. The fossil was {word}." in the same block). A single ring pulse (`dig-found`) plays once around the bedrock marker in the strip. The ring scales from its own centre (`transform-box: fill-box; transform-origin: center`), otherwise an SVG `scale()` flies off from the viewBox origin.
- **Not found**: block label becomes "The fossil was" (was: "This prompt's fossil"), then the word and its fact as today.
- Fact, Wiktionary link and story link rules stay as they are (raw facts stay hidden).
- Announcement (persistent live region): "{answer}, {Label}, {points} points. You found the fossil." or "... Fossil: {word}." Existing text kept, "You found the fossil." appended when true.

### 2.5 Intro line

Intro gains "Each prompt hides one word nobody expects." and one line that explains the drawing and the fossil, "Your answers build a cross-section as you go. The hidden word is the fossil, buried in the bedrock." (full copy and the sample in 5.1).

### States table (item 2)

| State | Behaviour |
|---|---|
| First visit | Strip empty (seven dotted columns) from prompt 1 on |
| Mid-game | Strip grows per reveal as above; reveal shows variant line, optional fact, fossil block |
| End screen | Same drawing, un-compact, built from the same `tiers`; band names and word labels appear |
| Returning same day | Postcard (item 3) with the same drawing |
| Returning next day | New day: empty strip, intro |
| Past day | Identical behaviour on `/dig/[date]` (strip, reveals, fossil moment); nothing is sent |
| No-JS / slow load | See 2.1 skeleton; no-JS note in 5.1 |
| Reduced motion | No drop, no pulse; markers and bone mark appear at once |

**Data stored and where.** None new. Strip state is derived from `state.results` and `state.current`; reveal variants derive from `results`; resume already restores both.

**Events.** One counter, added in the finish plan on the server: `fossil` incremented by the number of fossil-tier tiers in the finish (skip when 0). No new request. It tells us whether the fossil hunt is reachable. Existing finish/start ratio is the day-1 finish-rate check.

**Tests.** `revealCopy.test.ts` (three Familiar results in one run produce three different lines; deterministic across resume; every variant starts with its layer name and passes `copyAudit`), `Reveal.test.tsx` (fossil found vs not, fact priority, no fact on miss), `Strata.test.tsx` (compact, `justDropped` only animates that column, aria-hidden), `strip.test.ts` (a resumed reveal never animates; the next live reveal does).

**Archive, never backlog check.** Pass. Everything concerns today's seven prompts. Variety comes from copy tables and the answer set, never from crowd counts (about 50 finishers a day would make "only 3% said this" noise). No rank phrasing, no "X of N" beyond `Prompt N of 7`. Nothing carries across days.

---

## 3. Postcard end screen with come-back row

**Player story.** "I finished. I get a good-looking card to send to a friend, and a calm way to come back tomorrow if I want to."

**Structure (top to bottom).** The payoff comes first: at 375 x about 700 the depth and Share must be on screen on arrival, so the depth sits directly under the header and the drawing is 240 units tall, not 360.
1. The postcard: one bordered surface (`border border-line-strong`, `rounded-lg`, `bg-paper-raised`, `p-4`).
   - Top line: `curio dig` (font-display, lowercase, `text-lg`) left; `Dig #N` (font-sans, `text-sm`, `text-ink-soft`) right.
   - The depth, `font-display text-5xl`, "4.2 m down" (existing `h2`, takes focus on a fresh finish).
   - Percentile line (today only, existing `percentileLine`, now only above 100 finishers: see below).
   - Date line, `text-sm text-ink-soft`: "7 November 2026" (formatted in UTC so a player's timezone can't shift it).
   - The drawing (`Strata`, `height={240}`, `label="Your dig, 7 November 2026"`, i.e. the date, never "day N", which can be heard as a count of days played).
2. Share actions (primary): **Share** (red, full width at 375) and **Save image** (secondary, full width).
3. Today only: the plain line "A new dig opens at midnight UTC."
4. The come-back row (ruled list, below). Join is a secondary (non-red) button: Share is the only red action on the screen.
5. Two disclosures: "Words worth knowing" and "Today's answers" (the day's answers on a past day), both `<details>`, closed by default.

The visible page h1 ("curio dig") becomes `sr-only` on the finished state, since the postcard carries the wordmark.

**Percentile line.** The existing line is a crowd comparison, which section 2 rejects for per-answer use because about 50 finishers a day makes it noise. `MIN_FINISHERS` in `lib/dig/share.ts` goes from 50 to 100, so the line stays hidden until the sample can carry it (the same 100 a day that gates the later features). At today's volume the postcard simply omits it.

**Wireframe, today's postcard at 375px.**
```
+-----------------------------------+
| curio dig                  Dig #1  |
| 4.2 m down                         |
| 7 November 2026                    |
| [ strata drawing, 240 tall ]       |
+-----------------------------------+
| [          Share            ]      |   red, full width
| [        Save image         ]      |   secondary, full width
| Copied. Paste it anywhere.         |   status, always mounted
|                                    |
| A new dig opens at midnight UTC.   |
| ---------------------------------- |
| One word's story, every morning    |   SignupOffer (hides itself for
| Curio sends one word and where     |   subscribers; the row closes up)
| it came from.                      |
| [ you@example.com ] [ Join ]       |   Join is secondary, not red
| ---------------------------------- |
| Cool down with a clue puzzle       |
| Guess the word from three clues.   |   link to /play (today only)
| ---------------------------------- |
| Past digs                          |
| Play or read any earlier dig.      |   link to /dig/past
| ---------------------------------- |
| > Words worth knowing              |
| > Today's answers                  |
+-----------------------------------+
```
The Tomorrow slot (hidden in Release 1) would sit as the first item of the row, above the email offer, as one plain line "Tomorrow: {hint}" with no time attached and never paired with "don't miss". It is today-only: on a past dig, "Tomorrow" would name a day that has already happened, so it never renders there. It is a `TomorrowHint` component (required `isToday` prop) that returns null unless `isToday` and `lib/dig/tomorrow.ts` exports a string (it exports `null`). Tests assert nothing renders now, and that a supplied hint still does not render on a past day.

The email sign-up stays first in the row (it is the one reliable day-2 pull that needs no account); the review suggestion to move it below the play and past rows was not taken. The competing-primary worry is solved by making Join non-red.

**Exact copy.**

| Element | Copy |
|---|---|
| Wordmark | curio dig |
| Dig label | Dig #N |
| Depth | 4.2 m down (existing `formatDepth`) |
| Primary action | Share |
| Secondary action | Save image |
| Status: shared | Shared |
| Status: copied | Copied. Paste it anywhere. |
| Status: image shared / saved | Shared / Image saved |
| Status: failures | Couldn't copy. / Couldn't make the image. |
| Reopened or fresh, today | A new dig opens at midnight UTC. |
| Email offer | existing pitch and form (unchanged in this item) |
| Play row | Cool down with a clue puzzle / Guess the word from three clues. |
| Past row | Past digs / Play or read any earlier dig. |
| Past day only, instead of the play row | Today's dig / Dig today's prompts. (link to `/dig`) |
| Drawing label (aria) | Your dig, {date as 7 November 2026} |
| Disclosures | Words worth knowing / Today's answers (past day: The day's answers) |

Verb consistency: the primary button is "Share" and its outcomes are "Shared" or "Copied. Paste it anywhere." (the clipboard path), so a player who sees "Copied" knows what happened when `navigator.share` is missing. The visible label changes from "Copy result" to "Share"; `copyResult`'s behaviour and the `share:text` event are unchanged, `share:image` too.

**States.**

| State | Behaviour |
|---|---|
| First visit | Not applicable (intro first) |
| Mid-game | Not applicable |
| End screen (fresh finish) | Postcard; focus goes to the depth heading; strip's drawing is the one they built, no extra animation |
| Returning same day | Same postcard, no focus jump, plus the midnight line (already there) |
| Returning next day | New dig's intro. Yesterday's postcard is reachable through Past digs like any past day |
| Past day | Postcard with that dig's `Dig #N` and its date; no percentile; no midnight line; the play row is replaced by "Today's dig"; the email offer remains |
| No-JS / slow load | The end screen is client-rendered, so a no-JS visitor never reaches it (see 5.1 `noscript`). Slow load shows the skeleton from 2.1 |
| Reduced motion | No animation on the postcard in any case |

**Accessibility.** `h2` for depth keeps programmatic focus on a fresh finish. The status line stays an always-mounted `role="status"` region so announcements fire. The come-back row is a `<ul>` of links and the signup form, so a screen reader hears a list of three. The two `<details>` use native disclosure semantics (keyboard: Tab, Enter/Space). Share and Save image remain tab stops 1 and 2 after the depth heading. Contrast: depth and body on `paper-raised` verified at 4.5:1 or better in light and dark (`#ede7da` / `#26231f` with ink); engineering to re-check in the existing contrast test.

**Data stored and where.** None new. Reads `StoredGame` as today (`answers`, `tiers`, `score`, `spread`). Date and `Dig #N` come from `day.date` and `day.number`.

**Events.** Existing: `share:text`, `share:image`, `signup`, `story`. New, in the same funnel pipeline: `row:play` and `row:past` incremented when those two row links are followed (one `sendDigEvent({ kind: "row", to })`, parsed by an enum, no new reads). The funnel can then show whether the row earns clicks next to `signup`.

**Tests.** `EndScreen.test.tsx` updated for the new labels (Share, Save image), postcard header (`Dig #N`, UTC date), midnight line on today only, no percentile on a past day, play row vs Today's dig row, disclosures closed by default and openable, tomorrow slot renders nothing (and not on a past day even with a hint), Join is not the red variant, depth heading precedes the drawing in the markup, copy audit (shared `copyAudit.ts`) over the rendered text, tier labels still sourced from `TIER_LABEL`. `share.test.ts` is updated only for the new 100-finisher threshold (boundary at 99 and 100); `score.test.ts` unchanged and still passes (share text is spoiler-free and untouched). Contrast of depth and body text on `paper-raised` is a real light and dark test, not a to-do.

**Archive, never backlog check.** Pass. No streak, no count of digs played or unplayed, no "you missed". The midnight line is plain information with no clock or countdown (architecture §2 decided against a countdown). Past digs stays a pull link with no done or undone marks. The email offer is an opt-in invitation.

---

## 4. Dig line in the daily email and the social posts

**Player story.** "My morning email, or a post I scroll past, gives me a reason to play today's dig."

**The line (the same for everyone).** One sentence pair, built from the day's first prompt text only:

`Today's dig starts with “{first prompt text}”. Seven prompts, about three minutes.`

Example: Today's dig starts with “Name a beverage”. Seven prompts, about three minutes.

The quoted form works whether a prompt reads "Name a beverage" or is a fragment. It names no answer, no fossil, no count of anyone, no deadline, and never says "you haven't played".

**Link.** Anchor text "Play today's dig". URL `https://curioword.com/dig` with the same `utm_source` tag each channel already uses for its story link (digest: the tag `digestStoryUrl` uses; Bluesky, Threads, Instagram: the tag `lib/bluesky.ts` and the matching social modules use). Arrival is credited by the existing `land:<source>` funnel field, so the funnel shows landings per channel. Starts are not split by source, so the channel comparison is lands, not starts.

**Where it goes.**
- Digest (`lib/email.ts`, body renderer that `/sample-email` also serves): one block below the word and its story link, above the footer. Text 16px sans, link underlined. The header line "One word, once a day." and the footer stay as is.
- Bluesky: appended as a final paragraph before the link card, within the 300-character limit (the line is about 85 characters; if the post would exceed the limit, drop "Seven prompts, about three minutes.").
- Threads, Instagram: same line in the caption. Instagram has no clickable links in captions, so the line ends "Link in bio." there, without the URL.

**Digest wireframe (inside the existing email chrome, 375px).**
```
One word, once a day.

   cappuccino
   (existing word, story, link)

Today's dig starts with “Name a beverage”.
Seven prompts, about three minutes.
Play today's dig            <- underlined link

--- footer (unchanged) ---
```

**States.**

| State | Behaviour |
|---|---|
| First visit / returning / past | Not applicable (email and posts only) |
| No dig today (before launch gate, pipeline gap, `getDigToday` null or throws) | Line is omitted silently, the send continues unchanged |
| Reduced motion | Not applicable |
| No-JS | Email is static HTML, fine |
| Plain-text email part | Same two sentences and the bare URL on its own line |

**Exact copy.** As above. Alt behaviour: none.

**Accessibility.** Real text, not an image. Link text is descriptive ("Play today's dig"). Colour contrast follows the email chrome (existing). Dark-mode email clients: the block uses the same colours as the surrounding body text.

**Data stored and where.** None. The first prompt's `text` is plain in `DigDay.prompts[0].text`; `payload` is never read, so no answer or fossil data is touched.

**Events.** `land:<source>` already exists. No new ones.

**Verification.** Render on `/sample-email` and check both parts. Do not send test emails to real subscribers. The production push is held until Sam answers the email-promise decision below (pushing master deploys, and the 09:00 UTC cron then sends to everyone).

**Tests.** `lib/email` render test (line present with a prompt; absent with none; quote characters escaped in HTML; first prompt only), social-text tests for length and the Instagram variant, `app/sample-email/route.test.ts` updated.

**Archive, never backlog check.** Pass. It is an invitation, not a gap: the same line for every recipient whether or not they have played, no counts, no deadline, no "you haven't played".

---

## 5. Play-screen cleanup

**Player story.** "I understand the game before I start, the screen isn't cluttered while I play, I can change my mind about the timer, and one fat-finger tap doesn't cost me a prompt."

### 5.1 Intro absorbs "How it works"

Remove the "How it works" section from `app/dig/page.tsx`. Replace it with a `<noscript>` block holding the same explanation so crawlers and no-JS visitors still see it (Google renders the client intro, and the meta description is unchanged). The page also gets: `<noscript>curio dig needs JavaScript to play. Curio's word stories and the Past digs list still work without it.</noscript>`.

**Intro, 375px.**
```
+-----------------------------------+
| curio dig                          |
|                                    |
| Each prompt hides one word nobody  |   text-lg ink
| expects.                           |
|                                    |
| 7 prompts. 25 seconds each. Rarer  |   text-lg ink-soft (existing line)
| answers dig deeper.                |
|                                    |
| Your answers build a cross-section |   text-lg ink-soft
| as you go. The hidden word is the  |
| fossil, buried in the bedrock.     |
|                                    |
| +--------------------------------+ |   sample, border-line, p-4, serif
| | For example: Name a fruit      | |
| | apple lands in the topsoil.    | |
| | quince digs down to the clay.  | |
| +--------------------------------+ |
|                                    |
| [ Start ]   [ No timer ]           |
| No timer counts the same. Use it   |
| any time.                          |
+-----------------------------------+
```
Copy, exactly:
- "Each prompt hides one word nobody expects."
- "7 prompts. 25 seconds each. Rarer answers dig deeper."
- "Your answers build a cross-section as you go. The hidden word is the fossil, buried in the bedrock." (explains the drawing and the fossil in one line; "Rarer answers dig deeper" stays the single scoring mechanic.)
- Sample: "For example: Name a fruit" / "apple lands in the topsoil. quince digs down to the clay." (the sample prompt is deliberately not any real day's prompt; words are the example's own.)
- "No timer counts the same. Use it any time." (existing, still true: mid-game switch is now possible)

Engineering acceptance: check "apple" and "quince" against `tierFromZipf` before shipping; if either lands in a different band, swap the word for one that does (the sentence must be true). The sample is static text, not game data.

### 5.2 Timer switch mid-game

**UI.** In the prompt screen's timer row, right-aligned: the same `ToggleGroup` pill as the intro, with a fixed label "No timer" in both states; `aria-pressed` alone carries on or off (a changing label plus `aria-pressed` is announced twice or confusingly by screen readers). `min-h-11`. When No timer is on, the progress bar and seconds line are replaced by the text "Take your time." at the left and the pill stays at the right, shown pressed, so the player can turn it back.

**Wireframe (timed, then No timer).**
```
Timed:                                   No timer on:
18 seconds left        [ No timer ]      Take your time.  [ No timer ]  (pressed)
[==========-----------]                  (no bar)
```

**Behaviour (reducer).** New action `{ type: "timer", noTimer: boolean }`:
- During `answering`: switching to No timer sets `noTimer: true` and leaves the phase `answering` (clock ignored). Switching the timer on restarts that prompt's clock at 25 (no 3-second read pause).
- During `reading`: switching to No timer moves to `answering` immediately.
- During `reveal` the toggle is not shown. The setting applies to the next prompt through `enterPrompt`, as it does today.
- Each switch also calls `setNoTimer(...)`, so the device preference follows what the player chose.
- Scoring is tier-based and ignores time, so a mid-game switch is scored exactly as No-timer runs are today. Resetting the clock by toggling is harmless: nothing in the score or percentile reads time.

**Persistence.** `toSavedRun` already carries `noTimer`, and the save effect already depends on it, so no format change. Resume after refresh restores `noTimer` and goes to `answering` with no clock (No timer) or the usual read pause then 25s (timer on), the existing resume behaviour.

**Copy.** Live region text on switch: "Timer off." and "Timer on. 25 seconds." The pill label never changes ("No timer").

### 5.3 Pass asks twice

First tap changes the label to "Pass? Tap again" and keeps focus on the button. A second tap passes. There is no timeout: a confirmation that expires on its own can be lost by slower, switch or screen-reader users (WCAG 2.2.1). The label reverts when the player types, when focus leaves the button, or on prompt change. Live region (polite): "Tap Pass again to give up this prompt." No modal. Pass stays disabled during the read pause.

### States table (item 5)

| State | Behaviour |
|---|---|
| First visit | New intro with sample; no "How it works" below |
| Mid-game | No instructional text on the page; timer pill available; Pass needs two taps |
| End screen | Unaffected |
| Returning same day | Unaffected (postcard) |
| Returning next day | New intro |
| Past day | Same intro and play controls on `/dig/[date]`; the timer pill and Pass work identically |
| No-JS / slow load | `noscript` text above; skeleton while loading |
| Reduced motion | The progress bar's width transition is already `motion-reduce:transition-none`; nothing new moves |

**Accessibility.** The timer pill is a real button with `aria-pressed`, visible focus from the global `:focus-visible` ring, 44px target. The second-tap label change is announced as above. Keyboard order on the prompt screen: timer pill, answer field (autofocus), Dig, Pass. The pill's accessible name is fixed ("No timer"); its state is `aria-pressed` only. Autofocus stays on the field on each prompt; the toggle does not steal focus on activation. Keep the assertive announcements at 10 s and 5 s when the timer is on.

**Data stored and where.** `settings.noTimer` (existing, in `curio:dig`) and `SavedRun.noTimer` (existing, `curio:dig:run`). No new fields and no version bump, so no saved game is wiped.

**Events.** One counter in the funnel: `timer:switch` (the player used the mid-game switch), via `sendDigEvent({ kind: "timer" })`. It tells us whether the control is wanted.

**Tests.** `game.test.ts` (timer action in each phase), `resume.test.ts` (switch mid-answering, `toSavedRun` shows the new `noTimer`, `resumeGame` honours it, the reveal-phase case applies to the next prompt), `PromptScreen.test.tsx` (fixed pill label and `aria-pressed`, two-tap Pass: arms on first tap, fires on second, disarms on typing and blur, never on a timer), `events.test.ts` (new kinds parse, junk rejected).

**Archive, never backlog check.** Pass. It touches only today's game and adds no counts, copy about history or carry-over.

---

## 6. Build map for the engineering lead

| Area | Files |
|---|---|
| Return counter | `lib/dig/client.ts` (gap bucket), `lib/dig/events.ts` (start `ret`, `row`, `timer` kinds, `fossil` incr), `app/api/dig/event` route, `lib/dig/funnel.ts`, `components/dig/DigFunnelTable.tsx`, `components/dig/DigGame.tsx` (send on Start) |
| Strip and reveals | `components/dig/Strata.tsx`, `components/dig/Reveal.tsx`, new `lib/dig/revealCopy.ts`, new `lib/dig/strip.ts` (pure `stripState`), new bone mark in `components/dig/`, `app/globals.css` (tokens, keyframes), `docs/design-system.md` (motion table) |
| Shared test helper | new `lib/dig/copyAudit.ts` (one banned-word list, imported by every test) |
| Postcard | `components/dig/EndScreen.tsx`, `components/SignupOffer.tsx` (non-red Join), `lib/dig/share.ts` (`MIN_FINISHERS` 100), new `TomorrowHint` and `lib/dig/tomorrow.ts` (exports `null`) |
| Digest and social | new pure `lib/dig/digLineText.ts` (text and URL, safe to import anywhere) and server-side `lib/dig/digLine.ts` (`getDigLine`, imports `server.ts`; only cron and the sample route import it), `lib/email.ts`, `lib/bluesky.ts`, the Threads and Instagram post builders, `lib/traffic.ts` (only if a source is missing), `app/sample-email/route.ts` |
| Cleanup | `components/dig/Intro.tsx`, `PromptScreen.tsx`, `lib/dig/game.ts` (timer action), `app/dig/page.tsx` |

Storage rule: `lib/dig/storage.ts` gets no changes in Release 1 (the store version stays 1; nothing new is saved). If a later release must add a field, it is optional; a version bump would wipe every saved game because `parseStore` resets on a mismatch.

Privacy rule: the `ret` bucket is a coarse, anonymous "rough return interval". Before the Group A deploy, confirm the event route does not log request bodies next to IP addresses, and if the privacy page lists what is collected, add one line for it ("anonymous, rough return interval").
Redis rule: new writes are extra `HINCRBY` fields inside the existing event pipeline (`start:ret:*`, `fossil`, `row:*`, `timer:switch`). No new reads, no per-user endpoints, everything stays cacheable.

**Done means (design acceptance).** A full play-through at 375px looks right (strip, reveals, postcard); keyboard-only and screen-reader passes work; `prefers-reduced-motion` shows end states without animation; a resume after refresh (including a mid-game timer switch) restores the strip and timer state; a revisit after finishing shows the postcard with the midnight line; the copy-audit regex is clean over rendered UI, email, share text, share image and OG text; the return counter is visible in admin; the postcard shows the depth and Share on arrival at 375 x about 700; the prompt screen keeps the field, Dig and the error line visible with the iOS keyboard open; marker, ring and fossil contrast tests pass in light and dark.

---

## Decisions for Sam

These three are copied from the CEO's decision and are the only open items.

1. **Tomorrow hint.** Does a static line such as "Tomorrow: a word English took from Japanese" break the "no come-back-tomorrow countdown" rule? Option A: allowed. It is information with no clock. Show it on the end screen and in the digest, from a short category-only hint written or approved per day. Option B: not allowed, so rely on the email and the sign-up row. Recommended: A, because an open question overnight is the strongest honest day-2 pull we have, and it passes the archive-never-backlog test. Until you decide, the slot stays hidden (built in item 3 as a component that renders nothing). Paste into Claude chat: "Curio dig has a decision recorded of no come-back-tomorrow countdown. I'm considering a static one-line hint at tomorrow's category on the end screen, with no clock. Argue both sides against my principle of archive, never backlog, then recommend."

2. **Changing the email promise.** The digest currently says "One word, once a day." Release 1 adds one line about today's dig below the word, the same for every subscriber, with the footer left as is. This changes what subscribers signed up for. Recommended: yes. Preview it on `/sample-email` before you push, because pushing master deploys and the 09:00 UTC cron then sends it to everyone. Alternative: send the line only to people who opt in again, which costs most of the reach. If you say yes, the postcard's email pitch also gains one sentence ("Today's dig comes with it."); if no, it stays as is.

3. **The kill line.** "Median daily starts in days 22 to 28 under 20 means stop" is nearly the whole audience at about 25 visitors a day, so it mostly measures traffic, which Google controls. Recommended: replace it, or add to it, with returning-start share and a floor on absolute returning starters, and decide after three weeks of returning data. Only you can set what "stop" means. Paste into Claude chat: "Curio dig launched 2026-11-07 with about 25 real visitors a day. Draft a kill-or-continue rule based on returning players rather than raw starts, with a small-sample caveat, so I can compare it with my current rule: stop if median daily starts in days 22-28 is under 20."

---

## Review log

Three reviews (principle, UX/UI, staff engineer) were run on the first draft. Every high and medium point was either fixed in this spec and the plan, or rejected below with a reason.

**Fixed**

| Source | Point | Where fixed |
|---|---|---|
| Principle 1 | Copy audit weaker than the rule; share image and OG not checked | One shared `lib/dig/copyAudit.ts` with the full banned list, imported by every test; plan F1 also checks share image and OG text (section 0) |
| Principle 2, UX | Percentile line is a crowd comparison at about 50 finishers | `MIN_FINISHERS` 50 to 100, line hidden below it (section 3) |
| Principle 3 | Tomorrow hint would invent a "tomorrow" on past digs | Today-only, plain line, no time, no "don't miss" (section 3) |
| Principle 4, UX | Reveal lines claim what others do or talk down to common answers | Table rewritten as statements about the word; layer name first on every line (2.2) |
| Principle 5 | "Day N" reads as a count of days played | Drawing label uses the date (section 3) |
| Principle 6 | Release check writes fake data to live stats | Plan A5 records the touched day and bucket and excludes it from the baseline |
| Principle 7 | Return flag privacy | Privacy rule in section 6, plan A2 |
| Principle 8 | Variable reward guardrail | Guardrails paragraph in section 0 |
| UX 1 | Pass revert after 3 seconds is a timed interaction | No timeout; disarms on typing, blur or prompt change (5.3) |
| UX 2 | Pill label changes and `aria-pressed` double-announce | Fixed label, `aria-pressed` only (5.2) |
| UX 3 | Postcard payoff below the fold | Depth under the header, drawing 240 units, Share on screen on arrival (section 3) |
| UX 4 | Prompt screen stack vs iOS keyboard | Visible h1 dropped while playing, `scrollIntoView` on the field, keyboard-open acceptance check (2.1) |
| UX 5 | Contradictory "rarer than most" on Familiar | Fact 1 only at clay or deeper (2.3) |
| UX 6 | Intro never explains the drawing or the fossil | One added intro line (5.1) |
| UX 7 | Strip too small, contrast unverified | 80 units, radius 5.5, light and dark contrast test (2.1) |
| UX low | Duplicate h1 and wordmark; "Read it" ambiguous; duplicate fossil lines; contrast to-dos | h1 `sr-only` on the postcard; descriptive link text; one fossil block; contrast made a real test |
| Staff 1 | Group A cannot ship alone from one worktree | Plan: separate branches, A merged first (see plan "Branches and stages") |
| Staff 2 | Fossil pulse scales from the wrong origin | `transform-box: fill-box; transform-origin: center` on both classes, asserted in `motion.test.ts` (2.1, 2.4) |
| Staff 3 | Drop animation flickers | `justDropped` derived during render with a resumed-reveal ref (2.1) |
| Staff 4 | Open-ring test always passes | Test asserts on the circle with lookaheads, and on `data-guide` counts (plan D3) |
| Staff 5, 6 | Shared test files; D4 breaks the build | Files are owned by one task each; `screens.test.tsx` is split first; new props are optional until the integration task wires them (plan) |
| Staff 7 | `getDigLine` pulls server code into email and social | Pure `digLineText.ts` plus server `digLine.ts` (section 6, plan C1) |
| Staff 8 | UTM tags unverified | Plan C1 asserts `isTrafficSource` for the four sources |
| Staff 9 | Median skewed by accepted-only answers; story key | `core === 1` only; `normalizeKey(answer)` (2.3) |
| Staff 10 | Hand-edited `finishedAt` proves wiring, not Safari eviction | Floor caveat and "do not read d7 as retention" in the handover (plan F2) |

**Rejected or changed**

- UX 10 (move the email sign-up below the play and past rows): rejected. The sign-up is the only day-2 pull that needs no account, so it stays first; Join becomes non-red instead, which removes the competing primary.
- UX 6 (also drop "nobody expects" for "Rare words dig deeper" as the single mechanic): partly rejected. The CEO set "Each prompt hides one word nobody expects." and "Rarer answers dig deeper" already carries the mechanic; one explanatory line is added rather than replacing the CEO's line.
- UX "take option A on the tomorrow hint": not mine to take; it stays Sam's decision, with the slot hidden.
- Staff "UTC rollover" (a page loaded before 00:00 UTC and started after it loses the start): existing behaviour, no code change; one line in the handover (plan F2).

## Sam's decisions (2026-11-07) — these override "Decisions for Sam" above

1. **Tomorrow hint: YES (option A).** The slot is visible in Release 1. Source: tomorrow's first prompt, already written and reviewed by the pipeline, with its leading "Name " removed — e.g. prompt "Name a word English took from Japanese" renders "Tomorrow: a word English took from Japanese." No curated per-day text is needed. It comes from `/api/dig/today`, which gains `tomorrow: string | null` (null when tomorrow's day file is missing or the prompt does not start with "Name "). One extra Redis read per cache miss of that route, which is cached until the UTC rollover, so roughly one read per region per day. Today-only, one plain line, no time, never paired with urgency copy. Prompt text is not secret (archive pages show prompts), and no answer or fossil data is used.
2. **Email line: YES.** Group C merges with the UI release. Before the deploy, Sam sees the `/sample-email` preview; deploy happens away from 09:00 UTC.
3. **Kill line: judge on returners.** Replaces "median daily starts in days 22–28 < 20". New rule, read at day 28 (2026-12-04): **stop if the median daily returning starts over days 22–28 is under 5**; the returning share of starts is shown alongside (target 30% or more) and informs the decision but does not trigger it alone. The admin kill-line row and `docs/handover/dig.md` change to match. Small-sample caveat: with ~25 visitors a day, read the trend, not one day.
