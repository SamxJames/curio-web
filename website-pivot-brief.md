# Website Pivot — Updated Brief

*Supersedes the "Tech stack" and "Notifications" sections of the original Daily Word Etymology App brief. Everything else in that brief (content pipeline, core loop, screen structure, favorites/history model, out-of-scope list) still applies unless noted below.*

## What changed and why

The product moves from a React Native + Expo mobile app to a website. The original hook — a native daily push notification — doesn't translate directly to the web, so the delivery mechanism changes too. Decisions made 2026-09-10:

| Decision | Chosen | Rejected alternatives |
|---|---|---|
| Delivery mechanism | **Email digest** — the day's word is emailed at the user's chosen hour | Web Push (iOS support too inconsistent, needs a backend anyway); no-push/habit-only (loses the core anticipation hook) |
| App feel | **Standard website** — regular responsive site, no install step | Progressive Web App (adds manifest/service-worker complexity not needed once push is off the table) |
| Tech stack | **Next.js** | Plain static HTML/CSS/JS (Next.js keeps a component-based structure similar to the RN app and makes it easy to add the small backend the email flow needs) |

## Scope changes this implies

**Email capture is now required.** The original v1 scope assumed no accounts and no backend. Email delivery breaks that slightly — the site needs to collect an email address and a preferred delivery hour, store them, and trigger a send at that hour daily. This is still lightweight (no passwords, no profiles, no social features) but it is a real backend, not zero backend:
- A small datastore for `{email, delivery_hour, created_at}` (e.g. Postgres via a managed service, or something as simple as a serverless KV store)
- A scheduled job (hourly cron) that sends that hour's subscribers their word
- A transactional email provider (e.g. Resend, Postmark, SendGrid) to actually send the mail
- An unsubscribe/preferences link in every email (basic email-sending hygiene, not full auth)

**Favorites/History stay local and decoupled from email.** There's no reason to tie browsing history and favorites to the email signup — those can still live entirely client-side (localStorage), exactly as the app planned with on-device storage. A visitor doesn't need to give an email at all to use Today/History/Favorites; email is only needed if they want the daily reminder. This preserves most of the "no accounts" simplicity.

**Notification permission step is dropped from onboarding.** The onboarding flow's "notification permission" screen becomes an "enter your email + pick delivery hour" step instead. The scroll-wheel hour picker concept carries over unchanged as a UI element.

**Native share sheet doesn't exist on web.** Sharing becomes the Web Share API where supported (mobile browsers), falling back to a "copy link" button on desktop.

## What's unchanged from the original brief

- Content pipeline: Wiktextract source, quality filtering, offline batch LLM rewrite into Origin / Journey / Related Words, generated in advance
- Core loop: daily word → open → sectioned story → optional favorite/share → joins history
- Navigation concept: Today / History, with Favorites as a filter within History, single shared Story View component
- Light/dark mode following system setting with manual override
- Out of scope for v1: user accounts beyond the lightweight email+hour signup, social features, gamification, monetization, theme/news-based selection, unrestricted "explore random"

## Open decisions for next stage

- Email provider choice (Resend / Postmark / SendGrid / other) and where the hourly send job runs (Vercel Cron pairs naturally with Next.js)
- Datastore choice for the email/hour list (Postgres, or something simpler like Vercel KV/Upstash given the tiny schema)
- Email template design — how much of the sectioned story appears inline in the email vs. a "read the full story" link back to the site
- Whether the site still needs a distinct "delivery hour" picker per user, or whether a handful of fixed send slots (e.g. every hour on the hour) is good enough given email delivery is less time-sensitive than a push notification
- Domain/hosting (Vercel is the natural fit for Next.js)

## Risks added by this pivot

- Email deliverability (spam filters, inbox placement) replaces "notification fatigue" as the main engagement risk — a word that lands in Promotions/Spam never gets opened
- The "tap notification → open app" moment that anchors the original hook becomes "open email → click through to site," a slightly longer path that may reduce day-2+ open rates versus the native version
