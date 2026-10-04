"use client";

import { useEffect, useId, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import clsx from "clsx";
import { Heart } from "lucide-react";
import {
  computeLanguageStats,
  resolveCollection,
  spellNumber,
  capitalize,
  pluralize,
  WIDE_DOT,
  type CollectionWord,
  type LanguageStat,
} from "@/lib/collection";
import {
  toggleFavorite,
  useAccountFavoritesPulled,
  useClientOnlyValue,
  useFavorites,
} from "@/lib/storage";
import { track } from "@/lib/analytics";
// Only the tiny generated name index here: the sheets themselves (data.ts)
// load with the lazy panel, never on Collection's first load.
import { SHEET_NAMES } from "@/lib/languages/sheetIndex";
import Button from "@/components/ui/Button";
import Eyebrow from "@/components/ui/Eyebrow";
import IconButton from "@/components/ui/IconButton";
import { ToggleGroup } from "@/components/ui/SegmentedControl";

// The language panel (and, from inside it, the map dots) loads only when
// "About …" is first pressed, so neither is in Collection's initial JS.
const LanguagePanel = dynamic(() => import("./LanguagePanel"), {
  ssr: false,
  loading: () => null,
});

/** Above this many words, the collection stops feeling like a handful of
 * things — the band note switches to explaining the widths, and the closing
 * note drops away. See the "Your collection" design handoff's density rules. */
const DENSE_THRESHOLD = 9;

/** /api/words rejects more than this many slugs in one request. */
const MAX_SLUGS_PER_REQUEST = 500;

type Status = "loading" | "ready" | "error";

async function fetchWords(slugs: string[]): Promise<CollectionWord[]> {
  const batches: string[][] = [];
  for (let i = 0; i < slugs.length; i += MAX_SLUGS_PER_REQUEST) {
    batches.push(slugs.slice(i, i + MAX_SLUGS_PER_REQUEST));
  }
  const results = await Promise.all(
    batches.map(async (batch) => {
      const res = await fetch(`/api/words?slugs=${batch.map(encodeURIComponent).join(",")}`);
      if (!res.ok) throw new Error(`/api/words ${res.status}`);
      const body = (await res.json()) as { words: CollectionWord[] };
      return body.words;
    })
  );
  return results.flat();
}

/** The reader's favourites, newest first. Favourites live in localStorage
 * (lib/storage.ts), so everything here is client-side: the page shell
 * prerenders static, and the words' story data comes from /api/words. */
export default function CollectionScreen() {
  const favorites = useFavorites();
  // useFavorites() is an empty Set on the server and during hydration —
  // indistinguishable from "no favourites". Until the client store has
  // actually been read, render the loading state rather than flash the
  // empty state at someone who has favourites.
  const hydrated = useClientOnlyValue(() => true, false);
  const slugs = useMemo(() => [...favorites].reverse(), [favorites]);
  // A signed-in reader on a fresh device has empty localStorage until
  // AccountFavoritesSync's pull lands; with nothing local, hold the loading
  // state until the session has resolved and (if signed in) the pull has
  // settled. Display-only — this is not an auth decision. Signed-out readers
  // only wait for the session check to resolve.
  const { status: sessionStatus } = useSession();
  const accountPulled = useAccountFavoritesPulled();
  const awaitingAccount =
    favorites.size === 0 &&
    (sessionStatus === "loading" || (sessionStatus === "authenticated" && !accountPulled));

  // slug → word, or null for a slug /api/words didn't return. Additive only:
  // unfavouriting removes a slug from `slugs`, and resolveCollection drops
  // its row straight away with nothing to refetch.
  const [cache, setCache] = useState<ReadonlyMap<string, CollectionWord | null>>(() => new Map());
  // The `missing` key whose fetch failed, so a later favourite retries.
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [activeLanguage, setActiveLanguage] = useState<string | null>(null);

  const { words, missing } = useMemo(() => resolveCollection(slugs, cache), [slugs, cache]);
  const missingKey = missing.join(",");

  useEffect(() => {
    track("collection_view");
  }, []);

  useEffect(() => {
    if (!missingKey) return;
    const requested = missingKey.split(",");
    let current = true;
    fetchWords(requested).then(
      (fetched) => {
        const bySlug = new Map(fetched.map((w) => [w.slug, w]));
        setCache((prev) => {
          const next = new Map(prev);
          for (const slug of requested) next.set(slug, bySlug.get(slug) ?? null);
          return next;
        });
      },
      () => {
        if (current) setFailedKey(missingKey);
      }
    );
    return () => {
      current = false;
    };
  }, [missingKey]);

  const status: Status = !hydrated || awaitingAccount
    ? "loading"
    : missing.length === 0
      ? "ready"
      : failedKey === missingKey
        ? "error"
        : "loading";

  const languages = useMemo(() => computeLanguageStats(words), [words]);
  // If the last favourite through the filtered language is removed, the
  // filter quietly lets go rather than showing "0 words through …".
  const effectiveLanguage =
    activeLanguage && languages.some((l) => l.name === activeLanguage) ? activeLanguage : null;

  const totalWords = words.length;
  const subline =
    totalWords > 0
      ? `${totalWords} ${pluralize(totalWords, "word")}${WIDE_DOT}${languages.length} ${pluralize(
          languages.length,
          "language"
        )}`
      : null;

  function toggleLanguage(name: string) {
    setActiveLanguage((current) => (current === name ? null : name));
  }

  const heading = (
    <div className="pt-7.5">
      <h1 className="font-serif text-4xl leading-display font-normal tracking-headline">
        Your collection
      </h1>
      {subline && (
        <Eyebrow as="p" className="mt-2.5 tracking-eyebrow-wider">
          {subline}
        </Eyebrow>
      )}
    </div>
  );

  // Loading with nothing to show yet: the heading alone, so the page doesn't
  // jump by more than a line once the words arrive. (When some words are
  // already loaded and a new favourite is being fetched, keep showing them.)
  if (status === "loading" && totalWords === 0) {
    return <div className="mx-auto max-w-form px-5 pb-8.5">{heading}</div>;
  }

  return (
    <div className="mx-auto max-w-form px-5 pb-8.5">
      {heading}

      {totalWords > 0 ? (
        <CollectionBody
          words={words}
          languages={languages}
          activeLanguage={effectiveLanguage}
          onToggleLanguage={toggleLanguage}
        />
      ) : (
        status === "ready" && (
          <p className="mt-7 font-serif text-base text-ink-soft italic">
            Nothing here yet. Tap the heart on any story to keep it here.
          </p>
        )
      )}

      {status === "error" && (
        <p className="mt-7 font-sans text-sm text-ink-soft">
          Couldn&apos;t load your collection. Try again in a moment.
        </p>
      )}

      <p className="mt-8 font-sans text-sm text-ink-soft">
        <Link href="/history" className="transition-colors hover:text-ink">
          Past words &rarr;
        </Link>
      </p>
    </div>
  );
}

function CollectionBody({
  words,
  languages,
  activeLanguage,
  onToggleLanguage,
}: {
  words: CollectionWord[];
  languages: LanguageStat[];
  activeLanguage: string | null;
  onToggleLanguage: (name: string) => void;
}) {
  const totalWords = words.length;
  const sparse = totalWords <= DENSE_THRESHOLD;
  const panelId = useId();

  // Which language the "About" panel is open for. Keyed by language, so the
  // panel closes by itself when the active language changes or clears (also
  // when the filter quietly lets go); never persisted.
  const [aboutFor, setAboutFor] = useState<string | null>(null);
  // When the filter lets go on its own (no toggle), forget the old language too, so
  // picking it again later doesn't reopen the panel. Adjusted during render, not in an effect.
  if (aboutFor !== null && aboutFor !== activeLanguage) setAboutFor(null);
  const sheetName = activeLanguage ? SHEET_NAMES[activeLanguage] : undefined;
  const aboutOpen = !!sheetName && aboutFor === activeLanguage;
  const favouriteLineages = useMemo(() => words.map((w) => w.lineage), [words]);

  function toggleLanguage(name: string) {
    setAboutFor(null);
    onToggleLanguage(name);
  }

  const filteredWords = useMemo(
    () => (activeLanguage ? words.filter((w) => w.lineage.includes(activeLanguage)) : words),
    [words, activeLanguage]
  );

  const bandNote = sparse
    ? `${capitalize(spellNumber(languages.length))} ${pluralize(languages.length, "language")} so far.`
    : "Widths are how many of your favourites passed through each language.";

  const filterLine = activeLanguage
    ? `${filteredWords.length} ${pluralize(filteredWords.length, "word")} through ${activeLanguage}`
    : null;

  // In place of a generic reassurance, the closing note surfaces something
  // to actually read: the `related` fact for the most recently favourited
  // word, which the collection view otherwise never shows (the story page is
  // the only other place it appears). Only for small, unfiltered collections.
  const closingWord = words[0];
  const showClosingLine = !activeLanguage && sparse && !!closingWord;

  return (
    <>
      <div className="pt-7">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-serif text-lg italic">Where they came from</h2>
          <Eyebrow className="tracking-eyebrow">tap to filter</Eyebrow>
        </div>

        <ToggleGroup
          segments={languages}
          getKey={(stat) => stat.name}
          isActive={(stat) => activeLanguage === stat.name}
          onToggle={(stat) => toggleLanguage(stat.name)}
          renderSegment={() => null}
          getButtonProps={(stat, isActive) => ({
            title: stat.name,
            "aria-label": `Filter by ${stat.name}, ${stat.count} ${pluralize(stat.count, "word")}`,
            className: "transition-[opacity,background-color] duration-150",
            style: {
              flexGrow: stat.count,
              flexShrink: 1,
              flexBasis: 0,
              minWidth: 3,
              backgroundColor: isActive ? "var(--accent)" : "currentColor",
              opacity: activeLanguage ? (isActive ? 1 : 0.09) : stat.opacity,
            },
          })}
          className="mt-3.5 flex h-7 gap-0.5 text-ink"
        />

        <ToggleGroup
          segments={languages}
          getKey={(stat) => stat.name}
          isActive={(stat) => activeLanguage === stat.name}
          onToggle={(stat) => toggleLanguage(stat.name)}
          renderSegment={(stat) => (
            <>
              <span>{stat.name}</span>
              <span className="text-micro opacity-70">{stat.count}</span>
            </>
          )}
          getButtonProps={(stat, isActive) => ({
            // The visible chip matches the design's exact box; `after`
            // extends the invisible tap target to ~44px tall without
            // affecting the 6px gap between chips (it's absolutely
            // positioned, so it doesn't take part in the flex layout).
            className: clsx(
              "relative flex items-baseline gap-1.25 rounded-full border px-2.25 py-1.25 font-sans text-micro tracking-label transition-colors duration-150 after:absolute after:-inset-3 after:content-['']",
              isActive ? "border-accent text-accent" : "border-line-strong text-ink-soft"
            ),
          })}
          className="mt-3 flex flex-wrap gap-1.5"
        />

        <p className="mt-3.5 font-serif text-sm leading-body text-ink-soft italic">
          {bandNote}
        </p>
      </div>

      {filterLine && (
        <div className="mt-6.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1.5 border-b border-accent pb-2">
          <span className="font-serif text-base">{filterLine}</span>
          <span className="flex shrink-0 items-baseline gap-4">
            {sheetName && (
              <Button
                variant="link"
                className="!text-accent !no-underline text-micro tracking-eyebrow uppercase"
                aria-expanded={aboutOpen}
                aria-controls={aboutOpen ? panelId : undefined}
                onClick={() => setAboutFor(aboutOpen ? null : activeLanguage)}
              >
                About {sheetName}
              </Button>
            )}
            <Button
              variant="link"
              className="!text-accent !no-underline text-micro tracking-eyebrow uppercase"
              onClick={() => toggleLanguage(activeLanguage!)}
            >
              clear
            </Button>
          </span>
        </div>
      )}

      {aboutOpen && sheetName && (
        <LanguagePanel id={panelId} name={sheetName} favouriteLineages={favouriteLineages} />
      )}

      <div className="mt-2">
        {filteredWords.map((word) => (
          <WordRow
            key={word.slug}
            word={word}
            activeLanguage={activeLanguage}
            onToggleLanguage={toggleLanguage}
          />
        ))}
      </div>

      {showClosingLine && (
        <p className="mt-7.5 border-t border-line pt-5.5 font-serif text-base leading-body text-ink-soft italic [text-wrap:pretty]">
          A little more about {closingWord.word}: {closingWord.related}
        </p>
      )}
    </>
  );
}

function WordRow({
  word,
  activeLanguage,
  onToggleLanguage,
}: {
  word: CollectionWord;
  activeLanguage: string | null;
  onToggleLanguage: (name: string) => void;
}) {
  const router = useRouter();

  function open() {
    router.push(`/story/${word.slug}`);
  }

  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={`${word.word} — read the full story`}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          open();
        }
      }}
      className="flex cursor-pointer gap-3 border-t border-line py-5"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.75">
          <span className="font-serif text-2xl leading-display">{word.word}</span>
        </div>
        <div className="mt-1.25 font-sans text-micro tracking-label text-ink-soft">
          {word.respelling}
          {WIDE_DOT}
          {word.partOfSpeech}
        </div>
        <p className="mt-2 font-serif text-base leading-body text-ink [text-wrap:pretty]">
          {word.teaser}
        </p>
        <Eyebrow className="mt-2.5 flex flex-wrap gap-x-1.75 gap-y-0 tracking-eyebrow-wider">
          {word.lineage.map((lang, i) => {
            const label = (i > 0 ? "› " : "") + lang;
            if (lang === "English") {
              return (
                <span key={i} className="opacity-45">
                  {label}
                </span>
              );
            }
            const isActive = activeLanguage === lang;
            return (
              <Button
                key={i}
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleLanguage(lang);
                }}
                className={isActive ? "text-accent" : undefined}
              >
                {label}
              </Button>
            );
          })}
        </Eyebrow>
      </div>
      <IconButton
        label="Remove from collection"
        onClick={(e) => {
          e.stopPropagation();
          toggleFavorite(word.slug);
        }}
        onKeyDown={(e) => e.stopPropagation()}
        bordered={false}
        className="shrink-0 self-start"
      >
        <Heart size={16} strokeWidth={1.75} className="fill-accent text-accent" />
      </IconButton>
    </div>
  );
}
