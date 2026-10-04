import type { LanguageSheet } from "./types";

/** Shared timeline axis: 4500 BCE to the current year. */
export const AXIS = { from: -4500, to: new Date().getUTCFullYear() };

/** Horizontal position of `year` on an axis `width` wide, clamped to the axis. */
export function yearToX(year: number, width: number): number {
  const clamped = Math.min(Math.max(year, AXIS.from), AXIS.to);
  return ((clamped - AXIS.from) / (AXIS.to - AXIS.from)) * width;
}

/** "700 BCE", "600 CE" (only below 1000), "1400". */
export function formatYear(year: number): string {
  if (year < 0) return `${-year} BCE`;
  if (year < 1000) return `${year} CE`;
  return `${year}`;
}

type Era = NonNullable<LanguageSheet["era"]>;

export function eraLabel(era: Pick<Era, "from" | "to" | "approximate">): string {
  const prefix = era.approximate ? "c. " : "";
  const to = era.to === null ? "today" : formatYear(era.to);
  return `${prefix}${formatYear(era.from)} – ${to}`;
}
