// Dig word audit: WHY a guess is refused (docs/dig-word-audit.md). Rebuilds every prompt's answer
// list exactly as scripts/dig/build.ts does (no days, no pageviews, no Redis), probes the guesses
// with the real matcher, and names the first pipeline gate that drops each refused word.
//   NODE_USE_ENV_PROXY=1 npx tsx --max-old-space-size=8192 scripts/dig/audit/diagnose.ts --data <dig-data> --out <dir> [--live before.json]
// Output holds answers: write it outside the repo.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { guessForms, normalizeKey } from "../../../lib/dig/normalize";
import { buildLookup, checkGuess } from "../../../lib/dig/match";
import { tierFromZipf } from "../../../lib/dig/score";
import { WORDS } from "../../../lib/words";
import { createFetcher } from "../../demand/http";
import { loadWordfreq } from "../sources/wordfreq";
import { loadOewn } from "../sources/oewn";
import { readCompact } from "../sources/compact";
import { fetchWikidataLabels } from "../sources/wikidata";
import { indexWiktionary } from "../wiktionary";
import { buildLexicon } from "../lexicon";
import { loadCatalogue } from "../catalogue";
import { letterVariants, wikidataThemeCandidates, wordnetThemes, type Candidate } from "../themes";
import { originCandidates } from "../origins";
import { buildAliases, buildGuard, finishCandidate, floorProblems, hasBlockedWord } from "../answers";
import { assignFamilies } from "../assemble";
import { etymologySentence, fold } from "../fossil";
import { parseGuesses } from "./probe";

