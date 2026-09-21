"use client";

import { useShowArrival } from "@/lib/useShowArrival";
import type { WordEntry } from "@/lib/words";
import ArrivalHero from "./ArrivalHero";
import TodayHero from "./TodayHero";

/** Decides between the first-time arrival hero and the normal Today hero.
 * `hasOnboarded()`'s pre-hydration snapshot is `true` (see lib/storage.ts),
 * so server-rendered HTML and the first (hydrating) client render both show
 * TodayHero regardless of who's visiting. A genuine first-time anonymous
 * visitor then flips to ArrivalHero on the very next render — right after
 * hydration completes, not after useSession()'s client-side fetch resolves
 * — because app/page.tsx renders components/ServerSessionMarker.tsx next to
 * this component, giving lib/useShowArrival.ts a server-known answer to
 * read the moment useSyncExternalStore's post-hydration snapshot kicks in.
 * Same one-render-later pattern OnboardingBanner used before it, just no
 * longer gated on the client's own session round trip. */
export default function HomeContent({
  word,
  date,
  isPersonalized,
}: {
  word: WordEntry;
  date: string;
  isPersonalized: boolean;
}) {
  const showArrival = useShowArrival();

  return showArrival ? (
    <ArrivalHero word={word} date={date} />
  ) : (
    <TodayHero word={word} date={date} isPersonalized={isPersonalized} />
  );
}
