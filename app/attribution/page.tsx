export const metadata = { title: "Attribution — Curio" };

export default function AttributionPage() {
  return (
    <section className="mx-auto max-w-[640px] px-6 py-20">
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
    </section>
  );
}
