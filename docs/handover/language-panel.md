# Curio: language panel

> Split out of handover.md on 2026-10-05, text unchanged. "Below"/"above" references may point to a sibling file in docs/handover/. Data model and the owner-reviewed facts -> draft -> review -> approve pipeline.



## Language panel (2026-10-04)

On Collection, after tapping a language chip, an "About {language}" link opens an inline panel (`components/LanguagePanel.tsx`) with a dot map (where), a lifespan bar on a shared timeline (when), speakers (the recorded figure and the year it is "as of", or an honest "no reliable count"), the family path, and a short origin with a "Source: Wikipedia" link. Plan and per-task ledger: `docs/superpowers/plans/2026-10-04-language-panel.md` and `.superpowers/sdd/2026-10-04-language-panel/`.

### Data model

`lib/languages/types.ts` defines `LanguageSheet`: `name` (exactly as in word lineages), `aliases`, `status` (`living | extinct | historical | reconstructed`; historical = an earlier stage of a language still spoken, such as Old English), `classification`, `region`, `map` (`{lat, lon, radiusKm}` or null), `era` (`from`, `to` null = still spoken, optional `writtenUntil` tail, `approximate`; or null when dates are unknown), `peakSpeakers` (`{count, year, note?}` or null; the field name is historical, it holds the recorded Wikidata figure as of that year, not necessarily a peak), `unknownSpeakersNote` (required when `peakSpeakers` is null), `parent` (canonical name or null), `origin`, `sourceUrl` and `approved`. `lib/languages/validate.ts` checks shape and meaning and never throws on malformed model output.

### The pipeline, in order

All commands run from the repo root. Network scripts are never run in tests; tests cover only the pure parsing and validation.

1. `npm run languages:facts` (flags `--only "A,B"`, `--limit N`, `--refresh`). Fetches, for each lineage language (most-used first), the Wikipedia REST summary, the plain-text lead section (`wikipedia.lead`, from the action API extracts, capped at 4,000 characters at a sentence end) and Wikidata claims (coordinates, inception, dissolved, speaker count with its year, instance-of, plus subclass-of and indigenous-to, resolved to English `parentLabels` and `regionLabels`). Title matching: `Proto-*` names try `{Name}` then `{Name} language`; other names try `{Name} language` then `{Name}`; a summary is accepted only if it is about a language and its normalised title (lowercase, one trailing " language"/" languages" removed) equals the requested name (so Proto-West Germanic no longer lands on "West Germanic languages"). If no candidate matches, the first usable page is still kept and drafted, but stored with `wikipedia.titleMatched: false`; `pageProblems` then adds a problem (`the Wikipedia page "<title>" does not match the language name "<name>" — check it is the same language`) so the owner decides whether it is the same language. Older facts files have no `titleMatched` and are not flagged. Writes `content/languages/facts/<slug>.json`. Resumable (skips existing files; `--refresh` re-fetches). A 404 counts as "no facts". A transient failure (429 or 5xx after one retry, other statuses, network errors) writes no file, so a re-run retries it. No API key needed. Facts files fetched before this change lack the lead and labels: re-run `npm run languages:facts -- --refresh` to enrich them, then re-draft.
2. `npm run languages:draft` (flags `--only`, `--limit`). Reads facts files that have no draft yet and asks Claude to write a sheet using only those facts. Needs `ANTHROPIC_API_KEY` in `.env.local` (loaded with `tsx --env-file`; never logged). Writes `content/languages/drafts/<slug>.json` with `approved: false`. A language with no Wikipedia facts is skipped. Unparseable output writes nothing, so a re-run retries it.
3. `npm run languages:review`. Writes `content/languages/review.html` (gitignored), one card per draft with every field, its problems in red and a "Fetched facts" block to check it against (including the parent and region labels and the Wikipedia lead in a collapsed details element). The owner reads it in a browser.
4. `npm run languages:approve -- --all-valid` or `-- --only "Latin,Old French"`. Validates, refuses anything invalid, merges alias-named drafts under the canonical name, then writes `lib/languages/data.ts` and the generated name index `lib/languages/sheetIndex.ts`, and sets `approved: true` in the approved draft files. It exits 1 if anything was refused or a named draft is missing, and leaves the files untouched if nothing was approved.

Also: `npm run languages:map` regenerates the map dots (see below). It is dev-only and rarely needs re-running.

### The draft call

Model `claude-sonnet-5-5`, thinking on (the default), `output_config.effort: "medium"`, `max_tokens` 8000 (thinking tokens count against it). The server-side refusal fallback is on (`fallbacks: "default"` with the beta header `server-side-fallback-2026-07-01`), so only a refusal by the whole chain, or a `max_tokens` cut-off, fails a language. Token usage is counted even for failed calls.

### The review gate

`parseDraftResponse` (`lib/languages/draftPrompt.ts`) forces `name`, `aliases` and `sourceUrl` from the facts and sets `approved: false`. It puts a draft into `_problems` when:

