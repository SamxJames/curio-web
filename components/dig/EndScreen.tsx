"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import SignupOffer from "@/components/SignupOffer";
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
  // First occurrence of a word wins, so the player's own entry beats a fossil and a repeated
  // fossil word shows once.
  const seen = new Set<string>();
  return [...mine, ...fossils].filter((w) => !seen.has(w.word) && !!seen.add(w.word));
}

const STATUS_MS = 4000;

/** What a screen reader hears when the dig finishes. DigRun sets it into its persistent live region. */
export function announceDone(score: number): string {
  return `Dig complete. ${formatDepth(score)} down.`;
}

/** `autoFocus` is for a dig the player has just finished: focus moves to the depth line, because
 * the prompt screen they were typing in has gone. An already-played day passes nothing, so a
 * page load never jumps focus. */
export default function EndScreen({ day, game, isToday, autoFocus = false }: { day: PreparedDay; game: StoredGame; isToday: boolean; autoFocus?: boolean }) {
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState<Set<number>>(new Set());
  const storySent = useRef(false);
  const depth = useRef<HTMLHeadingElement>(null);
  const clearTimer = useRef<number | undefined>(undefined);
  useEffect(() => { if (autoFocus) depth.current?.focus(); }, [autoFocus]);
  useEffect(() => () => window.clearTimeout(clearTimer.current), []);
  /** Sets the text of the always-mounted status line, then clears it after a few seconds. */
  const say = (message: string) => {
    window.clearTimeout(clearTimer.current);
    setStatus(message);
    if (message) clearTimer.current = window.setTimeout(() => setStatus(""), STATUS_MS);
  };
  const text = shareText(day.number, game.score, game.tiers);
  const pct = isToday ? percentileLine(game.spread, game.score) : null;
  const onStory = () => {
    if (isToday && !storySent.current) { storySent.current = true; sendDigEvent({ kind: "story" }); }
  };
  const copy = async () => {
    const how = await copyResult(text);
    // The share text isn't on the page, so a failure can't point to it.
    say(how === "copied" ? "Copied" : how === "failed" ? "Couldn't copy." : "");
    if (how === "copied" || how === "shared") sendDigEvent({ kind: "share", how: "text" });
  };
  const image = async () => {
    const how = await shareImage({ number: day.number, score: game.score, tiers: game.tiers, text });
    say(how === "shared" ? "Shared" : how === "downloaded" ? "Image saved" : how === "failed" ? "Couldn't make the image." : "");
    if (how === "shared" || how === "downloaded") sendDigEvent({ kind: "share", how: "image" });
  };
  return (
    <section className="mt-8">
      <Strata tiers={game.tiers} words={game.answers} label={`Your dig, day ${day.number}`} />
      <h2 ref={depth} tabIndex={-1} className="mt-6 font-display text-5xl leading-display">{`${formatDepth(game.score)} down`}</h2>
      {pct && <p className="mt-2 font-sans text-base text-ink-soft">{pct}</p>}

      <div className="mt-6 flex flex-wrap gap-3">
        <Button onClick={copy}>Copy result</Button>
        <Button variant="secondary" onClick={image}>Share image</Button>
        {/* Always mounted, so a screen reader announces the text when it changes. */}
        <p role="status" aria-live="polite" className="self-center font-sans text-sm text-ink-soft">{status}</p>
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

      <h2 className="mt-10 font-display text-2xl">{isToday ? "Today's answers" : "The day's answers"}</h2>
      {day.prompts.map((p, i) => (
        <details key={p.id} className="mt-3 border-t border-line pt-3" onToggle={(e) => e.currentTarget.open && setOpen((o) => new Set(o).add(i))}>
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

      {/* SignupOffer hides itself, pitch included, for readers who already get the email. */}
      <SignupOffer
        placement="dig"
        className="mt-10 max-w-form border-t border-line pt-6"
        pitch={
          <>
            <h2 className="font-display text-2xl">One word&apos;s story, every morning</h2>
            <p className="mt-2 font-sans text-base text-ink-soft">Curio sends one word and where it came from.</p>
          </>
        }
        onSubscribed={() => sendDigEvent({ kind: "signup" })}
      />
      <p className="mt-8 font-sans text-base">
        <Link href="/dig/past" prefetch={false} className="underline underline-offset-2">Past digs</Link>
      </p>
    </section>
  );
}
