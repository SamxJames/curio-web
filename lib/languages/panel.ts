// Pure view-model helpers that build the model for components/LanguagePanelView.tsx (via LanguagePanel on Collection and the language page). No React, no map data:
// LAND_DOTS is passed in by the caller after its lazy import.
import { LANGUAGE_SHEETS } from "./data";
import { familyPath, findSheet, nextLanguages } from "./lookup";
import { AXIS, eraLabel, formatYear, yearToX } from "./timeline";
import { PANEL_WIDTH, type FamilyChip, type PanelModel, type SpeakersModel, type TimelineModel } from "./panelView";
import type { LanguageSheet } from "./types";

export { PANEL_WIDTH, mapHeight, mapModel } from "./panelView";
export type { FamilyChip, MapModel, PanelModel, SpeakersModel, TimelineModel } from "./panelView";

/** Timeline bars are never narrower than this, in user units (>= 4px at >= 320px wide). */
export const MIN_BAR_WIDTH = 4;

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
  // Only an actual year draws the written-only tail; null or absent means "no
  // information" (drafts use null that way), never "still written today".
  if (era.to !== null && typeof era.writtenUntil === "number") {
    const tx2 = yearToX(era.writtenUntil, PANEL_WIDTH);
    if (tx2 > x + width) tail = { x: x + width, width: tx2 - (x + width) };
    writtenWords =
      era.writtenUntil >= AXIS.to
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

export function statusNote(sheet: LanguageSheet): string {
  switch (sheet.status) {
    case "living":
      return "spoken today";
    case "extinct":
      return "no native speakers today";
    case "historical":
      // Lineage order records borrowing, not descent, so never name a later language here.
      return "an earlier stage of a language still spoken today";
    case "reconstructed":
      return "reconstructed by scholars, never written down";
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
  const { groups } = familyModel(sheet, favouriteLineages, sheets);
  return {
    statusNote: statusNote(sheet),
    timeline: timelineModel(sheet),
    speakers: speakersModel(sheet),
    family: groups,
    showDashedCaption: groups.some((g) => g.some((c) => c.reconstructed)),
    favouriteCount: favouriteCount(sheet, favouriteLineages),
  };
}
