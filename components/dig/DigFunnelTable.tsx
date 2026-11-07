import type { summarizeCohorts } from "@/lib/dig/cohort";
import { killLineText, type DigFunnelSummary } from "@/lib/dig/funnel";

const COLS = ["land", "start", "finish", "share", "story", "signup", "past", "returning"] as const;

/** Admin only: land → start → finish → share → story → signup for the last 28 days.
 * Markup follows the "Where visitors come from" table in AdminDashboard (internal tooling). */
export default function DigFunnelTable({ summary, cohorts }: { summary: DigFunnelSummary; cohorts: ReturnType<typeof summarizeCohorts> }) {
  return (
    <div>
      <p className="font-serif text-[13.5px] leading-[1.5] text-ink-soft italic">
        {killLineText(summary.killLine, summary.killReturnShare)} Returning = starts from a device that
        finished a dig on an earlier day. It undercounts (Safari clears storage after 7 days, private
        windows). Read from day 2; target 30% by days 8 to 14. With a small daily sample, read the trend,
        not one day. Share arrivals land as land:direct, because chat apps strip the referrer, so read
        direct against the pre-launch baseline.
      </p>
      {summary.rows.length === 0 ? (
        <p className="mt-3 font-serif text-[13.5px] text-ink-soft italic">No dig events yet.</p>
      ) : (
        <div className="mt-3">
          <div className="flex items-baseline justify-between py-1.5 font-sans text-[9.5px] tracking-[0.18em] text-ink-soft uppercase">
            <span className="flex-1">Day</span>
            {COLS.map((c) => (
              <span key={c} className="w-16 text-right">{c}</span>
            ))}
            <span className="w-16 text-right">Return %</span>
          </div>
          {summary.rows.map((row) => (
            <div key={row.date} className="flex items-baseline justify-between border-t border-line py-1.5">
              <span className="flex-1 font-sans text-[11px] tracking-[0.06em] text-ink-soft">{row.date}</span>
              {COLS.map((c) => (
                <span key={c} className="w-16 text-right font-serif text-[13px] tabular-nums">{row[c]}</span>
              ))}
              <span className="w-16 text-right font-serif text-[13px] tabular-nums">
                {row.returnShare === null ? "" : `${row.returnShare}%`}
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="mt-6 font-sans text-[9.5px] tracking-[0.18em] text-ink-soft uppercase">Dig cohorts (first-play date)</p>
      <p className="mt-1 font-sans text-[11px] text-ink-soft">From 8 Nov 2026. &lsquo;Back&rsquo; counts starts per device, so it reads slightly high (a first finish on a past dig or an unsent report isn&rsquo;t counted as new).</p>
      <div className="mt-1">
        <div className="flex items-baseline justify-between py-1.5 font-sans text-[9.5px] tracking-[0.18em] text-ink-soft uppercase">
          <span className="flex-1">Date</span>
          <span className="w-24 text-right">New finishers</span>
          <span className="w-24 text-right">Back day 1</span>
          <span className="w-24 text-right">Back day 7</span>
          <span className="w-24 text-right">Back days 8–13</span>
        </div>
        {cohorts.map((c) => (
          <div key={c.date} className="flex items-baseline justify-between border-t border-line py-1.5">
            <span className="flex-1 font-sans text-[11px] tracking-[0.06em] text-ink-soft">{c.date}</span>
            <span className="w-24 text-right font-serif text-[13px] tabular-nums">{c.newFinishers}</span>
            <span className="w-24 text-right font-serif text-[13px] tabular-nums">{c.d1}</span>
            <span className="w-24 text-right font-serif text-[13px] tabular-nums">{c.d7}</span>
            <span className="w-24 text-right font-serif text-[13px] tabular-nums">{c.d8to13}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
