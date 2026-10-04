import Link from "next/link";
import EtymologyLineage from "@/components/EtymologyLineage";
import type { WordEntry } from "@/lib/words";

export default function TodayHero({
  word,
  date,
}: {
  word: WordEntry;
  date: string;
}) {
  return (
    <section className="mx-auto flex max-w-page flex-col items-start px-6 py-20">
      <p className="font-sans text-xs tracking-wide text-ink-faint">
        Today&apos;s word &middot; {date}
      </p>

      <h1 className="mt-6 font-serif text-6xl leading-none sm:text-7xl">{word.word}</h1>
      <p className="mt-4 font-sans text-sm text-ink-soft">
        {word.respelling} &middot; {word.partOfSpeech}
      </p>

      <EtymologyLineage lineage={word.lineage} className="mt-3 text-xs" />

      <p className="mt-8 max-w-[46ch] font-serif text-lg leading-relaxed text-ink-soft">
        {word.teaser}
      </p>

      <div className="mt-10 flex flex-wrap items-center gap-3">
        <Link
          href={`/story/${word.slug}`}
          className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 font-sans text-sm font-medium text-paper transition-opacity hover:opacity-90"
        >
          Read the full story
        </Link>

        {/* Styled as Button's secondary variant — a Link, so it can't use
         * the <button> primitive directly. */}
        <Link
          href="/play"
          className="inline-flex items-center gap-2 rounded-full border border-line-strong px-5 py-2.5 font-sans text-sm text-ink-soft transition-colors hover:border-accent hover:text-ink"
        >
          Play today&apos;s puzzle
        </Link>
      </div>

      <p className="mt-6 font-sans text-sm">
        <Link href="/history" className="text-ink-soft transition-colors hover:text-ink">
          Past words &rarr;
        </Link>
      </p>
    </section>
  );
}
