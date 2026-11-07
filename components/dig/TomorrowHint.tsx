/** One plain line naming what tomorrow's dig asks for. Today's dig only: on a past dig "tomorrow"
 * is a day that has already happened. No time, and never paired with urgency copy. */
export default function TomorrowHint({ hint, isToday }: { hint?: string | null; isToday: boolean }) {
  if (!isToday || !hint) return null;
  return <p className="font-sans text-base text-ink-soft">{`Tomorrow: ${hint}`}</p>;
}
