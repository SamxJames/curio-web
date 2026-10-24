// Downloads the dig datasets into --data, re-downloading the Wiktextract dump only when
// kaikki.org's Last-Modified changes, then compacts it. Counts-only logging.
//   npm run dig:fetch -- --data dig-data
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { flagValue } from "../languages/cli";
import { compactDump } from "./sources/compact";
import { DIG_USER_AGENT } from "./sources/wikidata";

const SOURCES = {
  dump: "https://kaikki.org/dictionary/raw-wiktextract-data.jsonl.gz",
  // Checked with a HEAD request on 2026-10-24: /downloads/ answers 200; the /static/ path
  // only 301-redirects to it, so we use the final URL.
  oewn: "https://en-word.net/downloads/english-wordnet-2025.xml.gz",
  wordfreq: "https://raw.githubusercontent.com/rspeer/wordfreq/master/wordfreq/data/large_en.msgpack.gz",
  ldnoobw: "https://raw.githubusercontent.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words/master/en",
};

async function download(url: string, file: string) {
  mkdirSync(path.dirname(file), { recursive: true });
  const res = await fetch(url, { headers: { "User-Agent": DIG_USER_AGENT } });
  if (!res.ok || !res.body) throw new Error(`download failed: HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(file));
}

async function main() {
  const data = flagValue(process.argv.slice(2), "--data") ?? "dig-data";
  const dumpFile = path.join(data, "wiktextract", "raw-wiktextract-data.jsonl.gz");
  const compactFile = path.join(data, "derived", "en-compact.jsonl");
  const metaFile = path.join(data, "wiktextract", "meta.json");
  const head = await fetch(SOURCES.dump, { method: "HEAD", headers: { "User-Agent": DIG_USER_AGENT } });
  const lastModified = head.headers.get("last-modified") ?? "";
  const meta = existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, "utf8")) : {};
  if (!existsSync(compactFile) || meta.lastModified !== lastModified) {
    console.log("Wiktextract dump changed: downloading");
    await download(SOURCES.dump, dumpFile);
    mkdirSync(path.dirname(compactFile), { recursive: true });
    const { lines, kept } = await compactDump(dumpFile, compactFile);
    console.log(`Compacted ${lines} lines to ${kept} English entries`);
    rmSync(dumpFile); // the cache keeps only the compact file
    writeFileSync(metaFile, JSON.stringify({ lastModified }));
  } else console.log("Wiktextract dump unchanged");
  const files: [keyof typeof SOURCES, string][] = [
    ["oewn", path.join(data, "oewn", "english-wordnet-2025.xml.gz")],
    ["wordfreq", path.join(data, "wordfreq", "large_en.msgpack.gz")],
    ["ldnoobw", path.join(data, "ldnoobw", "en.txt")],
  ];
  for (const [k, file] of files) if (!existsSync(file)) { await download(SOURCES[k], file); console.log(`Downloaded ${k}`); }
}

main().catch((err) => { console.error(`dig:fetch failed: ${err instanceof Error ? err.message : "unknown"}`); process.exit(1); });
