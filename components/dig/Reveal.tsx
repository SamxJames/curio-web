"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import type { PromptResult } from "@/lib/dig/game";
import { STRATUM, TIER_LABEL, TIER_POINTS } from "@/lib/dig/score";
import type { PromptSecret } from "@/lib/dig/types";

type Props = {
  result: PromptResult;
  secret: PromptSecret;
  isLast: boolean;
  claimed: boolean;
  /** the player gave up with Pass (rather than running out of time) */
  passed?: boolean;
  /** false on a past day, where a claim is never sent, so neither the button nor the thanks shows */
  canClaim: boolean;
  onNext: () => void;
  onClaim: (guess: string) => void;
};

/** What a screen reader hears when a prompt locks. DigRun sets it into one persistent live
 * region: this section mounts fresh each time, and a region that mounts with its text is
 * not reliably announced. */
export function announceReveal(result: PromptResult, secret: PromptSecret, passed: boolean): string {
  const outcome = result.answer && result.tier
    ? `${result.answer}, ${TIER_LABEL[result.tier]}, ${TIER_POINTS[result.tier]} points.`
    : passed ? "Passed." : "Time's up.";
  return `${outcome} Fossil: ${secret.fossil.word}.`;
}

/** After each prompt (mockup screen 3): where the answer landed, and the prompt's fossil.
 * The prompt's inputs have just unmounted, so focus would fall to <body>: it moves to the
 * heading instead, and Next prompt is the next tab stop. */
export default function Reveal({ result, secret, isLast, claimed, passed = false, canClaim, onNext, onClaim }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  // Only a prompt that ended with no answer has anything to claim: the player's own most recent
  // miss, as typed (not rejected.at(-1): that list stops growing at its cap).
  const claimable = canClaim && result.answer === null ? result.lastGuess : null;
  return (
    <section className="mt-8">
      <h2 ref={heading} tabIndex={-1} className={result.answer ? "font-display text-4xl leading-display" : "font-display text-3xl"}>
        {result.answer ?? (passed ? "Passed" : "Time's up")}
      </h2>
      {result.answer && result.tier && (
        <p className="mt-2 font-sans text-base text-ink-soft">
          {`${TIER_LABEL[result.tier]}, ${TIER_POINTS[result.tier]} points, into the ${STRATUM[result.tier]}`}
        </p>
      )}
      <div className="mt-6 border-t border-line pt-4">
        <p className="font-sans text-sm text-ink-faint">This prompt&apos;s fossil</p>
        <p className="mt-1 font-display text-2xl">{secret.fossil.word}</p>
        <p className="mt-1 font-serif text-lg leading-relaxed text-ink-soft">{secret.fossil.fact}</p>
        {secret.fossil.story && (
          <Link href={`/story/${secret.fossil.story}`} className="mt-2 inline-block font-sans text-sm underline underline-offset-2">
            Read the story of {secret.fossil.word}
          </Link>
        )}
      </div>
      {claimable && (
        <p className="mt-4 font-sans text-sm text-ink-soft">
          {claimed ? "Thanks. We look at these every week." : (
            <Button variant="link" onClick={() => onClaim(claimable)}>{`“${claimable}” should count`}</Button>
          )}
        </p>
      )}
      <div className="mt-8">
        <Button onClick={onNext} variant="secondary">{isLast ? "See your dig" : "Next prompt"}</Button>
      </div>
    </section>
  );
}
