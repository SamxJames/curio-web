"use client";

import { useState } from "react";
import HourWheel from "./HourWheel";

type Status = "idle" | "submitting" | "success" | "error";

export default function SignupForm({ onSubscribed }: { onSubscribed?: () => void }) {
  const [email, setEmail] = useState("");
  const [hour, setHour] = useState(9);
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
        body: JSON.stringify({ email, hour }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      setStatus("success");
      onSubscribed?.();
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  if (status === "success") {
    return (
      <p className="font-sans text-sm text-ink-soft">
        You&apos;re in. Your first word arrives at your next chosen hour.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="email" className="mb-2 block font-sans text-xs tracking-wide text-ink-faint">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full rounded-md border border-line bg-transparent px-3 py-2.5 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
        />
      </div>

      <div>
        <p className="mb-2 text-center font-sans text-xs tracking-wide text-ink-faint">
          Delivery hour
        </p>
        <HourWheel value={hour} onChange={setHour} />
      </div>

      {status === "error" && (
        <p className="font-sans text-sm text-danger">{errorMessage}</p>
      )}

      <button
        type="submit"
        disabled={status === "submitting"}
        className="w-full rounded-md bg-accent px-4 py-2.5 font-sans text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
      >
        {status === "submitting" ? "Subscribing…" : "Get the daily word"}
      </button>
    </form>
  );
}
