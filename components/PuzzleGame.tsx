"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Share } from "lucide-react";
import type { WordEntry } from "@/lib/words";
import { isCorrectGuess, buildPuzzleShareText } from "@/lib/puzzle";
import {
  usePlayState,
  savePlayState,
  usePuzzleStats,
  recordPuzzleResult,
  type PlayState,
} from "@/lib/storage";
import { useSession } from "next-auth/react";
import EmailSignupInline from "./EmailSignupInline";

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

const CLUE_LABELS = ["First clue", "Second clue", "Third clue"] as const;

export default function PuzzleGame({
  word,
  puzzleNumber,
}: {
  word: WordEntry;
  puzzleNumber: number;
}) {
  const puzzleDate = todayDateString();
  const localState = usePlayState(puzzleDate);
  const stats = usePuzzleStats();
  const { status: sessionStatus } = useSession();
  const [guess, setGuess] = useState("");
  const [wrongFlash, setWrongFlash] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  // Fresh state for a puzzle date this browser has no local record of yet.
  const state: PlayState = localState ?? {
    puzzleDate,
    cluesRevealed: 1,
    status: "playing",
    cluesUsedToSolve: null,
  };

  // Pull down a signed-in account's saved state for today's puzzle once,
  // if this browser has no local record yet (e.g. they played on another
  // device) — mirrors AccountFavoritesSync's pull-on-sign-in idea, scoped
  // to just today's puzzle rather than a whole reconciliation flow.
  useEffect(() => {
    if (sessionStatus !== "authenticated" || localState) return;
    fetch(`/api/play-state?date=${puzzleDate}`)
      .then((res) => (res.ok ? res.json() : { state: null }))
      .then((data: { state: PlayState | null }) => {
        if (data.state) savePlayState(data.state);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStatus, puzzleDate]);

  function handleGuess(e: React.FormEvent) {
    e.preventDefault();
    if (state.status !== "playing" || !guess.trim()) return;
    attemptGuess(guess);
    setGuess("");
  }

  function handleNeedAnotherClue() {
    if (state.status !== "playing" || state.cluesRevealed >= 3) return;
    savePlayState({ ...state, cluesRevealed: (state.cluesRevealed + 1) as 2 | 3 });
  }

  function attemptGuess(rawGuess: string) {
    if (isCorrectGuess(rawGuess, word.word)) {
      const cluesUsed = state.cluesRevealed;
      savePlayState({ ...state, status: "solved", cluesUsedToSolve: cluesUsed });
      recordPuzzleResult(cluesUsed);
      return;
    }

    setWrongFlash(true);
    setTimeout(() => setWrongFlash(false), 600);

    if (state.cluesRevealed >= 3) {
      savePlayState({ ...state, status: "failed", cluesUsedToSolve: null });
      recordPuzzleResult(null);
      return;
    }

    savePlayState({ ...state, cluesRevealed: (state.cluesRevealed + 1) as 2 | 3 });
  }

  async function handleShare() {
    const siteUrl = window.location.origin;
    const text = buildPuzzleShareText(puzzleNumber, state.cluesUsedToSolve, siteUrl);
    if (navigator.share) {
      try {
        await navigator.share({ text });
      } catch {
        // user dismissed the share sheet
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch {
      // Clipboard access can reject in an insecure context or when
      // permission is denied — leave shareCopied false rather than
      // claiming a copy that didn't happen.
    }
  }

  const isDone = state.status === "solved" || state.status === "failed";

  return (
    <div className="mx-auto max-w-[640px] px-6 py-16">
      <p className="font-sans text-xs tracking-wide text-ink-faint">Puzzle #{puzzleNumber}</p>
      <h1 className="mt-3 font-serif text-3xl">Guess the word</h1>

      {!isDone && (
        <div className="mt-8 space-y-4">
          {Array.from({ length: state.cluesRevealed }, (_, i) => (
            <div key={i}>
              <p className="font-sans text-xs tracking-wide text-ink-faint">{CLUE_LABELS[i]}</p>
              <p className="mt-1 font-serif text-lg leading-relaxed text-ink">{word.clues[i]}</p>
            </div>
          ))}

          <form onSubmit={handleGuess} className="mt-6 flex gap-2">
            <input
              type="text"
              value={guess}
              onChange={(e) => setGuess(e.target.value)}
              placeholder="Type your guess…"
              aria-label="Your guess"
              className="min-w-0 flex-1 rounded-md border border-line bg-transparent px-3 py-2.5 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent"
            />
            <button
              type="submit"
              className="shrink-0 rounded-md bg-accent px-4 py-2.5 font-sans text-sm font-medium text-paper transition-opacity hover:opacity-90 cursor-pointer"
            >
              Guess
            </button>
          </form>
          {wrongFlash && (
            <p className="font-sans text-sm text-danger">Not quite — here&apos;s another clue.</p>
          )}
          {state.cluesRevealed < 3 && (
            <button
              type="button"
              onClick={handleNeedAnotherClue}
              className="font-sans text-xs text-ink-faint underline underline-offset-2 transition-colors hover:text-ink-soft cursor-pointer"
            >
              I need another clue
            </button>
          )}
        </div>
      )}

      {isDone && (
        <div className="mt-8">
          <p className="font-sans text-sm text-ink-soft">
            {state.status === "solved" ? "Solved it." : "This one got away."}
          </p>
          <h2 className="mt-2 font-serif text-4xl">{word.word}</h2>
          <p className="mt-1 font-sans text-sm text-ink-soft">
            {word.respelling} &middot; {word.partOfSpeech}
          </p>

          <Link
            href={`/story/${word.slug}`}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 font-sans text-sm font-medium text-paper transition-opacity hover:opacity-90"
          >
            Read the full story &rarr;
          </Link>

          <button
            type="button"
            onClick={handleShare}
            className="mt-6 flex items-center gap-2 font-sans text-sm text-ink-soft transition-colors hover:text-ink cursor-pointer"
          >
            <Share size={15} strokeWidth={1.75} />
            {shareCopied ? "Copied" : "Share your result"}
          </button>

          <div className="mt-10 border-t border-line pt-6">
            <p className="font-sans text-sm text-ink-soft">
              One word, one story, every day — get tomorrow&apos;s in your inbox.
            </p>
            <div className="mt-4">
              <EmailSignupInline />
            </div>
          </div>

          <div className="mt-10 border-t border-line pt-6">
            <h2 className="font-sans text-xs tracking-wide text-ink-faint">Your stats</h2>
            <p className="mt-2 font-sans text-sm text-ink-soft">
              {stats.played} {stats.played === 1 ? "game" : "games"} played
            </p>
            <div className="mt-3 space-y-1">
              {(["1 clue", "2 clues", "3 clues", "Not solved"] as const).map((label, i) => (
                <div key={label} className="flex items-center gap-3 font-sans text-xs text-ink-soft">
                  <span className="w-16 shrink-0">{label}</span>
                  <div className="h-2 flex-1 bg-line">
                    <div
                      className="h-2 bg-accent"
                      style={{
                        width: stats.played > 0 ? `${(stats.histogram[i] / stats.played) * 100}%` : "0%",
                      }}
                    />
                  </div>
                  <span className="w-6 shrink-0 text-right">{stats.histogram[i]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
