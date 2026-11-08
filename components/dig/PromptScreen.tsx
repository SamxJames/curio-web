"use client";

import { useEffect, useRef, useState } from "react";
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
  /** Switch the timer off mid-prompt. "Turn off timer" shows only when this is passed and the
   * timer is running: once it is off, there is nothing to undo mid-run. */
  onTimer?: (noTimer: boolean) => void;
  /** Offer "should count" beside a rejected guess. False on a past day, where a claim is never sent. */
  canClaim?: boolean;
  onClaim?: (guess: string) => void;
};

export type PassState = "idle" | "armed";

/** Skip takes two taps so a stray tap cannot give up a prompt. Nothing here is timed: a
 * confirmation that expires on its own can be lost by slower, switch or screen-reader users. */
export function nextPassState(state: PassState, event: "tap" | "type" | "blur"): { state: PassState; fire: boolean } {
  if (event === "tap") return state === "armed" ? { state: "idle", fire: true } : { state: "armed", fire: false };
  return { state: "idle", fire: false };
}

/** Whether to put the cursor in the answer box when a prompt appears. Only with a mouse or
 * trackpad: on a touch screen, focus from script opens no keyboard (iOS), and the field then
 * sits focused, so the player's own tap often fails to raise one. Their tap is the focus there. */
export function focusOnShow(matchMedia: ((query: string) => { matches: boolean }) | undefined): boolean {
  return !!matchMedia && matchMedia("(pointer: fine)").matches;
}

/** One prompt (mockup screen 2). Rendered with key={index} by DigGame, so the field resets.
 * Red is reserved for Start, Copy result and Join, so Dig and Skip are both quiet buttons. */
