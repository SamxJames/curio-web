"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Button from "@/components/ui/Button";
import SignupOffer from "@/components/SignupOffer";
import type { PreparedDay } from "@/lib/dig/game";
import { formatDepth, scoreOf, STRATUM, TIER_LABEL } from "@/lib/dig/score";
import { percentileLine, shareText } from "@/lib/dig/share";
import type { StoredGame } from "@/lib/dig/storage";
import { TIERS, type Tier } from "@/lib/dig/types";
import { sendDigEvent } from "@/lib/dig/client";
import type { DigEvent } from "@/lib/dig/events";
import Strata from "./Strata";
import TomorrowHint from "./TomorrowHint";
import { renderShareImage, shareImage } from "./shareImage";
import { prefersShareSheet, shareOrCopy } from "@/lib/shareOrCopy";
import { etymologyLink, presentableFact } from "@/lib/dig/fact";
import { ROLLOVER_FALLBACK, rolloverLine } from "@/lib/dig/rollover";

const noSubscribe = () => () => {};
/** The rollover on the player's clock in the browser; the UTC wording on the server and at hydration. */
function useRolloverLine(): string {
  return useSyncExternalStore(noSubscribe, () => rolloverLine(), () => ROLLOVER_FALLBACK);
}

/** Answers with a Curio story first (the player's own), then every prompt's fossil. */
export function wordsWorthKnowing(day: PreparedDay, answers: (string | null)[]) {
  const mine: { word: string; note: string | null; story?: string }[] = answers.flatMap((a, i) => {
    const story = a ? day.secrets[i].stories[a] : undefined;
    return a && story ? [{ word: a, note: `Your answer to “${day.prompts[i].text}”`, story }] : [];
  });
  // A fossil whose fact is dictionary notation shows no note; the list links to its source instead.
  const fossils = day.secrets.map((s) => ({ word: s.fossil.word, note: presentableFact(s.fossil), ...(s.fossil.story ? { story: s.fossil.story } : {}) }));
  // First occurrence of a word wins, so the player's own entry beats a fossil and a repeated
  // fossil word shows once.
  const seen = new Set<string>();
  return [...mine, ...fossils].filter((w) => !seen.has(w.word) && !!seen.add(w.word));
}

const STATUS_MS = 4000;

/** The postcard's first line: what the player found, never what they didn't. */
export function foundLine(tiers: (Tier | null)[]): string {
  const found = tiers.filter((t): t is Tier => t !== null);
  if (found.length === 0) return "Hard ground today. Here's what was buried.";
  const deepest = found.reduce((a, t) => (TIERS.indexOf(t) > TIERS.indexOf(a) ? t : a));
  return `You found ${found.length} ${found.length === 1 ? "word" : "words"} and reached the ${STRATUM[deepest]}.`;
}

