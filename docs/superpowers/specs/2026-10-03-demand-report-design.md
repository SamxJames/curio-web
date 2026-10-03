# Weekly Demand Report — Design

**Status:** approved in chat, 2026-10-03.
**Branch:** `demand-report`. Nothing is pushed or merged without the owner's sign-off.

## Goal

A weekly, fully automated report showing:

- which of Curio's 1,147 words have real search demand, using English Wiktionary pageviews as a proxy;
- which story pages are earning impressions, using Google Search Console.

It uses only free data sources. It adds no user-facing surface: no public route, component or page changes.

## Guardrails

- This is internal tooling only. `app/`, `components/`, `vercel.json` and `LAUNCH_OPENERS` are not touched.
- **No production deploys.** Every push to `master` deploys to production through Vercel's git integration. The work happens on `demand-report`. GitHub only runs scheduled workflows that are on the default branch, so going live needs **one** merge to `master`. That merge deploys once and needs the owner's sign-off. After it, the weekly runs only push to the private `SamxJames/curio-reports` repo, which isn't connected to Vercel.
- **Credentials** live only in GitHub Actions secrets and `.env.local`. They are never printed, logged or committed. Auth errors report the HTTP status and Google's error code, never the body.
- **Conventions:** TypeScript, `tsx` scripts in `scripts/`, Vitest tests beside the code, fixtures in `scripts/__fixtures__/`.
- **The work is gated in phases.** The owner signs off at the end of each phase:
  - Phase 1: Wiktionary.
  - Phase 2: Search Console.
  - Phase 3: the combined report and the workflow.
  - Phase 4: `handover.md`.

## Decisions made while brainstorming

