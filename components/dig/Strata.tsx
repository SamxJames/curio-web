import { STRATUM, TIER_LABEL } from "@/lib/dig/score";
import { STRATA, STRATUM_DARK, strataLayout } from "@/lib/dig/strata";
import type { Tier } from "@/lib/dig/types";

/** A narrow viewBox so 13-unit labels stay ~12px on a phone; max-w-form caps them near 16px. */
const W = 360;
const NAME_SIZE = 13, WORD_SIZE = 13, GUTTER = 68, RIGHT = 14;
const FULL_H = 360, COMPACT_H = 80;
/** The dotted guide in an unanswered column is decorative; this keeps it visible, not loud. */
export const GUIDE_OPACITY = 0.5;

/** Long answers are shortened in the drawing only; the accessible name keeps every word whole. */
const short = (w: string) => (w.length > 10 ? `${w.slice(0, 9)}…` : w);

const inkOn = (band: number | null) => (band !== null && STRATUM_DARK[band] ? "fill-stratum-paper" : "fill-stratum-ink");

type Tiers = (Tier | null | undefined)[];

/** The cross-section of today's dig: five strata, one marker per prompt at its answer's
 * depth. The accessible name lists every answer with its tier in words. Ink and paper
 * come from the fixed stratum tokens, so the drawing reads the same in light and dark.
 *
 * `tiers` entries: a tier = answered; `null` = passed or timed out (an open ring at the
 * surface); `undefined` = not answered yet (a faint dotted guide).
 * `compact` is the slim strip above the prompts and reveals: no band names, no word labels,
 * hidden from assistive tech (the reveal announces the answer). `current` shows the surface
 * ring in the column being answered; `justDropped` is the one column that animates. */
