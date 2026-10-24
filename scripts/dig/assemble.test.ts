import { describe, expect, it } from "vitest";
import { assignFamilies, daysBetween, isEligible, overlapRatio, pickDay, sameFamily, type HistoryDay } from "./assemble";
import type { Candidate } from "./themes";

const mk = (id: string, kind: "theme" | "origin", core: string[], over: Partial<Candidate> = {}): Candidate => ({
  id, base: id, kind, text: id, core, accepted: core, sources: [], anchor: id, senseIds: null, ancestors: new Set(), languages: kind === "origin" ? [id] : [], ...over,
});
const words = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

describe("cooldowns", () => {
  const history: HistoryDay[] = [{ date: "2026-12-01", prompts: [{ id: "theme:birds:c", base: "theme:birds", fossil: "chough" }, { id: "origin:arabic", base: "origin:arabic", fossil: "alembic", languages: ["Arabic"] }] }];
  it("blocks an exact prompt for 14 days and its base theme for 5", () => {
    expect(daysBetween("2026-12-01", "2026-12-31")).toBe(30);
    expect(isEligible(mk("theme:birds:c", "theme", []), "2026-12-15", history)).toBe(true); // 14 days on
    expect(isEligible(mk("theme:birds:c", "theme", []), "2026-12-14", history)).toBe(false); // 13 days on
    expect(isEligible(mk("theme:birds", "theme", []), "2026-12-05", history)).toBe(false);
    expect(isEligible(mk("theme:birds", "theme", []), "2026-12-06", history)).toBe(true);
  });
  it("lets an origin return once its language cooldown has passed (no exact-prompt rule for origins)", () => {
    expect(isEligible(mk("origin:arabic", "origin", [], { languages: ["Arabic"] }), "2026-12-04", history)).toBe(false);
    expect(isEligible(mk("origin:arabic", "origin", [], { languages: ["Arabic"] }), "2026-12-05", history)).toBe(true);
  });
  it("blocks an origin language for 4 days, including inside a group", () => {
    expect(isEligible(mk("origin:group:x", "origin", [], { languages: ["Persian", "Arabic"] }), "2026-12-03", history)).toBe(false);
    expect(isEligible(mk("origin:group:y", "origin", [], { languages: ["Arabic"] }), "2026-12-05", history)).toBe(true);
  });
});

describe("assignFamilies", () => {
  it("puts a theme that mostly repeats a bigger one into the bigger one's cooldown family", () => {
    const liquids = mk("theme:liquids", "theme", words("w", 40));
    const beverages = mk("theme:beverages", "theme", [...words("w", 25), ...words("b", 5)]);
    const birds = mk("theme:birds", "theme", words("bird", 30));
    const out = assignFamilies([beverages, birds, liquids]);
    expect(out.map((c) => [c.id, c.base])).toEqual([["theme:beverages", "theme:liquids"], ["theme:birds", "theme:birds"], ["theme:liquids", "theme:liquids"]]);
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
    const day = pickDay("2026-12-05", { themes, origins }, [], zipf, "test-salt")!;
    expect(day.map((c) => c.kind)).toEqual(["theme", "theme", "origin", "theme", "theme", "origin", "theme"]);
    const easy = (c: Candidate) => c.core.filter((w) => (zipf.get(w) ?? 0) >= 3.5).length;
    const themesOnDay = day.filter((c) => c.kind === "theme");
    expect(easy(day[0])).toBe(Math.max(...themesOnDay.map(easy)));
  });
  it("is deterministic and returns null when supply is too thin", () => {
    expect(pickDay("2026-12-05", { themes, origins }, [], zipf, "test-salt")!.map((c) => c.id)).toEqual(pickDay("2026-12-05", { themes, origins }, [], zipf, "test-salt")!.map((c) => c.id));
    expect(pickDay("2026-12-05", { themes: themes.slice(0, 4), origins }, [], zipf, "test-salt")).toBeNull();
  });
  it("draws differently under a different seed salt, and the same under the same one", () => {
    const ids = (salt: string) => pickDay("2026-12-05", { themes, origins }, [], zipf, salt)!.map((c) => c.id).join();
    expect(ids("salt-one-aaaaaaaa")).toBe(ids("salt-one-aaaaaaaa"));
    const variants = new Set(["salt-two-bbbbbbbb", "salt-three-cccccc", "salt-four-dddddd", "salt-five-eeeeee"].map(ids));
    expect(variants.has(ids("salt-one-aaaaaaaa")) && variants.size === 1).toBe(false);
  });
  it("never pairs two origins that share a core", () => {
    const shared = words("s", 50);
    const pool = [mk("origin:g1", "origin", shared), mk("origin:g2", "origin", shared)];
    expect(pickDay("2026-12-05", { themes, origins: pool }, [], zipf, "test-salt")).toBeNull();
  });
});
