import { disagreements, summarizeVerdicts, type JudgeReason, type VerdictLog } from "@/lib/dig/verdicts";

const WHY: Record<JudgeReason, string> = {
  accepted: "accepted",
  "not-a-word": "not in our word list",
  blocked: "blocklisted",
  unusable: "too obscure or unsuitable",
  "not-in-sources": "no source puts it here",
};

/** Admin only: guesses the game refused that a blind AI reviewer (shown only the prompt and the word)
 * says should have been accepted. Shadow mode: nothing here has changed an answer list; accept a word
 * by adding it to the prompt's catalogue answers. Markup follows DigFunnelTable (internal tooling). */
export default function DigReviewTable({ log }: { log: VerdictLog }) {
  const s = summarizeVerdicts(log);
  const rows = disagreements(log, 40);
  return (
    <div>
      <p className="font-sans text-[9.5px] tracking-[0.18em] text-ink-soft uppercase">Refused guesses, reviewed blind</p>
      <p className="mt-1 font-serif text-[13.5px] leading-[1.5] text-ink-soft italic">
        A model sees only the prompt and the word, not our verdict. Shadow mode: it changes no answer list.
        Typed = times players entered it. Most confident, then most typed, first.
      </p>
      {s.reviewed === 0 ? (
        <p className="mt-3 font-serif text-[13.5px] text-ink-soft italic">No reviews yet.</p>
      ) : (
        <>
          <p className="mt-3 font-sans text-[11px] text-ink-soft">
            {s.reviewed} reviewed: {s.shouldAccept} the reviewer would accept, {s.agree} it agrees were right to refuse.
          </p>
          <div className="mt-1">
            <div className="flex items-baseline justify-between py-1.5 font-sans text-[9.5px] tracking-[0.18em] text-ink-soft uppercase">
              <span className="w-24">Word</span>
              <span className="flex-1">Prompt</span>
              <span className="w-10 text-right">Typed</span>
              <span className="w-28 text-right">We refused it as</span>
              <span className="w-12 text-right">Sure</span>
              <span className="w-40 pl-3">Reviewer says</span>
            </div>
            {rows.map((r) => (
              <div key={`${r.prompt}|${r.guess}`} className="flex items-baseline justify-between border-t border-line py-1.5">
                <span className="w-24 font-serif text-[13px]">{r.guess}</span>
                <span className="flex-1 font-sans text-[11px] text-ink-soft">{r.text}</span>
                <span className="w-10 text-right font-serif text-[13px] tabular-nums">{r.n}</span>
                <span className="w-28 text-right font-sans text-[11px] text-ink-soft">{WHY[r.ours]}</span>
                <span className="w-12 text-right font-sans text-[11px] text-ink-soft">{r.conf}</span>
                <span className="w-40 pl-3 font-sans text-[11px] text-ink-soft">{r.reason}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
