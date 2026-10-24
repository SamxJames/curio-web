import type { DigFunnelSummary } from "@/lib/dig/funnel";

const COLS = ["land", "start", "finish", "share", "story", "signup", "past"] as const;

/** Admin only: land → start → finish → share → story → signup for the last 28 days.
 * Markup follows the "Where visitors come from" table in AdminDashboard (internal tooling). */
export default function DigFunnelTable({ summary }: { summary: DigFunnelSummary }) {
  return (
    <div>
      <p className="font-serif text-[13.5px] leading-[1.5] text-ink-soft italic">
        Daily players are starts. Kill line (median start, days 22–28 after launch):{" "}
        {summary.killLine ?? "not yet"}; below 20 means stop. Share arrivals land as land:direct,
        because chat apps strip the referrer, so read direct against the pre-launch baseline.
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
          </div>
          {summary.rows.map((row) => (
            <div key={row.date} className="flex items-baseline justify-between border-t border-line py-1.5">
              <span className="flex-1 font-sans text-[11px] tracking-[0.06em] text-ink-soft">{row.date}</span>
              {COLS.map((c) => (
                <span key={c} className="w-16 text-right font-serif text-[13px] tabular-nums">{row[c]}</span>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
