import clsx from "clsx";

/** A horizontal breadcrumb of the languages a word passed through, oldest
 * first (e.g. "Latin → Italian → English"). Pure presentation — the actual
 * language list lives on WordEntry.lineage (lib/words.ts), derived from
 * that word's own origin/journey/related text. */
export default function EtymologyLineage({
  lineage,
  className,
}: {
  lineage: string[];
  className?: string;
}) {
  if (lineage.length === 0) return null;

  return (
    <div
      className={clsx(
        "flex flex-wrap items-center gap-x-2 gap-y-1 font-sans text-ink-soft",
        className
      )}
    >
      {lineage.map((language, i) => (
        <span key={`${language}-${i}`} className="flex items-center gap-2">
          {i > 0 && (
            <span className="text-accent" aria-hidden>
              &rarr;
            </span>
          )}
          <span>{language}</span>
        </span>
      ))}
    </div>
  );
}
