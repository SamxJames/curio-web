"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Star } from "lucide-react";
import type { HistoryDay } from "@/lib/words";
import {
  computeLanguageStats,
  groupByMonth,
  formatShortDate,
  monthLabel,
  spellNumber,
  capitalize,
  pluralize,
  WIDE_DOT,
  type LanguageStat,
} from "@/lib/collection";
import { useFavorites } from "@/lib/storage";
import { track } from "@/lib/analytics";

type Tab = "collection" | "history";

/** Above this many words, the collection stops feeling like a handful of
 * things and starts needing month headers to stay scannable — see the
 * "Your collection" design handoff's density rules. */
const DENSE_THRESHOLD = 9;

export default function CollectionScreen({
  entries,
  tab,
}: {
  /** This account's seen-words, newest first — one entry per day since
   * joining (lib/words.ts's getHistoryForUser). */
  entries: HistoryDay[];
  tab: Tab;
}) {
  const [activeLanguage, setActiveLanguage] = useState<string | null>(null);

  useEffect(() => {
    track("collection_view");
  }, []);

  const totalWords = entries.length;
  const languages = useMemo(() => computeLanguageStats(entries), [entries]);
  const oldestDate = totalWords > 0 ? entries[totalWords - 1].date : null;

  const subline =
    oldestDate !== null
      ? `${totalWords} ${pluralize(totalWords, "word")}${WIDE_DOT}${languages.length} ${pluralize(
          languages.length,
          "language"
        )}${WIDE_DOT}since ${monthLabel(oldestDate)}`
      : null;

  function toggleLanguage(name: string) {
    setActiveLanguage((current) => (current === name ? null : name));
  }

  return (
    <div className="mx-auto max-w-[560px] px-5 pb-[34px]">
      <div className="pt-[30px]">
        <h1 className="font-serif text-[36px] leading-[1.05] font-normal tracking-[-0.015em]">
          Your collection
        </h1>
        {subline && (
          <p className="mt-2.5 font-sans text-[10.5px] tracking-[0.12em] text-ink-soft uppercase">
            {subline}
          </p>
        )}
      </div>

      <div className="mt-[22px] flex border-b border-line">
        <Link
          href="/collection"
          scroll={false}
          className={clsx(
            "-mb-px mr-[24px] border-b pb-2.5 font-sans text-[11px] tracking-[0.12em] uppercase transition-colors duration-150",
            tab === "collection" ? "border-ink text-ink" : "border-transparent text-ink-soft"
          )}
        >
          Collection
        </Link>
        <Link
          href="/collection?tab=history"
          scroll={false}
          className={clsx(
            "-mb-px border-b pb-2.5 font-sans text-[11px] tracking-[0.12em] uppercase transition-colors duration-150",
            tab === "history" ? "border-ink text-ink" : "border-transparent text-ink-soft"
          )}
        >
          History
        </Link>
      </div>

      {tab === "collection" ? (
        totalWords === 0 ? (
          <p className="mt-[28px] font-serif text-[15px] text-ink-soft italic">
            Your first word arrives tomorrow morning.
          </p>
        ) : (
          <CollectionBody
            entries={entries}
            languages={languages}
            activeLanguage={activeLanguage}
            onToggleLanguage={toggleLanguage}
          />
        )
      ) : (
        <HistoryTabBody entries={entries} />
      )}
    </div>
  );
}

