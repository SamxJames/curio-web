// Pure view-model helpers for components/LanguagePanel.tsx. No React, no map data:
// LAND_DOTS is passed in by the caller after its lazy import.
import { LANGUAGE_SHEETS } from "./data";
import { familyPath, findSheet, nextLanguages } from "./lookup";
import { dotsInView, isLit, project, viewAround, type Dot } from "./mapGeometry";
import { AXIS, eraLabel, formatYear, yearToX } from "./timeline";
import type { LanguageSheet } from "./types";

/** SVG user-space width shared by the map and the timeline. */
export const PANEL_WIDTH = 320;
/** Timeline bars are never narrower than this, in user units (>= 4px at >= 320px wide). */
export const MIN_BAR_WIDTH = 4;

export type FamilyChip = { name: string; reconstructed: boolean; current: boolean };

export type TimelineModel = {
  label: string; // eraLabel, shown above the bar
  ariaLabel: string; // dates in words
  bar: { x: number; width: number };
  tail: { x: number; width: number } | null; // later written-only use, drawn faint
  dashed: boolean; // reconstructed: outline only
  /** Where the label sits: from the bar's start, or ending at the bar's end near "now". */
  labelAnchor: { side: "left" | "right"; percent: number };
  ticks: { label: string; percent: number }[]; // axis labels under the baseline
};

export type SpeakersModel =
  | { kind: "count"; value: string; year: string; note: string | null }
  | { kind: "unknown"; note: string };

export type PanelModel = {
  statusNote: string;
  timeline: TimelineModel | null; // null => "Dates unknown"
  speakers: SpeakersModel;
  /** Groups joined by "›"; chips within a group are alternatives (several next steps). */
  family: FamilyChip[][];
  showDashedCaption: boolean;
  favouriteCount: number;
};

const ENGLISH = "English";
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

const percent = (x: number) => (x / PANEL_WIDTH) * 100;

/** Every lineage spelling that means this sheet's language. */
const namesOf = (sheet: LanguageSheet) => [sheet.name, ...sheet.aliases];

/** Rewrites alias spellings in lineages to the sheet's canonical name. */
function canonicalLineages(sheet: LanguageSheet, lineages: string[][]): string[][] {
  const names = new Set(namesOf(sheet));
  return lineages.map((l) => l.map((n) => (names.has(n) ? sheet.name : n)));
}

function isReconstructed(name: string, sheets: LanguageSheet[]): boolean {
  const sheet = findSheet(name, sheets);
  return sheet ? sheet.status === "reconstructed" : name.startsWith("Proto-");
}

function yearInWords(year: number, approximate: boolean): string {
  return `${approximate ? "about " : ""}${formatYear(year)}`;
}

export function timelineModel(sheet: LanguageSheet): TimelineModel | null {
  const era = sheet.era;
  if (!era) return null;
  const x1 = yearToX(era.from, PANEL_WIDTH);
  const x2 = yearToX(era.to ?? AXIS.to, PANEL_WIDTH);
  const width = Math.max(x2 - x1, MIN_BAR_WIDTH);
  const x = Math.min(x1, PANEL_WIDTH - width);

  let tail: TimelineModel["tail"] = null;
  let writtenWords = "";
  if (era.to !== null && era.writtenUntil !== undefined) {
    const tx2 = yearToX(era.writtenUntil ?? AXIS.to, PANEL_WIDTH);
    if (tx2 > x + width) tail = { x: x + width, width: tx2 - (x + width) };
    writtenWords =
      era.writtenUntil === null
        ? "; still used in writing today"
        : `; used in writing until ${formatYear(era.writtenUntil)}`;
  }

  const spoken =
    era.to === null
      ? `spoken from ${yearInWords(era.from, era.approximate)} to today`
      : `spoken from ${yearInWords(era.from, era.approximate)} to ${yearInWords(era.to, era.approximate)}`;

  const startPct = percent(x);
  const labelAnchor: TimelineModel["labelAnchor"] =
    startPct <= 60
      ? { side: "left", percent: startPct }
      : { side: "right", percent: 100 - percent(x + width) };

  return {
    label: eraLabel(era),
    ariaLabel: `Timeline: ${sheet.name} was ${spoken}${writtenWords}.`,
    bar: { x, width },
    tail,
    dashed: sheet.status === "reconstructed",
    labelAnchor,
    ticks: [-4500, -1000].map((year) => ({
      label: formatYear(year),
      percent: percent(yearToX(year, PANEL_WIDTH)),
    })),
  };
}

