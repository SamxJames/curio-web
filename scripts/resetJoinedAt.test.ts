import { describe, it, expect } from "vitest";
import { planJoinedAtReset, parseArgs } from "./resetJoinedAt";

const joined = {
  "curio:user:a:joinedAt": "2026-09-10",
  "curio:user:b:joinedAt": "2026-09-12",
};

describe("planJoinedAtReset", () => {
  it("moves earlier join dates to the cutover and reports the resulting History range", () => {
    expect(planJoinedAtReset(joined, "2026-09-27", "2026-09-27")).toEqual([
      { key: "curio:user:a:joinedAt", userId: "a", current: "2026-09-10", proposed: "2026-09-27", changes: true, historyFrom: "2026-09-27", historyTo: "2026-09-27" },
      { key: "curio:user:b:joinedAt", userId: "b", current: "2026-09-12", proposed: "2026-09-27", changes: true, historyFrom: "2026-09-27", historyTo: "2026-09-27" },
    ]);
  });

  it("is idempotent: planning again after applying changes nothing", () => {
    const applied = Object.fromEntries(
      planJoinedAtReset(joined, "2026-09-27", "2026-09-27").map((p) => [p.key, p.proposed])
    );
    expect(planJoinedAtReset(applied, "2026-09-27", "2026-09-28").every((p) => !p.changes)).toBe(true);
  });

  it("never moves a join date that's already on or after the cutover", () => {
    const [p] = planJoinedAtReset({ "curio:user:c:joinedAt": "2026-09-28" }, "2026-09-27", "2026-09-28");
    expect(p).toMatchObject({ current: "2026-09-28", proposed: "2026-09-28", changes: false });
  });

  it("only ever plans writes to joinedAt keys — never favourites or anything else", () => {
    const plans = planJoinedAtReset(
      { ...joined, "curio:user:a:favorites": "x" } as Record<string, string>,
      "2026-09-27",
      "2026-09-27"
    );
    expect(plans.every((p) => p.key.endsWith(":joinedAt"))).toBe(true);
  });

  it("rejects a malformed cutover date", () => {
    expect(() => planJoinedAtReset(joined, "27/09/2026", "2026-09-27")).toThrow();
  });

  it("computes historyTo as the later of proposed and today (so future cutover doesn't backtrack)", () => {
    const [p] = planJoinedAtReset(
      { "curio:user:x:joinedAt": "2026-09-10" },
      "2026-10-05", // cutover later than today
      "2026-09-26"  // today
    );
    expect(p).toMatchObject({ proposed: "2026-10-05", historyFrom: "2026-10-05", historyTo: "2026-10-05" });
  });
});

describe("parseArgs", () => {
  it("parses --cutover=YYYY-MM-DD correctly", () => {
    expect(parseArgs(["--cutover=2026-09-27"])).toEqual({ apply: false, cutover: "2026-09-27" });
  });

  it("detects --apply flag", () => {
    expect(parseArgs(["--cutover=2026-09-27", "--apply"])).toEqual({ apply: true, cutover: "2026-09-27" });
  });

  it("treats --dry-run as a no-op (apply false)", () => {
    expect(parseArgs(["--cutover=2026-09-27", "--dry-run"])).toEqual({ apply: false, cutover: "2026-09-27" });
  });

  it("neither --dry-run nor --apply defaults to apply false", () => {
    expect(parseArgs(["--cutover=2026-09-27"])).toEqual({ apply: false, cutover: "2026-09-27" });
  });

  it("throws if both --dry-run and --apply are passed", () => {
    expect(() => parseArgs(["--cutover=2026-09-27", "--dry-run", "--apply"])).toThrow();
  });

  it("returns undefined cutover if not provided", () => {
    expect(parseArgs(["--apply"])).toEqual({ apply: true, cutover: undefined });
  });
});
