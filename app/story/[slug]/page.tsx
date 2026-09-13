import { notFound } from "next/navigation";
import type { Metadata } from "next";
import StoryView from "@/components/StoryView";
import { auth } from "@/lib/auth";
import { getUserJoinedAt, recordUserSeen } from "@/lib/userData";
import { WORDS, getWordBySlug, getHistory, getHistoryForUser } from "@/lib/words";

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

  // Prefer this account's own personalized date for the word (matching what
  // they actually saw on Today/Collection) over the shared calendar's date —
  // the two rotations are independent, so the shared date can be a stale day
  // for someone whose personal rotation is showing this word right now.
  const session = await auth();
  if (session?.user?.id) void recordUserSeen(session.user.id);
  const joinedAtStr = session?.user?.id ? await getUserJoinedAt(session.user.id) : null;
  const personalEntry =
    session?.user?.id && joinedAtStr
      ? getHistoryForUser(session.user.id, new Date(joinedAtStr + "T00:00:00Z")).find(
          (d) => d.word.slug === slug
        )
      : undefined;
  const historyEntry = personalEntry ?? getHistory().find((d) => d.word.slug === slug);
  const date = historyEntry
    ? new Date(historyEntry.date + "T00:00:00Z").toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      })
    : undefined;

  return <StoryView word={word} date={date} />;
}
