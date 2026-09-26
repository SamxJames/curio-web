"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Heart, Link as LinkIcon, Share } from "lucide-react";
import type { WordEntry } from "@/lib/words";
import type { RelatedWords } from "@/lib/relatedWords";
import { isFavorite, toggleFavorite, useClientOnlyValue } from "@/lib/storage";
import { track } from "@/lib/analytics";
import { useStoryDay } from "@/lib/useStoryDay";
import EtymologyLineage from "./EtymologyLineage";
import Button from "@/components/ui/Button";
import StoryDate from "./StoryDate";

const SECTIONS: { key: keyof Pick<WordEntry, "origin" | "journey" | "related">; label: string }[] = [
  { key: "origin", label: "Origin" },
  { key: "journey", label: "Journey" },
  { key: "related", label: "Related words" },
];

export default function StoryView({ word, related }: { word: WordEntry; related: RelatedWords }) {
  const day = useStoryDay(word.slug);

  useEffect(() => {
    track("story_view");
  }, []);

  const favorited = useClientOnlyValue(() => isFavorite(word.slug), false);
  const canShare = useClientOnlyValue(
    () => typeof navigator !== "undefined" && !!navigator.share,
    false
  );
  const [copied, setCopied] = useState(false);
  // Local optimistic override so the heart flips instantly on click, without
  // waiting on the external-store round trip.
  const [favoritedOverride, setFavoritedOverride] = useState<boolean | null>(null);
  const isFavorited = favoritedOverride ?? favorited;

  function handleFavorite() {
    setFavoritedOverride(toggleFavorite(word.slug));
  }

  async function handleShare() {
    const url = `${window.location.origin}/story/${word.slug}`;
    if (canShare) {
      try {
        await navigator.share({ title: `${word.word} — Curio`, url });
      } catch {
        // user dismissed the share sheet — no action needed
      }
      return;
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <article className="mx-auto max-w-page px-6 py-12">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1.5 font-sans text-xs tracking-wide text-ink-faint transition-colors hover:text-ink"
      >
        <ArrowLeft size={13} strokeWidth={1.75} />
        Today
      </Link>

      <StoryDate date={day?.date ?? null} />

      <h1 className="font-serif text-5xl leading-none">{word.word}</h1>
      <p className="mt-3 font-sans text-sm text-ink-soft">
        {word.respelling} &middot; {word.partOfSpeech}
      </p>

      <EtymologyLineage lineage={word.lineage} className="mt-4 text-sm" />

      <div className="mt-10 flex items-center gap-3">
        <Button
          variant="secondary"
          className="inline-flex items-center gap-2"
          aria-pressed={isFavorited}
          aria-label={isFavorited ? "Remove from favorites" : "Add to favorites"}
          onClick={handleFavorite}
        >
          <Heart
            size={15}
            strokeWidth={1.75}
            className={isFavorited ? "fill-accent text-accent" : ""}
          />
          {isFavorited ? "Favorited" : "Favorite"}
        </Button>
        <Button variant="secondary" className="inline-flex items-center gap-2" onClick={handleShare}>
          {copied ? (
            <>
              <LinkIcon size={15} strokeWidth={1.75} />
              Link copied
            </>
          ) : canShare ? (
            <>
              <Share size={15} strokeWidth={1.75} />
              Share
            </>
          ) : (
            <>
              <LinkIcon size={15} strokeWidth={1.75} />
              Copy link
            </>
          )}
        </Button>
      </div>

      <div className="mt-12 space-y-10">
        {SECTIONS.map(({ key, label }) => (
          <section key={key}>
            <div className="mb-3 flex items-center gap-3">
              <h2 className="font-sans text-xs tracking-wide text-ink-faint">{label}</h2>
              <div className="h-px flex-1 bg-line" />
            </div>
            <p className="font-serif text-lg leading-relaxed text-ink">{word[key]}</p>
          </section>
        ))}
      </div>

      {related.peers.length + related.neighbours.length > 0 && (
        <section className="mt-12">
          <div className="mb-3 flex items-center gap-3">
            <h2 className="font-sans text-xs tracking-wide text-ink-faint">More words</h2>
            <div className="h-px flex-1 bg-line" />
          </div>
          {related.peers.length > 0 && (
            <div>
              <p className="mb-2 font-sans text-xs text-ink-faint">From {related.language}</p>
              <ul className="flex flex-wrap gap-x-6 gap-y-2">
                {related.peers.map((link) => (
                  <li key={link.slug}>
                    <Link
                      href={`/story/${link.slug}`}
                      className="font-serif text-lg text-ink transition-colors hover:text-accent"
                    >
                      {link.word}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {related.neighbours.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 font-sans text-xs text-ink-faint">Nearby, A&ndash;Z</p>
              <ul className="flex flex-wrap gap-x-6 gap-y-2">
                {related.neighbours.map((link) => (
                  <li key={link.slug}>
                    <Link
                      href={`/story/${link.slug}`}
                      className="font-serif text-lg text-ink transition-colors hover:text-accent"
                    >
                      {link.word}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Link
            href="/words"
            className="mt-4 inline-block font-sans text-xs text-ink-faint transition-colors hover:text-ink-soft"
          >
            All words A&ndash;Z &rarr;
          </Link>
        </section>
      )}

      <div className="mt-12 space-y-4 border-t border-line pt-8">
        {/* Only for a word that isn't today's: the one pointer from an old
         * story to the live day. "Browse all words" (to /history, a
         * personal view) was removed; "All words A–Z" above covers it. */}
        {day?.today && day.today.slug !== word.slug && (
          <Link
            href={`/story/${day.today.slug}`}
            className="block font-sans text-sm text-ink-soft transition-colors hover:text-ink"
          >
            Today&apos;s word is {day.today.word} &rarr;
          </Link>
        )}
        <Link
          href="/play"
          className="block font-sans text-xs text-ink-faint transition-colors hover:text-ink-soft"
        >
          Try today&apos;s puzzle &rarr;
        </Link>
      </div>
    </article>
  );
}
