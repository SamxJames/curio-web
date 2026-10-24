import { STRATUM, TIER_LABEL } from "@/lib/dig/score";
import { STRATA, STRATUM_DARK, strataLayout } from "@/lib/dig/strata";
import type { Tier } from "@/lib/dig/types";

/** A narrow viewBox so 13-unit labels stay ~12px on a phone; max-w-form caps them near 16px. */
const W = 360, H = 360;
const NAME_SIZE = 13, WORD_SIZE = 13;

const inkOn = (band: number | null) => (band !== null && STRATUM_DARK[band] ? "fill-stratum-paper" : "fill-stratum-ink");

/** The cross-section of today's dig: five strata, one marker per prompt at its answer's
 * depth. The accessible name lists every answer with its tier in words. Ink and paper
 * come from the fixed stratum tokens, so the drawing reads the same in light and dark. */
export default function Strata({ tiers, words, label }: { tiers: (Tier | null)[]; words?: (string | null)[]; label: string }) {
  const { bands, markers } = strataLayout(tiers, W, H);
  const darkTop = bands[STRATUM_DARK.indexOf(true)].y;
  const described = tiers
    .map((t, i) => (t ? `${words?.[i] ?? "Answer"}, ${TIER_LABEL[t]}, in the ${STRATUM[t]}` : "No answer"))
    .join("; ");
  return (
    <figure className="m-0 max-w-form">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}: ${described}`} className="h-auto w-full">
        {bands.map((b, i) => (
          <g key={b.name}>
            <rect x={0} y={b.y} width={W} height={b.h} style={{ fill: `var(--stratum-${i + 1})` }} />
            {i > 0 && <line x1={0} x2={W} y1={b.y} y2={b.y} className="stroke-stratum-ink" strokeWidth={1} />}
            <text x={8} y={b.y + 15} fontSize={NAME_SIZE} className={inkOn(i)}>{STRATA[i]}</text>
          </g>
        ))}
        {markers.map((m, i) => {
          const r = tiers[i] === "fossil" ? 18 : 11;
          const cy = Math.max(m.y, 8);
          // Neighbouring columns put their labels on opposite sides of the marker, so
          // longer words in the same band don't run into each other.
          const labelY = i % 2 ? cy - r - 6 : cy + r + 14;
          return (
            <g key={i}>
              {/* The drop line changes to paper where it passes through the dark strata. */}
              <line x1={m.x} x2={m.x} y1={0} y2={Math.min(m.y, darkTop)} className="stroke-stratum-ink" strokeWidth={3} strokeDasharray="2 8" />
              {m.y > darkTop && (
                <line x1={m.x} x2={m.x} y1={darkTop} y2={m.y} className="stroke-stratum-paper" strokeWidth={3} strokeDasharray="2 8" />
              )}
              <circle cx={m.x} cy={cy} r={r} className={inkOn(m.band)} />
              {words?.[i] && (
                <text x={m.x} y={labelY} fontSize={WORD_SIZE} textAnchor="middle" className={inkOn(m.band)}>{words[i]}</text>
              )}
            </g>
          );
        })}
        {/* Keeps bedrock's edge visible against the dark page. */}
        <rect x={0.5} y={0.5} width={W - 1} height={H - 1} fill="none" className="stroke-line-strong" strokeWidth={1} />
      </svg>
    </figure>
  );
}
