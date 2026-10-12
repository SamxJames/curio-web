// Data-free half of the language panel: view-model types and the map projection.
// Imported by the client view (components/LanguagePanelView.tsx), so it must never
// import data.ts, lookup.ts, panel.ts or lib/words — see LanguagePanelView.imports.test.ts.
import { dotsInView, isLit, project, viewAround, type Dot } from "./mapGeometry";
import type { LanguageSheet } from "./types";

/** SVG user-space width shared by the map and the timeline. */
export const PANEL_WIDTH = 320;

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
