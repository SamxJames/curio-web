import type { Metadata } from "next";
import Link from "next/link";
import MarkSubscribedHere from "@/components/MarkSubscribedHere";

export const metadata: Metadata = {
  title: "Subscription — Curio",
  robots: { index: false, follow: false },
};

export default async function SubscribedPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string }>;
}) {
  const { ok } = await searchParams;
  const success = ok === "1";

  return (
    <section className="mx-auto max-w-form px-6 py-24 text-center">
      {success && <MarkSubscribedHere />}
      <h1 className="font-serif text-3xl">{success ? "You're in" : "That link didn't work"}</h1>
      <p className="mt-4 font-sans text-sm leading-relaxed text-ink-soft">
        {success
          ? "Tomorrow's word arrives in the morning. Every email has a one-click unsubscribe."
          : "It may have expired (links last 7 days) or been copied incompletely. You can sign up again from the homepage."}
      </p>
      <Link href="/" className="mt-8 inline-block font-sans text-sm text-ink-soft underline underline-offset-4 hover:text-ink">
        {success ? "Read today's word" : "Go to the homepage"}
      </Link>
    </section>
  );
}
