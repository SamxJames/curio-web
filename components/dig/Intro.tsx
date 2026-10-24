"use client";

import Button from "@/components/ui/Button";
import { ToggleGroup } from "@/components/ui/SegmentedControl";

/** The landing card (mockup screen 1): one line of rules, Start, and No timer. */
export default function Intro({ noTimer, onToggleTimer, onStart }: { noTimer: boolean; onToggleTimer: () => void; onStart: () => void }) {
  return (
    <div className="mt-8">
      <p className="font-sans text-lg text-ink-soft">7 prompts. 25 seconds each. Rarer answers dig deeper.</p>
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
      <p className="mt-3 font-sans text-sm text-ink-faint">No timer counts the same. Use it any time.</p>
    </div>
  );
}
