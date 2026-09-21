import Link from "next/link";
import { WORDS } from "@/lib/words";

export const metadata = {
  title: "All words A–Z — Curio",
  description: "Every word Curio has a story for, listed A to Z.",
  alternates: { canonical: "/words" },
};

// The complete index. /history can only ever show the words the shared
// calendar has actually reached (263 today, bounded by days since the
// rotation's start date), and caps that at 60 behind a client-side "Show
// more" — so most of the word bank has never been linked from anywhere at
// all. Everything here is plain server-rendered markup: no client
// component, no pagination, no search. It is an index, not a feature.
function groupByLetter() {
  const sorted = [...WORDS].sort((a, b) => a.word.localeCompare(b.word, "en"));
  const groups = new Map<string, typeof sorted>();
  for (const word of sorted) {
    const letter = word.word[0].toUpperCase();
    const group = groups.get(letter);
    if (group) group.push(word);
    else groups.set(letter, [word]);
  }
  return [...groups.entries()];
}

export default function WordsPage() {
  const groups = groupByLetter();

  return (
    <div className="mx-auto max-w-page px-6 py-16">
      <h1 className="font-serif text-3xl">All words</h1>
      <p className="mt-3 font-sans text-sm text-ink-soft">
        Every word Curio has a story for — {WORDS.length} of them, A to Z.
      </p>

      <nav aria-label="Jump to letter" className="mt-6 flex flex-wrap gap-x-3 gap-y-1">
        {groups.map(([letter]) => (
          <a
            key={letter}
            href={`#${letter.toLowerCase()}`}
            className="font-sans text-sm text-ink-soft transition-colors hover:text-accent"
          >
            {letter}
          </a>
        ))}
      </nav>

      {groups.map(([letter, words]) => (
        <section key={letter} className="mt-10">
          <h2
            id={letter.toLowerCase()}
            className="mb-3 font-sans text-xs tracking-wide text-ink-faint"
          >
            {letter}
          </h2>
          <ul className="columns-2 gap-x-8 sm:columns-3">
            {words.map((word) => (
              <li key={word.slug} className="py-1">
                {/* prefetch={false} deliberately: 1,147 links on one page
                    would otherwise queue 1,147 prefetches as the user
                    scrolls. These pages are prerendered and cheap to load
                    outright. */}
                <Link
                  href={`/story/${word.slug}`}
                  prefetch={false}
                  className="font-serif text-base text-ink transition-colors hover:text-accent"
                >
                  {word.word}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
