"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import TextField from "@/components/ui/TextField";
import { ANSWER_SECONDS, type Feedback, type GameState } from "@/lib/dig/game";
import type { PromptKind } from "@/lib/dig/types";

type Props = {
  index: number;
  total: number;
  prompt: { id: string; kind: PromptKind; text: string };
  phase: GameState["phase"];
  clock: number;
  noTimer: boolean;
  feedback: Feedback;
  onSubmit: (guess: string) => void;
  onPass: () => void;
};

/** One prompt (mockup screen 2). Rendered with key={index} by DigGame, so the field resets.
 * Red is reserved for Start, Copy result and Join, so Dig and Pass are both quiet buttons. */
export default function PromptScreen({ index, total, prompt, phase, clock, noTimer, feedback, onSubmit, onPass }: Props) {
  const [guess, setGuess] = useState("");
  const reading = phase === "reading";
  const announce = !noTimer && phase === "answering" && (clock === 10 || clock === 5) ? `${clock} seconds left` : "";
  return (
    <section aria-labelledby="dig-prompt" className="mt-8">
      <p className="font-sans text-sm text-ink-faint">{`Prompt ${index + 1} of ${total}`}</p>
      <h2 id="dig-prompt" className="mt-2 font-display text-3xl leading-display">{prompt.text}</h2>
      {!noTimer && (
        <div className="mt-5" aria-hidden={reading}>
          <p className="font-sans text-sm text-ink-soft">{reading ? "Ready…" : `${clock} seconds left`}</p>
          <div role="progressbar" aria-label="Time left" aria-valuemin={0} aria-valuemax={ANSWER_SECONDS}
            aria-valuenow={reading ? ANSWER_SECONDS : clock} className="mt-2 h-2 w-full overflow-hidden rounded-full bg-paper-raised">
            <div className="h-full bg-ink transition-all duration-1000 ease-linear motion-reduce:transition-none"
              style={{ width: `${((reading ? ANSWER_SECONDS : clock) / ANSWER_SECONDS) * 100}%` }} />
          </div>
        </div>
      )}
      <p className="sr-only" aria-live="assertive">{announce}</p>
      <form className="mt-6 flex gap-2" onSubmit={(e) => { e.preventDefault(); onSubmit(guess); }}>
        <div className="min-w-0 flex-1">
          {/* readOnly, not disabled, during the read pause: a disabled field can't hold the
              autoFocus, so the player would have to tap it again when the clock starts. */}
          <TextField aria-label="Your answer" value={guess} onChange={(e) => setGuess(e.target.value)} readOnly={reading}
            autoFocus autoComplete="off" autoCapitalize="none" spellCheck={false} enterKeyHint="go" maxLength={40} />
        </div>
        <Button type="submit" variant="secondary" disabled={reading} className="shrink-0">Dig</Button>
      </form>
      <div aria-live="polite" className="mt-3 min-h-12 font-sans text-sm text-ink-soft">
        {feedback?.kind === "near" && (
          <p>
            Did you mean <em className="font-display not-italic text-ink">{feedback.suggestion}</em>? Press Enter to accept.{" "}
            <Button variant="link" onClick={() => onSubmit(feedback.guess)}>Yes, {feedback.suggestion}</Button>
          </p>
        )}
        {feedback?.kind === "miss" && <p>Not on today&apos;s list. Try another.</p>}
        {feedback?.kind === "empty" && <p>Type a word first.</p>}
      </div>
      {/* The way out of a prompt with No timer on (and a shortcut with it on). The reducer
          only honours it while answering, so it is disabled during the read pause. */}
      <div className="mt-2">
        <Button type="button" variant="ghost" className="min-h-11 text-sm" disabled={phase !== "answering"} onClick={onPass}>Pass</Button>
      </div>
    </section>
  );
}
