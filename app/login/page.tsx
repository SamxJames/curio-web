"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { detectMailProvider, openMailProvider, MAIL_PROVIDERS } from "@/lib/mailProviders";
import Button from "@/components/ui/Button";
import TextField from "@/components/ui/TextField";

type Status = "idle" | "submitting" | "sent" | "error";

// How often (and for how long) this tab checks whether the link it sent got
// verified somewhere else — see the effect below and app/api/auth/device-link.
const DEVICE_LINK_POLL_MS = 3000;
const DEVICE_LINK_MAX_POLLS = 300; // ~15 minutes, matching the Redis entry's TTL

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  // One id per page load, not per submit — reused if the person edits the
  // email and resends, which is harmless (the old id just expires unused).
  const [attemptId] = useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : null
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    try {
      const callbackUrl = attemptId ? `/api/auth/device-link?attempt=${attemptId}` : "/";
      const result = await signIn("resend", { email, redirect: false, callbackUrl });
      setStatus(result?.error ? "error" : "sent");
    } catch {
      setStatus("error");
    }
  }

  // Once the link is out, poll for it having been verified elsewhere (e.g.
  // opened on a phone) so this tab signs itself in instead of sitting on
  // "check your email" until someone comes back and reloads it by hand.
  useEffect(() => {
    if (status !== "sent" || !attemptId) return;

    let cancelled = false;
    let polls = 0;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      if (cancelled) return;
      polls += 1;
      try {
        const res = await fetch(`/api/auth/device-link/status?attempt=${attemptId}`);
        const data = (await res.json()) as { linked: boolean };
        if (data.linked) {
          // A full reload, not router.push — SessionProvider's useSession()
          // doesn't refetch on client-side navigation, only on focus/mount,
          // so a soft transition would land on "/" still showing signed out.
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.href = "/";
          return;
        }
      } catch {
        // Transient network hiccup — just try again on the next tick.
      }
      if (!cancelled && polls < DEVICE_LINK_MAX_POLLS) {
        timer = setTimeout(poll, DEVICE_LINK_POLL_MS);
      }
    }

    timer = setTimeout(poll, DEVICE_LINK_POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [status, attemptId]);

  if (status === "sent") {
    const matched = detectMailProvider(email);
    // Show the detected provider first (if any), then the rest as smaller
    // fallback links — most people only need the one button, but a second
    // email account or a guess that didn't match should still be one tap away.
    const others = MAIL_PROVIDERS.filter((p) => p !== matched);

    return (
      <section className="mx-auto max-w-form px-6 py-20">
        <p className="font-sans text-sm text-ink-soft">
          Check {email} for a sign-in link. It expires in 24 hours.
        </p>

        {matched && (
          <Button type="button" fullWidth className="mt-6" onClick={() => openMailProvider(matched)}>
            Open {matched.label}
          </Button>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 font-sans text-sm text-ink-soft">
          {!matched && <span className="text-ink-faint">Open your inbox:</span>}
          {others.map((p) => (
            <Button key={p.label} variant="ghost" type="button" onClick={() => openMailProvider(p)}>
              {p.label}
            </Button>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-form px-6 py-20">
      <h1 className="font-serif text-3xl">Sign in</h1>
      <p className="mt-3 font-sans text-sm text-ink-soft">
        We&apos;ll email you a link — no password needed.
      </p>
      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <TextField
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          label="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
        {status === "error" && (
          <p className="font-sans text-sm text-danger">Something went wrong. Try again.</p>
        )}
        <Button
          type="submit"
          fullWidth
          loading={status === "submitting"}
          disabled={status === "submitting"}
        >
          {status === "submitting" ? "Sending…" : "Send sign-in link"}
        </Button>
      </form>
    </section>
  );
}
