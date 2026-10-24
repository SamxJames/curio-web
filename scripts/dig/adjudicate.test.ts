import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { adjudicate, judge } from "./adjudicate";
import { FileSink } from "./sink";
import { decodeDay, encodeDay } from "../../lib/dig/payload";
import type { DigDayPlain } from "../../lib/dig/types";
import { ACCEPTED_CAP, type Candidate } from "./themes";
import { MAX_DAY_CHARS } from "./validate";

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
    expect(r).toEqual({ judged: 2, accepted: 1, amendedDays: 1, skippedOversize: 0 });
    expect(await sink.readExtras()).toEqual({ "theme:sailing": ["jib"] });
    const past = decodeDay((await sink.readDay("2026-12-01"))!);
    expect(past.prompts[0].answers).toContainEqual(["jib", "uncommon", 0]);
    const todays = decodeDay((await sink.readDay("2026-12-03"))!);
    expect(todays.prompts[0].answers).toHaveLength(1);
    expect(await sink.readAdjudicated()).toEqual(expect.arrayContaining(["theme:sailing|jib", "theme:sailing|banana"]));
  });

  it("stops adding extras at ACCEPTED_CAP, most-guessed first", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "adj-cap-"));
    const sink = new FileSink(dir);
    await sink.writeManifest({ v: 1, lastRun: "x", days: { "2026-12-01": [{ id: "theme:sailing", base: "theme:sailing", fossil: "keel" }] }, poolThemes: 0, poolOrigins: 0 });
    mkdirSync(path.join(dir, "logs"), { recursive: true });
    writeFileSync(path.join(dir, "logs", "rej-2026-12-01-0.json"), JSON.stringify({ jib: 2, sail: 3 }));
    const filler = Array.from({ length: ACCEPTED_CAP - 2 }, (_, i) => `filler${i}`);
    // Core keel plus filler leaves room for exactly one more answer.
    const nearCap: Candidate = { ...theme, accepted: ["keel", ...filler], sources: [new Set(["keel", "sail", "jib"])] };
    const open = { lexicon: new Set(["keel", "sail", "jib"]), usable: () => true, blocked: new Set<string>() };
    const r = await adjudicate(sink, new Map([["theme:sailing", nearCap]]), { ...open, today: "2026-12-03", zipf: new Map() });
    expect(r).toEqual({ judged: 1, accepted: 1, amendedDays: 0, skippedOversize: 0 });
    expect(await sink.readExtras()).toEqual({ "theme:sailing": ["sail"] });
  });

  it("adds nothing when the prompt is already at ACCEPTED_CAP", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "adj-full-"));
    const sink = new FileSink(dir);
    await sink.writeManifest({ v: 1, lastRun: "x", days: { "2026-12-01": [{ id: "theme:sailing", base: "theme:sailing", fossil: "keel" }] }, poolThemes: 0, poolOrigins: 0 });
    mkdirSync(path.join(dir, "logs"), { recursive: true });
    writeFileSync(path.join(dir, "logs", "rej-2026-12-01-0.json"), JSON.stringify({ jib: 2 }));
    const filler = Array.from({ length: ACCEPTED_CAP - 1 }, (_, i) => `filler${i}`);
    const full: Candidate = { ...theme, accepted: ["keel", ...filler], sources: [new Set(["keel", "jib"])] };
    const open = { lexicon: new Set(["keel", "jib"]), usable: () => true, blocked: new Set<string>() };
    const r = await adjudicate(sink, new Map([["theme:sailing", full]]), { ...open, today: "2026-12-03", zipf: new Map() });
    expect(r).toEqual({ judged: 0, accepted: 0, amendedDays: 0, skippedOversize: 0 });
    expect(await sink.readExtras()).toEqual({});
  });

  it("skips an amendment that would push a day over MAX_DAY_CHARS and counts it", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "adj-big-"));
    const sink = new FileSink(dir);
    const dayWithFact = (fact: string) => ({ v: 1 as const, date: "2026-12-01", rejSample: 1, prompts: [{ id: "theme:sailing", kind: "theme" as const, text: "t", answers: [["keel", "fossil", 1] as ["keel", "fossil", 1]], aliases: {}, guard: [], fossil: { word: "keel", fact }, stories: {} }] });
    // Pad the fossil fact so the stored day is exactly at the cap; any added answer goes over.
    const baseLen = JSON.stringify(encodeDay(dayWithFact(""))).length;
    const fact = "a".repeat(MAX_DAY_CHARS - baseLen);
    expect(JSON.stringify(encodeDay(dayWithFact(fact))).length).toBe(MAX_DAY_CHARS);
    await sink.writeDay(encodeDay(dayWithFact(fact)));
    await sink.writeManifest({ v: 1, lastRun: "x", days: { "2026-12-01": [{ id: "theme:sailing", base: "theme:sailing", fossil: "keel" }] }, poolThemes: 0, poolOrigins: 0 });
    mkdirSync(path.join(dir, "logs"), { recursive: true });
    writeFileSync(path.join(dir, "logs", "rej-2026-12-01-0.json"), JSON.stringify({ jib: 2 }));
    const r = await adjudicate(sink, new Map([["theme:sailing", theme]]), { ...ctx, today: "2026-12-03", zipf: new Map([["jib", 2.5]]) });
    expect(r).toEqual({ judged: 1, accepted: 1, amendedDays: 0, skippedOversize: 1 });
    expect(decodeDay((await sink.readDay("2026-12-01"))!).prompts[0].answers).toHaveLength(1);
  });
});

