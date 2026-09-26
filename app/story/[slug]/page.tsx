import { notFound } from "next/navigation";
import type { Metadata } from "next";
import StoryView from "@/components/StoryView";
import { WORDS, getWordBySlug } from "@/lib/words";
import { buildStoryJsonLd, serializeJsonLd } from "@/lib/storyJsonLd";
import { getRelatedWords } from "@/lib/relatedWords";

export function generateStaticParams() {
  return WORDS.map((w) => ({ slug: w.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const word = getWordBySlug(slug);
  if (!word) return {};

  // `teaser` is the field written to be read cold by a human — one
  // sentence, no mid-thought opening, and deliberately distinct from
  // `origin` (which is the full explanation and starts with "From Latin…"
  // more often than not). Every teaser in the bank is ≤151 characters, so
  // nothing needs truncating for a meta description.
  const description = word.teaser;
  const title = `${word.word}: the origin of the word — Curio`;

  return {
    title,
    description,
    // Relative on purpose: app/layout.tsx's metadataBase resolves it
    // against CURIO_SITE_URL, so this can't drift from the sitemap's origin.
    alternates: { canonical: `/story/${slug}` },
    openGraph: {
      // Next replaces the layout's openGraph wholesale rather than merging
      // it, so the site-level fields have to be restated here.
      type: "website",
      siteName: "Curio",
      title,
      description,
      url: `/story/${slug}`,
    },
  };
}

// Nothing in this component may read cookies, headers, or Redis: every such
// call opts all 1,147 prerendered paths back into per-request rendering.
// The session-dependent parts (the featured-on date, recordUserSeen) live
// in app/api/story/[slug]/date/route.ts, fetched by lib/useStoryDay.ts,
// called from components/StoryView.tsx.
export default async function StoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const word = getWordBySlug(slug);
  if (!word) notFound();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildStoryJsonLd(word)) }}
      />
      <StoryView word={word} related={getRelatedWords(slug)} />
    </>
  );
}
