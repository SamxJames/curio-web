"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Heart, Search } from "lucide-react";
import { toggleFavorite, useFavorites } from "@/lib/storage";
import Button from "@/components/ui/Button";
import IconButton from "@/components/ui/IconButton";

type Filter = "mine" | "all" | "favorites";

type HistoryPreview = { date: string; word: { slug: string; word: string } };

/** Above this many entries, a flat list stops being scannable — split into
 * month/year sections instead. Below it, the extra headers would just be
 * visual noise for a handful of rows. */
const GROUP_THRESHOLD = 30;

/** How many entries the unfiltered browse view renders before "Show more"
 * is needed — chosen so the first page comfortably fills a screen without
 * forcing a page-load's worth of DOM up front. The shared archive is
 * currently 261 entries (bounded by days since the rotation's start date)
 * and grows toward the full word bank (1,147 and counting) over time; this
 * cap keeps the DOM bounded either way. A search always bypasses this cap
 * (see `isSearching` below): finding a word you typed shouldn't depend on
 * how many times you've clicked "Show more" first. */
const PAGE_SIZE = 60;

function groupByMonth(entries: HistoryPreview[]): { label: string; entries: HistoryPreview[] }[] {
  const groups: { label: string; entries: HistoryPreview[] }[] = [];
  for (const entry of entries) {
    const label = new Date(entry.date + "T00:00:00Z").toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
    const current = groups[groups.length - 1];
    if (current && current.label === label) current.entries.push(entry);
    else groups.push({ label, entries: [entry] });
  }
  return groups;
}

export default function HistoryList({
  allEntries,
  personalEntries,
}: {
  /** The full shared archive — every word, in calendar order. Always
   * available, signed in or not, so a brand-new account has something rich
   * to look at on day one instead of only their (necessarily sparse) own
   * history. */
  allEntries: HistoryPreview[];
  /** This account's personal word order, one entry per day since they
   * joined — present only when signed in. */
  personalEntries?: HistoryPreview[] | null;
}) {
  const hasPersonal = !!personalEntries;
  const [filter, setFilter] = useState<Filter>(hasPersonal ? "mine" : "all");
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  // Tracks the (filter, query) pair `visibleCount` was last reset for, so we
  // can detect a tab switch or a fresh search during render — see the reset
  // below.
  const [paginationKey, setPaginationKey] = useState({ filter, query });
  const favorites = useFavorites();

  function handleToggle(slug: string) {
    toggleFavorite(slug);
  }

  const tabs: { key: Filter; label: string }[] = hasPersonal
    ? [
        { key: "mine", label: "My days" },
        { key: "all", label: "All words" },
        { key: "favorites", label: "Favorites" },
      ]
    : [
        { key: "all", label: "All" },
        { key: "favorites", label: "Favorites" },
      ];

  const activeEntries = filter === "mine" && personalEntries ? personalEntries : allEntries;
  // Favorites always reads from the shared archive's dates, regardless of
  // which tab was open before — a favorited word's "when" shouldn't change
  // depending on which list you happened to be looking at.
  const visible = filter === "favorites" ? allEntries.filter((d) => favorites.has(d.word.slug)) : activeEntries;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return visible;
    return visible.filter((d) => d.word.word.toLowerCase().includes(q));
  }, [visible, query]);

  // A search has to be able to surface any matching word, not just ones
  // already revealed by "Show more" — so the page cap only applies to the
  // unfiltered browse view, never to search results.
  const isSearching = query.trim().length > 0;

  // Switching tabs or starting a fresh search resets pagination — otherwise
  // "Favorites" could inherit a visibleCount left over from scrolling deep
  // into "All words", and immediately show a misleading "Show more" (or
  // none at all) relative to its own much shorter list. Adjusting state
  // during render (rather than in a useEffect) avoids an extra
  // commit-then-effect round trip for what's ultimately a derived reset.
  let effectiveVisibleCount = visibleCount;
  if (paginationKey.filter !== filter || paginationKey.query !== query) {
    effectiveVisibleCount = PAGE_SIZE;
    setPaginationKey({ filter, query });
    setVisibleCount(PAGE_SIZE);
  }

  const paged = isSearching ? filtered : filtered.slice(0, effectiveVisibleCount);
  const hasMore = !isSearching && filtered.length > effectiveVisibleCount;

  const groups = useMemo(
    () =>
      paged.length > GROUP_THRESHOLD
        ? groupByMonth(paged)
        : [{ label: "", entries: paged }],
    [paged]
  );

  return (
    <div className="mx-auto max-w-page px-6 py-16">
      <div className="relative mb-4">
        <Search
          size={15}
          strokeWidth={1.75}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search words…"
          aria-label="Search words"
          className="w-full rounded-full border border-line bg-transparent py-2 pl-9 pr-3 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent"
        />
      </div>

      <div className="mb-6 flex items-center gap-1 font-sans text-sm">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={clsx(
              "rounded-full px-3.5 py-1.5 transition-colors cursor-pointer",
              filter === key ? "bg-paper-raised text-ink" : "text-ink-soft hover:text-ink"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {filter === "mine" && (
        <p className="mb-6 font-sans text-sm text-ink-faint">
          Your personal word order — one new word a day since you joined. It&apos;ll grow day by
          day; browse <Button variant="link" className="inline" onClick={() => setFilter("all")}>all words</Button> in the meantime.
        </p>
      )}

      {filtered.length === 0 && (
        <p className="font-sans text-sm text-ink-faint">
          {query.trim()
            ? `No words match “${query.trim()}.”`
            : filter === "favorites"
              ? "Nothing favorited yet — tap the heart on any story to save it here."
              : "No words yet."}
        </p>
      )}

      {groups.map(({ label, entries }) => (
        <div key={label || "ungrouped"}>
          {label && (
            <h2 className="mb-2 mt-8 font-sans text-xs tracking-wide text-ink-faint first:mt-0">
              {label}
            </h2>
          )}
          <ul>
            {entries.map(({ date, word }) => {
              const favorited = favorites.has(word.slug);
              const displayDate = new Date(date + "T00:00:00Z").toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              });
              return (
                <li key={date} className="border-b border-line py-4 first:pt-0 last:border-0">
                  <div className="flex items-center justify-between gap-4">
                    <Link href={`/story/${word.slug}`} className="min-w-0 flex-1 group">
                      <p className="font-sans text-xs text-ink-faint">{displayDate}</p>
                      <p className="mt-0.5 font-serif text-xl group-hover:text-accent transition-colors">
                        {word.word}
                      </p>
                    </Link>
                    <IconButton
                      label={favorited ? "Remove from favorites" : "Add to favorites"}
                      onClick={() => handleToggle(word.slug)}
                      bordered={false}
                      className="shrink-0 !text-ink-faint hover:!text-accent"
                    >
                      <Heart
                        size={16}
                        strokeWidth={1.75}
                        className={favorited ? "fill-accent text-accent" : ""}
                      />
                    </IconButton>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {hasMore && (
        <Button
          variant="secondary"
          fullWidth
          className="mt-6 !rounded-md"
          onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
        >
          Show more
        </Button>
      )}
    </div>
  );
}
