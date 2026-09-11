"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { detectMailProvider, MAIL_PROVIDERS } from "@/lib/mailProviders";

type Status = "idle" | "submitting" | "sent" | "error";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    try {
      const result = await signIn("resend", { email, redirect: false, callbackUrl: "/" });
      setStatus(result?.error ? "error" : "sent");
    } catch {
      setStatus("error");
    }
  }

  if (status === "sent") {
    const matched = detectMailProvider(email);
    // Show the detected provider first (if any), then the rest as smaller
    // fallback links — most people only need the one button, but a second
    // email account or a guess that didn't match should still be one tap away.
    const others = MAIL_PROVIDERS.filter((p) => p !== matched);

    return (
      <section className="mx-auto max-w-[440px] px-6 py-20">
        <p className="font-sans text-sm text-ink-soft">
          Check {email} for a sign-in link. It expires in 24 hours.
        </p>

        {matched && (
          <a
            href={matched.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-flex w-full items-center justify-center rounded-md bg-accent px-4 py-2.5 font-sans text-sm font-medium text-paper transition-opacity hover:opacity-90"
          >
            Open {matched.label}
          </a>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 font-sans text-sm text-ink-soft">
          {!matched && <span className="text-ink-faint">Open your inbox:</span>}
          {others.map((p) => (
            <a
              key={p.label}
              href={p.url}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-ink"
            >
              {p.label}
            </a>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-[440px] px-6 py-20">
      <h1 className="font-serif text-3xl">Sign in</h1>
      <p className="mt-3 font-sans text-sm text-ink-soft">
        We&apos;ll email you a link — no password needed.
      </p>
      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
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
        {status === "error" && (
          <p className="font-sans text-sm text-danger">Something went wrong. Try again.</p>
        )}
        <button
          type="submit"
          disabled={status === "submitting"}
          className="w-full rounded-md bg-accent px-4 py-2.5 font-sans text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
        >
          {status === "submitting" ? "Sending…" : "Send sign-in link"}
        </button>
      </form>
    </section>
  );
}
