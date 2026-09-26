"use client";

import { useEffect, useState } from "react";

export type StoryDay = {
  date: string | null;
  today: { slug: string; word: string } | null;
};

/** One request for a story page's per-visit facts (the "featured on" date
 * and today's word), shared by the date line and the today link. Two
 * separate fetches would also fire recordUserSeen twice. Fetched rather
 * than rendered so the page stays static; see
 * app/api/story/[slug]/date/route.ts. */
export function useStoryDay(slug: string): StoryDay | null {
  const [day, setDay] = useState<StoryDay | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/story/${slug}/date`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: StoryDay | null) => {
        if (!cancelled) setDay(data);
      })
      .catch(() => {
        // A missing date line or today link is not worth surfacing an error for.
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return day;
}
