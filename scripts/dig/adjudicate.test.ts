import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { adjudicate, judge } from "./adjudicate";
import { FileSink } from "./sink";
import { decodeDay, encodeDay } from "../../lib/dig/payload";
import type { Candidate } from "./themes";

const theme: Candidate = {
  id: "theme:sailing", base: "theme:sailing", kind: "theme", text: "Name a word from sailing", core: ["keel"], accepted: ["keel"],
  sources: [new Set(["keel", "jib", "cleat"]), new Set(["keel"])], anchor: "x", senseIds: null, ancestors: new Set(), languages: [],
};
const ctx = { lexicon: new Set(["jib", "cleat", "banana", "keel"]), usable: (w: string) => w !== "cleat", blocked: new Set<string>() };

describe("judge", () => {
  it("accepts a real word that any one source places in the prompt", () => {
    expect(judge("Jib", theme, ctx)).toBe("jib");
  });
  it("rejects unknown, unusable or off-theme words", () => {
    expect(judge("banana", theme, ctx)).toBeNull();
    expect(judge("cleat", theme, ctx)).toBeNull();
    expect(judge("zzzz", theme, ctx)).toBeNull();
  });
});

describe("adjudicate", () => {
  it("adds accepted words to extras and to stored days except today, as accepted-only", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "adj-"));
    const sink = new FileSink(dir);
    const plain = { v: 1 as const, date: "2026-12-01", rejSample: 1, prompts: [{ id: "theme:sailing", kind: "theme" as const, text: "t", answers: [["keel", "fossil", 1] as ["keel", "fossil", 1]], aliases: {}, guard: [], fossil: { word: "keel", fact: "f" }, stories: {} }] };
    await sink.writeDay(encodeDay(plain));
    await sink.writeDay(encodeDay({ ...plain, date: "2026-12-03" }));
    await sink.writeManifest({ v: 1, lastRun: "x", days: { "2026-12-01": [{ id: "theme:sailing", base: "theme:sailing", fossil: "keel" }], "2026-12-03": [{ id: "theme:sailing", base: "theme:sailing", fossil: "keel" }] }, poolThemes: 0, poolOrigins: 0 });
    mkdirSync(path.join(dir, "logs"), { recursive: true });
    writeFileSync(path.join(dir, "logs", "rej-2026-12-01-0.json"), JSON.stringify({ jib: 2, banana: 5, cleat: 1 }));
    const r = await adjudicate(sink, new Map([["theme:sailing", theme]]), { ...ctx, today: "2026-12-03", zipf: new Map([["jib", 2.5]]) });
    expect(r).toEqual({ judged: 2, accepted: 1, amendedDays: 1 });
    expect(await sink.readExtras()).toEqual({ "theme:sailing": ["jib"] });
    const past = decodeDay((await sink.readDay("2026-12-01"))!);
    expect(past.prompts[0].answers).toContainEqual(["jib", "uncommon", 0]);
    const todays = decodeDay((await sink.readDay("2026-12-03"))!);
    expect(todays.prompts[0].answers).toHaveLength(1);
    expect(await sink.readAdjudicated()).toEqual(expect.arrayContaining(["theme:sailing|jib", "theme:sailing|banana"]));
  });
});
