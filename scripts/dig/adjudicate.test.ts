import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { adjudicate, judge, JUDGE_PER_PROMPT } from "./adjudicate";
import { FileSink } from "./sink";
import { decodeDay, encodeDay } from "../../lib/dig/payload";
import type { DigDayPlain } from "../../lib/dig/types";
import { ACCEPTED_CAP, type Candidate } from "./themes";
import { MAX_DAY_CHARS } from "./validate";

const theme: Candidate = {
  id: "theme:sailing", base: "theme:sailing", kind: "theme", text: "Name a word from sailing", core: ["keel"], accepted: ["keel"],
  sources: [new Set(["keel", "jib", "cleat"]), new Set(["keel"])], anchor: "x", senseIds: null, ancestors: new Set(), languages: [],
};
const ctx = { lexicon: new Set(["jib", "cleat", "banana", "keel"]), guardLexicon: new Set(["jib", "cleat", "banana", "keel"]), usable: (w: string) => w !== "cleat", blocked: new Set<string>() };

describe("judge", () => {
  it("accepts a real word that any one source places in the prompt", () => {
    expect(judge("Jib", theme, ctx)).toBe("jib");
  });
  it("rejects unknown, unusable or off-theme words", () => {
    expect(judge("banana", theme, ctx)).toBeNull();
    expect(judge("cleat", theme, ctx)).toBeNull();
    expect(judge("zzzz", theme, ctx)).toBeNull();
  });
  it("rejects a phrase containing a blocked word", () => {
    const t = { ...theme, sources: [new Set(["jib sheet"])] };
    expect(judge("jib sheet", t, { ...ctx, lexicon: new Set(["jibsheet", "jib sheet"]), blocked: new Set(["sheet"]) })).toBeNull();
  });
  it("never adds an answer to a stored day that sits one typo from its fossil", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "adj-"));
    const sink = new FileSink(dir);
    const plain = { v: 1 as const, date: "2026-12-01", rejSample: 1, prompts: [{ id: "theme:sailing", kind: "theme" as const, text: "t", answers: [["keel", "fossil", 1] as ["keel", "fossil", 1]], aliases: {}, guard: [], fossil: { word: "keel", fact: "f" }, stories: {} }] };
    await sink.writeDay(encodeDay(plain));
    await sink.writeManifest({ v: 1, lastRun: "x", days: { "2026-12-01": [{ id: "theme:sailing", base: "theme:sailing", fossil: "keel" }] }, poolThemes: 0, poolOrigins: 0 });
    mkdirSync(path.join(dir, "logs"), { recursive: true });
    writeFileSync(path.join(dir, "logs", "rej-2026-12-01-0.json"), JSON.stringify({ kee: 3 }));
    // "kees", one typo from keel, would match the plural of "kee".
    const t = { ...theme, sources: [new Set(["keel", "kee"])] };
    const lex = new Set(["keel", "kee"]);
    const r = await adjudicate(sink, new Map([["theme:sailing", t]]), { ...ctx, lexicon: lex, guardLexicon: lex, today: "2026-12-03", zipf: new Map() });
    expect(r).toEqual({ judged: 1, accepted: 1, amendedDays: 0, skippedOversize: 0, skippedTypo: 1 });
    expect(decodeDay((await sink.readDay("2026-12-01"))!).prompts[0].answers).toHaveLength(1);
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
    expect(r).toEqual({ judged: 2, accepted: 1, amendedDays: 1, skippedOversize: 0, skippedTypo: 0 });
    expect(await sink.readExtras()).toEqual({ "theme:sailing": ["jib"] });
    const past = decodeDay((await sink.readDay("2026-12-01"))!);
    expect(past.prompts[0].answers).toContainEqual(["jib", "uncommon", 0]);
    const todays = decodeDay((await sink.readDay("2026-12-03"))!);
    expect(todays.prompts[0].answers).toHaveLength(1);
    expect(await sink.readAdjudicated("2026-12-03")).toEqual({ "theme:sailing|jib": "2026-12-03", "theme:sailing|banana": "2026-12-03" });
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
    const open = { lexicon: new Set(["keel", "sail", "jib"]), guardLexicon: new Set(["keel", "sail", "jib"]), usable: () => true, blocked: new Set<string>() };
    const r = await adjudicate(sink, new Map([["theme:sailing", nearCap]]), { ...open, today: "2026-12-03", zipf: new Map() });
    expect(r).toEqual({ judged: 1, accepted: 1, amendedDays: 0, skippedOversize: 0, skippedTypo: 0 });
    expect(await sink.readExtras()).toEqual({ "theme:sailing": ["sail"] });
  });

  it("does not count extras twice: candidates that already include extras keep their room", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "adj-twice-"));
    const sink = new FileSink(dir);
    await sink.writeManifest({ v: 1, lastRun: "x", days: { "2026-12-01": [{ id: "theme:sailing", base: "theme:sailing", fossil: "keel" }] }, poolThemes: 0, poolOrigins: 0 });
    mkdirSync(path.join(dir, "logs"), { recursive: true });
    writeFileSync(path.join(dir, "logs", "rej-2026-12-01-0.json"), JSON.stringify({ jib: 4, sail: 3, mast: 2 }));
    await sink.writeExtras({ "theme:sailing": ["e1", "e2"] });
    // build.ts hands in candidates that already contain the extras: CAP - 2 accepted, room for exactly two more.
    const filler = Array.from({ length: ACCEPTED_CAP - 4 }, (_, i) => `filler${i}`);
    const nearCap: Candidate = { ...theme, accepted: ["keel", ...filler, "e1", "e2"], sources: [new Set(["keel", "sail", "jib", "mast"])] };
    expect(nearCap.accepted).toHaveLength(ACCEPTED_CAP - 1);
    nearCap.accepted.pop();
    expect(nearCap.accepted).toHaveLength(ACCEPTED_CAP - 2);
    const open = { lexicon: new Set(["keel", "sail", "jib", "mast"]), guardLexicon: new Set(["keel", "sail", "jib", "mast"]), usable: () => true, blocked: new Set<string>() };
    const r = await adjudicate(sink, new Map([["theme:sailing", nearCap]]), { ...open, today: "2026-12-03", zipf: new Map() });
    expect(r.accepted).toBe(2);
    expect(await sink.readExtras()).toEqual({ "theme:sailing": ["e1", "e2", "jib", "sail"] });
  });

  it("adds nothing when the prompt is already at ACCEPTED_CAP", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "adj-full-"));
    const sink = new FileSink(dir);
    await sink.writeManifest({ v: 1, lastRun: "x", days: { "2026-12-01": [{ id: "theme:sailing", base: "theme:sailing", fossil: "keel" }] }, poolThemes: 0, poolOrigins: 0 });
    mkdirSync(path.join(dir, "logs"), { recursive: true });
    writeFileSync(path.join(dir, "logs", "rej-2026-12-01-0.json"), JSON.stringify({ jib: 2 }));
    const filler = Array.from({ length: ACCEPTED_CAP - 1 }, (_, i) => `filler${i}`);
    const full: Candidate = { ...theme, accepted: ["keel", ...filler], sources: [new Set(["keel", "jib"])] };
    const open = { lexicon: new Set(["keel", "jib"]), guardLexicon: new Set(["keel", "jib"]), usable: () => true, blocked: new Set<string>() };
    const r = await adjudicate(sink, new Map([["theme:sailing", full]]), { ...open, today: "2026-12-03", zipf: new Map() });
    expect(r).toEqual({ judged: 0, accepted: 0, amendedDays: 0, skippedOversize: 0, skippedTypo: 0 });
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
    expect(r).toEqual({ judged: 1, accepted: 1, amendedDays: 0, skippedOversize: 1, skippedTypo: 0 });
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
  adjudicate(sink, new Map([["theme:sailing", cand]]), { lexicon: new Set(lexicon), guardLexicon: new Set(lexicon), usable: () => true, blocked: new Set<string>(), today: "2026-12-03", zipf });

