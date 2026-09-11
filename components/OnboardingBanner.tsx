"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { markOnboarded, useHasOnboarded } from "@/lib/storage";
import SignupForm from "./SignupForm";

/** A dismissible bottom banner, not a full-screen modal — first-time
 * visitors see today's word immediately; this only asks for their email
 * once they've had a chance to read. Starts collapsed to a single-line
 * teaser so it takes up as little space as possible until someone actually
 * wants to sign up, then expands in place to the full pitch + form.
 * Dismissal (either "maybe later" or the close button, or subscribing) is
 * persisted the same way the previous modal did — once dismissed, it's
 * gone for good on this device. */
export default function OnboardingBanner() {
  const onboarded = useHasOnboarded();
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const open = !onboarded && !dismissed;

  function dismiss() {
    markOnboarded();
    setDismissed(true);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper shadow-[0_-8px_24px_rgba(0,0,0,0.08)]">
      <div className="mx-auto max-w-[640px] px-6 py-5">
        {expanded ? (
          <>
            <div className="flex items-start justify-between gap-4">
              <p className="font-serif text-lg italic leading-snug">
                One word. One story. Every day.
              </p>
              <button
                onClick={dismiss}
                aria-label="Dismiss"
                className="shrink-0 text-ink-faint transition-colors hover:text-ink cursor-pointer"
              >
                <X size={18} strokeWidth={1.75} />
              </button>
            </div>
            <p className="mt-2 font-sans text-sm leading-relaxed text-ink-soft">
              Get a single word&apos;s origin story once a day — no feed, no
              backlog to catch up on. Just one word.
            </p>
            <div className="mt-5">
              <SignupForm onSubscribed={dismiss} />
            </div>
            <button
              onClick={dismiss}
              className="mt-4 font-sans text-xs text-ink-faint transition-colors hover:text-ink-soft cursor-pointer"
            >
              Maybe later
            </button>
          </>
        ) : (
          <div className="flex items-center justify-between gap-4">
            <p className="font-sans text-sm text-ink-soft">
              Get this word by email, once a day.
            </p>
            <div className="flex shrink-0 items-center gap-3">
              <button
                onClick={() => setExpanded(true)}
                className="rounded-full bg-accent px-4 py-2 font-sans text-sm font-medium text-paper transition-opacity hover:opacity-90 cursor-pointer"
              >
                Get the daily word
              </button>
              <button
                onClick={dismiss}
                aria-label="Dismiss"
                className="text-ink-faint transition-colors hover:text-ink cursor-pointer"
              >
                <X size={18} strokeWidth={1.75} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
