"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Share } from "lucide-react";
import type { WordEntry } from "@/lib/words";
import {
  isCorrectGuess,
  isCloseGuess,
  isRepeatGuess,
  revealedLetterPositions,
  buildPuzzleShareText,
  MAX_FREE_CLOSE_GUESSES,
} from "@/lib/puzzleGuess";
import { dayKey } from "@/lib/day";
import { sendTrafficEvent } from "@/lib/trafficClient";
import {
  usePlayState,
  savePlayState,
  usePuzzleStats,
  recordPuzzleResult,
  type PlayState,
} from "@/lib/storage";
import { useSession } from "next-auth/react";
import SignupOffer from "./SignupOffer";
import LetterTiles from "./LetterTiles";
import Button from "@/components/ui/Button";
import TextField from "@/components/ui/TextField";
import { shareOrCopy } from "@/lib/shareOrCopy";

const CLUE_LABELS = ["First clue", "Second clue", "Third clue"] as const;

/** Longest guess kept in the saved list, so a pasted paragraph can't bloat
 * local storage or the synced account copy. */
const MAX_SAVED_GUESS_LENGTH = 40;

type Feedback = "wrong" | "close" | "lastClose" | "repeat" | null;

const FEEDBACK_TEXT: Record<Exclude<Feedback, null>, string> = {
  wrong: "Not quite — here's another clue.",
  close: "So close! Check your spelling — that one didn't cost a guess.",
  lastClose: "So close! Check your spelling — that one was free, but the next near miss will count.",
  repeat: "You've already tried that one.",
};

/** One-line rules under the heading, so a first-time visitor knows what the puzzle is. */
export function PuzzleRules() {
  return (
    <p className="mt-2 font-sans text-base text-ink-soft">
      Guess today&apos;s word in up to three clues. Each clue gives more away.
    </p>
  );
}

