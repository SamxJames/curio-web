import { describe, expect, it } from "vitest";
import { parseStore } from "./storage";

const game = { answers: Array(7).fill(null), tiers: Array(7).fill(null), score: 0, finishedAt: "2026-11-10T09:00:00Z" };
const store = (g: object) => JSON.stringify({ v: 1, settings: {}, games: { "2026-11-10": g } });

describe("parseStore shared flag", () => {
  it("keeps shared: true on a game", () => {
    expect(parseStore(store({ ...game, shared: true })).games["2026-11-10"].shared).toBe(true);
  });
  it("drops a non-boolean shared but keeps the game", () => {
    const g = parseStore(store({ ...game, shared: "yes" })).games["2026-11-10"];
    expect(g).toBeDefined();
    expect(g).not.toHaveProperty("shared");
  });
  it("leaves shared absent by default", () => {
    expect(parseStore(store(game)).games["2026-11-10"]).not.toHaveProperty("shared");
  });
});
