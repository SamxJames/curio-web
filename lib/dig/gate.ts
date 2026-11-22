import { DAY_MS, dayKey, dayStart } from "../day";
import { COHORT_START, type summarizeCohorts } from "./cohort";

/** The 2026-12-04 dig gate (decided 2026-11-07, docs/handover/dig.md "The kill line"):
 * >=200 first-time finishers, day-7 return >=15%, share/challenge >=15%. Pure, so the
 * weekly email (lib/dig/gateReadout.ts) and its tests need no Redis. Counts only. */
export const GATE_DATE = "2026-12-04";
export const GATE = { finishers: 200, d7Rate: 0.15, shareRate: 0.15 } as const;
/** The share counters (`shared:new`) only exist from this day, so earlier rows would drag the rate down. */
export const SHARE_START = "2026-11-12";

export type CohortRow = ReturnType<typeof summarizeCohorts>[number];

/** Mondays, plus the gate day itself (a Friday, after the last Monday before it). UTC, like the cron. */
export function isGateReadoutDay(now: Date): boolean {
  return now.getUTCDay() === 1 || dayKey(now) === GATE_DATE;
}

/** Every day from the cohort start up to, but not including, today: today's counters are still filling. */
export function gateDates(now: Date): string[] {
  const out: string[] = [];
  for (let t = dayStart(COHORT_START).getTime(); dayKey(new Date(t)) < dayKey(now); t += DAY_MS) out.push(dayKey(new Date(t)));
  return out;
}

const sum = (rows: CohortRow[], f: (r: CohortRow) => number) => rows.reduce((a, r) => a + f(r), 0);
const rate = (n: number, d: number) => (d > 0 ? n / d : null);

export type GateSummary = {
  finishers: number;
  d7: { finishers: number; returned: number; rate: number | null };
  share: { finishers: number; shared: number; rate: number | null };
};

/** Today's row is left out (partial). Day-7 return only counts cohorts whose day 7 has fully passed. */
export function summarizeGate(rows: CohortRow[], today: string): GateSummary {
  const done = rows.filter((r) => r.date < today);
  const d7Cutoff = dayKey(new Date(dayStart(today).getTime() - 7 * DAY_MS));
  const d7Rows = done.filter((r) => r.date < d7Cutoff);
  const shareRows = done.filter((r) => r.date >= SHARE_START);
  const d7 = { finishers: sum(d7Rows, (r) => r.newFinishers), returned: sum(d7Rows, (r) => r.d7) };
  const share = { finishers: sum(shareRows, (r) => r.newFinishers), shared: sum(shareRows, (r) => r.sharedNew) };
  return {
    finishers: sum(done, (r) => r.newFinishers),
    d7: { ...d7, rate: rate(d7.returned, d7.finishers) },
    share: { ...share, rate: rate(share.shared, share.finishers) },
  };
}

const pct = (r: number | null) => (r === null ? "no data yet" : `${Math.round(r * 100)}%`);
const verdict = (r: number | null, need: number) => (r === null ? "no data yet" : r >= need ? "met" : "below");

export function buildGateReadoutMessage(s: GateSummary, today: string): { subject: string; text: string } {
  const left = Math.round((dayStart(GATE_DATE).getTime() - dayStart(today).getTime()) / DAY_MS);
  const when = today === GATE_DATE ? `Today is the ${GATE_DATE} read.` : left > 0 ? `${left} days to the ${GATE_DATE} read.` : `The ${GATE_DATE} read has passed.`;
  const text = [
    `curio dig gate readout for ${today}. ${when}`,
    "",
    `- First-time finishers since ${COHORT_START}: ${s.finishers} (need ${GATE.finishers}): ${s.finishers >= GATE.finishers ? "met" : "not yet"}`,
    `- Day-7 return: ${s.d7.rate === null ? "no data yet" : `${pct(s.d7.rate)} (${s.d7.returned} of ${s.d7.finishers} finishers whose day 7 has passed; need ${Math.round(GATE.d7Rate * 100)}%): ${verdict(s.d7.rate, GATE.d7Rate)}`}`,
    `- Share rate: ${s.share.rate === null ? "no data yet" : `${pct(s.share.rate)} (${s.share.shared} of ${s.share.finishers} finishers since ${SHARE_START}; need ${Math.round(GATE.shareRate * 100)}%): ${verdict(s.share.rate, GATE.shareRate)}`}`,
    "",
    "Under 200 finishers means the launch failed: re-launch. Low return means Curio on autopilot: build Same Brain.",
    "Day-7 undercounts (Safari clears script-written storage after 7 days, private windows lose it), so a miss near the line is not final.",
    'Per-day detail: /admin, "Dig cohorts". Counts only; nothing here identifies a person.',
  ].join("\n");
  return { subject: `curio dig gate readout: ${s.finishers} first-time finishers, day-7 return ${pct(s.d7.rate)}`, text };
}
