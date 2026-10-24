import { STRATUM, TIER_LABEL } from "@/lib/dig/score";
import { STRATA, STRATUM_DARK, strataLayout } from "@/lib/dig/strata";
import type { Tier } from "@/lib/dig/types";

const W = 700, H = 420;

/** The cross-section of today's dig: five strata, one marker per prompt at its answer's
 * depth. The accessible name lists every answer with its tier in words. Ink and paper
 * come from the fixed stratum tokens, so the drawing reads the same in light and dark. */
export default function Strata({ tiers, words, label }: { tiers: (Tier | null)[]; words?: (string | null)[]; label: string }) {
  const { bands, markers } = strataLayout(tiers, W, H);
  const described = tiers
    .map((t, i) => (t ? `${words?.[i] ?? "Answer"}, ${TIER_LABEL[t]}, in the ${STRATUM[t]}` : "No answer"))
    .join("; ");
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}: ${described}`} className="h-auto w-full">
        {bands.map((b, i) => (
          <g key={b.name}>
            <rect x={0} y={b.y} width={W} height={b.h} style={{ fill: `var(--stratum-${i + 1})` }} />
            {i > 0 && <line x1={0} x2={W} y1={b.y} y2={b.y} className="stroke-stratum-ink" strokeWidth={1} />}
            <text x={12} y={b.y + 22} fontSize={16} className={STRATUM_DARK[i] ? "fill-stratum-paper" : "fill-stratum-ink"}>{STRATA[i]}</text>
          </g>
        ))}
        {markers.map((m, i) => (
          <g key={i}>
            <line x1={m.x} x2={m.x} y1={0} y2={m.y} className="stroke-stratum-ink" strokeWidth={3} strokeDasharray="2 8" />
            <circle cx={m.x} cy={Math.max(m.y, 8)} r={tiers[i] === "fossil" ? 18 : 11}
              className={m.band !== null && STRATUM_DARK[m.band] ? "fill-stratum-paper" : "fill-stratum-ink"} />
            {words?.[i] && (
              <text x={m.x} y={Math.max(m.y, 8) + 34} fontSize={15} textAnchor="middle"
                className={m.band !== null && STRATUM_DARK[m.band] ? "fill-stratum-paper" : "fill-stratum-ink"}>{words[i]}</text>
            )}
          </g>
        ))}
      </svg>
    </figure>
  );
}
