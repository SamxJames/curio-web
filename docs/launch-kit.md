# Curio launch kit

This kit holds everything needed to introduce Curio somewhere public. **The owner does every submission and post.** Claude never posts or signs up anywhere.

Prepared 2026-10-03 from the first weekly check-in ("Proposed Claude work #3").

## Before posting anything

1. **Double opt-in ships first.** Double opt-in is built (2026-10-03) and goes live with the next deploy. That was decided before any public promotion (`handover.md`, "Deferred / parked items"). One wave of junk signups would hurt delivery for the digest and the sign-in emails, because they share a Resend quota. The game directories (section 1) send people to `/play`, where no signup is needed, but they still put the subscribe box in front of strangers. So everything here waits.
2. **Be upfront about how the stories are written.** Curio's `/attribution` page already says it: the facts come from Wiktionary (via Wiktextract), and the Origin, Journey and Related sections are rewritten by an offline language-model pass under a strict "don't invent anything" rule.
   - Several communities ban or dislike AI-written content. Never let a post imply the stories are hand-written.
   - Each section below includes the disclosure line where it matters.
   - **Owner to confirm** how much of the content you personally reviewed, and adjust the line if needed. The copy below says only what the attribution page says.
3. **Don't use UTM tags on these links.** Reddit and Hacker News are recognised from the referrer, which shows on `/admin` as `reddit` and `hn`. Everything else shows as `other`. A tag such as `?utm_source=producthunt` would be ignored, because only Curio's own tags are allowlisted (see `lib/traffic.ts`).
4. **One place per day, not a blast.** Space submissions out. That way `npm run traffic:report` and the weekly check-in can show which place actually sent people.
5. **Never ask anyone for upvotes.** Hacker News and Product Hunt both treat it as manipulation.

## Facts to draw on (all true as of 2026-10-03)

- **One word a day.** Everyone sees the same word on the same date, and it changes at 00:00 UTC.
- **1,147 word stories.** Each has an origin, a journey, related words and a language lineage (e.g. Proto-Basque → Basque → French → English).
- **Daily puzzle at `/play`.** It's the same puzzle for everyone each day. You guess the word from up to three clues, with three guesses. The third clue adds the letter count and first letter. A spoiler-free result grid can be shared.
- **Free, no ads, no login needed** to read or play. The optional free account (sign-in by email link) keeps your own collection and favourites.
- **Optional daily email** with the day's word. It has a one-click unsubscribe.
- **Positioning:** "one word, one story, every day — no feed, no backlog to catch up on."
- **The voice to avoid:** streaks, "don't miss out", counts of words you haven't read, completion percentages. They contradict the product (see the principle in `AGENTS.md`).

---

## 1. Daily-game directories (the best fit, and low risk)

These list free daily games that are the same for everyone and need no login. `/play` qualifies on all three.

### The Dles: https://dles.aukspot.com
- **How:** the suggestion form at https://tally.so/r/mOKOea, or a "dle suggestion" issue on https://github.com/qubit10/dles.
- **Criteria** (from its README): it changes every day, it's the same for everyone, it's free, and it has no login or subscription.
- **Paste:**
  - Name: `Curio`
  - URL: `https://curioword.com/play`
  - Category: Word / Language
  - Description: use the 50-word blurb below.

### Dle Hunt: https://dlehunt.com
- **How:** the site says makers can submit games. Use its submit link (check the footer or nav).
- **Paste:** same as The Dles. Category: Word.

### Wordle-alternative lists (pitch the author, low odds, keep it short)
- Capitalle's "best daily games" post: https://capitalle.app/blog/best-puzzle-games-2026 (look for a contact link).
- The open GitHub list `wordleweb`: https://awesome.ecosyste.ms/lists/rarelygoeshere%2Fwordleweb. Open a PR or issue adding Curio under word games, following the list's own format.
- The pitch email sits in "Copy blocks" at the end.

## 2. Newsletter directories (free listings, slow but durable)

Most need a free account, so the owner signs up. Submit the **digest**, with sign-up at `https://curioword.com`.

| Directory | Notes |
|---|---|
| InboxReads: https://inboxreads.co | Free listing ("Submit Newsletter" in the footer). |
| LetterList: https://letterlist.com | Free listing. |
| Newsletter Stack | Check that it accepts newsletters not on Substack before submitting. |

