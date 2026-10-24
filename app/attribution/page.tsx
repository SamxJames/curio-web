export const metadata = {
  title: "Attribution — Curio",
  description: "Where Curio's word origins come from: Wiktionary's etymology data (CC BY-SA), rewritten into short stories by a language model.",
  alternates: { canonical: "/attribution" },
};

const linkClass = "text-accent underline underline-offset-2";

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} className={linkClass} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

export default function AttributionPage() {
  return (
    <section className="mx-auto max-w-page px-6 py-20">
      <h1 className="font-serif text-3xl">Attribution</h1>
      <p className="mt-6 font-serif text-lg leading-relaxed text-ink-soft">
        Word origin content on Curio is adapted from{" "}
        <a
          href="https://www.wiktionary.org/"
          className="text-accent underline underline-offset-2"
          target="_blank"
          rel="noopener noreferrer"
        >
          Wiktionary
        </a>{" "}
        entries, via the{" "}
        <a
          href="https://github.com/tatuylonen/wiktextract"
          className="text-accent underline underline-offset-2"
          target="_blank"
          rel="noopener noreferrer"
        >
          Wiktextract
        </a>{" "}
        structured data project. Wiktionary content is available under the{" "}
        <a
          href="https://creativecommons.org/licenses/by-sa/4.0/"
          className="text-accent underline underline-offset-2"
          target="_blank"
          rel="noopener noreferrer"
        >
          Creative Commons Attribution-ShareAlike 4.0
        </a>{" "}
        license and the{" "}
        <a
          href="https://www.gnu.org/licenses/fdl-1.3.html"
          className="text-accent underline underline-offset-2"
          target="_blank"
          rel="noopener noreferrer"
        >
          GNU Free Documentation License
        </a>
        .
      </p>
      <p className="mt-6 font-serif text-lg leading-relaxed text-ink-soft">
        Curio&apos;s Origin, Journey, and Related Words sections are rewritten
        from that raw entry data by an offline language-model pass, but the
        underlying etymological facts trace back to Wiktionary contributors.
        Any further reuse of Curio&apos;s content should preserve this
        attribution and remain under a compatible share-alike license.
      </p>
      <p className="mt-6 font-serif text-lg leading-relaxed text-ink-soft">
        The language facts on Collection (where and when a language was
        spoken, its speakers and its family) are adapted from{" "}
        <a
          href="https://en.wikipedia.org/"
          className="text-accent underline underline-offset-2"
          target="_blank"
          rel="noopener noreferrer"
        >
          Wikipedia
        </a>{" "}
        (
        <a
          href="https://creativecommons.org/licenses/by-sa/4.0/"
          className="text-accent underline underline-offset-2"
          target="_blank"
          rel="noopener noreferrer"
        >
          CC BY-SA
        </a>
        ) and{" "}
        <a
          href="https://www.wikidata.org/"
          className="text-accent underline underline-offset-2"
          target="_blank"
          rel="noopener noreferrer"
        >
          Wikidata
        </a>{" "}
        (
        <a
          href="https://creativecommons.org/publicdomain/zero/1.0/"
          className="text-accent underline underline-offset-2"
          target="_blank"
          rel="noopener noreferrer"
        >
          CC0
        </a>
        ). They are summarised by an offline language-model pass, under a
        rule that it may not add anything the sources don&apos;t say, and each
        language is reviewed before it is published.
      </p>
      <h2 className="mt-12 font-serif text-2xl">curio dig</h2>
      <p className="mt-6 font-serif text-lg leading-relaxed text-ink-soft">
        The daily word game, curio dig, is built from open data. Word
        frequencies come from{" "}
        <ExtLink href="https://github.com/rspeer/wordfreq">wordfreq</ExtLink>{" "}
        by Robyn Speer (
        <ExtLink href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</ExtLink>
        ), which includes data from the{" "}
        <ExtLink href="https://books.google.com/ngrams">Google Books Ngram Viewer</ExtLink>.
      </p>
      <p className="mt-6 font-serif text-lg leading-relaxed text-ink-soft">
        Word senses and relations come from{" "}
        <ExtLink href="https://en-word.net/">Open English WordNet</ExtLink> (
        <ExtLink href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</ExtLink>
        ) and{" "}
        <ExtLink href="https://www.wikidata.org/">Wikidata</ExtLink> (
        <ExtLink href="https://creativecommons.org/publicdomain/zero/1.0/">CC0</ExtLink>
        ). Wiktionary pageviews come from the{" "}
        <ExtLink href="https://www.mediawiki.org/wiki/Wikimedia_REST_API">Wikimedia REST API</ExtLink>.
      </p>
      <p className="mt-6 font-serif text-lg leading-relaxed text-ink-soft">
        The{" "}
        <ExtLink href="https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words">LDNOOBW</ExtLink>{" "}
        word list (
        <ExtLink href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</ExtLink>
        ) is used to filter answers. The game is set in the{" "}
        <ExtLink href="https://github.com/impallari/Libre-Caslon-Text">Libre Caslon Text</ExtLink>{" "}
        typeface (
        <ExtLink href="https://openfontlicense.org/">SIL Open Font License</ExtLink>
        ).
      </p>
    </section>
  );
}
