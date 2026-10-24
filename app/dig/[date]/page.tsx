import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { formatDay } from "@/lib/day";
import { dayNumber, digLaunchDate, isPastDay } from "@/lib/dig/clock";
import { decodeDay } from "@/lib/dig/payload";
import { TIER_LABEL } from "@/lib/dig/score";
import { readDay } from "@/lib/dig/server";
import { TIERS } from "@/lib/dig/types";

// Today and future dates 404; revalidating means a cached 404 heals once the day passes.
export const revalidate = 3600;
// No dates at build time; each is rendered on its first visit and then cached (ISR).
// Without this the route renders, and reads Redis, on every request.
export async function generateStaticParams() {
  return [];
}

// cache(): generateMetadata and the page share one Redis read per render.
const load = cache(async (date: string) => {
  const launch = digLaunchDate();
  if (!launch || !isPastDay(date, new Date(), launch)) return null;
  const day = await readDay(date);
  return day ? { plain: decodeDay(day), number: dayNumber(date, launch) } : null;
});

export async function generateMetadata({ params }: PageProps<"/dig/[date]">): Promise<Metadata> {
  const { date } = await params;
  const d = await load(date);
  if (!d) return {};
  return {
    title: `curio dig, day ${d.number} answers (${formatDay(date)}) | Curio`,
    description: `All the answers and fossils for curio dig day ${d.number}: ${d.plain.prompts.map((p) => p.text.replace(/^Name /, "")).join("; ")}.`,
    alternates: { canonical: `/dig/${date}` },
  };
}

export default async function ArchivePage({ params }: PageProps<"/dig/[date]">) {
  const { date } = await params;
  const d = await load(date);
  if (!d) notFound();
  return (
    <main className="mx-auto max-w-page px-6 py-10">
      <p className="font-sans text-sm text-ink-faint">{formatDay(date)}</p>
      <h1 className="mt-1 font-display text-4xl leading-display">curio dig, day {d.number}</h1>
      <p className="mt-4 font-sans">
        <Link href={`/dig/${date}/play`} className="underline underline-offset-2">Play this dig first</Link>: the answers are below.
      </p>
      {d.plain.prompts.map((p) => (
        <section key={p.id} className="mt-10 border-t border-line pt-4">
          <h2 className="font-display text-2xl">{p.text}</h2>
          <p className="mt-3 font-sans text-sm text-ink-faint">Fossil</p>
          <p className="font-display text-xl">
            {p.fossil.story ? <Link href={`/story/${p.fossil.story}`} className="underline underline-offset-2">{p.fossil.word}</Link> : p.fossil.word}
          </p>
          <p className="font-serif text-base leading-relaxed text-ink-soft">{p.fossil.fact}</p>
          {TIERS.filter((t) => t !== "fossil").map((t) => {
            const words = p.answers.filter((a) => a[1] === t && a[2] === 1).map((a) => a[0]);
            return words.length ? (
              <p key={t} className="mt-3 font-serif text-base leading-relaxed">
                <span className="font-sans text-sm text-ink-faint">{TIER_LABEL[t]}: </span>
                {words.map((w, i) => (
                  <span key={w}>
                    {i > 0 && ", "}
                    {p.stories[w] ? <Link href={`/story/${p.stories[w]}`} className="underline underline-offset-2">{w}</Link> : w}
                  </span>
                ))}
              </p>
            ) : null;
          })}
        </section>
      ))}
    </main>
  );
}