function CollectionBody({
  entries,
  languages,
  activeLanguage,
  onToggleLanguage,
}: {
  entries: HistoryDay[];
  languages: LanguageStat[];
  activeLanguage: string | null;
  onToggleLanguage: (name: string) => void;
}) {
  const favorites = useFavorites();
  const totalWords = entries.length;
  const sparse = totalWords <= DENSE_THRESHOLD;

  const filteredEntries = useMemo(
    () => (activeLanguage ? entries.filter((e) => e.word.lineage.includes(activeLanguage)) : entries),
    [entries, activeLanguage]
  );

  const showMonthHeaders = !activeLanguage && !sparse;
  const groups = useMemo(
    () => (showMonthHeaders ? groupByMonth(filteredEntries) : [{ label: null, items: filteredEntries }]),
    [filteredEntries, showMonthHeaders]
  );

  const bandNote = sparse
    ? `${capitalize(spellNumber(languages.length))} ${pluralize(languages.length, "language")} so far.`
    : "Widths are how many of your words passed through each language.";

  const filterLine = activeLanguage
    ? `${filteredEntries.length} ${pluralize(filteredEntries.length, "word")} through ${activeLanguage}`
    : null;

  // In place of a generic reassurance ("nothing to catch up on"), the closing
  // note surfaces something to actually read: the `related` fact for the
  // most recent word, which the collection view otherwise never shows (the
  // story page is the only other place it appears). Only for small,
  // unfiltered collections — the same slot the copy used to occupy.
  const closingWord = entries[0]?.word;
  const showClosingLine = !activeLanguage && sparse && !!closingWord;

  return (
    <>
      <div className="pt-[28px]">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-serif text-[18px] italic">Where they came from</h2>
          <span className="font-sans text-[9.5px] tracking-[0.1em] text-ink-soft uppercase">
            tap to filter
          </span>
        </div>

        <div className="mt-[14px] flex h-[28px] gap-[2px] text-ink">
          {languages.map((stat) => {
            const isActive = activeLanguage === stat.name;
            return (
              <button
                key={stat.name}
                type="button"
                title={stat.name}
                aria-pressed={isActive}
                aria-label={`Filter by ${stat.name}, ${stat.count} ${pluralize(stat.count, "word")}`}
                onClick={() => onToggleLanguage(stat.name)}
                className="cursor-pointer transition-[opacity,background-color] duration-150"
                style={{
                  flexGrow: stat.count,
                  flexShrink: 1,
                  flexBasis: 0,
                  minWidth: 3,
                  backgroundColor: isActive ? "var(--accent)" : "currentColor",
                  opacity: activeLanguage ? (isActive ? 1 : 0.09) : stat.opacity,
                }}
              />
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap gap-[6px]">
          {languages.map((stat) => {
            const isActive = activeLanguage === stat.name;
            return (
              <button
                key={stat.name}
                type="button"
                aria-pressed={isActive}
                onClick={() => onToggleLanguage(stat.name)}
                className={clsx(
                  // The visible chip matches the design's exact box; `after`
                  // extends the invisible tap target to ~44px tall without
                  // affecting the 6px gap between chips (it's absolutely
                  // positioned, so it doesn't take part in the flex layout).
                  "relative flex cursor-pointer items-baseline gap-[5px] rounded-[2px] border px-[9px] py-[5px] font-sans text-[10.5px] tracking-[0.05em] transition-colors duration-150 after:absolute after:-inset-3 after:content-['']",
                  isActive ? "border-accent text-accent" : "border-line text-ink-soft"
                )}
              >
                <span>{stat.name}</span>
                <span className="text-[9px] opacity-70">{stat.count}</span>
              </button>
            );
          })}
        </div>

        <p className="mt-[14px] font-serif text-[13.5px] leading-[1.5] text-ink-soft italic">
          {bandNote}
        </p>
      </div>

      {filterLine && (
        <div className="mt-[26px] flex items-baseline justify-between border-b border-accent pb-2">
          <span className="font-serif text-[16px]">{filterLine}</span>
          <button
            type="button"
            onClick={() => onToggleLanguage(activeLanguage!)}
            className="cursor-pointer font-sans text-[10px] tracking-[0.1em] text-accent uppercase"
          >
            clear
          </button>
        </div>
      )}

      <div className="mt-2">
        {groups.map((group, i) => (
          <div key={group.label ?? `ungrouped-${i}`}>
            {group.label && (
              <div className="pt-[26px] pb-1 font-sans text-[9.5px] tracking-[0.18em] text-ink-soft uppercase">
                {group.label}
              </div>
            )}
            {group.items.map((entry) => (
              <WordRow
                key={entry.date}
                entry={entry}
                favorited={favorites.has(entry.word.slug)}
                activeLanguage={activeLanguage}
                onToggleLanguage={onToggleLanguage}
              />
            ))}
          </div>
        ))}
      </div>

      {showClosingLine && (
        <p className="mt-[30px] border-t border-line pt-[22px] font-serif text-[15px] leading-[1.55] text-ink-soft italic [text-wrap:pretty]">
          A little more about {closingWord.word}: {closingWord.related}
        </p>
      )}
    </>
  );
}

function WordRow({
  entry,
  favorited,
  activeLanguage,
  onToggleLanguage,
}: {
  entry: HistoryDay;
  favorited: boolean;
  activeLanguage: string | null;
  onToggleLanguage: (name: string) => void;
}) {
  const router = useRouter();
  const { word } = entry;

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
        <div className="flex items-center gap-[7px]">
          <span className="font-serif text-[26px] leading-[1.1]">{word.word}</span>
          {favorited && <Star size={10} className="fill-accent text-accent" aria-hidden />}
        </div>
        <div className="mt-[5px] font-sans text-[10.5px] tracking-[0.06em] text-ink-soft">
          {word.respelling}
          {WIDE_DOT}
          {word.partOfSpeech}
        </div>
        <p className="mt-2 font-serif text-[15px] leading-[1.45] text-ink [text-wrap:pretty]">
          {word.teaser}
        </p>
        <div className="mt-2.5 flex flex-wrap gap-x-[7px] gap-y-0 font-sans text-[9.5px] tracking-[0.13em] text-ink-soft uppercase">
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
              <button
                key={i}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleLanguage(lang);
                }}
                className={clsx("cursor-pointer", isActive && "text-accent")}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="pt-2 font-sans text-[9.5px] tracking-[0.08em] whitespace-nowrap text-ink-soft">
        {formatShortDate(entry.date)}
      </div>
    </div>
  );
}

function HistoryTabBody({ entries }: { entries: HistoryDay[] }) {
  const groups = useMemo(() => groupByMonth(entries), [entries]);

  return (
    <div className="pt-[22px]">
      <p className="font-serif text-[14px] text-ink-soft italic">Every morning since you joined.</p>
      {groups.map((group) => (
        <div key={group.label}>
          <div className="pt-[26px] pb-1 font-sans text-[9.5px] tracking-[0.18em] text-ink-soft uppercase">
            {group.label}
          </div>
          {group.items.map((entry) => (
            <Link
              key={entry.date}
              href={`/story/${entry.word.slug}`}
              className="flex items-baseline gap-3 border-t border-line py-3"
            >
              <span className="w-[42px] shrink-0 font-sans text-[10px] tracking-[0.06em] text-ink-soft">
                {formatShortDate(entry.date)}
              </span>
              <span className="flex-1 font-serif text-[18px]">{entry.word.word}</span>
              <span className="font-sans text-[9.5px] tracking-[0.1em] text-ink-soft uppercase">
                {entry.word.partOfSpeech}
              </span>
            </Link>
          ))}
        </div>
      ))}
    </div>
  );
}
