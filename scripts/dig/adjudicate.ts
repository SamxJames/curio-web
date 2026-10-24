import { normalizeKey } from "../../lib/dig/normalize";
import { decodeDay, encodeDay } from "../../lib/dig/payload";
import { tierFromZipf } from "../../lib/dig/score";
import { historyFromManifest } from "../../lib/dig/keys";
import { daysBetween } from "./assemble";
import type { DigSink } from "./sink";
import type { Candidate } from "./themes";

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

export async function adjudicate(
  sink: DigSink,
  candidates: Map<string, Candidate>,
  ctx: JudgeCtx & { today: string; zipf: Map<string, number> }
): Promise<{ judged: number; accepted: number; amendedDays: number }> {
  const history = historyFromManifest(await sink.readManifest());
  const done = new Set(await sink.readAdjudicated());
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
    for (const [guess, t] of byGuess) {
      if (t.claim < 1 && t.rej < 2) continue;
      const mark = `${promptId}|${normalizeKey(guess)}`;
      if (done.has(mark)) continue;
      done.add(mark);
      judged++;
      const word = judge(guess, c, ctx);
      if (!word || (extras[promptId] ?? []).includes(word)) continue;
      extras[promptId] = [...(extras[promptId] ?? []), word];
      newlyAccepted.set(promptId, [...(newlyAccepted.get(promptId) ?? []), word]);
      accepted++;
    }
  }
  let amendedDays = 0;
  for (const h of history) {
    if (h.date === ctx.today) continue; // today's file is CDN-cached until rollover
    const ids = h.prompts.map((p) => p.id).filter((id) => newlyAccepted.has(id));
    if (!ids.length) continue;
    const stored = await sink.readDay(h.date);
    if (!stored) continue;
    const plain = decodeDay(stored);
    let changed = false;
    for (const p of plain.prompts) for (const w of newlyAccepted.get(p.id) ?? []) {
      if (p.answers.some((a) => normalizeKey(a[0]) === normalizeKey(w))) continue;
      p.answers.push([w, tierFromZipf(ctx.zipf.get(w)), 0]);
      changed = true;
    }
    if (changed) { await sink.writeDay(encodeDay(plain)); amendedDays++; }
  }
  await sink.writeExtras(extras);
  await sink.writeAdjudicated([...done]);
  return { judged, accepted, amendedDays };
}
