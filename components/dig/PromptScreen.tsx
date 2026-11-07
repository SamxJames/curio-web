"use client";

import { useEffect, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import { ToggleGroup } from "@/components/ui/SegmentedControl";
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
  /** Switch the timer on or off mid-prompt. The pill renders only when this is passed. */
  onTimer?: (noTimer: boolean) => void;
};

export type PassState = "idle" | "armed";

/** Pass takes two taps so a stray tap cannot give up a prompt. Nothing here is timed: a
 * confirmation that expires on its own can be lost by slower, switch or screen-reader users. */
export function nextPassState(state: PassState, event: "tap" | "type" | "blur"): { state: PassState; fire: boolean } {
  if (event === "tap") return state === "armed" ? { state: "idle", fire: true } : { state: "armed", fire: false };
  return { state: "idle", fire: false };
}

/** One prompt (mockup screen 2). Rendered with key={index} by DigGame, so the field resets.
 * Red is reserved for Start, Copy result and Join, so Dig and Pass are both quiet buttons. */
export default function PromptScreen({ index, total, prompt, phase, clock, noTimer, feedback, onSubmit, onPass, onTimer }: Props) {
  const [guess, setGuess] = useState("");
  const [pass, setPass] = useState<PassState>("idle");
  const [passNote, setPassNote] = useState("");
  const [timerNote, setTimerNote] = useState("");
  const disarm = (event: "type" | "blur") => setPass((s) => nextPassState(s, event).state);
  const tapPass = () => {
    const r = nextPassState(pass, "tap");
    setPass(r.state);
    setPassNote(r.fire ? "" : "Tap Pass again to give up this prompt.");
    if (r.fire) onPass();
  };
  const flipTimer = () => {
    if (!onTimer) return;
    onTimer(!noTimer);
    setPassNote("");
    setTimerNote(noTimer ? `Timer on. ${ANSWER_SECONDS} seconds.` : "Timer off.");
  };
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
  return (
    <section aria-labelledby="dig-prompt" className="mt-8 short:mt-2">
      <p className="font-sans text-sm text-ink-faint">{`Prompt ${index + 1} of ${total}`}</p>
      <h2 id="dig-prompt" className="mt-2 font-display text-3xl leading-display">{prompt.text}</h2>
      <div className="mt-5 flex items-start justify-between gap-4">
        {noTimer ? (
          <p className="pt-3 font-sans text-sm text-ink-soft">Take your time.</p>
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
        {onTimer && (
          <ToggleGroup
            className="shrink-0"
            segments={["No timer"]}
            getKey={(s) => s}
            isActive={() => noTimer}
            onToggle={flipTimer}
            renderSegment={(s) => <span>{s}</span>}
            getButtonProps={(_, active) => ({
              className: active
                ? "min-h-11 rounded-full border border-ink px-3.5 font-sans text-sm text-ink"
                : "min-h-11 rounded-full border border-line-strong px-3.5 font-sans text-sm text-ink-soft",
            })}
          />
        )}
      </div>
      <p className="sr-only" aria-live="assertive">{announce}</p>
      <div ref={answerArea}>
      <form className="mt-6 short:mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); onSubmit(guess); }}>
        <div className="min-w-0 flex-1">
          {/* readOnly, not disabled, during the read pause: a disabled field can't hold the
              autoFocus, so the player would have to tap it again when the clock starts. */}
          <TextField aria-label="Your answer" value={guess} onChange={(e) => { setGuess(e.target.value); disarm("type"); }}
            onFocus={showAnswerArea} readOnly={reading}
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
        {feedback?.kind === "miss" && <p key={round}>Not on today&apos;s list. Try another.</p>}
        {feedback?.kind === "empty" && <p>Type a word first.</p>}
        {feedback?.kind === "letters" && <p>Answers are English words: use the letters A to Z.</p>}
      </div>
      </div>
      {/* The way out of a prompt with No timer on (and a shortcut with it on). The reducer
          only honours it while answering, so it is disabled during the read pause. Two taps: the
          first arms it, the second passes. There is no timeout. */}
      <p className="sr-only" aria-live="polite">{passNote || timerNote}</p>
      <div className="mt-2">
        <Button type="button" variant="ghost" className="min-h-11 text-sm" disabled={phase !== "answering"}
          onClick={tapPass} onBlur={() => disarm("blur")}>{pass === "armed" ? "Pass? Tap again" : "Pass"}</Button>
      </div>
    </section>
  );
}
