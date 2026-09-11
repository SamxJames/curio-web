"use client";

import { useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Heart } from "lucide-react";
import type { HistoryDay } from "@/lib/words";
import { toggleFavorite, useFavorites } from "@/lib/storage";

type Filter = "mine" | "all" | "favorites";

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

  return (
    <div className="mx-auto max-w-[640px] px-6 py-16">
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

      {visible.length === 0 && (
        <p className="font-sans text-sm text-ink-faint">
          {filter === "favorites"
            ? "Nothing favorited yet — tap the heart on any story to save it here."
            : "No words yet."}
        </p>
      )}

      <ul>
        {visible.map(({ date, word }) => {
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
  );
}
