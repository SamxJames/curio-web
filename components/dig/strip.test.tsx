import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Strata from "./Strata";
import { headingClass } from "./DigGame";
import { stripState } from "@/lib/dig/strip";
import type { GameState, PromptResult } from "@/lib/dig/game";
import type { Tier } from "@/lib/dig/types";

const tiers: (Tier | null)[] = ["common", "rare", "familiar", null, null, null, null];
const results: PromptResult[] = tiers.map((tier) => ({ answer: tier ? "word" : null, tier, rejected: [], lastGuess: null }));
const reveal = (current: number): Pick<GameState, "results" | "current" | "phase"> => ({ results, current, phase: "reveal" });

function strip(state: Pick<GameState, "results" | "current" | "phase">, resumedReveal: number) {
  return renderToStaticMarkup(<Strata compact label="" {...stripState(state, resumedReveal)} />);
}

describe("the strip as DigGame composes it", () => {
  it("animates exactly one column on a fresh reveal", () => {
    expect(strip(reveal(2), -1).match(/dig-drop/g)).toHaveLength(1);
  });

  it("animates nothing when the reveal is the one a refreshed run resumed into", () => {
    expect(strip(reveal(2), 2)).not.toContain("dig-drop");
  });

  it("animates the next reveal after a resumed one", () => {
    expect(strip(reveal(2), 1).match(/dig-drop/g)).toHaveLength(1);
  });
});

describe("headingClass", () => {
  it("shows the heading on the intro", () => {
    expect(headingClass("intro")).not.toContain("sr-only");
    expect(headingClass("intro")).toContain("font-display");
  });

  it("hides it visually on every other phase", () => {
    for (const phase of ["reading", "answering", "reveal", "done"] as const) expect(headingClass(phase)).toBe("sr-only");
  });
});