const flag = (args: string[], name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

async function main() {
  const args = process.argv.slice(2);
  const data = flag(args, "--data")!, outDir = flag(args, "--out")!;
  mkdirSync(outDir, { recursive: true });
  const zipf = loadWordfreq(path.join(data, "wordfreq", "large_en.msgpack.gz"));
  const wn = loadOewn(path.join(data, "oewn", "english-wordnet-2025.xml.gz"));
  const blocked = new Set(readFileSync(path.join(data, "ldnoobw", "en.txt"), "utf8").split(/\r?\n/).map((l) => l.trim().toLowerCase()).filter(Boolean));
  const index = await indexWiktionary(readCompact(path.join(data, "derived", "en-compact.jsonl")), blocked);
  const lexicon = buildLexicon(zipf, index.info.keys());
  const guardLexicon = buildLexicon(new Map([...zipf].filter(([, z]) => z >= 2)), []);
  const cat = loadCatalogue(flag(args, "--catalogue"));
  const curioLineage = new Map(WORDS.map((w) => [w.word.toLowerCase(), w.lineage]));
  const wdThemes: { theme: (typeof cat.wikidataThemes)[number]; labels: Set<string> }[] = [];
  const wikidataFetcher = createFetcher({ minGapMs: 1000, attempts: 2 });
  for (const theme of cat.wikidataThemes) {
    try {
      const r = await fetchWikidataLabels(theme, { fetcher: wikidataFetcher, cacheDir: path.join(data, "cache", "wikidata"), now: new Date() });
      if (r.labels) wdThemes.push({ theme, labels: r.labels });
      console.log(`wikidata ${theme.id}: ${r.status}`);
    } catch { console.log(`wikidata ${theme.id}: failed`); }
  }
  const withExtras = (c: Candidate): Candidate => finishCandidate(c, { cat, blocked, index, zipf });
  const fctx = { wn, index, zipf };
  const rawThemes = [...wordnetThemes(wn, index, zipf, cat), ...wikidataThemeCandidates(wdThemes, index, zipf)];
  const baseThemes = assignFamilies(rawThemes.map(withExtras));
  const letters = baseThemes.flatMap((t) => letterVariants(t, zipf)).map(withExtras);
  const rawOrigins = originCandidates(index, zipf, cat, curioLineage);
  const origins = rawOrigins.map(withExtras);
  const allCands = [...baseThemes, ...letters, ...origins];
  const byId = new Map(allCands.map((c) => [c.id, c]));
  const preBlock = new Map([...rawThemes, ...rawOrigins].map((c) => [c.id, c]));

  const summary = allCands.map((c) => ({ id: c.id, text: c.text, core: c.core.length, accepted: c.accepted.length, problems: floorProblems(c, fctx), anchor: c.anchor, broad: undefined }));
  writeFileSync(path.join(outDir, "candidates.json"), JSON.stringify(summary, null, 1));
  console.log(`candidates ${allCands.length}; publishable ${summary.filter((s) => !s.problems.length).length}`);

  const secretOf = (c: Candidate) => {
    const aliases = buildAliases(c.accepted, index, wn);
    const core = new Set(c.core);
    return { answers: c.accepted.map((w) => [w, tierFromZipf(zipf.get(w)), core.has(w) ? 1 : 0] as [string, ReturnType<typeof tierFromZipf>, 0 | 1]), aliases, guard: buildGuard(c.accepted, aliases, guardLexicon) };
  };

  const liveFile = flag(args, "--live");
  const live = new Map<string, string>();
  if (liveFile && existsSync(liveFile)) for (const r of JSON.parse(readFileSync(liveFile, "utf8"))) live.set(`${r.id}|${r.guess}`, r.kind);

  const names = (w: string, lang: string) => {
    const s = fold(etymologySentence(index.info.get(w)?.etymology ?? ""));
    return !s || s.includes(fold(lang.split(" ").at(-1)!));
  };
  const RANK = ["accepted-now", "cap", "letter", "excluded", "blocklist-word", "origin-etymology-check", "obsolete", "offensive-rule", "tags-not-ok", "no-lowercase-entry"];

  function why(c: Candidate, guess: string): { reason: string; detail: string } {
    const key = normalizeKey(guess);
    const forms = guessForms(key);
    const parent = byId.get(c.base) && c.id !== c.base && c.id.startsWith(c.base) ? byId.get(c.id.split(":").slice(0, 2).join(":"))! : c;
    const pre = preBlock.get(parent.id) ?? parent;
    const acceptedKeys = new Set(c.accepted.map(normalizeKey));
    const hits: { reason: string; detail: string }[] = [];
    pre.sources.forEach((src, si) => {
      for (const w of src) {
        if (!forms.includes(normalizeKey(w))) continue;
        const info = index.info.get(w);
        const srcName = c.kind === "origin" ? (si % 2 ? "template" : "category") : si ? (c.anchor.startsWith("wikidata") ? "wiktionary" : "wordnet") : (c.anchor.startsWith("wikidata") ? "wikidata" : "wiktionary");
        const d = `${w} [${srcName}] zipf ${zipf.get(w)?.toFixed(1) ?? "-"}`;
        let reason: string;
        if (acceptedKeys.has(normalizeKey(w))) reason = "accepted-now";
        else if (!info) reason = "no-lowercase-entry";
        else if (!info.ok) reason = "tags-not-ok";
        else if (info.offensive) reason = "offensive-rule";
        else if (info.obsolete && !zipf.has(w)) reason = "obsolete";
        else if (hasBlockedWord(w, blocked)) reason = "blocklist-word";
        else if (c.kind === "origin" && !c.languages.some((l) => names(w, l))) reason = "origin-etymology-check";
        else if (c.excluded?.has(normalizeKey(w))) reason = "excluded";
        else if (c !== parent && w[0] !== c.id.split(":").at(-1)) reason = "letter";
        else reason = "cap";
        hits.push({ reason, detail: d });
      }
    });
    if (hits.length) return hits.sort((a, b) => RANK.indexOf(a.reason) - RANK.indexOf(b.reason))[0];
    const words = guess.trim().split(/[\s-]+/).length;
    const inLex = forms.some((f) => lexicon.has(f));
    const z = forms.map((f) => zipf.get(f)).find((x) => x !== undefined);
    if (!inLex) return { reason: words > 1 ? "phrase-not-in-dictionary" : "not-in-dictionary", detail: "" };
    const wnNoun = forms.some((f) => (wn.synsetsOf.get(f) ?? []).some((id) => wn.synsets.get(id)?.pos === "n"));
    const hasEntry = forms.some((f) => index.info.has(f));
    return { reason: "not-in-sources", detail: `zipf ${z?.toFixed(1) ?? "-"} wordnet-noun ${wnNoun} wiktionary-entry ${hasEntry}` };
  }

  const guesses = parseGuesses(readFileSync(flag(args, "--guesses") ?? path.join("scripts", "dig", "audit", "guesses.txt"), "utf8"));
  const rows: unknown[] = [];
  const reverse: Record<string, unknown> = {};
  for (const [id, list] of guesses) {
    const c = byId.get(id);
    if (!c) { console.log(`${id}: no candidate`); continue; }
    const secret = secretOf(c);
    const lookup = buildLookup(secret);
    for (const { guess, shouldReject } of list) {
      const r = checkGuess(lookup, guess);
      const hit = r.kind === "match" || r.kind === "near" ? secret.answers[r.index] : undefined;
      const w = r.kind === "match" ? { reason: "", detail: "" } : why(c, guess);
      rows.push({ id, guess, shouldReject, live: live.get(`${id}|${guess}`) ?? null, fresh: r.kind, hit: hit?.[0], tier: hit?.[1], ...w });
    }
    // Reverse audit and filter losses for this prompt.
    const core = new Set(c.core), acc = new Set(c.accepted);
    const pre = preBlock.get(c.id) ?? c;
    const everydayNonCore = c.accepted.filter((w) => !core.has(w) && (zipf.get(w) ?? 0) >= 4.5).sort((a, b) => zipf.get(b)! - zipf.get(a)!);
    const strictOffensive = c.accepted.filter((w) => index.info.get(w)?.strictOffensive);
    const noFreq = c.accepted.filter((w) => !zipf.has(w)).length;
    const lost: Record<string, string[]> = {};
    const seen = new Set<string>();
    for (const src of pre.sources) for (const w of src) {
      if (seen.has(w) || acc.has(w) || acceptedKeysHas(acc, w)) continue;
      seen.add(w);
      if ((zipf.get(w) ?? 0) < 3.5) continue;
      const { reason } = why(c, w);
      (lost[reason] ??= []).push(w);
    }
    reverse[id] = { text: c.text, accepted: c.accepted.length, core: c.core.length, noFreq, everydayNonCore, strictOffensive, lost, excluded: [...(c.excluded ?? [])], hidden: [...(c.hidden ?? [])], obvious: c.obvious?.length ?? 0 };
  }
  writeFileSync(path.join(outDir, "rows.json"), JSON.stringify(rows));
  writeFileSync(path.join(outDir, "reverse.json"), JSON.stringify(reverse));
  // Full lists, so follow-up questions don't need another load.
  writeFileSync(path.join(outDir, "lists.json"), JSON.stringify(Object.fromEntries([...guesses.keys()].filter((id) => byId.has(id)).map((id) => { const c = byId.get(id)!; return [id, { core: c.core, accepted: c.accepted, tiers: c.accepted.map((w) => tierFromZipf(zipf.get(w))[0]) }]; }))));
}
function acceptedKeysHas(acc: Set<string>, w: string) { for (const f of guessForms(normalizeKey(w))) if (acc.has(f)) return true; return false; }

main().catch((e) => { console.error(e); process.exit(1); });
