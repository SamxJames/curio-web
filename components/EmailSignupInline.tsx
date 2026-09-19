"use client";

import { useState } from "react";
import { track } from "@/lib/analytics";
import Button from "@/components/ui/Button";
import TextField from "@/components/ui/TextField";

type Status = "idle" | "submitting" | "success" | "error";

/** The single-field email capture pill — used on the arrival hero (first
 * homepage view) and, unmodified, on /play's post-game funnel. Fires the
 * same "signup_submitted" event from both places, since it's genuinely the
 * same action either way. */
export default function EmailSignupInline({ onSubscribed }: { onSubscribed?: () => void }) {
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
      track("signup_submitted");
      onSubscribed?.();
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  if (status === "success") {
    return (
      <p className="font-sans text-sm text-ink-soft">You&apos;re in. Your first word arrives tomorrow.</p>
    );
  }

  return (
    <div>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="min-w-0 flex-1">
          <TextField
            type="email"
            name="email"
            inputMode="email"
            autoComplete="email"
            required
            aria-label="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
          />
        </div>
        <Button type="submit" disabled={status === "submitting"} className="shrink-0">
          {status === "submitting" ? "Joining…" : "Join"}
        </Button>
      </form>
      {status === "error" && <p className="mt-2 font-sans text-sm text-danger">{errorMessage}</p>}
    </div>
  );
}
