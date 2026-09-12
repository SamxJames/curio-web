"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { useSession } from "next-auth/react";
import { useHasOnboarded } from "@/lib/storage";
import ThemeToggle from "./ThemeToggle";

export default function Header() {
  const pathname = usePathname();
  const { status } = useSession();
  const onboarded = useHasOnboarded();

  // The arrival hero (app/page.tsx, first-time anonymous visitors only)
  // draws its own wordmark + theme toggle row as part of its layout — the
  // global header would otherwise duplicate that row and add nav links
  // ("Today", "History", "Sign in") that don't make sense before someone
  // has read a single word yet. See components/HomeContent.tsx for the
  // exact same condition this mirrors.
  const isArrivalRoute = pathname === "/" && status !== "authenticated" && !onboarded;
  if (isArrivalRoute) return null;

  const secondNavItem =
    status === "authenticated"
      ? { href: "/collection", label: "Collection" }
      : { href: "/history", label: "History" };
  const NAV = [{ href: "/", label: "Today" }, secondNavItem];

  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-[640px] items-center justify-between px-6 py-5">
        <Link href="/" className="font-serif text-lg tracking-tight">
          Curio
        </Link>
        <nav className="flex items-center gap-5">
          {NAV.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "text-sm transition-colors",
                  active ? "text-ink" : "text-ink-soft hover:text-ink"
                )}
              >
                {item.label}
              </Link>
            );
          })}
          {status === "authenticated" ? (
            <Link
              href="/account"
              className={clsx(
                "text-sm transition-colors",
                pathname === "/account" ? "text-ink" : "text-ink-soft hover:text-ink"
              )}
            >
              Account
            </Link>
          ) : status === "unauthenticated" ? (
            <Link href="/login" className="text-sm text-ink-soft transition-colors hover:text-ink">
              Sign in
            </Link>
          ) : null}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
