import type { Tier } from "./types";

/** The section drawing's geometry and colours, shared by the SVG (components/dig/Strata),
 * the canvas share card and the next/og previews, which can't read CSS variables. Earth
 * tones from paper to ink, never red (red is for actions only). */
export const STRATA = ["topsoil", "loam", "clay", "stone", "bedrock"] as const;
export const STRATUM_HEX = ["#E9E1CF", "#D6C4A3", "#B99A72", "#7E6A52", "#3A322A"] as const;
/** Bands dark enough to need paper-coloured text and markers. */
export const STRATUM_DARK = [false, false, false, true, true] as const;

const BAND: Record<Tier, number> = { common: 0, popular: 0, familiar: 1, uncommon: 2, rare: 3, fossil: 4 };
export const bandOf = (t: Tier | null): number | null => (t ? BAND[t] : null);

/** Cap height of the 13-unit labels, and the room left for descenders. */
const LABEL_CAP = 9, LABEL_DESC = 2;

/** Baseline for a marker's word label: below the marker, or above it on alternate columns.
 * The label is clamped into the marker's own band so it keeps that band's halo colour and
 * contrast; in a tall band (72 units) the clamp never bites. */
export function labelBaseline(cy: number, r: number, above: boolean, bandTop: number, bandH: number): number {
  const wanted = above ? cy - r - (bandH < 60 ? 4 : 6) : cy + r + (bandH < 60 ? 12 : 14);
  return Math.min(Math.max(wanted, bandTop + LABEL_CAP + 1), bandTop + bandH - LABEL_DESC);
}

export function strataLayout(tiers: (Tier | null)[], width: number, height: number) {
  const h = height / STRATA.length;
  return {
    bands: STRATA.map((name, i) => ({ name, y: i * h, h })),
    markers: tiers.map((t, i) => {
      const band = bandOf(t);
      return { x: (width * (i + 0.5)) / tiers.length, y: band === null ? 0 : h * (band + 0.5), band };
    }),
  };
}