describe("adjudicate bounds its work and its state", () => {
  it("judges at most JUDGE_PER_PROMPT guesses per prompt per run, top-ranked first, then the rest on the next run", async () => {
    const claims: Record<string, number> = Object.fromEntries(Array.from({ length: JUDGE_PER_PROMPT + 5 }, (_, i) => [`junk${String.fromCharCode(97 + i)}`, 1]));
    claims.favourite = 9;
    const { sink } = fixture({ "claim-2026-12-01-0.json": claims });
    await sink.writeManifest(manifest);
    const go = () => run(sink, theme, ["keel"]);
    expect((await go()).judged).toBe(JUDGE_PER_PROMPT);
    const marks = await sink.readAdjudicated("2026-12-03");
    expect(Object.keys(marks)).toHaveLength(JUDGE_PER_PROMPT);
    expect(marks["theme:sailing|favourite"]).toBe("2026-12-03");
    expect((await go()).judged).toBe(6);
  });

  it("still judges a single claim (claim >= 1) and a guess rejected twice, but not one rejection", async () => {
    const { sink } = fixture({ "claim-2026-12-01-0.json": { jib: 1 }, "rej-2026-12-01-0.json": { sail: 2, mast: 1 } });
    await sink.writeManifest(manifest);
    const r = await run(sink, { ...theme, sources: [new Set(["keel", "jib", "sail", "mast"])] }, ["keel", "jib", "sail", "mast"]);
    expect(r.judged).toBe(2);
  });

  it("drops marks judged more than 40 days before today when writing, and keeps newer ones", async () => {
    const { sink } = fixture({ "rej-2026-12-01-0.json": { jib: 2 } });
    await sink.writeManifest(manifest);
    await sink.writeAdjudicated({ "theme:sailing|old": "2026-10-20", "theme:sailing|edge": "2026-10-24", "theme:sailing|recent": "2026-12-01" });
    await run(sink, theme, ["keel", "jib"]);
    expect(await sink.readAdjudicated("2026-12-03")).toEqual({ "theme:sailing|edge": "2026-10-24", "theme:sailing|recent": "2026-12-01", "theme:sailing|jib": "2026-12-03" });
  });

  it("treats an old array-shaped mark list as judged today, so none is judged again", async () => {
    const { dir, sink } = fixture({ "rej-2026-12-01-0.json": { jib: 2 } });
    await sink.writeManifest(manifest);
    writeFileSync(path.join(dir, "adjudicated.json"), JSON.stringify(["theme:sailing|jib"]));
    const r = await run(sink, theme, ["keel", "jib"]);
    expect(r.judged).toBe(0);
    expect(await sink.readAdjudicated("2026-12-03")).toEqual({ "theme:sailing|jib": "2026-12-03" });
  });
});

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
    expect(r).toEqual({ judged: 0, accepted: 0, amendedDays: 0, skippedOversize: 0, skippedTypo: 0 });
    expect(await sink.readExtras()).toEqual({});
  });

  it("is idempotent: a second run on the same logs writes no days", async () => {
    const { sink } = fixture({ "rej-2026-12-01-0.json": { jib: 2 } });
    await sink.writeManifest(manifest);
    await sink.writeDay(encodeDay(dayOf()));
    const first = await run(sink, theme, ["keel", "jib"], new Map([["jib", 2.5]]));
    expect(first).toEqual({ judged: 1, accepted: 1, amendedDays: 1, skippedOversize: 0, skippedTypo: 0 });
    const afterFirst = await sink.readDay("2026-12-01");
    const writeDay = vi.spyOn(sink, "writeDay");
    const second = await run(sink, theme, ["keel", "jib"], new Map([["jib", 2.5]]));
    expect(second).toEqual({ judged: 0, accepted: 0, amendedDays: 0, skippedOversize: 0, skippedTypo: 0 });
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
