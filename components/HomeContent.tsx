"use client";

import { useSession } from "next-auth/react";
import { useHasOnboarded } from "@/lib/storage";
import type { WordEntry } from "@/lib/words";
import ArrivalHero from "./ArrivalHero";
import TodayHero from "./TodayHero";

/** Decides between the first-time arrival hero and the normal Today hero.
 * `hasOnboarded()`'s pre-hydration snapshot is `true` (see lib/storage.ts),
 * so server-rendered HTML and the first client render both show TodayHero —
 * a genuine first-timer flips to ArrivalHero immediately after hydration,
 * the same one-render-later pattern OnboardingBanner used before it. */
export default function HomeContent({
  word,
  date,
  isPersonalized,
}: {
  word: WordEntry;
  date: string;
  isPersonalized: boolean;
}) {
  const { status } = useSession();
  const onboarded = useHasOnboarded();
  const showArrival = status !== "authenticated" && !onboarded;

  return showArrival ? (
    <ArrivalHero word={word} date={date} />
  ) : (
    <TodayHero word={word} date={date} isPersonalized={isPersonalized} />
  );
}
