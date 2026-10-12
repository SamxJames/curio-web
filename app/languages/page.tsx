import Link from "next/link";
import type { Metadata } from "next";
import { languagePages } from "@/lib/languages/pages";
import { eraLabel } from "@/lib/languages/timeline";

export const metadata: Metadata = {
  title: "Words by language: where English words come from | Curio",
  description:
    "The languages Curio's words passed through on their way into English, from Latin and Old French to Arabic and Old Norse.",
  alternates: { canonical: "/languages" },
};

export default function LanguagesPage() {
  const pages = languagePages();
  return (
    <div className="mx-auto max-w-page px-6 py-16">
      <h1 className="font-serif text-3xl">Words by language</h1>
      <p className="mt-3 font-sans text-sm text-ink-soft">
        Every language with at least a few of Curio&rsquo;s words passing through it on the way into English.
      </p>
      <ul className="mt-8">
        {pages.map((p) => (
          <li
            key={p.slug}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line py-3"
          >
            <Link
              href={`/language/${p.slug}`}
              prefetch={false}
              className="font-serif text-lg text-ink transition-colors hover:text-accent"
            >
              {p.name}
            </Link>
            <span className="font-sans text-sm text-ink-soft">
              {p.words.length} words · {p.sheet.era ? eraLabel(p.sheet.era) : "Dates unknown"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
