"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { coachIndex, createReducer, initialGame, prepareDay, resultTiers, resumeGame, toSavedRun, type DigDayResponse, type GameState, type PreparedDay } from "@/lib/dig/game";
import { priorSameTier } from "@/lib/dig/revealCopy";
import { stripState } from "@/lib/dig/strip";
import { scoreOf } from "@/lib/dig/score";
import { challengeLine, parseVs, staleChallengeLine } from "@/lib/dig/challenge";
import { clearRun, effectiveNoTimer, markCoached, markReported, readRun, readStore, saveGame, saveRun, setNoTimer, useDigStore } from "@/lib/dig/storage";
import { isNewPlayer } from "@/lib/dig/cohort";
import { fetchDayWithRetry } from "@/lib/dig/loadDay";
import { normalizeKey } from "@/lib/dig/normalize";
import { buildFinishEvent, buildStartEvent, sendDigEvent, sendFinish, sendLandOnce, sendViaOnce } from "@/lib/dig/client";
import EndScreen, { announceDone } from "./EndScreen";
import Intro from "./Intro";
import PromptScreen from "./PromptScreen";
import Reveal, { announceReveal } from "./Reveal";
import Strata from "./Strata";

/** The page heading is visible on the intro and while the day loads; on the play and end screens it
 * stays for assistive tech only (the postcard carries the wordmark, and hiding it frees room above
 * the on-screen keyboard). */
export function headingClass(phase: GameState["phase"]): string {
  return phase === "intro" ? "font-display text-4xl leading-display" : "sr-only";
}

function Heading({ heading, phase, note }: { heading?: string; phase: GameState["phase"]; note?: string }) {
  if (!heading) return null;
  const visible = phase === "intro";
  return (
    <>
      <h1 className={headingClass(phase)}>{heading}</h1>
      {visible && note && <p className="mt-2 font-sans text-sm text-ink-faint">{note}</p>}
    </>
  );
}

/** The load-failure line; only today's dig is called "Today's". */
export function LoadFailed({ past }: { past: boolean }) {
  return <p className="mt-8 font-sans text-ink-soft">{past ? "This dig didn't load. Refresh to try again." : "Today's dig didn't load. Refresh to try again."}</p>;
}

/** Loads a day (today, or a past date) and plays it. Today's game reports start/finish;
 * a past game records locally only and reports a single past:start. "Past" here is simply
 * "a date prop was given": lib/dig/clock.ts reads the server-only launch date, so it can't
 * be asked in the browser. */
export default function DigGame({ date, heading, note }: { date?: string; heading?: string; note?: string }) {
  const [day, setDay] = useState<PreparedDay | null>(null);
  const [failed, setFailed] = useState(false);
  const [vsRaw, setVsRaw] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const url = date ? `/api/dig/day/${date}` : "/api/dig/today";
    fetchDayWithRetry(() => fetch(url), (ms) => new Promise((resolve) => setTimeout(resolve, ms)))
      .then((r) => (r.ok ? (r.json() as Promise<DigDayResponse>) : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (!alive) return;
        if (!date) setVsRaw(new URLSearchParams(window.location.search).get("vs"));
        setDay(prepareDay(d));
      })
      .catch(() => alive && setFailed(true));
    if (!date) {
      sendLandOnce();
      sendViaOnce();
    }
    return () => { alive = false; };
  }, [date]);
  if (failed) return <><Heading heading={heading} phase="intro" note={note} /><LoadFailed past={!!date} /></>;
  if (!day) {
    return (
      <>
        <Heading heading={heading} phase="intro" note={note} />
        {/* noTimer matches the first-run default (effectiveNoTimer): the stored setting isn't readable before mount. */}
        <Intro noTimer onToggleTimer={() => {}} onStart={() => {}} loading />
        <p className="sr-only" aria-live="polite">Loading the dig…</p>
      </>
    );
  }
  return <DigRun day={day} isToday={!date} vsRaw={vsRaw} heading={heading} note={note} />;
}

