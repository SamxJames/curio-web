import { normalizeKey } from "../../lib/dig/normalize";
import { buildLookup, checkGuess } from "../../lib/dig/match";
import { decodeDay, encodeDay } from "../../lib/dig/payload";
import { tierFromZipf } from "../../lib/dig/score";
import { historyFromManifest } from "../../lib/dig/keys";
import type { DigDayPlain } from "../../lib/dig/types";
import { daysBetween } from "./assemble";
import { buildGuard } from "./answers";
import type { DigSink } from "./sink";
import { ACCEPTED_CAP, type Candidate } from "./themes";
import { MAX_DAY_CHARS } from "./validate";

type JudgeCtx = { lexicon: Set<string>; usable: (w: string) => boolean; blocked: Set<string> };

/** pipeline-design §11: a person proposed it, so one strong source is enough, but it must
 * be a real, usable, unblocked English word. Returns the source's spelling. */
export function judge(guess: string, c: Candidate, ctx: JudgeCtx): string | null {
  const key = normalizeKey(guess);
  if (!key || !ctx.lexicon.has(key) || ctx.blocked.has(key)) return null;
  for (const source of c.sources) for (const w of source) {
    if (normalizeKey(w) === key && ctx.usable(w) && !ctx.blocked.has(w)) return w;
  }
  return null;
}

const LOG_DAYS = 35;
/** At most this many guesses are judged per prompt per run (the top-ranked); the rest wait for the next run. */
export const JUDGE_PER_PROMPT = 20;
/** Judged marks older than this are dropped on write. Re-judging is harmless: judge() is deterministic. */
const MARK_KEEP_DAYS = 40;

/** Reads and decodes one stored day. A corrupt day is a hard failure. The message names the
 * date only, because JSON parse errors can quote the file's content. */
async function readPlainDay(sink: DigSink, date: string): Promise<DigDayPlain | null> {
  try {
    const stored = await sink.readDay(date);
    return stored ? decodeDay(stored) : null;
  } catch {
    throw new Error(`adjudicate: day ${date} unreadable`);
  }
}

export async function adjudicate(
  sink: DigSink,
  candidates: Map<string, Candidate>,
  ctx: JudgeCtx & { today: string; zipf: Map<string, number> }
): Promise<{ judged: number; accepted: number; amendedDays: number; skippedOversize: number }> {
  const history = historyFromManifest(await sink.readManifest());
  const done = await sink.readAdjudicated(ctx.today);
  const extras = await sink.readExtras();
  // Aggregate rejected (count ≥ 2) and claimed (any) guesses per prompt id.
  const tallies = new Map<string, Map<string, { rej: number; claim: number }>>();
  for (const h of history) {
    const age = daysBetween(h.date, ctx.today);
    if (age <= 0 || age > LOG_DAYS) continue;
    for (const [index, p] of h.prompts.entries()) {
      for (const kind of ["rej", "claim"] as const) {
        for (const [guess, n] of Object.entries(await sink.readLog(kind, h.date, index))) {
          const byGuess = tallies.get(p.id) ?? new Map();
          const t = byGuess.get(guess) ?? { rej: 0, claim: 0 };
          t[kind] += n;
          byGuess.set(guess, t);
          tallies.set(p.id, byGuess);
        }
      }
    }
  }
  let judged = 0, accepted = 0;
  const newlyAccepted = new Map<string, string[]>();
  for (const [promptId, byGuess] of tallies) {
    const c = candidates.get(promptId);
    if (!c) continue;
    // Claims on words the prompt already has never reach the cap or the judge (claims are unauthenticated).
    const acceptedKeys = new Set(c.accepted.map(normalizeKey));
    // Most-guessed first, then alphabetical, so the cap always keeps the same words.
    const ranked = [...byGuess].filter(([guess]) => !acceptedKeys.has(normalizeKey(guess))).sort(
      ([ga, a], [gb, b]) => (b.rej + b.claim) - (a.rej + a.claim) || (ga < gb ? -1 : ga > gb ? 1 : 0)
    );
    // `c.accepted` already includes the extras (build.ts merges them), so only words accepted
    // earlier in this run are added to it for the cap check.
    let acceptedHere = 0, judgedHere = 0;
    for (const [guess, t] of ranked) {
      if (t.claim < 1 && t.rej < 2) continue;
      if (c.accepted.length + acceptedHere >= ACCEPTED_CAP) break;
      if (judgedHere >= JUDGE_PER_PROMPT) break;
      const mark = `${promptId}|${normalizeKey(guess)}`;
      if (mark in done) continue;
      done[mark] = ctx.today;
      judged++;
      judgedHere++;
      const word = judge(guess, c, ctx);
      if (!word || (extras[promptId] ?? []).includes(word)) continue;
      extras[promptId] = [...(extras[promptId] ?? []), word];
      newlyAccepted.set(promptId, [...(newlyAccepted.get(promptId) ?? []), word]);
      accepted++;
      acceptedHere++;
    }
  }
  let amendedDays = 0, skippedOversize = 0;
  for (const h of history) {
    if (h.date === ctx.today) continue; // today's file is CDN-cached until rollover
    const ids = h.prompts.map((p) => p.id).filter((id) => newlyAccepted.has(id));
    if (!ids.length) continue;
    const plain = await readPlainDay(sink, h.date);
    if (!plain) continue;
    let changed = false;
    for (const p of plain.prompts) {
      let added = false;
      for (const w of newlyAccepted.get(p.id) ?? []) {
        // Never shadow: a word that already matches this prompt's answer, alias or plural key is not added.
        // The lookup is rebuilt per word, so two new words in one run cannot shadow each other.
        if (checkGuess(buildLookup(p), w).kind === "match") continue;
        p.answers.push([w, tierFromZipf(ctx.zipf.get(w)), 0]);
        added = true;
      }
      if (added) {
        p.guard = buildGuard(p.answers.map((a) => a[0]), p.aliases, ctx.lexicon);
        changed = true;
      }
    }
    if (!changed) continue;
    const encoded = encodeDay(plain);
    // An amended day over the cap is left as it was. Only the count is reported.
    if (JSON.stringify(encoded).length > MAX_DAY_CHARS) { skippedOversize++; continue; }
    await sink.writeDay(encoded);
    amendedDays++;
  }
  await sink.writeExtras(extras);
  const kept = Object.fromEntries(Object.entries(done).filter(([, date]) => daysBetween(date, ctx.today) <= MARK_KEEP_DAYS));
  await sink.writeAdjudicated(kept);
  return { judged, accepted, amendedDays, skippedOversize };
}
