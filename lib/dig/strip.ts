import type { GameState } from "./game";
import type { Tier } from "./types";

/** What the compact strata strip shows for the current game state. Pure and derived from
 * `results`, `current` and `phase`: nothing is stored, and a refresh rebuilds the same strip.
 *
 * - `tiers`: a tier = answered; `null` = answered with nothing (pass or time out); `undefined` = not yet.
 * - `current`: the column showing the surface ring (while reading or answering).
 * - `justDropped`: the column that animates. Derived during render with no effect and no
 *   state: it is the current index in the reveal phase, unless that reveal is the one a
 *   refreshed run resumed into (`resumedReveal`, -1 for a fresh run). Setting it in an effect
 *   would paint the marker at its final spot and then restart the animation: a flicker. */
export function stripState(
  state: Pick<GameState, "results" | "current" | "phase">,
  resumedReveal: number,
): { tiers: (Tier | null | undefined)[]; current: number | undefined; justDropped: number | undefined } {
  const { results, current, phase } = state;
  const answered = (i: number) => phase === "done" || i < current || (i === current && phase === "reveal");
  const tiers = results.map((r, i) => (answered(i) ? r.tier : undefined));
  return {
    tiers,
    current: phase === "answering" || phase === "reading" ? current : undefined,
    justDropped: phase === "reveal" && current !== resumedReveal ? current : undefined,
  };
}
