import { notFound } from "next/navigation";
import PastList from "@/components/dig/PastList";
import { dayNumber, digLaunchDate, isDigOpen } from "@/lib/dig/clock";
import { pastDates } from "@/lib/dig/server";

export const metadata = {
  title: "Past digs | curio dig",
  description: "Every earlier curio dig, with its prompts, fossils and answers. Play any of them.",
  alternates: { canonical: "/dig/past" },
};
export const revalidate = 3600;

export default async function PastPage() {
  const launch = digLaunchDate();
  if (!launch || !isDigOpen()) notFound();
  const dates = await pastDates();
  return (
    <main className="mx-auto max-w-page px-6 py-10">
      <h1 className="font-display text-4xl leading-display">Past digs</h1>
      <PastList days={dates.map((date) => ({ date, number: dayNumber(date, launch) }))} />
    </main>
  );
}