const dayOf = (over: Partial<DigDayPlain["prompts"][number]> = {}): DigDayPlain => ({
  v: 1, date: "2026-12-01", rejSample: 1,
  prompts: [{ id: "theme:sailing", kind: "theme", text: "t", answers: [["keel", "fossil", 1]], aliases: {}, guard: [], fossil: { word: "keel", fact: "f" }, stories: {}, ...over }],
});
const manifest = { v: 1 as const, lastRun: "x", days: { "2026-12-01": [{ id: "theme:sailing", base: "theme:sailing", fossil: "keel" }] }, poolThemes: 0, poolOrigins: 0 };

function fixture(logs: Record<string, object>) {
  const dir = mkdtempSync(path.join(tmpdir(), "adj-r2-"));
  mkdirSync(path.join(dir, "logs"), { recursive: true });
  for (const [name, data] of Object.entries(logs)) writeFileSync(path.join(dir, "logs", name), JSON.stringify(data));
  return { dir, sink: new FileSink(dir) };
}

const run = (sink: FileSink, cand: Candidate, lexicon: string[], zipf = new Map<string, number>()) =>
  adjudicate(sink, new Map([["theme:sailing", cand]]), { lexicon: new Set(lexicon), usable: () => true, blocked: new Set<string>(), today: "2026-12-03", zipf });

describe("adjudicate never shadows answers and rebuilds the guard", () => {
  it("does not add a rejected plural of an existing answer", async () => {
    const { sink } = fixture({ "rej-2026-12-01-0.json": { keels: 2 } });
    await sink.writeManifest(manifest);
    await sink.writeDay(encodeDay(dayOf()));
    await run(sink, { ...theme, sources: [new Set(["keel", "keels"])] }, ["keel", "keels"]);
    expect(decodeDay((await sink.readDay("2026-12-01"))!).prompts[0].answers).toHaveLength(1);
  });

  it("does not add a word that is an alias key", async () => {
    const { sink } = fixture({ "rej-2026-12-01-0.json": { jibs: 2 } });
    await sink.writeManifest(manifest);
    await sink.writeDay(encodeDay(dayOf({ aliases: { jibs: 0 } })));
    await run(sink, { ...theme, sources: [new Set(["keel", "jibs"])] }, ["keel", "jibs"]);
    expect(decodeDay((await sink.readDay("2026-12-01"))!).prompts[0].answers).toHaveLength(1);
  });

  it("rebuilds the guard so a lexicon neighbour of a new answer is listed", async () => {
    const { sink } = fixture({ "rej-2026-12-01-0.json": { sail: 2 } });
    await sink.writeManifest(manifest);
    await sink.writeDay(encodeDay(dayOf()));
    await run(sink, { ...theme, sources: [new Set(["keel", "sail"])] }, ["keel", "sail", "mail"]);
    const p = decodeDay((await sink.readDay("2026-12-01"))!).prompts[0];
    expect(p.answers.map((a) => a[0])).toContain("sail");
    expect(p.guard).toContain("mail");
  });

  it("adds nothing for a claim on an existing accepted word", async () => {
    const { sink } = fixture({ "claim-2026-12-01-0.json": { keel: 1 } });
    await sink.writeManifest(manifest);
    await sink.writeDay(encodeDay(dayOf()));
    const r = await run(sink, theme, ["keel"]);
    expect(r).toEqual({ judged: 0, accepted: 0, amendedDays: 0, skippedOversize: 0 });
    expect(await sink.readExtras()).toEqual({});
  });

  it("is idempotent: a second run on the same logs writes no days", async () => {
    const { sink } = fixture({ "rej-2026-12-01-0.json": { jib: 2 } });
    await sink.writeManifest(manifest);
    await sink.writeDay(encodeDay(dayOf()));
    const first = await run(sink, theme, ["keel", "jib"], new Map([["jib", 2.5]]));
    expect(first).toEqual({ judged: 1, accepted: 1, amendedDays: 1, skippedOversize: 0 });
    const afterFirst = await sink.readDay("2026-12-01");
    const writeDay = vi.spyOn(sink, "writeDay");
    const second = await run(sink, theme, ["keel", "jib"], new Map([["jib", 2.5]]));
    expect(second).toEqual({ judged: 0, accepted: 0, amendedDays: 0, skippedOversize: 0 });
    expect(writeDay).not.toHaveBeenCalled();
    expect(await sink.readDay("2026-12-01")).toEqual(afterFirst);
  });

  it("throws a date-only message for a corrupt day file", async () => {
    const { dir, sink } = fixture({ "rej-2026-12-01-0.json": { jib: 2 } });
    await sink.writeManifest(manifest);
    writeFileSync(path.join(dir, "days", "2026-12-01.json"), '{"v":1,"SECRETTEXT":');
    let message = "";
    try { await run(sink, theme, ["keel", "jib"], new Map([["jib", 2.5]])); } catch (e) { message = (e as Error).message; }
    expect(message).toBe("adjudicate: day 2026-12-01 unreadable");
    expect(message).not.toContain("SECRETTEXT");
  });
});
