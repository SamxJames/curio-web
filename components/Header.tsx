"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { useSession } from "next-auth/react";
import { useShowArrival } from "@/lib/useShowArrival";
import { writeSessionHint } from "@/lib/storage";
import ThemeToggle from "./ThemeToggle";

export default function Header() {
  const pathname = usePathname();
  const { status } = useSession();
  const showArrival = useShowArrival();

  // The only writer of the session hint (see readSessionHint's doc comment
  // in lib/storage.ts) — runs whenever useSession() settles, so the next
  // cold load's pre-hydration script (components/SessionHintInit.tsx) has
  // an up-to-date answer to paint the nav with before this component (and
  // its "loading" state below) ever renders.
  useEffect(() => {
    if (status === "authenticated") writeSessionHint(true);
    else if (status === "unauthenticated") writeSessionHint(false);
  }, [status]);

  // The arrival hero (app/page.tsx, first-time anonymous visitors only)
  // draws its own wordmark + theme toggle row as part of its layout — the
  // global header would otherwise duplicate that row and add nav links
  // ("Today", "History", "Sign in") that don't make sense before someone
  // has read a single word yet. See components/HomeContent.tsx for the
  // exact same condition this mirrors (useShowArrival has no route
  // awareness of its own, hence the separate pathname check here).
  const isArrivalRoute = pathname === "/" && showArrival;
  if (isArrivalRoute) return null;

  const todayActive = pathname === "/";
  const historyActive = pathname.startsWith("/history");
  const collectionActive = pathname.startsWith("/collection");
  const accountActive = pathname === "/account";
  const navLinkClass = (active: boolean) =>
    clsx("text-sm transition-colors", active ? "text-ink" : "text-ink-soft hover:text-ink");

  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-page items-center justify-between px-6 py-5">
        <Link href="/" className="font-serif text-lg tracking-tight">
          Curio
        </Link>
        <nav className="flex items-center gap-5">
          <Link href="/" className={navLinkClass(todayActive)}>
            Today
          </Link>

          {/* useSession() is "loading" on a cold load until its client-side
              fetch resolves. Rather than guessing which pair to render,
              render both pairs and let app/globals.css's `signed-in:`
              variant — driven by SessionHintInit's pre-hydration script —
              pick the right one before paint. Once status resolves, only
              the one matching pair renders. */}
          {status === "authenticated" ? (
            <Link href="/collection" className={navLinkClass(collectionActive)}>
              Collection
            </Link>
          ) : status === "unauthenticated" ? (
            <Link href="/history" className={navLinkClass(historyActive)}>
              History
            </Link>
          ) : (
            <>
              <Link href="/history" className={clsx(navLinkClass(historyActive), "signed-in:hidden")}>
                History
              </Link>
              <Link
                href="/collection"
                className={clsx("hidden signed-in:inline", navLinkClass(collectionActive))}
              >
                Collection
              </Link>
            </>
          )}

          {status === "authenticated" ? (
            <Link href="/account" className={navLinkClass(accountActive)}>
              Account
            </Link>
          ) : status === "unauthenticated" ? (
            <Link href="/login" className="text-sm text-ink-soft transition-colors hover:text-ink">
              Sign in
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="text-sm text-ink-soft transition-colors hover:text-ink signed-in:hidden"
              >
                Sign in
              </Link>
              <Link
                href="/account"
                className={clsx("hidden signed-in:inline", navLinkClass(accountActive))}
              >
                Account
              </Link>
            </>
          )}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
