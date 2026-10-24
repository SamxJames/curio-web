"use client";

import Link from "next/link";
import { formatDay } from "@/lib/day";
import { formatDepth } from "@/lib/dig/score";
import { useDigStore } from "@/lib/dig/storage";

/** Archive, never backlog: played days show your depth, other days show nothing extra. */
export default function PastList({ days }: { days: { date: string; number: number }[] }) {
  const store = useDigStore();
  if (!days.length) return <p className="mt-6 font-sans text-ink-soft">The first past dig appears here tomorrow.</p>;
  return (
    <ul className="mt-6 divide-y divide-line border-y border-line">
      {days.map(({ date, number }) => {
        const game = store.games[date];
        return (
          <li key={date} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-3 font-sans">
            <Link href={`/dig/${date}/play`} prefetch={false} className="font-display text-xl underline-offset-2 hover:underline">{`Day ${number}`}</Link>
            <span className="text-sm text-ink-faint">{formatDay(date)}</span>
            {game && <span className="text-sm text-ink-soft">{`${formatDepth(game.score)} down`}</span>}
            <Link href={`/dig/${date}`} prefetch={false} className="ml-auto text-sm text-ink-soft underline underline-offset-2">Answers</Link>
          </li>
        );
      })}
    </ul>
  );
}