export default function PuzzleGame({
  word,
  puzzleNumber,
  digOpen = false,
}: {
  word: WordEntry;
  puzzleNumber: number;
  /** Whether curio dig has launched; the end screen offers it as one more game. */
  digOpen?: boolean;
}) {
  const puzzleDate = dayKey();
  const localState = usePlayState(puzzleDate);
  const stats = usePuzzleStats();
  const { status: sessionStatus } = useSession();
  const [guess, setGuess] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
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
    setFeedback(null);
    savePlayState({ ...state, cluesRevealed: (state.cluesRevealed + 1) as 2 | 3 });
  }

  function attemptGuess(rawGuess: string) {
    if (isCorrectGuess(rawGuess, word.word)) {
      const cluesUsed = state.cluesRevealed;
      setFeedback(null);
      savePlayState({ ...state, status: "solved", cluesUsedToSolve: cluesUsed });
      recordPuzzleResult(cluesUsed);
      return;
    }

    const prior = state.guesses ?? [];
    if (isRepeatGuess(rawGuess, prior.map((g) => g.text))) {
      setFeedback("repeat");
      return;
    }

    const text = rawGuess.trim().slice(0, MAX_SAVED_GUESS_LENGTH);
    const freeUsed = prior.filter((g) => g.free).length;

    // A near miss is forgiven, up to a cap: it stays on this clue.
    if (isCloseGuess(rawGuess, word.word) && freeUsed < MAX_FREE_CLOSE_GUESSES) {
      setFeedback(freeUsed + 1 < MAX_FREE_CLOSE_GUESSES ? "close" : "lastClose");
      savePlayState({ ...state, guesses: [...prior, { text, free: true }] });
      return;
    }

    const guesses = [...prior, { text, free: false }];
    if (state.cluesRevealed >= 3) {
      setFeedback(null);
      savePlayState({ ...state, guesses, status: "failed", cluesUsedToSolve: null });
      recordPuzzleResult(null);
      return;
    }

    setFeedback("wrong");
    savePlayState({ ...state, guesses, cluesRevealed: (state.cluesRevealed + 1) as 2 | 3 });
  }

  async function handleShare() {
    const text = buildPuzzleShareText(puzzleNumber, state.cluesUsedToSolve, window.location.origin);
    const how = await shareOrCopy(text);
    if (how === "shared" || how === "copied") sendTrafficEvent({ kind: "share", what: "puzzle" });
    if (how === "copied") {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    }
  }

  const isDone = state.status === "solved" || state.status === "failed";
  const guesses = state.guesses ?? [];

  return (
    <div className="mx-auto max-w-page px-6 py-16">
      <p className="font-sans text-xs tracking-wide text-ink-faint">Puzzle #{puzzleNumber}</p>
      <h1 className="mt-3 font-serif text-3xl">Guess the word</h1>
      <PuzzleRules />

      {!isDone && (
        <div className="mt-8 space-y-4">
          {Array.from({ length: state.cluesRevealed }, (_, i) => (
            <div key={i}>
              <p className="font-sans text-xs tracking-wide text-ink-faint">{CLUE_LABELS[i]}</p>
              <p className="mt-1 font-serif text-lg leading-relaxed text-ink">{word.clues[i]}</p>
            </div>
          ))}

          {/* The answer's shape: its length from the start, then a letter
              more with each later clue (see revealedLetterPositions). */}
          <div className="pt-4">
            <LetterTiles
              word={word.word}
              revealed={revealedLetterPositions(word.word, state.cluesRevealed)}
              outcome="playing"
            />
          </div>

          {/* One turn per clue: a wrong guess or "another clue" both move on,
              and a wrong guess on the third ends the game. */}
          <div className="mt-6">
            <p aria-live="polite" className="font-sans text-sm text-ink-soft">
              Guess {state.cluesRevealed} of 3
            </p>
            <form onSubmit={handleGuess} className="mt-2 flex gap-2">
              <div className="min-w-0 flex-1">
                <TextField
                  type="text"
                  value={guess}
                  onChange={(e) => setGuess(e.target.value)}
                  placeholder="Type your guess…"
                  aria-label="Your guess"
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="go"
                />
              </div>
              <Button type="submit">
                Guess
              </Button>
            </form>
          </div>
          <p
            role="status"
            className={
              feedback === "wrong" || feedback === "repeat"
                ? "font-sans text-sm text-danger"
                : "font-sans text-sm text-accent-deep"
            }
          >
            {feedback ? FEEDBACK_TEXT[feedback] : ""}
          </p>
          {guesses.length > 0 && (
            <div>
              <p className="font-sans text-xs tracking-wide text-ink-faint">Tried</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {guesses.map((g, i) => (
                  <li
                    key={i}
                    className={
                      g.free
                        ? "rounded-full border border-dashed border-accent px-3 py-1 font-sans text-sm text-ink-soft"
                        : "rounded-full border border-line px-3 py-1 font-sans text-sm text-ink-faint line-through"
                    }
                  >
                    {g.text}
                    {g.free && <span className="text-accent-deep"> · close</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {state.cluesRevealed < 3 && (
            <Button variant="link" className="text-xs" onClick={handleNeedAnotherClue}>
              I need another clue
            </Button>
          )}
        </div>
      )}

      {isDone && (
        <div role="status" className="mt-8">
          <p className="font-sans text-sm text-ink-soft">
            {state.status === "solved" ? "Solved it." : "This one got away."}
          </p>
          <h2 className="mt-3">
            <LetterTiles word={word.word} revealed={[]} outcome={state.status === "solved" ? "solved" : "failed"} />
          </h2>
          <p className="mt-3 font-sans text-sm text-ink-soft">
            {word.respelling} &middot; {word.partOfSpeech}
          </p>
          <p className="mt-4 max-w-[46ch] font-serif text-lg leading-relaxed text-ink">{word.teaser}</p>

          {/* Sharing is the primary action: it's how the puzzle reaches
           * new people. The story is one tap away as the secondary. */}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button className="inline-flex items-center gap-2 border border-transparent" onClick={handleShare}>
              <Share size={15} strokeWidth={1.75} />
              {shareCopied ? "Copied" : "Share your result"}
            </Button>
            <Link
              href={`/story/${word.slug}`}
              className="inline-flex items-center gap-2 rounded-full border border-line-strong px-5 py-2.5 font-sans text-sm text-ink-soft transition-colors hover:border-accent hover:text-ink"
            >
              Read the full story &rarr;
            </Link>
          </div>

          {digOpen && (
            <p className="mt-6 font-sans text-sm text-ink-soft">
              One more for today:{" "}
              <Link href="/dig?from=play" className="text-ink underline underline-offset-2 hover:text-accent">
                curio dig
              </Link>
              : name words that fit seven prompts and see how deep you dig.
            </p>
          )}

          {/* Form for signed-out readers, one tap for signed-in readers who
           * aren't subscribed, nothing for subscribers (see SignupOffer). */}
          <SignupOffer
            placement="play"
            className="mt-10 border-t border-line pt-6"
            pitch={
              <p className="font-sans text-sm text-ink-soft">
                One word, one story, every day: get tomorrow&apos;s in your inbox.
              </p>
            }
          />

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
