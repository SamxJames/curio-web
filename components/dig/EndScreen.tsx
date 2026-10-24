"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import EmailSignupInline from "@/components/EmailSignupInline";
import type { PreparedDay } from "@/lib/dig/game";
import { formatDepth, TIER_LABEL } from "@/lib/dig/score";
import { percentileLine, shareText } from "@/lib/dig/share";
import type { StoredGame } from "@/lib/dig/storage";
import { TIERS } from "@/lib/dig/types";
import { sendDigEvent } from "@/lib/dig/client";
import Strata from "./Strata";
import { copyResult, shareImage } from "./shareImage";

/** Answers with a Curio story first (the player's own), then every prompt's fossil. */
export function wordsWorthKnowing(day: PreparedDay, answers: (string | null)[]) {
  const mine = answers.flatMap((a, i) => {
    const story = a ? day.secrets[i].stories[a] : undefined;
    return a && story ? [{ word: a, note: `Your answer to “${day.prompts[i].text}”`, story }] : [];
  });
  const fossils = day.secrets.map((s) => ({ word: s.fossil.word, note: s.fossil.fact, ...(s.fossil.story ? { story: s.fossil.story } : {}) }));
  return [...mine, ...fossils.filter((f) => !mine.some((m) => m.word === f.word))];
}

/** What a screen reader hears when the dig finishes. DigRun sets it into its persistent live region. */
export function announceDone(score: number): string {
  return `Dig complete. ${formatDepth(score)} down.`;
}

/** `autoFocus` is for a dig the player has just finished: focus moves to the depth line, because
 * the prompt screen they were typing in has gone. An already-played day passes nothing, so a
 * page load never jumps focus. */
export default function EndScreen({ day, game, isToday, autoFocus = false }: { day: PreparedDay; game: StoredGame; isToday: boolean; autoFocus?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState<Set<number>>(new Set());
  const storySent = useRef(false);
  const depth = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (autoFocus) depth.current?.focus(); }, [autoFocus]);
  const text = shareText(day.number, game.score, game.tiers);
  const pct = isToday ? percentileLine(game.spread, game.score) : null;
  const onStory = () => {
    if (isToday && !storySent.current) { storySent.current = true; sendDigEvent({ kind: "story" }); }
  };
  const copy = async () => {
    const how = await copyResult(text);
    if (how === "copied") setCopied(true);
    if (how !== "failed") sendDigEvent({ kind: "share", how: "text" });
  };
  const image = async () => {
    if ((await shareImage({ number: day.number, score: game.score, tiers: game.tiers, text })) !== "failed") sendDigEvent({ kind: "share", how: "image" });
  };
  return (
    <section className="mt-8">
      <Strata tiers={game.tiers} words={game.answers} label={`Your dig, day ${day.number}`} />
      <h2 ref={depth} tabIndex={-1} className="mt-6 font-display text-5xl leading-display">{`${formatDepth(game.score)} down`}</h2>
      {pct && <p className="mt-2 font-sans text-base text-ink-soft">{pct}</p>}

      <div className="mt-6 flex flex-wrap gap-3">
        <Button onClick={copy}>Copy result</Button>
        <Button variant="secondary" onClick={image}>Share image</Button>
        {copied && <p role="status" className="self-center font-sans text-sm text-ink-soft">Copied</p>}
      </div>

      <h2 className="mt-10 font-display text-2xl">Words worth knowing</h2>
      <ul className="mt-3 space-y-3">
        {wordsWorthKnowing(day, game.answers).map((w) => (
          <li key={w.word}>
            <p className="font-display text-xl">
              {w.story ? <Link href={`/story/${w.story}`} prefetch={false} onClick={onStory} className="underline underline-offset-2">{w.word}</Link> : w.word}
            </p>
            <p className="font-serif text-base leading-relaxed text-ink-soft">{w.note}</p>
          </li>
        ))}
      </ul>

      <h2 className="mt-10 font-display text-2xl">Today&apos;s answers</h2>
      {day.prompts.map((p, i) => (
        <details key={p.id} className="mt-3 border-t border-line pt-3" onToggle={(e) => e.currentTarget.open && setOpen(new Set(open).add(i))}>
          <summary className="cursor-pointer font-sans text-base">{p.text}</summary>
          {open.has(i) && TIERS.map((t) => {
            const words = day.secrets[i].answers.filter((a) => a[1] === t && a[2] === 1).map((a) => a[0]);
            return words.length ? (
              <p key={t} className="mt-2 font-serif text-base leading-relaxed">
                <span className="font-sans text-sm text-ink-faint">{TIER_LABEL[t]}: </span>{words.join(", ")}
              </p>
            ) : null;
          })}
        </details>
      ))}

      <div className="mt-10 border-t border-line pt-6">
        <h2 className="font-display text-2xl">One word&apos;s story, every morning</h2>
        <p className="mt-2 font-sans text-base text-ink-soft">Curio sends one word and where it came from. Free.</p>
        <div className="mt-4 max-w-form">
          <EmailSignupInline onSubscribed={() => sendDigEvent({ kind: "signup" })} />
        </div>
      </div>
      <p className="mt-8 font-sans text-base">
        <Link href="/dig/past" prefetch={false} className="underline underline-offset-2">Past digs</Link>
      </p>
    </section>
  );
}
