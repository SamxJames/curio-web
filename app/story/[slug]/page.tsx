import { notFound } from "next/navigation";
import type { Metadata } from "next";
import StoryView from "@/components/StoryView";
import { WORDS, getWordBySlug } from "@/lib/words";

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
  return {
    title: `${word.word} — Curio`,
    description: word.origin,
  };
}

// Nothing in this component may read cookies, headers, or Redis: every such
// call opts all 1,147 prerendered paths back into per-request rendering.
// The session-dependent parts (the personalized date, recordUserSeen) live
// in app/api/story/[slug]/date/route.ts, fetched by components/StoryDate.tsx.
export default async function StoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const word = getWordBySlug(slug);
  if (!word) notFound();

  return <StoryView word={word} />;
}
