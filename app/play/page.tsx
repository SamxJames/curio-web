import PuzzleGame from "@/components/PuzzleGame";
import { getTodayPuzzle } from "@/lib/puzzle";

export const metadata = { title: "Daily puzzle — Curio" };

// getTodayPuzzle() is date-dependent (via `new Date()`), same as
// app/page.tsx and app/history/page.tsx — those get dynamic rendering for
// free because they call auth(), but this route doesn't, so it needs the
// opt-in explicitly. Without this, Next statically prerenders the page at
// build time and keeps serving that frozen puzzle/date until the next
// deploy, rather than recomputing today's puzzle on every request.
export const dynamic = "force-dynamic";

export default function PlayPage() {
  const puzzle = getTodayPuzzle();

  if (!puzzle) {
    return (
      <div className="mx-auto max-w-[640px] px-6 py-16">
        <p className="font-sans text-xs tracking-wide text-ink-faint">Puzzle</p>
        <h1 className="mt-3 font-serif text-3xl">Not open yet</h1>
        <p className="mt-4 max-w-[46ch] font-serif text-lg leading-relaxed text-ink-soft">
          The daily puzzle needs a deeper word bank before it can promise a
          fair game every day without repeating too soon. Check back once
          Curio&apos;s collection has grown.
        </p>
      </div>
    );
  }

  return <PuzzleGame word={puzzle.word} puzzleNumber={puzzle.puzzleNumber} />;
}
