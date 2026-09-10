"use client";

import { useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Heart } from "lucide-react";
import type { HistoryDay } from "@/lib/words";
import { toggleFavorite, useFavorites } from "@/lib/storage";

type Filter = "all" | "favorites";

export default function HistoryList({ entries }: { entries: HistoryDay[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const favorites = useFavorites();

  function handleToggle(slug: string) {
    toggleFavorite(slug);
  }

  const visible =
    filter === "favorites"
      ? entries.filter((d) => favorites.has(d.word.slug))
      : entries;

  return (
    <div className="mx-auto max-w-[640px] px-6 py-16">
      <div className="mb-10 flex items-center gap-1 font-sans text-sm">
        {(["all", "favorites"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={clsx(
              "rounded-full px-3.5 py-1.5 transition-colors cursor-pointer",
              filter === f ? "bg-paper-raised text-ink" : "text-ink-soft hover:text-ink"
            )}
          >
            {f === "all" ? "All" : "Favorites"}
          </button>
        ))}
      </div>

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
