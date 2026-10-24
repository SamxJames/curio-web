"use client";

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
  /** false on a past day, where a claim is never sent, so neither the button nor the thanks shows */
  canClaim: boolean;
  onNext: () => void;
  onClaim: (guess: string) => void;
};

/** After each prompt (mockup screen 3): where the answer landed, and the prompt's fossil. */
export default function Reveal({ result, secret, isLast, claimed, canClaim, onNext, onClaim }: Props) {
  // The player's own most recent miss, in the form they typed it (not rejected.at(-1): that
  // list stops growing at its cap).
  const claimable = canClaim ? result.lastGuess : null;
  return (
    <section className="mt-8" aria-live="polite">
      {result.answer && result.tier ? (
        <>
          <p className="font-display text-4xl leading-display">{result.answer}</p>
          <p className="mt-2 font-sans text-base text-ink-soft">
            {`${TIER_LABEL[result.tier]}, ${TIER_POINTS[result.tier]} points, into the ${STRATUM[result.tier]}`}
          </p>
        </>
      ) : (
        <p className="font-display text-3xl">Time&apos;s up</p>
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
