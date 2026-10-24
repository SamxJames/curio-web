import { notFound } from "next/navigation";
import Link from "next/link";
import DigGame from "@/components/dig/DigGame";
import { isDigOpen } from "@/lib/dig/clock";

export const metadata = {
  title: "curio dig: a daily word game | Curio",
  description: "Seven prompts a day. Name a word that fits: the rarer your answer, the deeper you dig. Free, no login, the same dig for everyone.",
  alternates: { canonical: "/dig" },
};

// The launch gate (DIG_LAUNCH_DATE) is the only server-side input; the day itself comes
// from /api/dig/today in the browser.
export const revalidate = 3600;

export default function DigPage() {
  if (!isDigOpen()) notFound();
  return (
    <main className="mx-auto max-w-page px-6 py-10">
      <h1 className="font-display text-4xl leading-display">curio dig</h1>
      <DigGame />
      <section className="mt-16 border-t border-line pt-6 font-sans text-base text-ink-soft">
        <h2 className="font-display text-2xl text-ink">How it works</h2>
        <p className="mt-2">Each prompt asks for a word: a fruit, a sailing term, a word English took from Arabic. Any fitting word scores. Common answers land in the topsoil; rarer ones dig down through loam, clay and stone, and each prompt hides one fossil in the bedrock.</p>
        <p className="mt-2">A new dig opens at midnight UTC. <Link href="/dig/past" className="underline underline-offset-2">Past digs</Link> stay open to play and browse.</p>
      </section>
    </main>
  );
}
