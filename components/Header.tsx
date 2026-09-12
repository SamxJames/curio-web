"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { useSession } from "next-auth/react";
import ThemeToggle from "./ThemeToggle";

export default function Header() {
  const pathname = usePathname();
  const { status } = useSession();

  // Signed-in users get "Collection" — their accumulated words — in place
  // of "History"; the two live together as tabs inside /collection, so
  // nothing is lost, and the nav stays at four items either way. Signed-out
  // (and not-yet-resolved) visitors keep History exactly as before.
  const NAV = [
    { href: "/", label: "Today" },
    status === "authenticated"
      ? { href: "/collection", label: "Collection" }
      : { href: "/history", label: "History" },
  ];

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
