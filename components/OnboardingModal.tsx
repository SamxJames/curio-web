"use client";

import { useState } from "react";
import { markOnboarded, useHasOnboarded } from "@/lib/storage";
import SignupForm from "./SignupForm";

export default function OnboardingModal() {
  const onboarded = useHasOnboarded();
  const [dismissed, setDismissed] = useState(false);
  const open = !onboarded && !dismissed;

  function dismiss() {
    markOnboarded();
    setDismissed(true);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-6 py-10">
      <div className="max-h-full w-full max-w-[420px] overflow-y-auto rounded-lg border border-line bg-paper p-8 shadow-xl">
        <p className="font-serif text-2xl italic leading-snug">
          One word. One story.
          <br />
          Every day.
        </p>
        <p className="mt-4 font-sans text-sm leading-relaxed text-ink-soft">
          Curio sends a single word&apos;s origin story once a day — where it
          came from, how its meaning shifted, and what it&apos;s related to.
          No feed, no backlog to catch up on. Just one word.
        </p>

        <div className="mt-8">
          <SignupForm onSubscribed={dismiss} />
        </div>

        <button
          onClick={dismiss}
          className="mt-5 w-full text-center font-sans text-xs text-ink-faint hover:text-ink-soft cursor-pointer"
        >
          Maybe later — just let me browse
        </button>
      </div>
    </div>
  );
}
