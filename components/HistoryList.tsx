"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Heart, Search } from "lucide-react";
import type { HistoryDay } from "@/lib/words";
import { toggleFavorite, useFavorites } from "@/lib/storage";

type Filter = "mine" | "all" | "favorites";

/** Above this many entries, a flat list stops being scannable — split into
 * month/year sections instead. Below it, the extra headers would just be
 * visual noise for a handful of rows. */
const GROUP_THRESHOLD = 30;

function groupByMonth(entries: HistoryDay[]): { label: string; entries: HistoryDay[] }[] {
  const groups: { label: string; entries: HistoryDay[] }[] = [];
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
  allEntries: HistoryDay[];
  /** This account's personal word order, one entry per day since they
   * joined — present only when signed in. */
  personalEntries?: HistoryDay[] | null;
}) {
  const hasPersonal = !!personalEntries;
  const [filter, setFilter] = useState<Filter>(hasPersonal ? "mine" : "all");
  const [query, setQuery] = useState("");
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

  const groups = useMemo(
    () =>
      filtered.length > GROUP_THRESHOLD
        ? groupByMonth(filtered)
        : [{ label: "", entries: filtered }],
    [filtered]
  );

  return (
    <div className="mx-auto max-w-[640px] px-6 py-16">
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
          className="w-full rounded-md border border-line bg-transparent py-2 pl-9 pr-3 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent"
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
          day; browse <button onClick={() => setFilter("all")} className="underline underline-offset-2 hover:text-ink cursor-pointer">all words</button> in the meantime.
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
                    <button
                      onClick={() => handleToggle(word.slug)}
                      aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
                      className="shrink-0 rounded-full p-2 text-ink-faint transition-colors hover:text-accent cursor-pointer"
                    >
                      <Heart
                        size={16}
                        strokeWidth={1.75}
                        className={favorited ? "fill-accent text-accent" : ""}
                      />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
