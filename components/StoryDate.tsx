"use client";

import { useEffect, useState } from "react";

/** The story page's "featured on" line. Fetched rather than server-rendered
 * so the page itself stays static — see
 * app/api/story/[slug]/date/route.ts for why.
 *
 * The slot keeps its height whether or not a date arrives: ~884 of 1,147
 * words have never been featured and will never fill it, and a line that
 * appears after hydration would otherwise shove the headword down the page
 * on the ~263 that do. Layout shift is a ranking signal, so reserving is
 * the right trade for this page. */
export default function StoryDate({ slug }: { slug: string }) {
  const [date, setDate] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/story/${slug}/date`)
      .then((res) => (res.ok ? res.json() : { date: null }))
      .then((data: { date: string | null }) => {
        if (!cancelled) setDate(data.date);
      })
      .catch(() => {
        // A missing date line is not worth surfacing an error for.
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return (
    <p className="mb-6 h-4 font-sans text-xs tracking-wide text-ink-faint">{date}</p>
  );
}
