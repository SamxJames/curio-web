# Weekly dig gate readout

Approved design (2026-11-22): email the 12-04 gate numbers to `DIG_ALERT_TO` on Mondays and on 2026-12-04, from the existing 09:00 UTC `send-daily` cron. No new cron slot (Hobby allows two, both used) and no new secrets (Actions has no Resend or app-Upstash secret; the Vercel function already has both).

- `lib/dig/gate.ts` (pure): `isGateReadoutDay`, `gateDates`, `summarizeGate`, `buildGateReadoutMessage`. Gate definition from `docs/handover/dig.md` "The kill line": >=200 first-time finishers, day-7 return >=15%, share >=15%.
- `lib/dig/gateReadout.ts` (server): `runGateReadout(now)`: day lock, read cohorts + funnel, send. Never throws.
- `lib/email.ts`: `sendGateReadout`, same shape as `sendDigAlert`. `lib/digestRuns.ts`: `gate` channel.
- `app/api/cron/send-daily/route.ts`: `after(() => runGateReadout(now))` on scheduled/forced runs, not `?resend=failed` or `?repost=`.
- Also: `directory` added to `TRAFFIC_SOURCES`/`TAGGED` for the directory-listing pipeline (`?utm_source=directory`).
- Tests: `lib/dig/gate.test.ts`, `lib/dig/gateReadout.test.ts`, route tests, `lib/traffic.test.ts`.
- Not verified live: the first real email (next send is Mon 2026-11-23 09:00 UTC; check the Resend dashboard and Vercel logs for `[curio:gate-readout]`).
