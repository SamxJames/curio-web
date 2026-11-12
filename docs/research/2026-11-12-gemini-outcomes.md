# Gemini research, outcomes (2026-11-12)

Three runs of the prompts in `2026-11-12-gemini-prompts.md`. Gemini had no analytics and several claims were wrong
about the live site (red accent, seven stacked dig inputs, a premium tier, screenshot-only sharing). Each finding was
checked against the code, the live pages and Sam's phone screenshots before acting.

## A. Design and UX
- **Dropped (already fine or wrong):** mobile lineage wrap (wraps cleanly on a real iPhone), homepage clutter on phone
  (one primary button, quiet "Also today" list), red accent (accent is amber; `--danger` is separate), dig a11y
  (one prompt at a time, aria-label, live regions, auto-focus, reduced motion), inline signup (already inline), tap
  targets, contrast, focus rings.
- **Kept:** finish the clue rewrite for the other 945 words (a real Dle Hunt user says clue 1 gives the word away).
  Add "what do you think *rarer ones dig deeper* means?" to the five-stranger test.
- **Parked:** dig prominence on the homepage (decide after 12-04); the story page opens with a dry chain, the hook
  is only in the teaser (template frozen to 12-18).

## B. Traffic
- **Rejected:** mass-noindex in week 1 (contradicts the 2026-11-07 decision; no new evidence). A narrow version stays
  an open thread: noindex only the 127 never-crawled stories, judged at the 12-18 GSC read.
- **Rejected:** emoji grid with no link (we need the link and its utm to measure the share gate); data-journalism
  pitches (not enough users).
- **Parked:** embeddable word-of-the-day widget (after 12-04).
- **Taken:** Upstash/Vercel load check before Show HN; r/WebGames, Indie Hackers and game directories added to the
  launch kit section 7; Dense Discovery may be a paid classified, check before 11-23.

## C. Features
- **Already built:** rarity scoring, share row, story tie-back, challenge links.
- **Rejected:** subscriber tier / custom dig (no paid product; a money decision for Sam), Word2Vec hints (opposes the
  rarity mechanic), Redis sorted-set search, Queen Bee tier, UX-break animations, difficulty colours.
- **Parked:** On This Day and thematic exhibitions (need tagging 1,147 words, 2026-10-12 decision); sibling
  products (the roadmap says build Same Brain if day-7 return is low).
- **Keep for after 12-18:** "Down the rabbit hole", related-word links on story pages. Pull not push, adds internal
  links, but it changes the frozen template.
