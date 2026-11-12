/** The verdict log (digKeys.verdicts): for each wrong guess the game could not accept, why our
 * deterministic judge refused it and what an independent, blind AI reviewer made of it.
 * Written by scripts/dig/review.ts in shadow mode (it never changes an answer list); read by the
 * admin dashboard, so this file holds only types and pure helpers. */

/** Why scripts/dig/adjudicate.ts explainJudge said no ("accepted" is a yes). */
export type JudgeReason = "accepted" | "not-a-word" | "blocked" | "unusable" | "not-in-sources";

export type Confidence = "high" | "medium" | "low";
export type AiVerdict = { ok: boolean; conf: Confidence; reason: string };

export type Verdict = {
  /** The day this was last reviewed or its count refreshed, YYYY-MM-DD. */
  date: string;
  /** The prompt as players saw it ("Name a word from sailing"). */
  text: string;
  /** Times it was typed (wrong guesses plus claims) over the log window. */
  n: number;
  ours: JudgeReason;
  /** Null when the reviewer was not asked (nothing to ask: not a real word) or the call failed. */
  ai: AiVerdict | null;
};

/** "promptId|guess" (the guess as stored: lowercase, spaces and hyphens removed) → verdict. */
export type VerdictLog = Record<string, Verdict>;

const REASONS: readonly string[] = ["accepted", "not-a-word", "blocked", "unusable", "not-in-sources"];
const CONFS: readonly string[] = ["high", "medium", "low"];

/** Reads whatever is stored, keeping only well-formed entries: a bad entry must never break the admin page. */
export function parseVerdictLog(raw: unknown): VerdictLog {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: VerdictLog = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!v || typeof v !== "object") continue;
    const e = v as Record<string, unknown>;
    if (typeof e.date !== "string" || typeof e.text !== "string" || typeof e.n !== "number" || !REASONS.includes(e.ours as string)) continue;
    let ai: AiVerdict | null = null;
    if (e.ai && typeof e.ai === "object") {
      const a = e.ai as Record<string, unknown>;
      if (typeof a.ok === "boolean" && CONFS.includes(a.conf as string) && typeof a.reason === "string") ai = { ok: a.ok, conf: a.conf as Confidence, reason: a.reason };
    }
    out[k] = { date: e.date, text: e.text, n: e.n, ours: e.ours as JudgeReason, ai };
  }
  return out;
}

export type ReviewRow = { prompt: string; guess: string; text: string; n: number; ours: JudgeReason; reason: string; conf: Confidence };

const CONF_RANK: Record<Confidence, number> = { high: 0, medium: 1, low: 2 };

/** Guesses we refused that the reviewer says should have been accepted: most confident first,
 * then most-typed, then alphabetical so the order is stable. */
export function disagreements(log: VerdictLog, limit = 50): ReviewRow[] {
  return Object.entries(log)
    .filter(([, v]) => v.ai?.ok === true && v.ours !== "accepted")
    .map(([k, v]) => {
      const cut = k.lastIndexOf("|");
      return { prompt: k.slice(0, cut), guess: k.slice(cut + 1), text: v.text, n: v.n, ours: v.ours, reason: v.ai!.reason, conf: v.ai!.conf };
    })
    .sort((a, b) => CONF_RANK[a.conf] - CONF_RANK[b.conf] || b.n - a.n || (a.guess < b.guess ? -1 : a.guess > b.guess ? 1 : 0))
    .slice(0, limit);
}

/** Headline counts for the admin card. */
export function summarizeVerdicts(log: VerdictLog): { reviewed: number; shouldAccept: number; agree: number } {
  const reviewed = Object.values(log).filter((v) => v.ai);
  const shouldAccept = reviewed.filter((v) => v.ai!.ok).length;
  return { reviewed: reviewed.length, shouldAccept, agree: reviewed.length - shouldAccept };
}
