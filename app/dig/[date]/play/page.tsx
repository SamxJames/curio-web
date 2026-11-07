import { notFound } from "next/navigation";
import DigGame from "@/components/dig/DigGame";
import { dayNumber, digLaunchDate, isPastDay } from "@/lib/dig/clock";

// The archive page is the indexed one; this playable copy would only duplicate it.
export const metadata = { title: "Play a past dig | curio dig", robots: { index: false, follow: true } };
export const revalidate = 3600;
// No dates at build time; each is rendered on first visit and then cached (ISR).
export async function generateStaticParams() {
  return [];
}

export default async function PlayPastPage({ params }: PageProps<"/dig/[date]/play">) {
  const { date } = await params;
  const launch = digLaunchDate();
  if (!launch || !isPastDay(date, new Date(), launch)) notFound();
  return (
    <main className="mx-auto max-w-page px-6 py-10">
      <DigGame date={date} heading={`curio dig, day ${dayNumber(date, launch)}`} note="Past digs are scored on this device only." />
    </main>
  );
}
