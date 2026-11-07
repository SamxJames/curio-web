"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { dayKey } from "@/lib/day";
import { getPlayState, useClientOnlyValue, type PlayState } from "@/lib/storage";
import { readStore, type DigStore } from "@/lib/dig/storage";

export function isPuzzleDone(s: PlayState | null): boolean {
  return !!s && s.status !== "playing";
}

export function isDigDone(store: DigStore, today: string): boolean {
  return !!store.games[today];
}

/** Today's other two things to do, under the story button. Ticks are today-only and show after
 * hydration (the server never knows). Never a count, never "not yet": archive, never backlog. */
export default function TodayStrip({ digOpen }: { digOpen: boolean }) {
  const puzzleDone = useClientOnlyValue(() => isPuzzleDone(getPlayState(dayKey())), false);
  const digDone = useClientOnlyValue(() => isDigDone(readStore(), dayKey()), false);
  const rows = [
    { href: "/play", title: "The puzzle", line: "Guess the word from three clues.", done: puzzleDone },
    ...(digOpen ? [{ href: "/dig?from=home", title: "curio dig", line: "Name words for seven prompts. Rarer ones dig deeper.", done: digDone }] : []),
  ];
  return (
    <div className="mt-8 w-full max-w-form">
      <p className="font-sans text-xs tracking-wide text-ink-faint">Also today</p>
      <ul className="mt-2 border-b border-line">
        {rows.map((r) => (
          <li key={r.href} className="border-t border-line">
            <Link href={r.href} className="group flex items-start justify-between gap-4 py-3">
              <span>
                <span className="block font-sans text-sm text-ink underline-offset-2 group-hover:underline">{r.title}</span>
                <span className="block font-sans text-sm text-ink-soft">{r.line}</span>
              </span>
              {r.done && (
                <span className="mt-0.5 text-ink-soft">
                  <Check size={16} strokeWidth={1.75} aria-hidden />
                  <span className="sr-only">done today</span>
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
