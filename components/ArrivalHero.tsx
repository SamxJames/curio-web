"use client";

import { useEffect } from "react";
import Link from "next/link";
import type { WordEntry } from "@/lib/words";
import { markOnboarded } from "@/lib/storage";
import { track } from "@/lib/analytics";
import ThemeToggle from "./ThemeToggle";
import EmailSignupInline from "./EmailSignupInline";
import Eyebrow from "@/components/ui/Eyebrow";

/** The merged first-look hero for anonymous, first-time visitors — replaces
 * the old pairing of the plain Today hero plus a separate OnboardingBanner
 * pitch. Marks onboarded (see lib/storage.ts) only on a real interaction —
 * submitting the email, or clicking through to the story — not on a bare
 * page view, so reloading mid-read doesn't prematurely swap to the normal
 * Today page. See components/HomeContent.tsx for how this is chosen. */
export default function ArrivalHero({ word, date }: { word: WordEntry; date: string }) {
  useEffect(() => {
    track("arrival_view");
  }, []);

  return (
    <div className="mx-auto flex min-h-[calc(100vh-1px)] max-w-page flex-col px-6">
      <div className="flex items-center justify-between py-5">
        <Link href="/" className="font-serif text-lg tracking-tight">
          Curio
        </Link>
        <div className="flex items-center gap-4">
          {/* Anyone landing here is unauthenticated (see useShowArrival) —
           * without this, a returning subscriber on a new device has no way
           * to sign in short of guessing "See the archive" to reach the
           * normal Header on another route. */}
          <Link
            href="/login"
            className="font-sans text-xs text-ink-faint transition-colors hover:text-ink-soft"
          >
            Sign in
          </Link>
          <ThemeToggle />
        </div>
      </div>

      <div className="flex flex-1 flex-col pt-10 pb-10">
        <Eyebrow as="p" className="tracking-eyebrow-wider text-accent">
          Today&apos;s word &middot; {date}
        </Eyebrow>

        <h1 className="mt-4 font-serif text-display leading-display font-bold">{word.word}</h1>
        <p className="mt-3 font-sans text-sm text-ink-soft">
          {word.respelling} &middot; {word.partOfSpeech}
        </p>

        <p className="mt-6 max-w-[46ch] font-serif text-lg leading-relaxed text-ink">
          {word.teaser}
        </p>

        <Link
          href={`/story/${word.slug}`}
          onClick={() => markOnboarded()}
          className="mt-6 inline-flex w-fit font-sans text-sm font-medium text-accent transition-opacity hover:opacity-80"
        >
          Find out more &rarr;
        </Link>

        <div className="flex-1" />

        <div className="border-t border-line pt-8">
          <p className="font-sans text-sm leading-relaxed text-ink-soft">
            One word, one story, every day.
            <br />
            No feed. No backlog to catch up on.
          </p>

          <div className="mt-5">
            <EmailSignupInline onSubscribed={() => setTimeout(() => markOnboarded(), 2000)} />
          </div>

          <Link
            href="/history"
            onClick={() => markOnboarded()}
            className="mt-6 inline-block font-sans text-xs text-ink-faint transition-colors hover:text-ink-soft"
          >
            Prefer to browse first? See the archive &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
}
