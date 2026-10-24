"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { createReducer, initialGame, prepareDay, resultTiers, type DigDayResponse, type PreparedDay } from "@/lib/dig/game";
import { scoreOf, formatDepth } from "@/lib/dig/score";
import { markReported, saveGame, setNoTimer, useDigStore } from "@/lib/dig/storage";
import { buildFinishEvent, sendDigEvent, sendFinish, sendLandOnce } from "@/lib/dig/client";
import Intro from "./Intro";
import PromptScreen from "./PromptScreen";
import Reveal, { announceReveal } from "./Reveal";

/** The load-failure line; only today's dig is called "Today's". */
export function LoadFailed({ past }: { past: boolean }) {
  return <p className="mt-8 font-sans text-ink-soft">{past ? "This dig didn't load. Refresh to try again." : "Today's dig didn't load. Refresh to try again."}</p>;
}

/** Loads a day (today, or a past date) and plays it. Today's game reports start/finish;
 * a past game records locally only and reports a single past:start. "Past" here is simply
 * "a date prop was given": lib/dig/clock.ts reads the server-only launch date, so it can't
 * be asked in the browser. */
export default function DigGame({ date }: { date?: string }) {
  const [day, setDay] = useState<PreparedDay | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch(date ? `/api/dig/day/${date}` : "/api/dig/today")
      .then((r) => (r.ok ? (r.json() as Promise<DigDayResponse>) : Promise.reject(new Error(String(r.status)))))
      .then((d) => alive && setDay(prepareDay(d)))
      .catch(() => alive && setFailed(true));
    if (!date) sendLandOnce();
    return () => { alive = false; };
  }, [date]);
  if (failed) return <LoadFailed past={!!date} />;
  if (!day) return <p className="mt-8 font-sans text-ink-faint" aria-live="polite">Loading the dig…</p>;
  return <DigRun day={day} isToday={!date} />;
}

function DigRun({ day, isToday }: { day: PreparedDay; isToday: boolean }) {
  const store = useDigStore();
  const reduce = useMemo(() => createReducer(day), [day]);
  const [state, dispatch] = useReducer(reduce, undefined, initialGame);
  const [claimed, setClaimed] = useState<Set<number>>(new Set());
  const [passed, setPassed] = useState<Set<number>>(new Set());
  const saved = useRef(false);
  const finished = store.games[day.date];

  const ticking = !state.noTimer && (state.phase === "reading" || state.phase === "answering");
  useEffect(() => {
    if (!ticking) return;
    const id = window.setInterval(() => dispatch({ type: "tick" }), 1000);
    return () => window.clearInterval(id);
  }, [ticking]); // every prompt ends in a reveal, so ticking drops to false and the interval restarts

  useEffect(() => {
    if (state.phase !== "done" || saved.current) return;
    saved.current = true;
    const tiers = resultTiers(state);
    const score = scoreOf(tiers);
    saveGame(day.date, { answers: state.results.map((r) => r.answer), tiers, score, finishedAt: new Date().toISOString() });
    // A past day never reports. Today's reports once per browser.
    if (!isToday || store.games[day.date]?.reported) return;
    const event = buildFinishEvent(day.date, tiers, score, state.results, Math.random() < day.rejSample);
    // A null answer means the finish wasn't counted (refused, offline, or the game crossed UTC
    // midnight so it is no longer today's): no percentile line, and not marked as reported.
    void sendFinish(event).then((spread) => {
      if (spread) markReported(day.date, spread);
    });
  }, [state, day, isToday, store.games]);

  if (finished && state.phase === "intro") {
    // Already played: show their own result, never a countdown.
    return <p className="mt-8 font-display text-4xl">{`${formatDepth(finished.score)} down`}</p>;
  }
  if (state.phase === "intro") {
    return (
      <Intro
        noTimer={store.settings.noTimer}
        onToggleTimer={() => setNoTimer(!store.settings.noTimer)}
        onStart={() => {
          sendDigEvent(isToday ? { kind: "start", date: day.date } : { kind: "past" });
          dispatch({ type: "start", noTimer: store.settings.noTimer });
        }}
      />
    );
  }
  let screen: React.ReactNode;
  if (state.phase === "done") {
    screen = <p className="mt-8 font-display text-4xl">{`${formatDepth(scoreOf(resultTiers(state)))} down`}</p>;
  } else if (state.phase === "reveal") {
    screen = (
      <Reveal
        result={state.results[state.current]}
        secret={day.secrets[state.current]}
        isLast={state.current === day.prompts.length - 1}
        claimed={claimed.has(state.current)}
        passed={passed.has(state.current)}
        canClaim={isToday}
        onNext={() => dispatch({ type: "next" })}
        onClaim={(guess) => {
          if (!isToday) return;
          sendDigEvent({ kind: "claim", date: day.date, prompt: state.current, guess });
          setClaimed(new Set(claimed).add(state.current));
        }}
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
  const outcome = state.phase === "reveal" ? announceReveal(state.results[state.current], day.secrets[state.current], passed.has(state.current)) : "";
  return (
    <>
      {screen}
      <p role="status" aria-live="polite" className="sr-only">{outcome}</p>
    </>
  );
}