/** "7 November 2026", always in UTC so a player's timezone can't shift the date. */
export function formatDigDate(date: string): string {
  return new Date(date + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** The funnel event for following a come-back row link. Today's dig only: no events from past digs. */
export function rowEvent(to: "play" | "past", isToday: boolean): Extract<DigEvent, { kind: "row" }> | null {
  return isToday ? { kind: "row", to } : null;
}

/** What a screen reader hears when the dig finishes. DigRun sets it into its persistent live region. */
export function announceDone(score: number, tiers: (Tier | null)[]): string {
  return `Dig complete. ${foundLine(tiers)} ${formatDepth(score)} down.`;
}

/** `autoFocus` is for a dig the player has just finished: focus moves to the depth line, because
 * the prompt screen they were typing in has gone. An already-played day passes nothing, so a
 * page load never jumps focus. */
export default function EndScreen({ day, game, isToday, autoFocus = false, offerTimer = false, onAddTimer, friend = null }: { day: PreparedDay; game: StoredGame; isToday: boolean; autoFocus?: boolean; offerTimer?: boolean; onAddTimer?: () => void; friend?: (Tier | null)[] | null }) {
  const [timerAdded, setTimerAdded] = useState(false);
  const rollover = useRolloverLine();
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState<Set<number>>(new Set());
  const storySent = useRef(false);
  const sheet = useSyncExternalStore(noSubscribe, prefersShareSheet, () => false);
  const preparedImage = useRef<Blob | null>(null);
  // Drawn ahead of the tap: a browser can refuse a share sheet opened after slow work.
  useEffect(() => {
    let alive = true;
    renderShareImage({ number: day.number, score: game.score, tiers: game.tiers, challenge: isToday })
      .then((b) => { if (alive) preparedImage.current = b; })
      .catch(() => {});
    return () => { alive = false; };
  }, [day.number, game, isToday]);
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
  const text = shareText(day.number, game.score, game.tiers, isToday);
  const pct = isToday ? percentileLine(game.spread, game.score) : null;
  const onStory = () => {
    if (isToday && !storySent.current) { storySent.current = true; sendDigEvent({ kind: "story" }); }
  };
  const copy = async () => {
    const how = await shareOrCopy(text);
    // The share text isn't on the page, so a failure can't point to it.
    say(how === "shared" ? "Shared" : how === "copied" ? "Copied. Paste it anywhere." : how === "failed" ? "Couldn't share." : "");
    if (how === "copied" || how === "shared") sendDigEvent({ kind: "share", how: "text" });
  };
  const image = async () => {
    const how = await shareImage({ number: day.number, score: game.score, tiers: game.tiers, text, challenge: isToday }, preparedImage.current);
    say(how === "shared" ? "Shared" : how === "downloaded" ? "Image saved" : how === "failed" ? "Couldn't make the image." : "");
    if (how === "shared" || how === "downloaded") sendDigEvent({ kind: "share", how: "image" });
  };
  const rowLink = "block py-4 font-sans text-base";
  const followRow = (to: "play" | "past") => () => {
    const ev = rowEvent(to, isToday);
    if (ev) sendDigEvent(ev);
  };
  return (
    <section className="mt-8">
      <div className="max-w-form rounded-lg border border-line-strong bg-paper-raised p-4">
        <div className="flex items-baseline justify-between">
          <p className="font-display text-lg">curio dig</p>
          <p className="font-sans text-sm text-ink-soft">{`Dig #${day.number}`}</p>
        </div>
        <p className="mt-3 font-sans text-base text-ink">{foundLine(game.tiers)}</p>
        <h2 ref={depth} tabIndex={-1} className="mt-1 font-display text-5xl leading-display outline-none">{`${formatDepth(game.score)} down`}</h2>
        {pct && <p className="mt-2 font-sans text-base text-ink-soft">{pct}</p>}
        <p className="mt-1 font-sans text-sm text-ink-soft">{formatDigDate(day.date)}</p>
        <div className="-mx-4 -mb-4 mt-4 overflow-hidden rounded-b-lg">
          <Strata tiers={game.tiers} words={game.answers} label={`Your dig, ${formatDigDate(day.date)}`} height={240} />
        </div>
      </div>

      {friend && (
        <section className="mt-8 max-w-form border-t border-line pt-6">
          <h2 className="font-sans text-sm text-ink-soft">You and your friend</h2>
          <div className="mt-3 grid grid-cols-2 gap-4">
            <div><p className="font-sans text-sm text-ink-soft">You · {formatDepth(game.score)}</p><Strata compact label="Your dig" tiers={game.tiers} /></div>
            <div><p className="font-sans text-sm text-ink-soft">Friend · {formatDepth(scoreOf(friend))}</p><Strata compact label="Your friend's dig" tiers={friend} /></div>
          </div>
        </section>
      )}

      <div className="mt-6 flex max-w-form flex-col gap-3 sm:flex-row">
        <Button fullWidth className="sm:w-auto" onClick={copy}>Share</Button>
        <Button fullWidth className="sm:w-auto" variant="secondary" onClick={image}>{sheet ? "Share image" : "Save image"}</Button>
      </div>
      {/* Always mounted, so a screen reader announces the text when it changes. */}
      <p role="status" aria-live="polite" className="mt-3 min-h-6 font-sans text-sm text-ink-soft">{status}</p>

      {isToday && <p className="mt-4 font-sans text-base text-ink-soft">{rollover}</p>}
      {(offerTimer || timerAdded) && onAddTimer && (
        <p className="mt-2 font-sans text-base text-ink-soft">
          {timerAdded ? "Timer on for your next dig." : (
            <Button variant="link" className="min-h-11 text-left" onClick={() => { onAddTimer(); setTimerAdded(true); say("Timer on for your next dig."); depth.current?.focus(); }}>Want more of a challenge? Add a 25-second timer next time.</Button>
          )}
        </p>
      )}

      <ul className="mt-6 max-w-form border-b border-line">
        {isToday && (
          <li className="border-t border-line">
            <Link href="/" prefetch={false} className={rowLink}>
              <span className="underline underline-offset-2">Today&apos;s word on Curio</span>
              <span className="block text-sm text-ink-soft">Read where today&apos;s word came from.</span>
            </Link>
          </li>
        )}
        <li className="border-t border-line py-4 empty:hidden"><TomorrowHint isToday={isToday} hint={day.tomorrow} /></li>
        {/* SignupOffer hides itself, pitch included, for readers who already get the email; its li then
            has no children and closes up, with no stray rule. */}
        <li className="empty:hidden">
          <SignupOffer
            placement="dig"
            joinVariant="secondary"
            className="border-t border-line py-4"
            pitch={
              <>
                <h2 className="font-display text-2xl">One word&apos;s story, every morning</h2>
                <p className="mt-2 font-sans text-base text-ink-soft">Curio sends one word and where it came from.</p>
              </>
            }
            onSubscribed={() => sendDigEvent({ kind: "signup" })}
          />
        </li>
        <li className="border-t border-line">
          {isToday ? (
            <Link href="/play" prefetch={false} onClick={followRow("play")} className={rowLink}>
              <span className="underline underline-offset-2">Cool down with a clue puzzle</span>
              <span className="block text-sm text-ink-soft">Guess the word from three clues.</span>
            </Link>
          ) : (
            <Link href="/dig" prefetch={false} className={rowLink}>
              <span className="underline underline-offset-2">Today&apos;s dig</span>
              <span className="block text-sm text-ink-soft">Dig today&apos;s prompts.</span>
            </Link>
          )}
        </li>
        <li className="border-t border-line">
          <Link href="/dig/past" prefetch={false} onClick={followRow("past")} className={rowLink}>
            <span className="underline underline-offset-2">Past digs</span>
            <span className="block text-sm text-ink-soft">Play or read any earlier dig.</span>
          </Link>
        </li>
      </ul>

      <details className="mt-6 max-w-form">
        <summary className="block cursor-pointer py-3 font-display text-xl">Words worth knowing</summary>
        <ul className="mt-3 space-y-3">
          {wordsWorthKnowing(day, game.answers).map((w) => (
            <li key={w.word}>
              <p className="font-display text-xl">
                {w.story ? <Link href={`/story/${w.story}`} prefetch={false} onClick={onStory} className="underline underline-offset-2">{w.word}</Link> : w.word}
              </p>
              {w.note ? (
                <p className="font-serif text-base leading-relaxed text-ink-soft">{w.note}</p>
              ) : !w.story && (
                <a href={etymologyLink(w.word)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-sans text-sm text-ink-soft underline underline-offset-2">
                  Where it came from (Wiktionary)
                </a>
              )}
            </li>
          ))}
        </ul>
      </details>

      <details className="mt-4 max-w-form">
        <summary className="block cursor-pointer py-3 font-display text-xl">{isToday ? "Today's answers" : "The day's answers"}</summary>
        {day.prompts.map((p, i) => (
          <details key={p.id} className="mt-3 border-t border-line pt-3" onToggle={(e) => e.currentTarget.open && setOpen((o) => new Set(o).add(i))}>
            <summary className="block cursor-pointer py-2 font-sans text-base">{p.text}</summary>
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
      </details>
    </section>
  );
}
