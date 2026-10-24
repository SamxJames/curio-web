import { describe, expect, it } from "vitest";
import { daysBetween, isEligible, overlapRatio, pickDay, sameFamily, type HistoryDay } from "./assemble";
import type { Candidate } from "./themes";

const mk = (id: string, kind: "theme" | "origin", core: string[], over: Partial<Candidate> = {}): Candidate => ({
  id, base: id, kind, text: id, core, accepted: core, sources: [], anchor: id, senseIds: null, ancestors: new Set(), languages: kind === "origin" ? [id] : [], ...over,
});
const words = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

describe("cooldowns", () => {
  const history: HistoryDay[] = [{ date: "2026-12-01", prompts: [{ id: "theme:birds:c", base: "theme:birds", fossil: "chough" }, { id: "origin:arabic", base: "origin:arabic", fossil: "alembic", languages: ["Arabic"] }] }];
  it("blocks an exact prompt for 90 days and its base theme for 30", () => {
    expect(daysBetween("2026-12-01", "2026-12-31")).toBe(30);
    expect(isEligible(mk("theme:birds:c", "theme", []), "2027-03-01", history)).toBe(true); // 90 days on
    expect(isEligible(mk("theme:birds:c", "theme", []), "2027-02-27", history)).toBe(false); // 88 days on
    expect(isEligible(mk("theme:birds", "theme", []), "2026-12-20", history)).toBe(false);
    expect(isEligible(mk("theme:birds", "theme", []), "2026-12-31", history)).toBe(true);
  });
  it("blocks an origin language for 14 days, including inside a group", () => {
    expect(isEligible(mk("origin:group:x", "origin", [], { languages: ["Persian", "Arabic"] }), "2026-12-10", history)).toBe(false);
    expect(isEligible(mk("origin:group:y", "origin", [], { languages: ["Arabic"] }), "2026-12-15", history)).toBe(true);
  });
});

describe("overlap and families", () => {
  it("measures overlap against the smaller core", () => {
    expect(overlapRatio(["a", "b", "c", "d"], ["a", "x"])).toBe(0.5);
  });
  it("treats ancestor anchors and shared bases as one family", () => {
    const fruit = mk("theme:fruits", "theme", [], { anchor: "fruit" });
    const citrus = mk("theme:citrus", "theme", [], { anchor: "citrus", ancestors: new Set(["fruit"]) });
    expect(sameFamily(fruit, citrus)).toBe(true);
    expect(sameFamily(mk("theme:birds:c", "theme", [], { base: "theme:birds" }), mk("theme:birds", "theme", []))).toBe(true);
    expect(sameFamily(fruit, mk("theme:fish", "theme", []))).toBe(false);
  });
});

describe("pickDay", () => {
  const zipf = new Map<string, number>();
  const themes = ["a", "b", "c", "d", "e", "f"].map((p, i) => {
    const core = words(p, 50);
    core.slice(0, 10 + i).forEach((w) => zipf.set(w, 4));
    return mk(`theme:${p}`, "theme", core);
  });
  const origins = ["x", "y", "z"].map((p) => mk(`origin:${p}`, "origin", words(p, 50)));
  it("picks 5 themes and 2 origins, origins at positions 3 and 6, easiest theme first", () => {
    const day = pickDay("2026-12-05", { themes, origins }, [], zipf)!;
    expect(day.map((c) => c.kind)).toEqual(["theme", "theme", "origin", "theme", "theme", "origin", "theme"]);
    const easy = (c: Candidate) => c.core.filter((w) => (zipf.get(w) ?? 0) >= 3.5).length;
    const themesOnDay = day.filter((c) => c.kind === "theme");
    expect(easy(day[0])).toBe(Math.max(...themesOnDay.map(easy)));
  });
  it("is deterministic and returns null when supply is too thin", () => {
    expect(pickDay("2026-12-05", { themes, origins }, [], zipf)!.map((c) => c.id)).toEqual(pickDay("2026-12-05", { themes, origins }, [], zipf)!.map((c) => c.id));
    expect(pickDay("2026-12-05", { themes: themes.slice(0, 4), origins }, [], zipf)).toBeNull();
  });
  it("never pairs two origins that share a core", () => {
    const shared = words("s", 50);
    const pool = [mk("origin:g1", "origin", shared), mk("origin:g2", "origin", shared)];
    expect(pickDay("2026-12-05", { themes, origins: pool }, [], zipf)).toBeNull();
  });
});
