import { describe, expect, it } from "vitest";
import { assignFamilies, COOLDOWNS, daysBetween, drawablePools, forecastSupply, fossilsResting, isEligible, isFree, lastFossilUse, overlapRatio, pickDay, sameFamily, type HistoryDay } from "./assemble";
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

describe("fossils may return after four months", () => {
  const day = (date: string, id: string, fossil: string) => ({ date, prompts: [{ id, base: id, fossil }] });
  const history: HistoryDay[] = [day("2026-07-01", "theme:birds", "chough"), day("2026-11-01", "theme:birds", "dunlin"), day("2026-11-20", "theme:birds", "chough"), day("2026-11-10", "theme:fish", "smelt")];
  it("remembers when a prompt last used each fossil, and nobody else's", () => {
    expect(lastFossilUse("theme:birds", history)).toEqual(new Map([["chough", "2026-11-20"], ["dunlin", "2026-11-01"]]));
  });
  it("rests a fossil for 122 days after its last use, in either direction", () => {
    expect(COOLDOWNS.fossilDays).toBe(122);
    const used = new Map([["chough", "2026-08-01"], ["dunlin", "2026-12-01"]]);
    expect(fossilsResting(used, "2026-11-30")).toEqual(new Set(["chough", "dunlin"])); // 121 days on; and a day built before a later one
    expect(fossilsResting(used, "2026-12-01")).toEqual(new Set(["dunlin"])); // 122 days on: chough may return
  });
  it("counts a prompt as free only when it is off cooldown and has a fossil that is not resting", () => {
    const birds = mk("theme:birds", "theme", []);
    expect(isFree(birds, "2026-12-20", history, ["chough", "dunlin"])).toBe(false); // both used within 122 days
    expect(isFree(birds, "2026-12-20", history, ["chough", "dunlin", "godwit"])).toBe(true);
    expect(isFree(birds, "2026-11-25", history, ["chough", "dunlin", "godwit"])).toBe(false); // still on its 14-day cooldown
    expect(isFree(birds, "2027-03-03", history, ["chough", "dunlin"])).toBe(true); // dunlin is back after 122 days
    expect(isFree(birds, "2027-06-01", history, [])).toBe(false); // no fossil at all
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

// The 2026-11 "no usable fossil" failures: the draw offered prompts whose fossils were all resting, and each
// one wasted a salt until a date could not be built.
describe("the draw only offers prompts that have a fossil free", () => {
  const zipf = new Map<string, number>();
  const themes = ["a", "b", "c", "d", "e", "f", "g"].map((p) => mk(`theme:${p}`, "theme", words(p, 50)));
  const origins = ["x", "y", "z"].map((p) => mk(`origin:${p}`, "origin", words(p, 50)));
  // theme:a ran four months of fossils dry: its only fossil was used 20 days ago (off its 14-day cooldown).
  const history: HistoryDay[] = [{ date: "2026-11-15", prompts: [{ id: "theme:a", base: "theme:a", fossil: "a0" }] }];
  const fossilsOf = (c: Candidate) => (c.id === "theme:a" ? ["a0"] : c.core.slice(0, 5));
  it("leaves out a prompt whose fossils are all resting, though its cooldown has passed", () => {
    expect(isEligible(themes[0], "2026-12-05", history)).toBe(true);
    const pools = drawablePools({ themes, origins }, "2026-12-05", history, fossilsOf);
    expect(pools.themes.map((c) => c.id)).not.toContain("theme:a");
    expect(pools.themes).toHaveLength(6);
    expect(pools.origins).toHaveLength(3);
    // No salt can draw it, where the blind draw did on most salts.
    const blind = Array.from({ length: 10 }, (_, salt) => pickDay("2026-12-05", { themes, origins }, history, zipf, "t", salt)!);
    expect(blind.some((day) => day.some((c) => c.id === "theme:a"))).toBe(true);
    const aware = Array.from({ length: 10 }, (_, salt) => pickDay("2026-12-05", pools, history, zipf, "t", salt)!);
    expect(aware.every((day) => day.every((c) => c.id !== "theme:a"))).toBe(true);
  });
  it("offers it again once a fossil is back, and leaves out prompts the builder found unusable today", () => {
    expect(drawablePools({ themes, origins }, "2027-03-17", history, fossilsOf).themes.map((c) => c.id)).toContain("theme:a"); // 122 days on
    const pools = drawablePools({ themes, origins }, "2026-12-05", history, fossilsOf, new Set(["theme:b", "origin:x"]));
    expect(pools.themes.map((c) => c.id)).not.toContain("theme:b");
    expect(pools.origins.map((c) => c.id)).toEqual(["origin:y", "origin:z"]);
  });
});

describe("forecastSupply", () => {
  const zipf = new Map<string, number>();
  const themes = Array.from({ length: 10 }, (_, i) => mk(`theme:t${i}`, "theme", words(`t${i}x`, 50)));
  const origins = Array.from({ length: 10 }, (_, i) => mk(`origin:o${i}`, "origin", words(`o${i}x`, 50)));
  // Ten themes fill two days, rest 14, fill two more, and so on: days 1, 2, 15, 16, 29 and 30 of 30.
  it("fills every day the cooldowns allow when each prompt has fossils to spare", () => {
    const f = forecastSupply({ themes, origins }, [], (c) => c.core.slice(0, 3), zipf, { from: "2026-12-01", days: 30 });
    expect(f.unfilled).toBe(24);
  });
  it("counts the days lost when prompts run out of fossils", () => {
    const f = forecastSupply({ themes, origins }, [], (c) => (c.kind === "theme" ? c.core.slice(0, 1) : c.core.slice(0, 3)), zipf, { from: "2026-12-01", days: 30 });
    expect(f.unfilled).toBe(28); // each theme's one fossil rests for 122 days after day 1 or 2
    expect(f.fewestFreeThemes).toBe(0);
  });
  it("reports no lost days and the thinnest day's free themes when supply is ample", () => {
    const many = Array.from({ length: 80 }, (_, i) => mk(`theme:m${i}`, "theme", words(`m${i}x`, 50)));
    const f = forecastSupply({ themes: many, origins }, [], (c) => (c.kind === "theme" ? c.core.slice(0, 3) : c.core), zipf, { from: "2026-12-01", days: 30 });
    expect(f.unfilled).toBe(0);
    expect(f.fewestFreeThemes).toBeGreaterThanOrEqual(5);
  });
});
