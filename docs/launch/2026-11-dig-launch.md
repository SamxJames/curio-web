# curio dig launch kit, November 2026

The founder posts everything here by hand. Nothing in this file has been posted or sent. Positioning line, used everywhere: "A daily word game where obscure answers win. No crowd needed, and every answer comes with its origin story."

## 1. Run sheet, 11-15 to 11-28

- **Sun 11-15:** pre-flight (below). Read the sidebar and rules of each subreddit. Start commenting in those communities.
- **Mon 11-16:** keep commenting. Fill in the personalisation line for the first five emails.
- **Tue 11-17:** subreddit rehearsal. Post A in r/SideProject (section 3). Stay for the first hours of replies.
- **Wed 11-18:** email 1, Kottke.org.
- **Thu 11-19:** email 2, Web Curios. Post B in r/DailyWordGames.
- **Fri 11-20:** email 3, Things That Exist.
- **Sat 11-21:** email 4, Word Nerd.
- **Sun 11-22:** email 5, On Words and Up Words.
- **Mon 11-23:** email 6, Dense Discovery. Reread the Show HN post and first comment against the live game.
- **Tue 11-24:** Show HN at about 8-10am ET (1-3pm UK). Be free for the following 3 to 4 hours. Email 7, Language Log, goes out in the evening.
- **Wed 11-25:** email 8, The Whippet. Answer late HN comments. Decide whether to retry (section 6).
- **Thu 11-26:** email 9, Merriam-Webster editors.
- **Fri 11-27:** email 10, Rusty Blazenhoff.
- **Sat 11-28:** write up what each source sent, using /admin by UTM source.

**Pre-flight**
1. Open `/dig` on a phone with a clean browser. A stranger must see the pitch, the rules and a Start button without signing in.
2. Check the page still says it is free, and that no login is needed. The page I read did not say so, so check it yourself.
3. Check section 2's numbers against the live game. They come from the design doc, and the game may differ.
4. Each post uses its own link: `https://curioword.com/dig?utm_source=reddit`, `https://curioword.com/dig?utm_source=hn` or `https://curioword.com/dig?utm_source=newsletter`.
5. Open /admin and confirm the three sources show up as separate rows.
6. Never ask anyone to upvote, and don't ask friends to. Reply to every comment.
7. Before Show HN, confirm the Upstash plan's command cap and Vercel usage alerts. A player costs about 25 Redis commands, so 2,000 HN visitors is roughly 50,000 commands.