- validation fails;
- `peakSpeakers.count` has no speaker-count fact behind it, or differs from the fact;
- `peakSpeakers.year` differs from the fact's year, or the fact has no year;
- `era.from` is more than 50 years from the inception fact, or `era.to` more than 50 years from the dissolved fact (or `to` is null while the facts give an end date);
- the map centre is more than 1,500 km from the fact coordinates;
- `parent` is not a lineage language;
- the facts' Wikipedia page does not look like a language page (a disambiguation page is never kept as facts at all).

Reconstructed languages (all `Proto-*`, plus any the facts mark so) get `peakSpeakers: null` and the fixed note "Reconstructed by scholars. Never written down."

An owner must clear `_problems` before approving: fix the draft JSON against the "Fetched facts" block, delete its `_problems` key and re-run `languages:review`. Deleting `_problems` does not hide anything: the checks run again at both later steps. `languages:review` re-runs `factProblems` (exported from `draftPrompt.ts`) against the facts file and shows its problems in red, and `languages:approve` loads `content/languages/facts/<same basename>.json` and refuses a draft whose `factProblems` is non-empty, even with `--all-valid`. It also refuses any draft that still has `_problems`. To accept a known mismatch on purpose, add a non-empty string `_override` to the draft JSON giving your reason. `_override` is never copied into `data.ts`. To hold a draft back on purpose (no reliable source), add a non-empty `_skip` reason instead: `--all-valid` lists it as SKIPPED without counting it as a refusal.

### Honesty rules

- Never invent facts. Prose and numbers come only from the fetched facts. An unknown speaker count means `peakSpeakers: null`, and the panel shows `unknownSpeakersNote`, never a guess.
- Only sheets with `approved: true` render, and only they get an "About" link. Languages without one behave as before.
- `familyPath` (`lib/languages/lookup.ts`) follows only approved sheets, so ancestors come only from approved sheets; the steps after it come from your favourites' word lineages.
- Counts in the panel are about the reader's own favourites ("3 of your favourites passed through Latin"). No totals, no "you haven't seen". This is the "archive, never backlog" rule.
- Attribution: every sheet has a Wikipedia `sourceUrl`, shown in the panel, and `/attribution` credits the language facts (CC BY-SA).

### Aliases and skip list

Both are in `lib/languages/facts.ts`. `ALIASES` merges lineage spellings under one canonical name: Kiswahili -> Swahili, Ottoman -> Ottoman Turkish, Old Provençal -> Old Occitan. `SKIP` never gets a sheet: English, Translingual, "Phrygian or Anatolian", Indian English, Late Middle English. Add to these before running `languages:facts` if more duplicate names turn up, and check first that the two names really are one language (Lombardic -> Lombard was wrong and was removed on 2026-10-09: Lombardic is Germanic, Lombard is Romance).

### Bundle weight and lazy loading

- Never hand-edit `lib/languages/data.ts` or `lib/languages/sheetIndex.ts`. Only `languages:approve` writes them, and they can drift apart if edited by hand (the failure is quiet).
- `CollectionScreen` imports only `sheetIndex` (names only), to decide whether to show the "About" link. The panel (`components/LanguagePanel.tsx`) loads with `next/dynamic` on first press, and it imports `data.ts`. The map dots load by dynamic `import()` from inside the panel. So Collection's first load carries no sheets and no dots, and `/collection` stays static.
- The map dots (`lib/languages/mapDots.ts`) are 6,842 dots, about 72 KB, sampled onto a 1.5 degree grid from Natural Earth 110m land (via `world-atlas`, public domain) by `scripts/languages/buildMapDots.ts`. `d3-geo`, `topojson-client` and `world-atlas` are devDependencies, used only by that script. Nothing in `app/` or `components/` may import them.
- Pure helpers (timeline position, map projection and highlight, alias lookup, family path, panel view-model) live in `lib/languages/` and are unit-tested.

### Current state

**58 approved sheets in `data.ts` (2026-10-09).** These are the 60 most-used lineage languages minus two held back with a `_skip` reason because no reliable source exists:
- Proto-West Germanic: the only Wikipedia match is the West Germanic *group* page.
- Old Italian: the only match is the modern Italian page, which says nothing about Old Italian.

The owner asked Claude to do the review for both batches (29 sheets on 2026-10-05, 29 more on 2026-10-09). Claude checked every date, parent, status, region and speaker figure against the Wikipedia lead and Wikidata facts. Corrections and `_override` reasons are in `content/languages/drafts/`. The rules the reviews settled:
- `era.to: null` ("still spoken today") only for living languages. No open-ended era for anything else.
- `parent` is the nearest ancestor the facts name (Middle French -> Old French, Gaulish -> Proto-Celtic). Never the modern language that a stage belongs to (Biblical Hebrew's parent is not Hebrew), and null when the facts name no ancestor.
- `era.from` is the earliest date the facts give for this language. An ancestor's date is not borrowed (Norwegian has no dates, not Old Norse's 800).
- `writtenUntil` stays null unless the facts say the language is still written after speech ended (only New Latin has one).

