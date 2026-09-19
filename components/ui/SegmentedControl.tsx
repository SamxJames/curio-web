"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import clsx from "clsx";

type Segment<T extends string> = { key: T; label: string };

/** Single-select tab row — role="tablist"/aria-selected, for a set of
 * mutually exclusive views (HistoryList's My days/All words/Favorites).
 * Distinct from ToggleGroup below: a tab selects one view, a toggle filters
 * a set — different ARIA semantics even though they render identically. */
export function SegmentedTabs<T extends string>({
  segments,
  active,
  onChange,
  className,
}: {
  segments: Segment<T>[];
  active: T;
  onChange: (key: T) => void;
  className?: string;
}) {
  return (
    <div role="tablist" className={clsx("flex items-center gap-1 font-sans text-sm", className)}>
      {segments.map(({ key, label }) => (
        <button
          key={key}
          role="tab"
          aria-selected={active === key}
          onClick={() => onChange(key)}
          className={clsx(
            "min-h-11 rounded-full px-3.5 py-1.5 transition-colors cursor-pointer",
            active === key ? "bg-paper-raised text-ink" : "text-ink-soft hover:text-ink"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** Multi-pressable toggle group — aria-pressed per segment, for a filter
 * where each option is independently on/off (CollectionScreen's language
 * filter, whether rendered as the proportional bar or the chip list).
 *
 * `segments` takes full objects (not bare keys) with a `getKey` accessor,
 * and an optional `getButtonProps` lets a caller attach per-segment button
 * attributes (title, aria-label, inline style, extra className) — the
 * language filter's proportional-bar rendering needs its flex-sizing style
 * and aria-label on the <button> itself, not on a nested child, so a
 * bare-string-key signature that only threads a key through wasn't enough. */
export function ToggleGroup<T>({
  segments,
  getKey,
  isActive,
  onToggle,
  renderSegment,
  getButtonProps,
  className,
}: {
  segments: T[];
  getKey: (segment: T) => string;
  isActive: (segment: T) => boolean;
  onToggle: (segment: T) => void;
  renderSegment: (segment: T, active: boolean) => ReactNode;
  getButtonProps?: (segment: T, active: boolean) => ButtonHTMLAttributes<HTMLButtonElement>;
  className?: string;
}) {
  return (
    <div className={className}>
      {segments.map((segment) => {
        const active = isActive(segment);
        const { className: extraClassName, ...restProps } = getButtonProps?.(segment, active) ?? {};
        return (
          <button
            key={getKey(segment)}
            type="button"
            aria-pressed={active}
            onClick={() => onToggle(segment)}
            className={clsx("cursor-pointer", extraClassName)}
            {...restProps}
          >
            {renderSegment(segment, active)}
          </button>
        );
      })}
    </div>
  );
}
