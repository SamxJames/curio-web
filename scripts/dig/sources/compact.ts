// Streams the raw Wiktextract dump (gzipped JSONL, ~25 GB unpacked) into an English-only
// JSONL holding just the fields the dig pipeline needs (about 240 MB, about 2.5 minutes).
import { createReadStream, createWriteStream } from "node:fs";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";

export type CompactEntry = { w: string; pos: string; t: string[]; c: string[]; g: string[]; e: string[]; f: string[]; n: number; et: string };

type RawCategory = string | { name?: string };
type RawEntry = {
  word?: string; lang_code?: string; pos?: string; categories?: RawCategory[];
  senses?: { topics?: string[]; tags?: string[]; categories?: RawCategory[] }[];
  etymology_templates?: { name: string; args?: Record<string, string> }[];
  forms?: { form?: string; tags?: string[] }[]; etymology_text?: string;
};

const catName = (c: RawCategory) => (typeof c === "string" ? c : c?.name) ?? "";
const keepCat = (n: string) =>
  /^en:/i.test(n) ||
  /^English terms (borrowed|derived|inherited) from /.test(n) ||
  /^English (learned|semi-learned|orthographic) borrowings from /.test(n);
const ETY = new Set(["bor", "bor+", "der", "der+", "lbor", "inh", "inh+", "slbor", "obor", "ubor", "calque", "cal", "translit", "lbor+"]);
const KEEP_TAGS = new Set(["obsolete", "archaic", "rare", "dialectal", "slang", "vulgar", "offensive", "derogatory", "proscribed", "misspelling", "alt-of", "form-of", "abbreviation", "initialism"]);

export function compactEntry(raw: unknown): CompactEntry | null {
  const e = raw as RawEntry;
  if (!e || e.lang_code !== "en" || !e.word) return null;
  const topics = new Set<string>(), cats = new Set<string>(), tags = new Set<string>();
  for (const c of e.categories ?? []) { const n = catName(c); if (keepCat(n)) cats.add(n); }
  for (const s of e.senses ?? []) {
    (s.topics ?? []).forEach((t) => topics.add(t));
    (s.tags ?? []).forEach((t) => tags.add(t));
    for (const c of s.categories ?? []) { const n = catName(c); if (keepCat(n)) cats.add(n); }
  }
  const ety: string[] = [];
  for (const t of e.etymology_templates ?? []) {
    if (ETY.has(t.name) && t.args?.["1"] === "en" && t.args["2"]) ety.push(`${t.name}:${t.args["2"]}`);
  }
  const forms = (e.forms ?? [])
    .filter((f) => f.form && f.tags?.some((t) => ["plural", "alternative", "standard-spelling"].includes(t)))
    .map((f) => f.form!)
    .slice(0, 6);
  return {
    w: e.word, pos: e.pos ?? "", t: [...topics], c: [...cats], g: [...tags].filter((x) => KEEP_TAGS.has(x)),
    e: ety, f: forms, n: (e.senses ?? []).length, et: (e.etymology_text ?? "").slice(0, 300),
  };
}

export async function compactDump(input: string, output: string): Promise<{ lines: number; kept: number }> {
  const out = createWriteStream(output);
  const gz = createGunzip();
  const rl = createInterface({ input: createReadStream(input).pipe(gz), crlfDelay: Infinity });
  let lines = 0, kept = 0;
  const failed = new Promise<never>((_, reject) => gz.on("error", reject));
  const done = (async () => {
    for await (const line of rl) {
      lines++;
      if (!line.includes('"lang_code": "en"') && !line.includes('"lang_code":"en"')) continue;
      let parsed: unknown;
      try { parsed = JSON.parse(line); } catch { continue; }
      const c = compactEntry(parsed);
      if (c) { out.write(JSON.stringify(c) + "\n"); kept++; }
    }
  })();
  await Promise.race([done, failed]);
  await new Promise<void>((resolve) => out.end(resolve));
  return { lines, kept };
}

export async function* readCompact(path: string): AsyncIterable<CompactEntry> {
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of rl) if (line) yield JSON.parse(line) as CompactEntry;
}