Other free directories are listed in the roundups by Ghost (https://ghost.org/blog/newsletter-directories) and Indie Hackers (https://www.indiehackers.com/post/list-of-newsletter-directories-dfb6499dfb). Ghost Explore is for Ghost-hosted newsletters only, so skip it.

- **Category:** Education / Language / Culture.
- **Frequency:** daily.
- **Description:** the 150-word blurb below. Where there's a "sample issue" field, link today's story page rather than the homepage.

## 3. Hacker News: Show HN

- **Rules** (https://news.ycombinator.com/showhn.html):
  - It must be something people can try without signing up, so lead with the site and puzzle, not the newsletter. Newsletters and signup pages don't qualify.
  - The title starts with "Show HN".
  - Don't ask friends to upvote.
- **Link:** `https://curioword.com/play`, or the homepage. The puzzle is the better hook for HN.
- **Timing:** a weekday morning US time. Be around for 3–4 hours afterwards to answer comments.
- **Expect** questions about the AI rewriting and the source data. The first comment below answers them up front.
- **Title:** see "Copy blocks". It must be under 80 characters.

## 4. Reddit (check each sidebar first; I couldn't read the rules from here)

Reddit blocked automated reading of its rules pages, so **read the sidebar and rules of each subreddit before posting.** Self-promotion limits are set per subreddit, and many expect an account with a real history of taking part. Use your own account, which presumably already has that history.

| Subreddit | Fit | Notes |
|---|---|---|
| r/etymology | Audience fit is the highest, and so is the risk | A discussion community. Posting an *interesting word story* (as text, with the link at the end) goes over better than "I made a site". Expect people to care that the prose is LLM-written, so disclose it in the post. |
| r/logophilia, r/words | Good fit | Same approach: lead with one story. |
| r/SideProject, r/IMadeThis | Built for this | The "I built this" framing is expected here. |
| r/InternetIsBeautiful | **Skip** | Its rules exclude sites whose primary content is AI-produced, which Curio's stories are. |
| r/linguistics | **Probably skip** | Moderated for academic linguistics; app promotion is very likely to be removed. |

## 5. Product Hunt (later, not now)

Product Hunt now weighs maker history: guides for 2026 suggest a maker profile active for about 30 days, plus 8–12 images, and a launch on a Tuesday or Wednesday at 00:01 PT. Never ask for upvotes. It's worth doing once there are real numbers to show, and after the Instagram carousels exist to supply images. Park it until the 4-week review.

---

## Copy blocks (ready to paste)

### Name / tagline (under 60 characters)
`Curio — one word's origin story, every day`

Alternative: `Curio: a daily word origin and a three-clue puzzle`

### 50-word blurb
> Curio gives you one word a day and the story of where it came from. That might be how *ketchup* probably began as a Hokkien word for fish sauce, or how *silhouette* came from a thrifty finance minister. There's a daily three-clue puzzle too. It's free, with no feed, no backlog and no login needed.

Both examples match Curio's own stories (`lib/words.ts`: ketchup's origin says "probably", so the blurb does too). Swap in any two favourites, but keep any hedging the story uses.

### 150-word blurb
> Curio is a small daily habit for people who like words. Each day everyone gets the same word, along with the story of where it came from: its origin, the journey it took through other languages, and the words it's related to. It's one story, not a feed, and there's nothing to catch up on if you miss a day.
>
> There's also a daily puzzle. You guess the word from up to three clues, and the third one comes with a letter hint. You can share your result without spoiling the word.
>
> You can read and play without an account. If you want the word in your inbox each morning, there's an optional email, and every email has a one-click unsubscribe.
>
> The etymological facts come from Wiktionary. Each story is written up from those facts by a language model told not to add anything they don't contain. 1,147 words so far.

### Show HN title (under 80 characters)
`Show HN: Curio – a daily word origin and a three-clue guessing game`

### Show HN first comment
> I'm the maker. Curio started because I like knowing where words come from, but every etymology site I found was a reference work rather than something you'd open every day.
>
> How it works:
> - Everyone gets the same word each day (UTC), with its origin, journey and related words.
> - /play is a daily guess-the-word puzzle: three clues, three guesses, and a letter hint on the last clue.
> - No login is needed. There's an optional daily email and an optional account for keeping favourites.
>
> Where the content comes from: the facts come from Wiktionary via Wiktextract. An offline pass with an LLM (Claude) rewrites each entry into a short story, under a rule not to add anything that isn't in the source data. Attribution and licence details are at /attribution. If you spot a word where the story says more than Wiktionary supports, I'd really like to know.
>
> Stack: Next.js on Vercel, Upstash Redis and Resend, all on free tiers. All 1,147 story pages are static.
>
> One deliberate choice: there are no streaks and no "you missed N words". It's meant to be a nice thing to open, not a thing you feel behind on.

### Reddit post (r/etymology style: lead with a story)
**Title:** `TIL "<word>" <one-line surprising origin>`. Pick the day's word, or a strong one from the archive.

**Body:**
> [Two or three sentences retelling that word's origin in your own words.]
>
> I've been collecting stories like this on a little site, one word a day: https://curioword.com/story/<slug>. Full disclosure: the write-ups are generated from Wiktionary's etymology data by a language model told not to invent anything, so corrections are very welcome.

### Reddit post (r/SideProject style)
**Title:** `I built Curio: one word's origin story a day, plus a three-clue puzzle (no login, no streaks)`

**Body:** the 150-word blurb, then one line: "Happy to answer anything about how it's built or where the content comes from."

### Pitch email to a list author
> **Subject:** A daily word game for your list: Curio
>
> Hi [name], I enjoyed [post title]. I make a small daily word game, Curio (https://curioword.com/play). It's the same puzzle for everyone each day: you guess the word from up to three etymology clues. It's free, with no login and a spoiler-free share grid. If it fits a future update of your list, I'd be glad to be included. Either way, thanks for the list.
>
> [Your name]

---

## After each submission

Write a line in `C:\Users\Sam\Documents\Claude\Projects\Curio\checkins\state.md`'s experiments log: the date, where you posted and the link. The next weekly check-in will then match any jump in `reddit`, `hn` or `other` visits (or signups) to the right submission.

## Sources
- Show HN rules: https://news.ycombinator.com/showhn.html
- The Dles criteria and suggestion form: https://github.com/qubit10/dles
- Dle Hunt: https://www.producthunt.com/products/dle-hunt
- InboxReads free listing: https://inboxreads.co/cross-promotions
- Newsletter directory roundups: https://ghost.org/blog/newsletter-directories, https://www.indiehackers.com/post/list-of-newsletter-directories-dfb6499dfb
- r/InternetIsBeautiful's AI-content exclusion (from search snippets of its rules): https://gummysearch.com/r/InternetIsBeautiful
- Product Hunt 2026 guidance: https://app.getlaunchlist.com/blog/how-to-launch-on-product-hunt-2026
- Reddit self-promotion norms in general: https://redship.io/blog/reddit-self-promotion-rules