**After each post, read in /admin** (filter by the source's UTM): visits, starts, "Reached prompt 4", finishes and Shared. Check at +3 hours and the next morning.
- Visits high, starts low: the cold page is the problem. Reread the pitch and the Start button on a phone.
- Starts good, "Reached prompt 4" poor: people are leaving in the first three prompts. Ask commenters where they stopped, and look at the opening prompt for that day.
- Reached prompt 4, finishes poor: seven prompts may be too many for a stranger. Ask where they stopped.
- Finishes good, Shared low: the end screen is not prompting a share. Note it for later.
- Don't change copy or code mid-launch because of one day. Write down what you saw, fix it afterwards, and use it in the retry.

## 2. Show HN

**Title (63 characters):**
`Show HN: curio dig, a daily word game where obscure answers win`

**Link:** `https://curioword.com/dig?utm_source=hn`. It must be playable now with no sign-up page in between.

**Post body:**
> I'm a solo builder in the UK. curio dig is a daily word game. There are seven prompts, such as "name a bird" or "name a word that came to English from Arabic". Any word that fits counts, and the rarer your word, the more it scores. There's no clock. It's free, with no login.
>
> The difference from similar games is that rarity comes from word-frequency data, so it works on day one with no crowd of players. After each prompt the reveal gives the origin of the rarest answer, with a link to a word story where I have one.
>
> I'd like feedback on three things. Do any prompts feel unfair? Did the game reject a word you think is valid? Does the scoring make sense on a phone?

**Founder's first comment:**
> Here is how rarity works and where the data comes from.
>
> Each prompt has an answer list that two public sources agree on. Wiktionary is one. The other is WordNet, or Wikidata for things like cheeses and dog breeds. I only publish a prompt if enough answers agree.
>
> Each answer's rarity comes from wordfreq, a word-frequency list by Robyn Speer that blends Wikipedia, subtitles, news, books, web, Reddit and Twitter. It uses a Zipf score. The cut-offs are fixed, so a score means the same thing every day. Common words (Zipf 4.0 or more) score 10. Familiar words score 30, uncommon 60, and rare 85. Words missing from the list count as rare. One answer per prompt is the "fossil" and scores 100.
>
> Frequency can't see fame. "Petrichor" is rare in print but most people know it. So I check Wiktionary pageviews, and a famous rare word is marked "Popular pick" and scores 15, with at most two per prompt.
>
> Known weaknesses. The frequency list is frozen at 2021 data. Words with several meanings can land a tier too common. My filters will reject some valid words, so each rejection has a "should count" button, and those reports are reviewed twice a week against the full Wiktionary data. An accepted word is added to that prompt, including past days, and never changes an earlier score.
>
> The days are built offline twice a week by a free GitHub Action, checked, and frozen a week before they go live. Future answers stay out of the public repo. Word origins come from Wiktionary under CC BY-SA. I'll be here for a few hours.

## 3. Two subreddit posts

**Before either post:** comment properly in each community for a week. Answer questions, join threads, and don't mention the game. Read the sidebar the day you post. I could not read any subreddit's rules, so the notes below are guesses. If a rule says no self-promotion, post in the weekly thread or don't post.

**Post A, r/SideProject (builder angle, the 11-17 rehearsal)**

Title: `I built a word game that scores rarity from frequency data, so it works with no players`

> I'm a solo builder in the UK. curio dig is a daily word game where obscure answers win. There are seven prompts a day, like "name a bird", and any word that fits counts. A rare word such as "quince" goes deeper than "apple".
>
> Games like this usually need a crowd of players to know what is rare. I took rarity from word-frequency data instead, with answer lists that two public sources agree on, so day one is fair. It's free, with no login: https://curioword.com/dig?utm_source=reddit
>
> What looks wrong in the scoring? I'd like to hear it.

Removal risk: low to medium. Many builder subreddits limit links in the body, need a flair, or want an account with history. If the link is the problem, move it to the first comment.

**Post B, r/DailyWordGames (player angle)**

Title: `Name a bird, name a word from Arabic: a daily game where the rare answer wins. Does it feel fair?`

> I make a daily word game. You get seven prompts and type any word that fits. Common words score a little and rare ones score a lot, and there's no clock. It's free, with no login: https://curioword.com/dig?utm_source=reddit
>
> Two things I'd like to know. Did it reject a word you think is valid? Was there a prompt where the rare answers felt too hard to find?

Removal risk: medium to high. Game communities often restrict self-posts to a weekly thread, or remove a post whose only purpose is a link. Message the mods first if the rules are unclear.

r/etymology is the riskiest and I have not written a post for it. Ask the mods before posting anything there.

## 4. Newsletter email (49 words)

Subject: `A daily word game where obscure answers win`

> Hi [name], [personalisation line]. I'm a solo builder in the UK, and I've made curio dig, a daily word game where obscure answers win. It's free, with no login, and every answer comes with its origin story. Would it suit your readers? https://curioword.com/dig?utm_source=newsletter
>
> Thanks, [your name]

Replace the personalisation line with something real from a recent issue. Check each one is still active and where it takes submissions.

- **Kottke.org** (named in the research; confirm the contact route). Hook: "your link to [recent post] was the kind of small web thing I'd hoped to make."
- **Web Curios, Matt Muir** (named in the research; confirm). Hook: "I read [recent issue]; this is a small thing for the games section."
- **Things That Exist, Vikki** (named in the research; confirm). Hook: "I liked [recent entry], so here is one more thing that exists."
- **Word Nerd, AprilJo Murphy** (named in the research; confirm). Hook: "I enjoyed your piece on [word], and this game ends with where words come from."
- **On Words and Up Words** (named in the research; confirm). Hook: "your readers like words, and this rewards the odd ones."
- **Dense Discovery** (unverified, from memory; confirm it exists and takes tips). Hook: "I read [recent issue]; this is a small, free thing from a solo builder."
- **Language Log** (unverified, from memory; it may not take pitches). Hook: "I read your post on [topic]; this game scores words by how rare they are in print."
- **The Whippet** (unverified, from memory; confirm). Hook: "I read [recent issue] and thought of you for this."
- **Merriam-Webster editors** (unverified, from memory; find a real contact or drop it). Hook: "your readers like words, and this game ends with where each one came from."
- **Rusty Blazenhoff** (unverified, from memory; confirm her current outlet). Hook: "I liked [recent post]; this is a small word game."

## 5. Prepared replies

**"Isn't this Wonderhop?"**
> It's a close cousin. Wonderhop, Popular Guess Only and Lyre also reward uncommon answers, and I'm not claiming the idea is new. Mine takes rarity from word-frequency data, so it works with no crowd, and afterwards you get the origin of the rarest word.

**"You rejected X, which is a valid word."**
> Sorry about that, and thanks for telling me. Press "should count" next to it. Those reports are reviewed twice a week against Wiktionary, and a word that checks out is added to that prompt, past days included, without changing anyone's earlier score.

**"How is rarity decided?"**
> From how often a word appears in a large mix of writing, using the wordfreq list. Rarer words sit in higher tiers and score more, and the cut-offs are fixed so a score means the same each day. A rare word that most people know, like "petrichor", is marked down as a "Popular pick".

**"Why no streaks?"**
> On purpose. I want it to be something you open when you fancy it, with nothing to feel behind on. There are no counts of what you've missed either.

**"Is this AI?"**
> The game doesn't use a language model to build the answer lists, score words or pick the rare answer. That is ordinary code over Wiktionary, WordNet and word-frequency data. The separate Curio word stories were rewritten from Wiktionary facts by a language model told not to add anything, and the attribution page says so.

Founder note on that last reply: the pipeline design says no language model is used for the game, and the older launch kit says the stories were model-rewritten. Check both still hold for the live game before posting. Also decide how much of the story text you reviewed yourself, and say that in your own words if asked. Don't let this reply stand in for that.

## 6. If Show HN flops

Call it a flop if, by the next morning, the post has little discussion and almost no starts from `hn` in /admin. Most daily-word-game Show HNs get 3 to 12 points, and Qwertle got 103, so plan for this. A flop says nothing about the game itself.

- **Retry day:** Tue 12-01, at 8-10am ET again. Don't repost on the same day or with the same title.
- **New angle:** lead with the method and not the game. The title becomes something like `Show HN: Scoring word rarity from frequency data, with no player crowd`. The first comment opens with the two-source answer lists and the known weaknesses, and the game is where people try it.
- **Fix first:** use whatever the first round showed, such as a confusing cold page or a rejected word people complained about. Don't change the pricing, login or scoring claims.
- **Same rules:** link to `https://curioword.com/dig?utm_source=hn`, never ask for upvotes, and be there for the first 3 to 4 hours. Check the HN guidelines the morning before for anything about reposting.
- **Keep going elsewhere:** emails and subreddit comments continue as planned. If the retry also flops, spend the next week on newsletters and communities instead of a third HN try.

## 7. Extra candidates from the 2026-11-12 Gemini research (all unverified)

Nothing here is scheduled. Gemini's claims about each channel's rules came from a model with no first-hand access, so read each channel's own rules before using it. Source: `docs/research/2026-11-12-gemini-prompts.md` prompts, answers reviewed in session.

- **r/WebGames (best fit for dig).** A browser-game showcase. Gemini says it requires a title tag such as `[HTML5]` and bans plain promotion. Read the sidebar first. If it allows developer posts, reuse Post B's player angle with `utm_source=reddit`. Rehearse in r/SideProject first, as planned.
- **Indie Hackers.** A short builder post about how rarity scoring works with no crowd. Low volume, good for early advocates and feedback. Reuse the Show HN first comment as the body.
- **Daily-game directories.** Dle Hunt already lists Curio (the page carries a real user comment about the puzzle's first clue). Other aggregators seen in the research: Coolgamesfree, ZapGames, quordle-wordle. Cheap to submit, low value for search. Use the directory-submissions skill when ready.
- **Dense Discovery (email 6).** Gemini says it sells 200-character classified ads rather than taking free tips. The email above assumes a free tip. Check its submission page before 11-23, and don't pay for an ad without deciding on a budget.
- **Not worth doing now:** Product Hunt (needs 24 hours of constant presence for a game with a 4 Dec gate to read), Lobste.rs (invite-only), r/etymology (read-only claim is probably out of date; mods first, as above), Atlas Obscura pitch (needs a data story we don't have yet).
