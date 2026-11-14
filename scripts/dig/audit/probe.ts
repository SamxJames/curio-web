// Dig word audit harness (docs/dig-word-audit.md). Runs typical player guesses through the
// real matcher (lib/dig/match.ts) against real day files, and prints what was refused.
//   npx tsx scripts/dig/audit/probe.ts --days <dir of day JSON> [--guesses scripts/dig/audit/guesses.txt] [--json out.json]
// Day files are the /api/dig/day/<date> responses (or pipeline output). Never commit them: they hold answers.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildLookup, checkGuess } from "../../../lib/dig/match";
import { decodeDay } from "../../../lib/dig/payload";
import type { DigDay, DigPromptPlain } from "../../../lib/dig/types";

export type Probe = { id: string; guess: string; shouldReject: boolean; kind: string; hit?: string; tier?: string };

export function parseGuesses(text: string): Map<string, { guess: string; shouldReject: boolean }[]> {
  const out = new Map<string, { guess: string; shouldReject: boolean }[]>();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.startsWith("#")) continue;
    const [id, list] = line.split("|");
    out.set(id.trim(), list.split(",").map((g) => g.trim()).filter(Boolean).map((g) => ({ guess: g.replace(/^!/, ""), shouldReject: g.startsWith("!") })));
  }
  return out;
}

export function probePrompt(p: DigPromptPlain, guesses: { guess: string; shouldReject: boolean }[]): Probe[] {
  const lookup = buildLookup(p);
  return guesses.map(({ guess, shouldReject }) => {
    const r = checkGuess(lookup, guess);
    const a = r.kind === "match" || r.kind === "near" ? p.answers[r.index] : undefined;
    return { id: p.id, guess, shouldReject, kind: r.kind, hit: a?.[0], tier: a?.[1] };
  });
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function main() {
  const args = process.argv.slice(2);
  const dir = flag(args, "--days");
  if (!dir) throw new Error("--days <dir> is required");
  const guesses = parseGuesses(readFileSync(flag(args, "--guesses") ?? path.join("scripts", "dig", "audit", "guesses.txt"), "utf8"));
  // The latest day that ran each prompt wins.
  const prompts = new Map<string, DigPromptPlain>();
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    const day = decodeDay(JSON.parse(readFileSync(path.join(dir, f), "utf8")) as DigDay);
    for (const p of day.prompts) prompts.set(p.id, p);
  }
  const all: Probe[] = [];
  let good = 0, goodOk = 0;
  for (const [id, list] of guesses) {
    const p = prompts.get(id);
    if (!p) { console.log(`${id}: no day file has this prompt, skipped`); continue; }
    const res = probePrompt(p, list);
    all.push(...res);
    const fair = res.filter((r) => !r.shouldReject);
    const refused = fair.filter((r) => r.kind !== "match");
    const wrongIn = res.filter((r) => r.shouldReject && r.kind === "match");
    good += fair.length; goodOk += fair.length - refused.length;
    console.log(`${id}: ${fair.length - refused.length}/${fair.length} accepted`);
    if (refused.length) console.log(`   refused: ${refused.map((r) => r.guess + (r.kind === "near" ? ` (offers "${r.hit}")` : "")).join(", ")}`);
    if (wrongIn.length) console.log(`   wrongly accepted: ${wrongIn.map((r) => `${r.guess}→${r.hit}`).join(", ")}`);
  }
  console.log(`TOTAL: ${goodOk}/${good} fair guesses accepted (${((100 * goodOk) / good).toFixed(1)}%)`);
  const json = flag(args, "--json");
  if (json) writeFileSync(json, JSON.stringify(all));
}

if (process.argv[1]?.endsWith("probe.ts")) main();
