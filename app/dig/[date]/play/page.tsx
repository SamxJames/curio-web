import { notFound } from "next/navigation";
import DigGame from "@/components/dig/DigGame";
import { dayNumber, digLaunchDate, isPastDay } from "@/lib/dig/clock";

// The archive page is the indexed one; this playable copy would only duplicate it.
export const metadata = { title: "Play a past dig | curio dig", robots: { index: false, follow: true } };
export const revalidate = 3600;

export default async function PlayPastPage({ params }: PageProps<"/dig/[date]/play">) {
  const { date } = await params;
  const launch = digLaunchDate();
  if (!launch || !isPastDay(date, new Date(), launch)) notFound();
  return (
    <main className="mx-auto max-w-page px-6 py-10">
      <h1 className="font-display text-4xl leading-display">curio dig, day {dayNumber(date, launch)}</h1>
      <p className="mt-2 font-sans text-sm text-ink-faint">Past digs are scored on this device only.</p>
      <DigGame date={date} />
    </main>
  );
}
