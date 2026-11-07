"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import type { PromptResult } from "@/lib/dig/game";
import { TIER_LABEL, TIER_POINTS } from "@/lib/dig/score";
import type { PromptKind, PromptSecret } from "@/lib/dig/types";
import { etymologyLink, presentableFact } from "@/lib/dig/fact";
import { normalizeKey } from "@/lib/dig/normalize";
import { layerLine, revealFact } from "@/lib/dig/revealCopy";
import BoneMark from "./BoneMark";

type Props = {
  result: PromptResult;
  secret: PromptSecret;
  isLast: boolean;
  claimed: boolean;
  /** the player gave up with Pass (rather than running out of time) */
  passed?: boolean;
  /** false on a past day, where a claim is never sent, so neither the button nor the thanks shows */
  canClaim: boolean;
  /** how many earlier results in this run landed in the same layer (picks the wording) */
  variantIndex?: number;
  /** first answer this device has ever made: show the one-time tip */
  coach?: boolean;
  kind?: PromptKind;
  promptText?: string;
  /** a Curio story link was followed */
  onStory?: () => void;
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
  if (result.answer && result.tier === "fossil") return `${outcome} You found the fossil.`;
  return `${outcome} Fossil: ${secret.fossil.word}.`;
}

/** After each prompt (mockup screen 3): where the answer landed, and the prompt's fossil.
 * The prompt's inputs have just unmounted, so focus would fall to <body>: it moves to the
 * heading instead, and Next prompt is the next tab stop. */
export default function Reveal({ result, secret, isLast, claimed, passed = false, canClaim, variantIndex = 0, coach = false, kind = "theme", promptText = "", onStory, onNext, onClaim }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  // Only a prompt that ended with no answer has anything to claim: the player's own most recent
  // miss, as typed (not rejected.at(-1): that list stops growing at its cap).
  const claimable = canClaim && result.answer === null ? result.lastGuess : null;
  const fact = presentableFact(secret.fossil);
  const answered = result.answer && result.tier ? { answer: result.answer, tier: result.tier } : null;
  const foundFossil = answered?.tier === "fossil";
  const sameFossil = !!answered && normalizeKey(answered.answer) === normalizeKey(secret.fossil.word);
  const line = answered ? layerLine(answered.tier, variantIndex) : null;
  const extra = answered ? revealFact({ answer: answered.answer, tier: answered.tier, kind, promptText, secret }) : null;
  return (
    <section className="mt-5 short:mt-2">
      <h2 ref={heading} tabIndex={-1} className={result.answer ? "font-display text-4xl leading-display outline-none" : "font-display text-3xl outline-none"}>
        {result.answer ?? (passed ? "Passed" : "Time's up")}
      </h2>
      {line && answered && <p className="mt-2 font-sans text-base text-ink-soft">{`${line} ${TIER_POINTS[answered.tier]} points`}</p>}
      {extra && (
        <p className="mt-1 font-sans text-base text-ink-soft">
          {extra.text}
          {extra.kind === "story" && (
            <>
              {" "}
              <Link href={`/story/${extra.slug}`} onClick={onStory} className="underline underline-offset-2">{extra.linkText}</Link>
            </>
          )}
        </p>
      )}
      {coach && answered && <p className="mt-2 font-sans text-base text-ink">Every word that fits counts. Rarer ones dig deeper.</p>}
      <div className="mt-4 border-t border-line pt-3">
        {foundFossil ? (
          <p className="flex items-center gap-2 font-display text-xl">
            <BoneMark className="size-6" />
            {sameFossil ? "You found the fossil." : `You found a fossil. The fossil was ${secret.fossil.word}.`}
          </p>
        ) : (
          <>
            <p className="font-sans text-sm text-ink-faint">The fossil was</p>
            <p className="mt-1 font-display text-2xl">{secret.fossil.word}</p>
          </>
        )}
        {fact && <p className="mt-1 font-serif text-lg leading-relaxed text-ink-soft">{fact}</p>}
        {!fact && !secret.fossil.story && (
          <a href={etymologyLink(secret.fossil.word)} target="_blank" rel="noopener noreferrer" className="inline-block py-2 font-sans text-sm underline underline-offset-2">
            Where {secret.fossil.word} came from (Wiktionary)
          </a>
        )}
        {secret.fossil.story && (
          <Link href={`/story/${secret.fossil.story}`} onClick={onStory} className="inline-block py-2 font-sans text-sm underline underline-offset-2">
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
      <div className="mt-5">
        <Button onClick={onNext} variant="secondary">{isLast ? "See your dig" : "Next prompt"}</Button>
      </div>
    </section>
  );
}