function DigRun({ day, isToday, vsRaw, heading, note }: { day: PreparedDay; isToday: boolean; vsRaw: string | null; heading?: string; note?: string }) {
  const store = useDigStore();
  const friend = isToday ? parseVs(vsRaw, day.number) : null;
  const reduce = useMemo(() => createReducer(day), [day]);
  // A refresh mid-dig picks up where it left off (lib/dig/game.ts SavedRun), unless the day is
  // already finished. DigRun only mounts on the client, after the day has loaded, so reading
  // localStorage here can't cause a hydration mismatch.
  const [resumed] = useState(() => (readStore().games[day.date] ? null : resumeGame(readRun(), day.date, day.secrets.length)));
  const [state, dispatch] = useReducer(reduce, undefined, () => resumed?.state ?? initialGame());
  // A refresh into a reveal must not replay that reveal's drop: the strip skips the animation for
  // this one column (lib/dig/strip.ts).
  const [resumedReveal] = useState(() => (resumed?.state.phase === "reveal" ? resumed.state.current : -1));
  // The word claimed per prompt, so one claimed at the prompt isn't offered again on the reveal,
  // while a different last guess still can be.
  const [claimed, setClaimed] = useState<Record<number, string>>({});
  const claim = (guess: string) => {
    if (!isToday) return;
    sendDigEvent({ kind: "claim", date: day.date, prompt: state.current, guess });
    setClaimed((c) => ({ ...c, [state.current]: guess }));
  };
  const [passed, setPassed] = useState<Set<number>>(() => new Set(resumed?.passed ?? []));
  // Coaching is decided once, at mount, so marking it seen doesn't hide the tip mid-reveal.
  const [coachable] = useState(() => !readStore().settings.coached);
  const coachAt = coachable ? coachIndex(state.results) : -1;
  const coachNow = state.phase === "reveal" && coachAt === state.current;
  useEffect(() => { if (coachNow) markCoached(); }, [coachNow]);
  const saved = useRef(false);
  const finished = store.games[day.date];

  // Save the run after every step (not every tick: the clock restarts on resume anyway).
  const { phase, current, results, noTimer } = state;
  useEffect(() => {
    if (phase === "done") return clearRun();
    const run = toSavedRun(day.date, { ...initialGame(), phase, current, results, noTimer }, passed);
    if (run) saveRun(run);
  }, [day.date, phase, current, results, noTimer, passed]);

  // Sent once per run when the fourth prompt appears, so a drop-off can be told apart from a bounce.
  // A resumed run already past it never sends again.
  const reachedSent = useRef((resumed?.state.current ?? 0) >= 3);
  useEffect(() => {
    if (!isToday || reachedSent.current || current !== 3 || (phase !== "reading" && phase !== "answering")) return;
    reachedSent.current = true;
    sendDigEvent({ kind: "reached", ...(isNewPlayer(readStore().games, day.date) ? { isNew: true } : {}) });
  }, [isToday, current, phase, day.date]);

  const ticking = !state.noTimer && (state.phase === "reading" || state.phase === "answering");
  useEffect(() => {
    if (!ticking) return;
    const id = window.setInterval(() => dispatch({ type: "tick" }), 1000);
    return () => window.clearInterval(id);
  }, [ticking]); // every prompt ends in a reveal, so ticking drops to false and the interval restarts

  useEffect(() => {
    if (state.phase !== "done" || saved.current) return;
    saved.current = true;
    // Another tab finished this day first: keep its game and its one report.
    if (readStore().games[day.date]) return;
    const isNew = isNewPlayer(readStore().games, day.date); // before saveGame, for clarity
    const tiers = resultTiers(state);
    const score = scoreOf(tiers);
    saveGame(day.date, { answers: state.results.map((r) => r.answer), tiers, score, finishedAt: new Date().toISOString() });
    // A past day never reports. Today's reports once per browser.
    if (!isToday || store.games[day.date]?.reported) return;
    const event = buildFinishEvent(day.date, tiers, score, state.results, Math.random() < day.rejSample, isNew, friend !== null);
    // A null answer means the finish wasn't counted (refused, offline, or the game crossed UTC
    // midnight so it is no longer today's): no percentile line, and not marked as reported.
    void sendFinish(event).then((spread) => {
      if (spread) markReported(day.date, spread);
    });
  }, [state, day, isToday, store.games]);

  if (state.phase === "intro" && !finished) {
    const noTimer = effectiveNoTimer(store.settings);
    return (
      <>
        <Heading heading={heading} phase="intro" note={note} />
        <Intro
          challenge={friend ? challengeLine(friend) : isToday ? staleChallengeLine(vsRaw, day.number) : null}
          noTimer={noTimer}
          onToggleTimer={() => setNoTimer(!noTimer)}
          onStart={() => {
            sendDigEvent(isToday ? buildStartEvent(day.date, readStore().games, friend !== null) : { kind: "past" });
            dispatch({ type: "start", noTimer });
          }}
        />
      </>
    );
  }
  let screen: React.ReactNode;
  if (finished && (state.phase === "intro" || state.phase === "done")) {
    // Already played, or just finished: their own result, never a countdown. Only a dig finished in
    // this session takes focus (a page load of a played day must not jump it).
    screen = <EndScreen day={day} game={finished} isToday={isToday} friend={friend} autoFocus={state.phase === "done"} offerTimer={isToday && store.settings.noTimer === undefined} onAddTimer={() => setNoTimer(false)} />;
  } else if (state.phase === "done") {
    // The save is a render away: show nothing in the meantime. The live region below must still
    // render, so it persists from the last reveal through to the end screen.
    screen = null;
  } else if (state.phase === "reveal") {
    screen = (
      <Reveal
        result={state.results[state.current]}
        secret={day.secrets[state.current]}
        isLast={state.current === day.prompts.length - 1}
        claimed={(() => { const last = state.results[state.current].lastGuess, c = claimed[state.current]; return !!last && !!c && normalizeKey(last) === normalizeKey(c); })()}
        passed={passed.has(state.current)}
        canClaim={isToday}
        variantIndex={priorSameTier(state.results, state.current)}
        coach={coachNow}
        kind={day.prompts[state.current].kind}
        promptText={day.prompts[state.current].text}
        onStory={() => sendDigEvent({ kind: "story" })}
        onNext={() => dispatch({ type: "next" })}
        onClaim={claim}
      />
    );
  } else {
    screen = (
      <PromptScreen
        key={state.current}
        index={state.current}
        total={day.prompts.length}
        prompt={day.prompts[state.current]}
        phase={state.phase}
        clock={state.clock}
        noTimer={state.noTimer}
        feedback={state.feedback}
        onSubmit={(guess) => dispatch({ type: "submit", guess })}
        canClaim={isToday}
        onClaim={claim}
        onTimer={(off) => {
          dispatch({ type: "timer", noTimer: off });
          setNoTimer(off);
          if (isToday) sendDigEvent({ kind: "timer" });
        }}
        onPass={() => {
          setPassed(new Set(passed).add(state.current));
          dispatch({ type: "pass" });
        }}
      />
    );
  }
  // One live region that outlives every screen change. Reveal mounts fresh when a prompt locks,
  // and a region that mounts with its text is not reliably announced, so the outcome is set
  // here, where the element persists.
  const doneTiers = state.phase === "done" ? resultTiers(state) : [];
  const outcome = state.phase === "reveal"
    ? announceReveal(state.results[state.current], day.secrets[state.current], passed.has(state.current))
    : state.phase === "done" ? announceDone(scoreOf(doneTiers), doneTiers) : "";
  // The strip shows above the prompt and reveal screens only (not the intro, not the end screen).
  const showStrip = state.phase === "reading" || state.phase === "answering" || state.phase === "reveal";
  const shownPhase = finished && (state.phase === "intro" || state.phase === "done") ? "done" : state.phase;
  return (
    <>
      <Heading heading={heading} phase={shownPhase} note={note} />
      {showStrip && (
        <div className="mt-4 short:mt-2">
          <Strata compact label="" {...stripState(state, resumedReveal)} />
        </div>
      )}
      {screen}
      <p role="status" aria-live="polite" className="sr-only">{outcome}</p>
    </>
  );
}