export default function Strata({ tiers, words, label, compact = false, height, current, justDropped }: {
  tiers: Tiers;
  words?: (string | null)[];
  label: string;
  compact?: boolean;
  /** viewBox height; default 360, compact default 80 (the postcard passes 240) */
  height?: number;
  current?: number;
  justDropped?: number;
}) {
  const H = height ?? (compact ? COMPACT_H : FULL_H);
  const gutter = compact ? 0 : GUTTER;
  const right = compact ? 0 : RIGHT;
  // Unanswered columns only need a y for the layout; `tiers` itself says which are answered.
  const { bands, markers: raw } = strataLayout(tiers.map((t) => t ?? null), W - gutter - right, H);
  const markers = raw.map((m) => ({ ...m, x: m.x + gutter }));
  const darkTop = bands[STRATUM_DARK.indexOf(true)].y;
  const markR = compact ? 5.5 : 11, fossilR = compact ? 7.5 : 18, ringR = compact ? 5.5 : 5;
  const described = tiers
    .map((t, i) => (t ? `${words?.[i] ?? "Answer"}, ${TIER_LABEL[t]}, in the ${STRATUM[t]}` : "No answer"))
    .join("; ");

  const svg = (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      {...(compact ? { "aria-hidden": true as const, className: "h-auto w-full max-w-form" } : { role: "img", "aria-label": `${label}: ${described}`, className: "h-auto w-full" })}
    >
      {bands.map((b, i) => (
        <g key={b.name}>
          <rect x={0} y={b.y} width={W} height={b.h} style={{ fill: `var(--stratum-${i + 1})` }} />
          {i > 0 && <line x1={0} x2={W} y1={b.y} y2={b.y} className="stroke-stratum-ink" strokeWidth={1} />}
          {!compact && <text x={8} y={b.y + 15} fontSize={NAME_SIZE} className={inkOn(i)}>{STRATA[i]}</text>}
        </g>
      ))}
      {markers.map((m, i) => {
        const tier = tiers[i];
        // Not answered yet: a dotted guide (ink above the dark strata, paper through them),
        // plus the surface ring if this is the column being answered.
        if (tier === undefined) {
          return (
            <g key={i}>
              <g data-guide="" strokeOpacity={GUIDE_OPACITY} strokeWidth={compact ? 2 : 3} strokeDasharray="2 6">
                <line x1={m.x} x2={m.x} y1={0} y2={darkTop} className="stroke-stratum-ink" />
                <line x1={m.x} x2={m.x} y1={darkTop} y2={H} className="stroke-stratum-paper" />
              </g>
              {i === current && <circle cx={m.x} cy={compact ? 8 : 10} r={ringR} fill="none" className="stroke-stratum-ink" strokeWidth={2} />}
            </g>
          );
        }
        // No answer: a small open ring at the surface, no drop line, never animated.
        if (tier === null || m.band === null) return <circle key={i} cx={m.x} cy={compact ? 8 : 10} r={ringR} fill="none" className="stroke-stratum-ink" strokeWidth={2} />;
        const r = tier === "fossil" ? fossilR : markR;
        const cy = Math.max(m.y, 8);
        const dropping = i === justDropped;
        // Neighbouring columns put their labels on opposite sides of the marker, so
        // longer words in the same band don't run into each other.
        const labelY = i % 2 ? cy - r - 6 : cy + r + 14;
        return (
          <g key={i}>
            {!compact && (
              <>
                {/* The drop line changes to paper where it passes through the dark strata. */}
                <line x1={m.x} x2={m.x} y1={0} y2={Math.min(m.y, darkTop)} className="stroke-stratum-ink" strokeWidth={3} strokeDasharray="2 8" />
                {m.y > darkTop && (
                  <line x1={m.x} x2={m.x} y1={darkTop} y2={m.y} className="stroke-stratum-paper" strokeWidth={3} strokeDasharray="2 8" />
                )}
              </>
            )}
            <g className={dropping ? "dig-drop" : undefined} style={dropping ? { ["--drop-from" as string]: `${-(cy - 8)}px` } : undefined}>
              <circle cx={m.x} cy={cy} r={r} className={inkOn(m.band)} />
              {dropping && tier === "fossil" && (
                <circle cx={m.x} cy={cy} r={r + 2} fill="none" className="dig-found stroke-stratum-paper" strokeWidth={2} />
              )}
            </g>
            {!compact && words?.[i] && (
              // A halo in the band colour keeps the drop line from running through the word.
              <text x={m.x} y={labelY} fontSize={WORD_SIZE} textAnchor="middle" className={inkOn(m.band)}
                style={{ paintOrder: "stroke", stroke: `var(--stratum-${m.band + 1})`, strokeWidth: 5, strokeLinejoin: "round" }}>{short(words[i]!)}</text>
            )}
          </g>
        );
      })}
      {/* Keeps bedrock's edge visible against the dark page. */}
      <rect x={0.5} y={0.5} width={W - 1} height={H - 1} fill="none" className="stroke-line-strong" strokeWidth={1} />
    </svg>
  );
  return compact ? svg : <figure className="m-0 max-w-form">{svg}</figure>;
}

/** The strip while the day loads: seven faint columns and five empty bands, so the layout
 * does not jump when the real strip arrives. */
export function StrataSkeleton() {
  const { bands, markers } = strataLayout(Array(7).fill(null), W, COMPACT_H);
  return (
    <svg viewBox={`0 0 ${W} ${COMPACT_H}`} aria-hidden="true" className="h-auto w-full max-w-form">
      {bands.map((b, i) => (
        <rect key={b.name} x={0} y={b.y} width={W} height={b.h} style={{ fill: `var(--stratum-${i + 1})`, opacity: 0.45 }} />
      ))}
      {markers.map((m, i) => (
        <line key={i} x1={m.x} x2={m.x} y1={0} y2={COMPACT_H} className="stroke-stratum-ink" strokeOpacity={0.2} strokeWidth={2} strokeDasharray="2 6" />
      ))}
      <rect x={0.5} y={0.5} width={W - 1} height={COMPACT_H - 1} fill="none" className="stroke-line-strong" strokeWidth={1} />
    </svg>
  );
}
