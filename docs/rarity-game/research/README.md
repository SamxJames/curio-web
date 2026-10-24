# Phase 3 measurement scripts (prototype)

These are the throwaway scripts behind the numbers in `../pipeline-design.md` §3, kept so the measurement can be
repeated. They are a **prototype**, not the pipeline. The real pipeline is `scripts/dig/` (`npm run dig:fetch` and
`npm run dig:build`; see `docs/handover/dig.md`). Re-measure supply with the build's summary, not these scripts.

**Data** lives outside the repo, in `Curio/data/`:
- `wiktextract/raw-wiktextract-data.jsonl.gz` (from kaikki.org, 3.1 GB)
- `oewn/english-wordnet-2025.xml.gz`
- `wordfreq/large_en.msgpack.gz`
- `derived/en-compact.jsonl`

**Scripts**
- `compact.mjs` streams the dump into the compact English file. It takes about 2.3 minutes.
- `measure.mts` (run with tsx) measures how many themes and origin prompts are viable.
- `letters.mjs` counts letter variants.

The file paths inside these scripts are absolute paths on Sam's machine. The pipeline takes `--data <dir>` instead.
