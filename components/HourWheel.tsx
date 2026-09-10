"use client";

import { useEffect, useRef } from "react";
import clsx from "clsx";

const ITEM_HEIGHT = 40;

function formatHour(hour: number): string {
  const period = hour < 12 ? "AM" : "PM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:00 ${period}`;
}

export default function HourWheel({
  value,
  onChange,
}: {
  value: number;
  onChange: (hour: number) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const isProgrammaticScroll = useRef(false);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    isProgrammaticScroll.current = true;
    el.scrollTo({ top: value * ITEM_HEIGHT, behavior: "instant" as ScrollBehavior });
    const t = setTimeout(() => (isProgrammaticScroll.current = false), 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleScroll() {
    if (isProgrammaticScroll.current) return;
    const el = listRef.current;
    if (!el) return;
    const hour = Math.round(el.scrollTop / ITEM_HEIGHT);
    if (hour !== value && hour >= 0 && hour <= 23) onChange(hour);
  }

  function selectHour(hour: number) {
    onChange(hour);
    listRef.current?.scrollTo({ top: hour * ITEM_HEIGHT, behavior: "smooth" });
  }

  return (
    <div className="relative mx-auto w-40">
      <div
        className="pointer-events-none absolute inset-x-0 top-1/2 z-10 h-10 -translate-y-1/2 rounded-md border border-accent/40 bg-accent/5"
        aria-hidden
      />
      <div
        ref={listRef}
        onScroll={handleScroll}
        className="no-scrollbar h-[200px] overflow-y-scroll"
        style={{
          scrollSnapType: "y mandatory",
          paddingTop: 80,
          paddingBottom: 80,
        }}
      >
        {Array.from({ length: 24 }, (_, hour) => (
          <button
            key={hour}
            type="button"
            onClick={() => selectHour(hour)}
            style={{ scrollSnapAlign: "center", height: ITEM_HEIGHT }}
            className={clsx(
              "flex w-full items-center justify-center font-sans text-sm transition-colors cursor-pointer",
              hour === value ? "text-ink" : "text-ink-faint"
            )}
          >
            {formatHour(hour)}
          </button>
        ))}
      </div>
    </div>
  );
}
