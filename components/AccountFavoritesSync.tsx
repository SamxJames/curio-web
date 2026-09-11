"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { getFavorites, mergeFavoritesFromAccount } from "@/lib/storage";

const OFFERED_KEY = "curio:localImportOffered";

/** Runs once whenever a session appears: pulls the account's server-side
 * favorites down into local storage (so they show up on this device even if
 * it has none locally yet), then — the first time only, per browser —
 * offers to push up any favorites this browser had before the account
 * existed. */
export default function AccountFavoritesSync() {
  const { status } = useSession();
  const [importCandidates, setImportCandidates] = useState<string[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (status !== "authenticated") return;
    if (typeof window === "undefined") return;

    fetch("/api/favorites")
      .then((res) => (res.ok ? res.json() : { slugs: [] as string[] }))
      .then((data: { slugs: string[] }) => {
        const accountSlugs = new Set(data.slugs);
        // Pull-down runs on every authenticated sign-in, unconditionally —
        // only the one-time import *offer* below is gated by OFFERED_KEY.
        mergeFavoritesFromAccount(data.slugs);

        if (window.localStorage.getItem(OFFERED_KEY)) return;

        const localOnly = Array.from(getFavorites()).filter((slug) => !accountSlugs.has(slug));
        setImportCandidates(localOnly);
      })
      .catch(() => {});
  }, [status]);

  async function handleImport() {
    await fetch("/api/account/import-favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slugs: importCandidates }),
    }).catch(() => {});
    window.localStorage.setItem(OFFERED_KEY, "1");
    setDismissed(true);
  }

  function handleSkip() {
    window.localStorage.setItem(OFFERED_KEY, "1");
    setDismissed(true);
  }

  if (dismissed || importCandidates.length === 0) return null;

  const count = importCandidates.length;
  return (
    <div className="border-b border-line bg-paper-raised px-6 py-3">
      <div className="mx-auto flex max-w-[640px] flex-wrap items-center justify-between gap-3">
        <p className="font-sans text-sm text-ink-soft">
          You have {count} favorite{count === 1 ? "" : "s"} saved on this device — import{" "}
          {count === 1 ? "it" : "them"} into your account?
        </p>
        <div className="flex gap-2">
          <button
            onClick={handleSkip}
            className="rounded-full px-3.5 py-1.5 font-sans text-sm text-ink-soft transition-colors hover:text-ink cursor-pointer"
          >
            Skip
          </button>
          <button
            onClick={handleImport}
            className="rounded-full bg-accent px-3.5 py-1.5 font-sans text-sm font-medium text-paper transition-opacity hover:opacity-90 cursor-pointer"
          >
            Import
          </button>
        </div>
      </div>
    </div>
  );
}
