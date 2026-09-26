/** The story page's "featured on" line. The date comes from lib/useStoryDay.ts.
 *
 * The slot keeps its height whether or not a date arrives: ~884 of 1,147
 * words have never been featured and will never fill it, and a line that
 * appears after hydration would otherwise shove the headword down the page
 * on the ~263 that do. Layout shift is a ranking signal, so reserving is
 * the right trade for this page. */
export default function StoryDate({ date }: { date: string | null }) {
  return (
    <p className="mb-6 h-4 font-sans text-xs tracking-wide text-ink-faint">{date}</p>
  );
}
