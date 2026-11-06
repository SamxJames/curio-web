import clsx from "clsx";

/** The answer as a row of letter tiles for /play. While playing, only the
 * letters in `revealed` show; when the game is over every letter shows,
 * staggered so the word lands left to right. Screen readers get one label
 * for the whole row instead of a tile-by-tile readout. */
export default function LetterTiles({
  word,
  revealed,
  outcome,
}: {
  word: string;
  revealed: number[];
  outcome: "playing" | "solved" | "failed";
}) {
  const letters = Array.from(word);
  const done = outcome !== "playing";
  const label = done
    ? word
    : `${letters.length} letters` +
      (revealed.length
        ? `: ${letters.map((l, i) => (revealed.includes(i) ? l.toUpperCase() : "blank")).join(", ")}`
        : "");

  return (
    <div role="img" aria-label={label} className="flex gap-1.5">
      {letters.map((letter, i) => {
        const shown = done || revealed.includes(i);
        return (
          <span
            key={`${i}-${shown}`}
            aria-hidden="true"
            style={done ? { animationDelay: `${i * 60}ms` } : undefined}
            className={clsx(
              "flex h-12 min-w-0 max-w-10 flex-1 items-center justify-center rounded-md border font-serif uppercase",
              // 12-letter words leave ~22px per tile on a 375px phone.
              letters.length > 9 ? "text-lg" : "text-2xl",
              !shown && "border-line-strong",
              shown && "motion-safe:animate-tile-reveal",
              shown && !done && "border-line-strong bg-paper-raised text-ink",
              outcome === "solved" && "border-accent bg-accent-button text-paper",
              outcome === "failed" && "border-line-strong bg-paper-raised text-ink-soft"
            )}
          >
            {shown ? letter : ""}
          </span>
        );
      })}
    </div>
  );
}