export default function PromptScreen({ index, total, prompt, phase, clock, noTimer, feedback, onSubmit, onPass, onTimer, canClaim, onClaim }: Props) {
  const [guess, setGuess] = useState("");
  // The server render has no window, so it gets the touch wording; a prompt only mounts after Start.
  const [hasMouse] = useState(() => focusOnShow(typeof window === "undefined" ? undefined : (q) => window.matchMedia(q)));
  const [claimedGuess, setClaimedGuess] = useState<string | null>(null);
  const [pass, setPass] = useState<PassState>("idle");
  const [passNote, setPassNote] = useState("");
  const [timerNote, setTimerNote] = useState("");
  const disarm = (event: "type" | "blur") => setPass((s) => nextPassState(s, event).state);
  const tapPass = () => {
    const r = nextPassState(pass, "tap");
    setPass(r.state);
    setPassNote(r.fire ? "" : "Tap Skip again to skip this prompt.");
    if (r.fire) onPass();
  };
  const timerOff = () => {
    if (!onTimer) return;
    onTimer(true);
    setPassNote("");
    setTimerNote("Timer off. Take your time.");
    refocus.current = true;
  };
  // The button unmounts with the timer, so focus would drop to <body>. With a mouse, it goes to
  // the answer box; on a touch screen (see focusOnShow), to the "Take your time." line instead.
  const refocus = useRef(false);
  const calm = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (!noTimer || !refocus.current) return;
    refocus.current = false;
    if (focusOnShow(typeof window === "undefined" ? undefined : (q) => window.matchMedia(q))) answerArea.current?.querySelector("input")?.focus();
    else calm.current?.focus();
  }, [noTimer]);
  const reading = phase === "reading";
  const left = `${clock} ${clock === 1 ? "second" : "seconds"} left`;
  const announce = reading ? "Get ready." : !noTimer && phase === "answering" && (clock === 10 || clock === 5) ? left : "";
  // A second identical miss leaves the feedback text unchanged, which a screen reader would not
  // repeat. Each new feedback object bumps a round, used as the key so the text is re-inserted.
  const [seenFeedback, setSeenFeedback] = useState(feedback);
  const [round, setRound] = useState(0);
  if (feedback !== seenFeedback) {
    setSeenFeedback(feedback);
    setRound(round + 1);
    // A miss empties the field so the next word isn't typed onto the last. A near miss keeps
    // it: pressing Enter again accepts the suggestion.
    if (feedback?.kind === "miss") setGuess("");
  }
  // With the phone keyboard open, bring the input, the Dig button and the feedback line into view
  // together (scrolling the input alone leaves the feedback under the keyboard).
  const answerArea = useRef<HTMLDivElement>(null);
  const showAnswerArea = () => answerArea.current?.scrollIntoView?.({ block: "nearest" });
  useEffect(() => { if (round > 0) showAnswerArea(); }, [round]);
  useEffect(() => {
    if (focusOnShow(typeof window === "undefined" ? undefined : (q) => window.matchMedia(q))) {
      answerArea.current?.querySelector("input")?.focus();
    }
  }, []);
  return (
    <section aria-labelledby="dig-prompt" className="mt-8 short:mt-2">
      <p className="font-sans text-sm text-ink-faint">{`Prompt ${index + 1} of ${total}`}</p>
      <h2 id="dig-prompt" className="mt-2 font-display text-3xl leading-display">{prompt.text}</h2>
      <div className="mt-5 flex items-start justify-between gap-4">
        {noTimer ? (
          <p ref={calm} tabIndex={-1} className="pt-3 font-sans text-sm text-ink-soft outline-none">Take your time.</p>
        ) : (
          <div className="min-w-0 flex-1 pt-2" aria-hidden={reading}>
            <p className="font-sans text-sm text-ink-soft">{reading ? "Ready…" : left}</p>
            <div role="progressbar" aria-label="Time left" aria-valuemin={0} aria-valuemax={ANSWER_SECONDS}
              aria-valuenow={reading ? ANSWER_SECONDS : clock} className="mt-2 h-2 w-full overflow-hidden rounded-full bg-paper-raised">
              <div className="h-full bg-ink transition-all duration-1000 ease-linear motion-reduce:transition-none"
                style={{ width: `${((reading ? ANSWER_SECONDS : clock) / ANSWER_SECONDS) * 100}%` }} />
            </div>
          </div>
        )}
        {onTimer && !noTimer && (
          <Button type="button" variant="secondary" size="sm" className="min-h-11 shrink-0" onClick={timerOff}>Turn off timer</Button>
        )}
      </div>
      <p className="sr-only" aria-live="assertive">{announce}</p>
      <div ref={answerArea}>
      <form className="mt-6 short:mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); onSubmit(guess); }}>
        <div className="min-w-0 flex-1">
          {/* Typeable even during the read pause: a read-only or disabled field gets no phone
              keyboard. Dig is disabled then, and the reducer ignores a submit until the clock starts. */}
          <TextField aria-label="Your answer" value={guess} onChange={(e) => { setGuess(e.target.value); disarm("type"); }}
            onFocus={showAnswerArea}
            autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="go" maxLength={40}
            placeholder={hasMouse ? undefined : "Tap to type"} />
        </div>
        <Button type="submit" variant="secondary" disabled={reading} className="shrink-0">Dig</Button>
      </form>
      <div aria-live="polite" className="mt-3 min-h-12 font-sans text-sm text-ink-soft">
        {feedback?.kind === "near" && (
          <p>
            Did you mean <em className="font-display not-italic text-ink">{feedback.suggestion}</em>? {hasMouse ? "Press Enter to accept." : "Tap Yes to accept."}{" "}
            <Button variant="link" onClick={() => onSubmit(feedback.guess)}>Yes, {feedback.suggestion}</Button>
          </p>
        )}
        {feedback?.kind === "miss" && (
          <p key={round}>
            Not one we know yet. Try another, or Skip.{" "}
            {canClaim && onClaim && (claimedGuess === feedback.guess ? "Thanks, we'll check it." : (
              <Button variant="link" className="min-h-11 text-left" onClick={() => { onClaim(feedback.guess); setClaimedGuess(feedback.guess); }}>{`“${feedback.guess}” should count`}</Button>
            ))}
          </p>
        )}
        {feedback?.kind === "empty" && <p>Type a word first.</p>}
        {feedback?.kind === "letters" && <p>Answers are English words: use the letters A to Z.</p>}
      </div>
      </div>
      {/* The way out of a prompt with the timer off (and a shortcut with it on). The reducer
          only honours it while answering, so it is disabled during the read pause. Two taps: the
          first arms it, the second skips. There is no timeout. */}
      <p className="sr-only" aria-live="polite">{passNote || timerNote}</p>
      <div className="mt-2">
        <Button type="button" variant="ghost" className="min-h-11 text-sm" disabled={phase !== "answering"}
          onClick={tapPass} onBlur={() => disarm("blur")}>{pass === "armed" ? "Skip? Tap again" : "Skip"}</Button>
      </div>
    </section>
  );
}