export function speakersModel(sheet: LanguageSheet): SpeakersModel {
  const p = sheet.peakSpeakers;
  if (!p) return { kind: "unknown", note: sheet.unknownSpeakersNote ?? "" };
  return { kind: "count", value: compact.format(p.count), year: formatYear(p.year), note: p.note ?? null };
}

/** Ancestors › current › next steps in the reader's favourites › English. */
export function familyModel(
  sheet: LanguageSheet,
  favouriteLineages: string[][],
  sheets: LanguageSheet[] = LANGUAGE_SHEETS,
): { groups: FamilyChip[][]; next: string[] } {
  const chip = (name: string, current = false): FamilyChip => ({
    name,
    current,
    reconstructed: current ? sheet.status === "reconstructed" : isReconstructed(name, sheets),
  });
  const ancestors = familyPath(sheet.name, sheets).filter((n) => n !== sheet.name);
  const next = nextLanguages(sheet.name, canonicalLineages(sheet, favouriteLineages));
  const groups: FamilyChip[][] = [...ancestors.map((n) => [chip(n)]), [chip(sheet.name, true)]];
  const between = next.filter((n) => n !== ENGLISH && n !== sheet.name);
  if (between.length) groups.push(between.map((n) => chip(n)));
  if (sheet.name !== ENGLISH) groups.push([chip(ENGLISH)]);
  return { groups, next };
}

export function statusNote(sheet: LanguageSheet, next: string[]): string {
  switch (sheet.status) {
    case "living":
      return "spoken today";
    case "extinct":
      return "no native speakers today";
    case "historical":
      return `an earlier stage of ${next[0] ?? "a living language"}`;
    case "reconstructed":
      return "reconstructed by scholars — never written down";
  }
}

/** How many of the reader's favourites passed through this language (by any spelling). */
export function favouriteCount(sheet: LanguageSheet, favouriteLineages: string[][]): number {
  const names = namesOf(sheet);
  return favouriteLineages.filter((l) => l.some((n) => names.includes(n))).length;
}

export function panelModel(
  sheet: LanguageSheet,
  favouriteLineages: string[][],
  sheets: LanguageSheet[] = LANGUAGE_SHEETS,
): PanelModel {
  const { groups, next } = familyModel(sheet, favouriteLineages, sheets);
  return {
    statusNote: statusNote(sheet, next),
    timeline: timelineModel(sheet),
    speakers: speakersModel(sheet),
    family: groups,
    showDashedCaption: groups.some((g) => g.some((c) => c.reconstructed)),
    favouriteCount: favouriteCount(sheet, favouriteLineages),
  };
}

export type MapModel = {
  width: number;
  height: number;
  dots: { x: number; y: number; lit: boolean }[];
  dotRadius: number;
  litRadius: number;
  centre: { x: number; y: number };
  ringRadius: number;
};

/** Height of the map canvas for a sheet's view, keeping degrees roughly square on the ground. */
export function mapHeight(map: NonNullable<LanguageSheet["map"]>): number {
  const view = viewAround(map);
  const cosLat = Math.max(Math.cos((map.lat * Math.PI) / 180), 0.2);
  const ratio = (view.maxLat - view.minLat) / ((view.maxLon - view.minLon) * cosLat);
  return Math.round(Math.min(Math.max(PANEL_WIDTH * ratio, 120), 240));
}

/** Projects the land dots around a sheet's location; dots within its radius are lit. */
export function mapModel(map: NonNullable<LanguageSheet["map"]>, landDots: Dot[]): MapModel {
  const view = viewAround(map);
  const width = PANEL_WIDTH;
  const height = mapHeight(map);
  // Dots sit on a 1.5-degree grid; size them from the on-screen grid spacing.
  const spacing = Math.min((1.5 / (view.maxLon - view.minLon)) * width, (1.5 / (view.maxLat - view.minLat)) * height);
  const dotRadius = Math.max(spacing * 0.28, 0.6);
  const litRadius = dotRadius * 1.5;
  const dots = dotsInView(landDots, view).map((d) => {
    const [x, y] = project(d, view, width, height);
    return { x, y, lit: isLit(d, map, map.radiusKm) };
  });
  const [cx, cy] = project([map.lon, map.lat], view, width, height);
  return { width, height, dots, dotRadius, litRadius, centre: { x: cx, y: cy }, ringRadius: litRadius * 3 };
}
