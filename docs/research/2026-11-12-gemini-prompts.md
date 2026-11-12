# Gemini research prompts (run manually, share results back)

How to use: paste the **Shared context** block first in every run, then ONE of the three task blocks. Use Deep
Research mode with browsing on. Three focused runs beat one giant prompt. Ask Gemini to cite URLs for every claim.
Treat the output as ideas to test, not facts: it can't see our analytics.

---

## Shared context (paste first)

I run a small solo-built website, **Curio** (https://curioword.com). Please open it and use it before answering.

- **What it is:** one word, one origin story, every day. 1,147 hand-written etymology stories, one shared "word of
  the day" for everyone, optional email digest (double opt-in), accounts with favourites ("Collection"), a daily
  puzzle at /play, and **curio dig** at /dig: a daily word game where *obscure* answers score better than common ones
  (pitch: "A daily word game where obscure answers win"). Automated posts to Bluesky, Threads, Instagram.
- **Stage:** dig went public on 2026-11-07. Roughly 250 site visits in the last measured window, so tiny traffic.
  Signup count is near zero but we only just added a denominator, so we don't yet know if the signup offer is weak
  or just under-seen.
- **Google:** site-wide suppression. About 748 pages indexed, hundreds "crawled, not indexed", impressions fell from
  ~1,300/day to ~300. Decision: do not mass-noindex; freeze templates 6 weeks, deepen ~50 stories, earn links.
- **Launch plan:** Reddit (r/SideProject 17 Nov, r/DailyWordGames 19 Nov), Show HN 24 Nov. Success gate on 4 Dec:
  at least 200 first-time dig finishers, day-7 return at least 15%, share/challenge rate at least 15%.
- **Closest rival:** Wonderhop.
- **Hard product principle ("archive, never backlog"):** users may *pull* any word, but Curio must never *push*
  unread-ness. No streaks, no "X of 1,147", no "you missed", no completion percentages, no manufactured history.
  Any idea that breaks this is out of scope. Please flag, don't pitch, anything that borders on it.
- **Constraints:** one person, evenings only. Prefer automated or one-off work over anything needing a daily routine.
  Stack: Next.js on Vercel, Upstash Redis, Resend email. No paid ads budget.

Output rules: be specific and ranked. For every recommendation give (1) what to do, (2) why, with a source,
(3) effort in hours, (4) how I'd measure it. Say clearly where you are guessing. No generic advice.

---

## Task A: Design and UX review

Review curioword.com and curioword.com/dig as a first-time visitor on a phone, then on desktop.
1. Walk the first 60 seconds of each: home, a story page, /dig, /play, the email signup offer. Where would a
   stranger be confused, bounce, or not realise what to do? Quote the exact copy or element.
2. Compare against 4-6 comparable daily-ritual products (e.g. Wordle, Connections, Etymonline, Wonderhop, Atlas
   Obscura's daily, a word-of-the-day newsletter). What do they do in the first screen that we don't?
3. Judge the visual identity (lowercase serif wordmark, warm off-white, one red accent) for consistency, hierarchy
   and readability. What looks amateur, and what is already distinctive and worth protecting?
4. Accessibility basics: contrast, tap target size, focus states, motion, screen-reader sense of the dig game.
5. Rank the top 10 fixes by impact over effort. Mark which need design taste vs which are mechanical.

## Task B: Driving traffic

Find realistic ways to get a few thousand relevant visitors, given the Google situation above.
1. Diagnose from the outside why a site of ~1,100 programmatic-feeling etymology pages might be suppressed, and what
   evidence-based changes help (thin-content signals, internal linking, E-E-A-T, unique value per page). Cite
   Google documentation and credible case studies, not folklore.
2. Distribution channels that suit a *daily word game and an etymology archive*: communities, newsletters, podcasts,
   teachers/educators, crossword and Wordle-adjacent audiences, word-nerd subreddits and Discords, link roundups,
   "daily game" directories and lists. Give 15 named targets with the submission route, audience size and the rules
   or etiquette that could get us banned.
3. Shareability: what makes a daily-game result card or challenge link spread? Examples with evidence.
4. Backlink ideas that are earned rather than begged: data stories, "most obscure answers this week", tools or
   embeds a linguist, teacher or writer would link to.
5. A 4-week sequence ranked by effort vs expected visitors, with what to measure after each step.

## Task C: Feature ideas

Suggest features, ranked, that would raise **day-7 return** and **sharing** for curio dig, and make Curio worth
subscribing to. Respect the "archive, never backlog" principle strictly.
1. For dig: 10 ideas (modes, social, post-game content, difficulty, rewards that aren't streaks, tying each day's
   answers back to the etymology stories). For each, say what it does to retention and sharing, with evidence from
   comparable games where you can find it.
2. For the wider site: 5 ideas that make the 1,147-word archive a pleasure to *pull from* without nagging anyone.
3. A "Curio for X" sibling idea: the engine is a daily story plus a daily game. Which 3 other niches (not language)
   fit best, and what would the smallest test of each look like?
4. Kill list: 5 things a site like this commonly builds that I should NOT, and why.
5. Identify the single feature you'd build first if you had only one evening, and defend it.
