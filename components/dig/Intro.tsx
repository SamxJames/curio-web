"use client";

import Button from "@/components/ui/Button";
import { ToggleGroup } from "@/components/ui/SegmentedControl";

/** The landing card: two plain lines, an example, Start, and No timer. */
export default function Intro({ noTimer, onToggleTimer, onStart }: { noTimer: boolean; onToggleTimer: () => void; onStart: () => void }) {
  return (
    <div className="mt-8">
      <p className="font-sans text-lg text-ink">Name a word that fits each prompt.</p>
      <p className="mt-2 font-sans text-lg text-ink-soft">Any word that fits counts. Rarer words score more.</p>
      <div className="mt-4 border border-line p-4">
        <p className="font-serif text-lg text-ink">{"For example: Name a fruit"}</p>
        <p className="mt-1 font-serif text-base text-ink-soft">{"apple lands in the topsoil. quince digs down to the clay."}</p>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <Button onClick={onStart}>Start</Button>
        <ToggleGroup
          segments={["No timer"]}
          getKey={(s) => s}
          isActive={() => noTimer}
          onToggle={onToggleTimer}
          renderSegment={(s, active) => <span>{active ? `${s}: on` : s}</span>}
          getButtonProps={(_, active) => ({
            className: active
              ? "min-h-11 rounded-full border border-ink px-3.5 font-sans text-sm text-ink"
              : "min-h-11 rounded-full border border-line-strong px-3.5 font-sans text-sm text-ink-soft",
          })}
        />
      </div>
      <p className="mt-3 font-sans text-sm text-ink-faint">{noTimer ? "Seven prompts. No clock: take your time." : "Seven prompts, 25 seconds each."}</p>
    </div>
  );
}
