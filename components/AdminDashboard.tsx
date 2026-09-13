import type { CumulativeCount, PuzzleEngagementSummary, RetentionResult } from "@/lib/adminStats";
import type { EmailMetricsTotals } from "@/lib/resendMetrics";
import { pluralize, capitalize, WIDE_DOT, formatShortDate } from "@/lib/collection";

type Props = {
  subscriberCount: number;
  accountCount: number;
  subscriberGrowth: CumulativeCount[];
  accountGrowth: CumulativeCount[];
  favorites: { accountsWithFavorites: number; totalFavorites: number };
  puzzleEngagement: PuzzleEngagementSummary;
  retention: { day1: RetentionResult; day7: RetentionResult; day30: RetentionResult };
  emailMetrics7d: EmailMetricsTotals | null;
  emailMetrics30d: EmailMetricsTotals | null;
};

export default function AdminDashboard({
  subscriberCount,
  accountCount,
  subscriberGrowth,
  accountGrowth,
  favorites,
  puzzleEngagement,
  retention,
  emailMetrics7d,
  emailMetrics30d,
}: Props) {
  return (
    <div className="mx-auto max-w-[720px] px-5 pt-[30px] pb-[60px]">
      <h1 className="font-serif text-[32px] leading-[1.05] font-normal tracking-[-0.015em]">
        Analytics
      </h1>
      <p className="mt-2 font-sans text-[10.5px] tracking-[0.12em] text-ink-soft uppercase">
        {subscriberCount} {pluralize(subscriberCount, "subscriber")}
        {WIDE_DOT}
        {accountCount} {pluralize(accountCount, "account")}
      </p>

      <Section title="Growth">
        <GrowthTable label="Subscribers" rows={subscriberGrowth} />
        <div className="mt-6">
          <GrowthTable label="Accounts" rows={accountGrowth} />
        </div>
      </Section>

      <Section title="Retention">
        <p className="font-serif text-[13.5px] leading-[1.5] text-ink-soft italic">
          Of accounts old enough to qualify, the share active within the window — see this
          plan&rsquo;s Flagged Decision A for why this isn&rsquo;t a fixed-cohort chart.
        </p>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <RetentionTile label="1-day" result={retention.day1} />
          <RetentionTile label="7-day" result={retention.day7} />
          <RetentionTile label="30-day" result={retention.day30} />
        </div>
      </Section>

      <Section title="Engagement">
        <StatRow
          label="Accounts with a favorite"
          value={`${favorites.accountsWithFavorites} (${favorites.totalFavorites} total)`}
        />
        <StatRow label="Puzzle plays" value={`${puzzleEngagement.totalPlays}`} />
        <StatRow label="Puzzles solved" value={`${puzzleEngagement.solved}`} />
        <StatRow label="Puzzles failed" value={`${puzzleEngagement.failed}`} />
        <StatRow label="Puzzles in progress" value={`${puzzleEngagement.inProgress}`} />
        {puzzleEngagement.totalPlays > 0 && (
          <div className="mt-3 flex h-[24px] gap-[2px]">
            {puzzleEngagement.histogram.map((count, i) => (
              <div
                key={i}
                title={i < 3 ? `Solved on clue ${i + 1}: ${count}` : `Failed: ${count}`}
                style={{ flexGrow: count || 0.02, flexShrink: 1, flexBasis: 0 }}
                className={i === 3 ? "bg-ink-soft/40" : "bg-accent"}
              />
            ))}
          </div>
        )}
      </Section>

      <Section title="Daily email">
        <div className="grid grid-cols-2 gap-6">
          <EmailMetricsCard label="Last 7 days" metrics={emailMetrics7d} />
          <EmailMetricsCard label="Last 30 days" metrics={emailMetrics30d} />
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-[36px] border-t border-line pt-[24px]">
      <h2 className="font-serif text-[18px] italic">{title}</h2>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between border-t border-line py-2 first:border-t-0">
      <span className="font-sans text-[11px] tracking-[0.06em] text-ink-soft">{label}</span>
      <span className="font-serif text-[15px]">{value}</span>
    </div>
  );
}

function GrowthTable({ label, rows }: { label: string; rows: CumulativeCount[] }) {
  const recent = rows.slice(-14); // most recent 14 days with any signups
  return (
    <div>
      <h3 className="font-sans text-[9.5px] tracking-[0.18em] text-ink-soft uppercase">{label}</h3>
      {recent.length === 0 ? (
        <p className="mt-2 font-serif text-[13.5px] text-ink-soft italic">No signups yet.</p>
      ) : (
        <div className="mt-2">
          {recent.map((row) => (
            <div
              key={row.date}
              className="flex items-baseline justify-between border-t border-line py-1.5 first:border-t-0"
            >
              <span className="font-sans text-[10.5px] tracking-[0.06em] text-ink-soft">
                {formatShortDate(row.date)}
              </span>
              <span className="font-serif text-[13px]">{row.total} total</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RetentionTile({ label, result }: { label: string; result: RetentionResult }) {
  return (
    <div className="border border-line px-3 py-3 text-center">
      <div className="font-sans text-[9px] tracking-[0.12em] text-ink-soft uppercase">{label}</div>
      <div className="mt-1 font-serif text-[22px]">
        {result.rate === null ? (
          <span className="text-[13px] text-ink-soft italic">Not enough data</span>
        ) : (
          `${Math.round(result.rate * 100)}%`
        )}
      </div>
      {result.rate !== null && (
        <div className="mt-0.5 font-sans text-[9px] text-ink-soft">
          {result.active} / {result.eligible}
        </div>
      )}
    </div>
  );
}

function EmailMetricsCard({ label, metrics }: { label: string; metrics: EmailMetricsTotals | null }) {
  return (
    <div>
      <h3 className="font-sans text-[9.5px] tracking-[0.18em] text-ink-soft uppercase">{label}</h3>
      {metrics === null ? (
        <p className="mt-2 font-serif text-[13.5px] text-ink-soft italic">
          {capitalize("email metrics unavailable.")}
        </p>
      ) : (
        <div className="mt-2">
          <StatRow label="Sent" value={`${metrics.sent}`} />
          <StatRow label="Delivered" value={`${metrics.delivered}`} />
          <StatRow
            label="Opened"
            value={metrics.openRate === null ? `${metrics.opened}` : `${metrics.opened} (${metrics.openRate.toFixed(1)}%)`}
          />
          <StatRow
            label="Clicked"
            value={metrics.clickRate === null ? `${metrics.clicked}` : `${metrics.clicked} (${metrics.clickRate.toFixed(1)}%)`}
          />
        </div>
      )}
    </div>
  );
}
