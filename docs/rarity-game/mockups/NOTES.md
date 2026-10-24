# Rarity game mockups: notes

2026-10-24. Open `index.html` straight from disk to see all three side by side. Each option file also opens on its
own.

**What's in them**
- Every option is clickable from start to finish. The flow:
  - start screen with a one-line explanation
  - the "No timer" setting
  - a prompt with the 3-second read pause and a 25-second clock, shown as a number **and** a bar
  - near-miss confirm (type `flotila` or `keal`)
  - "isn't on the list, try another"
  - the per-answer reveal, and the gem reveal with its fact and a story link
  - end screen with the percentile line
  - "Words worth knowing" linking to real `curioword.com/story/...` pages
  - full answer lists
  - spoiler-free share text, plus 1200×630 and square share cards
  - past days
  - the daily-word signup after the game
- A dashed "Mockup: jump to a screen" button reaches any screen without playing. It is not part of the design.
- The sample data is hand-made but uses real Curio story words (keel, rudder, port, skipper, dinghy, flotilla,
  tabby, saffron, nadir, chess, azure, lilac and more). The day has 5 themes and 2 origin prompts, as decided.

**How they're built**
- Sources live in `_src/`. Run `node docs/rarity-game/mockups/build.mjs` to inline the shared engine and data into
  each option.
- The built files are self-contained apart from Google Fonts. Offline, they fall back to Georgia and the system
  sans.

## The three options

### 1. Quiet: "curio rarities"
- **Look:** a paper puzzle page.
- **How rarity shows:** each answer gets a plain tier name (Common, Popular pick, Familiar, Uncommon, Rare, Today's
  gem). Its position appears as a mark on a fine common-to-rare scale. Rarer words are set heavier on the end screen,
  which reads like a typeset contents page of your seven words.
- **Motion:** one gentle movement, the scale mark sliding.
- **Optimises for:** calm, brand purity and the lowest build cost.
- **Weakness:** the weakest thing to share. Bars and a number look like any score card, so there's little reason for
  a stranger to post it, and acquisition is the main job.

### 2. Curio with depth: "curio dig" (recommended)
- **Metaphor:** rarer words dig deeper through strata: topsoil, loam, clay, stone, bedrock. Each prompt hides one
  **fossil**, the gem.
- **On screen:** a depth gauge runs down the side and fills as you score. Each answer drops into its layer, a small
  motion with a purpose.
- **End screen:** a section drawing with your seven words embedded at their depths.
- **Share card:** the same drawing with the words removed, so it shows depth and pattern but no spoilers.
- **Optimises for:** a metaphor that belongs to Curio, since a site about where words come from fits "roots" and
  digging, and a share card nobody else has.
- **Why geology names rather than language eras:** era names ("Old English layer") would make players think the
  score is about how old a word is. It isn't.
- **Weakness:** a bit more to build than Quiet, and the strata drawing has to be produced well in the OG image
  route as well as the page.

### 3. Full dive: "curio depths"
- **Metaphor:** the whole screen is the water column, sinking from paper-coloured light down to brand ink as your
  score rises. Depth is in **fathoms**, itself a word with a story. The timer is an "air" gauge, the gem is a
  **pearl**, and words sink large and bold with bubbles.
- **Optimises for:** thrill, and the feel closest to Krillion.
- **Weaknesses**
  - It **is** closest to Krillion, which already has clones and parasite sites. Strangers may read it as another
    copy.
  - It drifts furthest from Curio's calm, editorial look.
  - The air metaphor adds tension, not guilt, but it's the most "pressure" of the three.
  - The dark gradient needs contrast checks at every depth. The mockup switches text from ink to paper as the
    water darkens.

## Cost to build and maintain (on top of the shared game: pipeline, scoring, archive, events)

| | Extra build | Ongoing upkeep | Hosting |
|---|---|---|---|
| Quiet | Baseline | Lowest | Same for all three: static day JSON, client scoring, one cached OG image per result |
| Dig | About +6–8 h | Low. The strata drawing is generated, not drawn by hand | Same |
| Full dive | About +10–14 h | Medium: motion, bubbles, contrast at every depth, reduced-motion fallbacks | Same |

Hours are Sam-weeks at 5–10 h a week: Dig adds roughly one week, Full dive one and a half to two.

## Against the principles and the hard rules

- **No streaks or FOMO.** None of the options has streaks, "you missed", completion counts or FOMO copy. Past days
  say "Every day stays open. Play any of them, in any order." Unplayed days show a Play button, not a gap.
- **Timer.** Each option has a "No timer" setting whose games count the same. Time always shows as a number and a
  bar, or a tank in Full dive. Screen readers hear "10 seconds left" and "5 seconds left". The clock pauses while the
  tab is hidden.
- **Reduced motion.** `prefers-reduced-motion` switches off every transition. In Full dive it also removes the
  bubbles.
- **Red** is used only for actions: primary buttons. Rarity and depth are shown by position, depth and ink weight,
  never red. In the dark parts of Full dive, the red buttons carry a light outline so they stay clear against the
  water.
- **Contrast.** Body text is Ink on Paper, roughly 16:1. Secondary text `#5E5850` on Paper is about 6:1. White on
  Red is about 7.7:1. Text on darker strata and deep water switches to Paper.
- **Five seconds to play.** Quiet's headline is the rules. Dig has a headline plus a picture. Full dive's headline
  is a question, so it's the slowest to understand.

## Gaps between the target brand and the repo (found while building)

- **Type.** The wordmark is lowercase Libre Caslon Text Bold "curio". The repo still uses Newsreader with "Curio" in
  title case. Body text stays Work Sans, as the repo does.
- **Colour.** Ink `#1C1A17`, Paper `#F5F1E8` and Red `#C23B22` are the target. The repo has ink `#24302b`, paper
  `#f1ece0` and an ochre accent `#9c6b30`, so it has no red. The repo's design tokens will need a rebrand pass before
  or alongside the game, otherwise the game will look different from the rest of the site.
- **Share images.** The existing OG images render in next/og's built-in Geist. To use Caslon on game share cards,
  the route must load the Libre Caslon TTF. It's under the OFL licence, so that's fine.
- **Dark mode.** The repo has a dark theme; the target brand doesn't define one yet. Quiet and Dig are light-only in
  these mockups.
- **Favicon.** Still due to be replaced (Sam, 19 Oct). Not touched here.
- **One design caution.** Warm paper, a serif and a red-clay accent is currently the most common look of
  AI-generated sites. The brand is fixed, so the distinctiveness has to come from the device: the strata, the
  contents page, the water column. That's another reason to prefer Dig over Quiet.

## Recommendation

**Option 2, Curio with depth ("dig").** It does the main job best:
- Its share card is unusual enough that a stranger would post it.
- Its metaphor ties the game to what Curio is about.
- It stays clearly on-brand and clearly not a Krillion re-skin.
- It adds only about one week to the build.

**Possible hybrid:** if Dig feels too gentle, borrow Full dive's bold reveal (the large word falling into its layer)
and leave everything else as it is. Quiet makes sense only if build time becomes the binding constraint.

**Route and name:** with Dig, `/dig` and "curio dig". `/play` stays as the clue puzzle (see `diagnosis.md`).