Main corrections in batch 1:
- Persian's era starts at about 800 (New Persian), not Old Persian's 550 BCE.
- Middle French's parent is Old French, not French.
- The Latin varieties are `extinct`.
- Sanskrit is `living` (it has a census of native speakers).
- Open-ended eras were removed from non-living languages.

Main corrections in batch 2:
- Koine Greek, Biblical Hebrew and Middle Persian were drafted as still spoken. Koine Greek is now about 300 BCE to 500 CE (it became Medieval Greek), Biblical Hebrew about 1000 BCE to 70 CE (end of the Second Temple period), and Middle Persian has no dates, because its facts give none.
- New Latin is `extinct`, spoken about 1300 to 1820 (Latin was a common tongue in the Austrian Empire "at least until the 1820s"), with a still-written tail.
- Ottoman Turkish ended in 1999 in the draft. It is now 1922, the end of the Ottoman Empire. The lead says only "14th to 20th centuries", so this is the one year taken from outside the facts.
- Scots now has a dated count: 1.5 million people able to speak it, from the 2022 census. Wikidata's figure has no year, and the lead dates it (`_override`).
- Parents: Hebrew was Proto-Semitic (not in the facts) and is now none; Biblical Hebrew (was Hebrew) and Ottoman Turkish (was Turkish) are now none; Gaulish -> Proto-Celtic, Occitan -> Old Occitan and Germanic -> Proto-Germanic were added from the facts.
- "Still written today" tails were removed from living languages, matching batch 1.
- Byzantine Greek (page "Medieval Greek"), New Latin (page "Neo-Latin") and Middle High German (a chronolect page) have the right articles and are accepted with `_override`.
- **Alias bug fixed.** `ALIASES` mapped Lombardic -> Lombard, but they are different languages. Lombardic is the Germanic language of the Lombards (behind gnocchi, stucco and balcony), and Lombard is a Romance language (behind artichoke and celery). The alias is gone, so the Lombard sheet no longer claims Lombardic, which will get its own sheet in a later batch.

**Humanizer pass (2026-10-09)** on the prose of all 58 sheets (`classification`, `region`, `origin`, the speaker notes): no em or en dashes (year ranges use "to"), no puffery or AI vocabulary ("notably", "rich"), no first person ("our sources"), no vague attributions the facts don't make, and no added glosses. No fact, date, number or name changed. The reconstructed note is now "Reconstructed by scholars. Never written down." and the panel's status line is "reconstructed by scholars, never written down". The draft prompt now asks for a plain reference-book register and forbids dashes, so later drafts start cleaner.

The review of batch 1 found two data-model bugs, still fixed and tested:
- `era.to: null` ("still spoken today") is valid only for living languages.
- `writtenUntil: null` used to draw a "still written today" tail on every timeline. Now only an actual year does.

Coverage now: 37 of 58 sheets have dates, 52 have a map, 34 have a parent and 22 have a speaker count. Some panels honestly say "Dates unknown", among them Latin, French, Italian, Hindi and Norwegian, because their Wikipedia leads give no start year.

**Next batches.** Run `languages:facts -- --limit N` (it takes the next N most-used languages that have no facts file yet), then draft, review and approve, as above. To hold back a draft that has no reliable source, add a non-empty `_skip` reason to it: `--all-valid` then lists it as SKIPPED and still exits 0, and naming it with `--only` refuses it. Next by usage: Old Irish, Old Saxon, Russian, Tamil, Andalusian Arabic, Classical Persian, Danish. Lombardic is now its own language. Deferred minor items are in the SDD ledger (`progress.md`).

### Verification

Batch 2 and the humanizer pass (2026-10-09) were checked by lint, the full test suite and a production build only, not in a browser. The panel code did not change apart from the reconstructed status line.

**Checked 2026-10-05 on a local dev server** (port 3100, from the branch) at 375px, with the real sheets. The favourites test used words added to local storage only, so nothing was synced to the owner's account; they were restored afterwards.

| Language | What it checked | Result |
|---|---|---|
| Proto-Indo-European | reconstructed | Dot map lit over the Pontic–Caspian steppe; dashed timeline 4500–2500 BCE; "Reconstructed by scholars" |
| Middle Dutch | `map: null` | No map; 1150–1500 |
| Latin | `era: null` | Map with Latium lit; "Dates unknown"; "7.5M as of 1 CE" |

Other results:
- No horizontal overflow.
- The "About" link appeared only for approved sheets.
- The sheet text sits only in the lazy panel chunk, not in `/collection`'s 10 initial chunks.

**Desktop width was not checked**, because the browser pane was phone-width. The panel lives in Collection's fixed-width column, so this is low risk.

**Follow-up idea:** at the 1.5° grid, a small region such as Latium (100 km) lights a single dot. A finer grid for zoomed views would make maps of small regions read better.
