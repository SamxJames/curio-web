"use client";

import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import clsx from "clsx";
import Link from "next/link";
import { useSession } from "next-auth/react";
import EmailSignupInline from "./EmailSignupInline";
import SignupPromise from "./SignupPromise";
import Button from "@/components/ui/Button";
import { track } from "@/lib/analytics";
import { offerMode, type OfferInput } from "@/lib/signupOffer";
import { markSubscribedHere, useHasArrivedFromEmailThisSession, useHasSubscribedHere } from "@/lib/storage";
import { getArrivalSource } from "@/lib/trafficClient";
import type { SignupPlacement } from "@/lib/traffic";

type OneTapStatus = "idle" | "pending" | "success" | "error";

/** The one email offer used on every signup spot (arrival hero, TodayHero,
 * StoryFrontDoor, /play's and /dig's end screens). offerMode (lib/signupOffer.ts)
 * picks what to show: the email form for signed-out readers, a one-tap
 * button for signed-in readers who aren't subscribed (GET
 * /api/subscribe/me), or nothing at all, with no wrapper, border or pitch,
 * for anyone this browser knows already gets the email. While the session
 * loads, the form renders (so it is in the server HTML) but the whole offer,
 * pitch included, carries `signed-in:hidden`, which the pre-paint session
 * hint applies, so a signed-in reader never sees it flash in. `onSubscribed`
 * runs after a successful signup on either path (dig counts it in its funnel). */
export default function SignupOffer({
  placement,
  pitch,
  className,
  ariaLabel,
  onSubscribed,
}: {
  placement: SignupPlacement;
  pitch?: React.ReactNode;
  className?: string;
  ariaLabel?: string;
  onSubscribed?: () => void;
}) {
  const { status: session } = useSession();
  const subscribedHere = useHasSubscribedHere();
  const arrivedFromEmail = useHasArrivedFromEmailThisSession();
  const [me, setMe] = useState<OfferInput["me"]>("unknown");
  // Pinned open after a signup here (either path), so the result message
  // isn't unmounted when mode flips to "none" meanwhile: the one-tap marks
  // subscribed-here straight away, and /subscribed sets it once a form
  // signup's emailed link is confirmed, possibly in another tab.
  const [pinned, setPinned] = useState(false);
  const [oneTap, setOneTap] = useState<OneTapStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (session !== "authenticated") return;
    let active = true;
    fetch("/api/subscribe/me")
      .then(async (res) => {
        const data = res.ok ? await res.json() : null;
        if (active) setMe(res.ok ? (data?.subscribed ? "subscribed" : "not-subscribed") : "error");
      })
      .catch(() => {
        if (active) setMe("error");
      });
    return () => {
      active = false;
    };
  }, [session]);

  const mode = offerMode({ session, subscribedHere, arrivedFromEmail, me });

  async function handleOneTap() {
    setOneTap("pending");
    setErrorMessage("");
    try {
      const res = await fetch("/api/subscribe/me", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placement, source: getArrivalSource() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      // flushSync so pinned commits synchronously, ahead of the
      // subscribed-here store re-render markSubscribedHere triggers, which
      // would otherwise flip mode to "none" and unmount this offer.
      flushSync(() => {
        setPinned(true);
        setOneTap("success");
      });
      markSubscribedHere();
      track("signup_submitted");
      onSubscribed?.();
    } catch (err) {
      setOneTap("error");
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  if (mode === "none" && !pinned) return null;

  let action: React.ReactNode;
  if (oneTap === "success") {
    action = (
      <p role="status" className="font-sans text-sm text-ink-soft">
        Done. Tomorrow&apos;s word arrives in your inbox. Manage it in{" "}
        <Link href="/account" className="underline underline-offset-2">
          Account
        </Link>
        .
      </p>
    );
  } else if (mode === "one-tap") {
    action = (
      <div>
        <Button type="button" onClick={handleOneTap} disabled={oneTap === "pending"}>
          {oneTap === "pending" ? "Subscribing…" : "Email me the daily word"}
        </Button>
        <SignupPromise />
        {oneTap === "error" && <p role="alert" className="mt-2 font-sans text-sm text-danger">{errorMessage}</p>}
      </div>
    );
  } else {
    // "form" / "form-unless-signed-in", or pinned after a form signup
    // (EmailSignupInline keeps showing its own "check your inbox" message).
    action = (
      <EmailSignupInline
        placement={placement}
        onSubscribed={() => {
          flushSync(() => setPinned(true));
          onSubscribed?.();
        }}
      />
    );
  }

  const wrapperClass = clsx(className, mode === "form-unless-signed-in" && "signed-in:hidden") || undefined;

  const content = (
    <>
      {pitch}
      <div className={pitch ? "mt-4" : undefined}>{action}</div>
    </>
  );

  return ariaLabel ? (
    <section aria-label={ariaLabel} className={wrapperClass}>
      {content}
    </section>
  ) : (
    <div className={wrapperClass}>{content}</div>
  );
}
