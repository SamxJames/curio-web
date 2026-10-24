# Phase 3 measurement scripts (prototype)

These are the throwaway scripts behind the numbers in `../pipeline-design.md` §3, kept so the measurement can be
repeated. They are a **prototype**, not the pipeline: Phase 5/6 rebuilds them as tested `scripts/dig/*`.

**Data** lives outside the repo, in `Curio/data/`:
- `wiktextract/raw-wiktextract-data.jsonl.gz` (from kaikki.org, 3.1 GB)
- `oewn/english-wordnet-2025.xml.gz`
- `wordfreq/large_en.msgpack.gz`
- `derived/en-compact.jsonl`

**Scripts**
- `compact.mjs` streams the dump into the compact English file. It takes about 2.3 minutes.
- `measure.mts` (run with tsx) measures how many themes and origin prompts are viable.
- `letters.mjs` counts letter variants.

The file paths inside the scripts are absolute paths on Sam's machine. Phase 6 makes them configurable.
