import { notFound } from "next/navigation";
import type { Metadata } from "next";
import StoryView from "@/components/StoryView";
import { WORDS, getWordBySlug, getHistory } from "@/lib/words";

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

export default async function StoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const word = getWordBySlug(slug);
  if (!word) notFound();

  const historyEntry = getHistory().find((d) => d.word.slug === slug);
  const date = historyEntry
    ? new Date(historyEntry.date + "T00:00:00Z").toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      })
    : undefined;

  return <StoryView word={word} date={date} />;
}