1. **Publishing target:** a separate **private** repo, `SamxJames/curio-reports`. `curio-web` is public, and Search Console queries and positions are competitive information.
   - The workflow pushes with a fine-grained personal access token scoped to that one repo (Contents: read and write). It's stored as the `REPORTS_REPO_TOKEN` secret.
   - The report is read at `https://github.com/SamxJames/curio-reports/blob/main/latest.md`.
   - Rejected alternatives:
     - an orphan `reports` branch in the public repo (public);
     - `docs/` on `master` (a production deploy every week);
     - a secret Gist (the token can't be limited to one Gist, and the Gist is unlisted rather than private);
     - Actions artifacts (no stable URL).
2. **Title casing:** try the **exact spelling from `lib/words.ts` first**, then the other-case form. This departs from the brief's "lowercase first". Seven words are capitalised (December, January, Jupiter, October, Pluto, Thursday, Wednesday). Wiktionary's lowercase pages such as `december` hold other languages' entries, so lowercase-first would measure the wrong page. For the 1,140 lowercase words, the two rules are identical.
3. **User-Agent:** `CurioDemandReport/1.0 (https://curioword.com; samfillingham@protonmail.com)`.
4. **Search Console auth:** the script signs the JWT itself with `node:crypto` (RS256, the JWT bearer grant). It adds no new dependency.

## Units

All new code is under `scripts/`. Tests sit beside each file, and fixtures go in `scripts/__fixtures__/demand/`.

| File | Responsibility |
|---|---|
| `scripts/demandReport.ts` | Command-line entry point: `npm run demand:report -- [--out <dir>]`. It runs both halves, checks the results and only then writes the output. The default output folder is `.reports/demand/` (gitignored). |
| `scripts/demand/http.ts` | `fetchWithRetry`: a minimum gap between requests, and retries on 429, 5xx and network errors with exponential backoff that honours `Retry-After`. `fetch`, `sleep` and the clock can be injected. |
| `scripts/demand/wiktionary.ts` | Title candidates and URL encoding, the batched title lookup, monthly pageviews, and the per-word maths. |
| `scripts/demand/searchConsole.ts` | Loading credentials from the environment, signing the JWT, the token exchange, and paginated `searchanalytics.query` calls. |
| `scripts/demand/report.ts` | Pure functions: join the sources per word, build the sections, render the Markdown, compare with the previous snapshot. |

The word list comes from `WORDS` in `lib/words.ts`. Importing that file also imports `lib/redis.ts`, which is `null` without Upstash variables and makes no network calls.

## Wiktionary half (Phase 1)

- **Window:** the last 12 complete UTC months before the run date.
- **Resolving titles:**
  - Candidates are the exact spelling, then its other-case form (first letter swapped).
  - The MediaWiki action API (`en.wiktionary.org/w/api.php?action=query&titles=…`) is called in batches of 50 titles. It returns which titles exist and how they normalise.
  - A word with no existing candidate goes on the **no Wiktionary page** list. It doesn't fail the run.
  - The title actually used is recorded for every word.
- **Pageviews:**
  - Endpoint: `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wiktionary.org/all-access/user/<encoded title>/monthly/<YYYYMM01>/<YYYYMM01>`.
  - Titles are encoded with spaces as `_`, then `encodeURIComponent`.
  - A 404 for a title that exists counts as zero views. Months missing from the response count as 0.
- **Pace:** sequential, with about 100 ms between requests (around 10 a second; 1,147 words takes a few minutes).
- **Retries:** up to 5 attempts, backing off 1, 2, 4 then 8 seconds, or `Retry-After` when it's given.
- **Per word:**
  - `total12`: the sum of the 12 months.
  - `avg3`: the mean of the last 3 months.
  - `trend`: (last-3 mean − previous-3 mean) / previous-3 mean.
  - When the previous-3 mean is 0, `trend` is `null` and shows as "new" (if the last 3 are above 0) or "—" (if both are 0).
- **Caveat stated in the report header:** a Wiktionary page covers every language's entry for that spelling. The figure is a proxy for interest in the word, not a count of English etymology searches.
- **Phase 1 stop point:** a real run, showing the owner the top 50 and bottom 50.

## Search Console half (Phase 2)

- **Credentials:**
  - `GSC_SERVICE_ACCOUNT_KEY` holds the service account's JSON key, **base64-encoded**, so it fits on one line in `.env.local` and in a GitHub secret.
  - The property is `sc-domain:curioword.com`.
  - The scope is `https://www.googleapis.com/auth/webmasters.readonly`.
- **Window:** 28 days ending 3 days before the run date, because of the reporting lag. The report states the exact dates and that the data lags by a few days.
- **Three queries:** dimensions `[page]`, `[query]` and `[page, query]`. Each uses `rowLimit` 25,000 and paginates with `startRow`. They return impressions, clicks, CTR and average position.
- **Mapping pages to words:** a page maps to a word when its URL path is `/story/<slug>` and the slug is in `WORDS`. This works for both `curioword.com` and `www.curioword.com`.
- **Credential behaviour:**
  - Variable **missing**: the Search Console half is skipped and the report says so clearly.
  - Variable **present but the call fails**: the run fails.
- **Owner's manual steps:** written out step by step for the owner, who does them by hand: create the service account, enable the API, add the service account as a user on the property, store the key as a GitHub secret and in `.env.local`, and create the `curio-reports` repo and its token.

## The report (Phase 3)

**Output:**
- `latest.md`
- `snapshots/YYYY-MM-DD.json`, which holds every word's monthly views and summary plus the Search Console rows.

**Header:**
- generation date;
- both data windows;
- the Wiktionary caveat;
- the Search Console lag note;
- a note that Google leaves rare queries out of query-level data;
- a "Search Console skipped" notice when that applies.

**Sections:**

1. **Top 30 by Wiktionary demand:** word, 12-month total, 3-month average, trend, and Search Console impressions, clicks and position (or "—").
2. **Opportunities:** words in the top quarter by 12-month total with fewer than 10 impressions in 28 days, sorted by demand, up to 30.
3. **Nearly there:** pages with an average position from 8 to 20, sorted by impressions, up to 30.
4. **Off-pattern queries.** The title pattern is `<word>: the origin of the word — Curio`. There are two groups, sorted by impressions, up to 30 each:
   - **Off-word:** the query doesn't contain the page's word.
   - **Other intent:** the query contains the word but none of `origin`, `etymology`, `history`, `come from`, `derive`.
5. **Week on week**, against the most recent earlier snapshot in the output folder:
   - total impressions and clicks, with the change;
   - the 10 biggest impression gains and losses;
   - the 10 biggest position improvements;
   - pages appearing for the first time;
   - Wiktionary changes only when the month window has rolled over.
   - The first run says there is no earlier snapshot.

**Footer:** the list of words with no Wiktionary page.

## Failing loudly

All checks run before anything is written. The script exits with code 1, and writes nothing, if:

- any word still fails after retries;
- no word has any pageview data;
- Search Console credentials are present but any call fails.

## Workflow (Phase 3)

`.github/workflows/demand-report.yml`:

- **Triggers:** `schedule: cron "0 6 * * 1"` (Mondays 06:00 UTC, clear of the 09:00 digest cron) and `workflow_dispatch`.
- **Settings:** `permissions: contents: read`, and `concurrency: demand-report`.
- **Steps:**
  1. Check out `curio-web`.
  2. `setup-node` with the npm cache, then `npm ci`.
  3. Check out `SamxJames/curio-reports` into `published/`, using `REPORTS_REPO_TOKEN`.
  4. `npm run demand:report -- --out published`, with `GSC_SERVICE_ACCOUNT_KEY` from secrets.
  5. Commit and push `published/` as `github-actions[bot]`.
- If the script fails, the job fails and nothing is pushed.

## Documentation (Phase 4)

A short section in `handover.md` covering:

- what the report is and where it's published;
- how to run it locally;
- how to rotate the service account key and the `REPORTS_REPO_TOKEN`;
- the Wiktionary caveat.

## Out of scope

- Surfacing the report in `/admin`.
- Any change to story titles, metadata or internal linking.
- Bing Webmaster Tools and Ahrefs Webmaster Tools.

## Testing

Everything uses fixtures and an injected `fetch`, with **no live network calls**. The tests cover:

- title candidates and encoding;
- handling a missing page;
- treating a 404 as zero views;
- trend maths, including the zero-baseline cases;
- retry behaviour on 429 and 5xx, with `Retry-After`;
- giving up after the last attempt;
- JWT structure and a signature verified with a test-generated key;
- the credentials-missing skip;
- the credentials-present failure;
- each report section's selection rules;
- the week-on-week comparison;
- the "write nothing on failure" ordering.
