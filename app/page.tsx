import Link from "next/link";
import OnboardingModal from "@/components/OnboardingModal";
import { auth } from "@/lib/auth";
import { getUserJoinedAt } from "@/lib/userData";
import { getTodayWord, getWordForUser } from "@/lib/words";

export default async function TodayPage() {
  const session = await auth();
  const joinedAtStr = session?.user?.id ? await getUserJoinedAt(session.user.id) : null;
  const word =
    session?.user?.id && joinedAtStr
      ? getWordForUser(session.user.id, new Date(joinedAtStr + "T00:00:00Z"))
      : getTodayWord();

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <>
      <OnboardingModal />
      <section className="mx-auto flex max-w-[640px] flex-col items-start px-6 py-20">
        <p className="font-sans text-xs tracking-wide text-ink-faint">{today}</p>

        <h1 className="mt-6 font-serif text-6xl leading-none sm:text-7xl">
          {word.word}
        </h1>
        <p className="mt-4 font-sans text-sm text-ink-soft">
          {word.respelling} &middot; {word.partOfSpeech}
        </p>

        <p className="mt-8 max-w-[46ch] font-serif text-lg leading-relaxed text-ink-soft">
          {word.origin}
        </p>

        <Link
          href={`/story/${word.slug}`}
          className="mt-10 inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 font-sans text-sm font-medium text-paper transition-opacity hover:opacity-90"
        >
          Read the full story
        </Link>
      </section>
    </>
  );
}
