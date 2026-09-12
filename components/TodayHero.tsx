import Link from "next/link";
import EtymologyLineage from "@/components/EtymologyLineage";
import type { WordEntry } from "@/lib/words";

export default function TodayHero({
  word,
  date,
  isPersonalized,
}: {
  word: WordEntry;
  date: string;
  isPersonalized: boolean;
}) {
  return (
    <section className="mx-auto flex max-w-[640px] flex-col items-start px-6 py-20">
      <p className="font-sans text-xs tracking-wide text-ink-faint">
        {isPersonalized ? <>Your word &middot; {date}</> : date}
      </p>

      <h1 className="mt-6 font-serif text-6xl leading-none sm:text-7xl">{word.word}</h1>
      <p className="mt-4 font-sans text-sm text-ink-soft">
        {word.respelling} &middot; {word.partOfSpeech}
      </p>

      <EtymologyLineage lineage={word.lineage} className="mt-3 text-xs" />

      <p className="mt-8 max-w-[46ch] font-serif text-lg leading-relaxed text-ink-soft">
        {word.teaser}
      </p>

      <Link
        href={`/story/${word.slug}`}
        className="mt-10 inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 font-sans text-sm font-medium text-paper transition-opacity hover:opacity-90"
      >
        Read the full story
      </Link>
    </section>
  );
}
