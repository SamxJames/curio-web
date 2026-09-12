"use client";

import { useState } from "react";
import Link from "next/link";
import type { WordEntry } from "@/lib/words";
import { markOnboarded } from "@/lib/storage";
import ThemeToggle from "./ThemeToggle";

type Status = "idle" | "submitting" | "success" | "error";

/** The merged first-look hero for anonymous, first-time visitors — replaces
 * the old pairing of the plain Today hero plus a separate OnboardingBanner
 * pitch. Marks onboarded (see lib/storage.ts) only on a real interaction —
 * submitting the email, or clicking through to the story — not on a bare
 * page view, so reloading mid-read doesn't prematurely swap to the normal
 * Today page. See components/HomeContent.tsx for how this is chosen. */
export default function ArrivalHero({ word, date }: { word: WordEntry; date: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setErrorMessage("");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      setStatus("success");
      // Delayed (unlike the "Find out more" / archive links below, which mark
      // onboarded immediately since they navigate away): marking onboarded
      // right away would flip HomeContent to TodayHero in the same commit as
      // this success state, so the "You're in" message would never actually
      // paint. Giving it a couple seconds first lets it be seen.
      setTimeout(() => markOnboarded(), 2000);
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-1px)] max-w-[640px] flex-col px-6">
      <div className="flex items-center justify-between py-5">
        <Link href="/" className="font-serif text-lg tracking-tight">
          Curio
        </Link>
        <ThemeToggle />
      </div>

      <div className="flex flex-1 flex-col pt-10 pb-10">
        <p className="font-sans text-[11px] tracking-[0.14em] text-accent uppercase">
          Today&apos;s word &middot; {date}
        </p>

        <h1 className="mt-4 font-serif text-[44px] leading-[1.05] font-bold">{word.word}</h1>
        <p className="mt-3 font-sans text-sm text-ink-soft">
          {word.respelling} &middot; {word.partOfSpeech}
        </p>

        <p className="mt-6 max-w-[46ch] font-serif text-[19px] leading-[1.38] text-ink">
          {word.teaser}
        </p>

        <Link
          href={`/story/${word.slug}`}
          onClick={() => markOnboarded()}
          className="mt-6 inline-flex w-fit font-sans text-sm font-medium text-accent transition-opacity hover:opacity-80"
        >
          Find out more &rarr;
        </Link>

        <div className="flex-1" />

        <div className="border-t border-line pt-8">
          <p className="font-sans text-sm leading-relaxed text-ink-soft">
            One word, one story, every day.
            <br />
            No feed. No backlog to catch up on.
          </p>

          {status === "success" ? (
            <p className="mt-5 font-sans text-sm text-ink-soft">
              You&apos;re in. Your first word arrives tomorrow.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="mt-5 flex gap-2">
              <input
                type="email"
                name="email"
                inputMode="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="min-w-0 flex-1 rounded-full border border-line bg-paper-raised px-4 py-2.5 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent"
              />
              <button
                type="submit"
                disabled={status === "submitting"}
                className="shrink-0 rounded-full bg-accent px-5 py-2.5 font-sans text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
              >
                {status === "submitting" ? "Joining…" : "Join"}
              </button>
            </form>
          )}
          {status === "error" && <p className="mt-2 font-sans text-sm text-danger">{errorMessage}</p>}

          <Link
            href="/history"
            onClick={() => markOnboarded()}
            className="mt-6 inline-block font-sans text-xs text-ink-faint transition-colors hover:text-ink-soft"
          >
            Prefer to browse first? See the archive &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
}
