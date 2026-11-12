import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { repairDays, repairPrompt } from "./repair";
import { FileSink } from "./sink";
import { decodeDay, encodeDay } from "../../lib/dig/payload";
import { buildLookup, checkGuess } from "../../lib/dig/match";
import type { DigDayPlain, DigPromptPlain } from "../../lib/dig/types";
import type { Candidate } from "./themes";

const prompt = (over: Partial<DigPromptPlain> = {}): DigPromptPlain => ({
  id: "theme:vegetables", kind: "theme", text: "Name a vegetable",
  answers: [["rutabaga", "fossil", 1], ["tomato", "familiar", 1], ["more", "common", 0], ["chat", "common", 0], ["kale", "familiar", 1]],
  aliases: { tomatoes: 1, chats: 3, kales: 4 }, guard: [], fossil: { word: "rutabaga", fact: "f" }, stories: { chat: "chat-story" },
  ...over,
});
const cand = (over: Partial<Candidate> = {}): Candidate => ({
  id: "theme:vegetables", base: "theme:vegetables", kind: "theme", text: "Name a vegetable",
  core: ["rutabaga", "tomato", "kale", "potato"], accepted: ["rutabaga", "tomato", "kale", "potato", "carrot"],
  sources: [], anchor: "x", senseIds: null, ancestors: new Set(), languages: [], homographs: new Set(["more", "chat"]),
  ...over,
});
const zipf = new Map([["potato", 4.1], ["carrot", 3.6]]);
const ctx = { zipf, guardLexicon: new Set(["potato", "carrot", "kale", "tomato"]) };
const matches = (p: DigPromptPlain, w: string) => checkGuess(buildLookup(p), w).kind === "match";

describe("repairPrompt", () => {
  it("adds accepted words the day is missing, tiered by frequency, as accepted-only", () => {
    const r = repairPrompt(prompt(), cand(), { ...ctx, removeHomographs: false });
    expect(r.added).toEqual(["potato", "carrot"]);
    expect(r.prompt.answers).toContainEqual(["potato", "common", 0]);
    expect(r.prompt.answers).toContainEqual(["carrot", "familiar", 0]);
    expect(matches(r.prompt, "potato")).toBe(true);
    expect(matches(r.prompt, "potatoes")).toBe(true); // plurals come with the matcher
    expect(r.removed).toEqual([]);
  });

  it("removes stray-sense words only when asked (unplayed days), keeping aliases and stories pointing right", () => {
    const r = repairPrompt(prompt(), cand(), { ...ctx, removeHomographs: true });
    expect(r.removed).toEqual(["more", "chat"]);
    expect(matches(r.prompt, "more")).toBe(false);
    expect(matches(r.prompt, "chats")).toBe(false);
    expect(r.prompt.stories).toEqual({});
    // Indexes shifted: "kales" must still point at kale, "tomatoes" at tomato.
    const lk = buildLookup(r.prompt);
    const at = (w: string) => { const g = checkGuess(lk, w); return g.kind === "match" ? r.prompt.answers[g.index][0] : null; };
    expect(at("kales")).toBe("kale");
    expect(at("tomatoes")).toBe("tomato");
  });

  it("never removes a core answer or the fossil, even if listed as a stray sense", () => {
    const r = repairPrompt(prompt(), cand({ homographs: new Set(["kale", "rutabaga"]) }), { ...ctx, removeHomographs: true });
    expect(r.removed).toEqual([]);
  });

  it("skips a word that a typo of the fossil would land on (the validator's rule)", () => {
    // "rutabags", one typo from the fossil, would read as the plural of "rutabag".
    const r = repairPrompt(prompt(), cand({ accepted: ["rutabaga", "rutabag", "potato"] }), { ...ctx, removeHomographs: false });
    expect(r.added).toEqual(["potato"]);
  });

  it("changes nothing when the day already has every accepted word and no stray senses", () => {
    const p = prompt({ answers: [["rutabaga", "fossil", 1], ["tomato", "familiar", 1]], aliases: {}, stories: {} });
    const r = repairPrompt(p, cand({ accepted: ["rutabaga", "tomato"] }), { ...ctx, removeHomographs: true });
    expect(r.added).toEqual([]);
    expect(r.removed).toEqual([]);
  });
});

describe("repairDays", () => {
  const day = (date: string): DigDayPlain => ({ v: 1, date, rejSample: 1, prompts: [prompt()] });
  async function setup(dates: string[]) {
    const sink = new FileSink(mkdtempSync(path.join(tmpdir(), "repair-")));
    for (const d of dates) await sink.writeDay(encodeDay(day(d)));
    await sink.writeManifest({ v: 1, lastRun: "x", days: Object.fromEntries(dates.map((d) => [d, [{ id: "theme:vegetables", base: "theme:vegetables", fossil: "rutabaga" }]])), poolThemes: 0, poolOrigins: 0 });
    return sink;
  }

  it("adds to past and future days, removes stray senses only from future days, and leaves today alone", async () => {
    const sink = await setup(["2026-11-06", "2026-11-07", "2026-11-08"]);
    const r = await repairDays(sink, new Map([["theme:vegetables", cand()]]), { ...ctx, today: "2026-11-07" });
    expect(r).toEqual({ amendedDays: 2, added: 4, removed: 2, skippedOversize: 0 });
    const read = async (d: string) => decodeDay((await sink.readDay(d))!).prompts[0];
    expect(matches(await read("2026-11-06"), "potato")).toBe(true);
    expect(matches(await read("2026-11-06"), "more")).toBe(true); // played day: nothing taken away
    expect(matches(await read("2026-11-07"), "potato")).toBe(false); // today: CDN-cached, untouched
    expect(matches(await read("2026-11-08"), "potato")).toBe(true);
    expect(matches(await read("2026-11-08"), "more")).toBe(false);
  });

  it("is idempotent: a second run changes nothing", async () => {
    const sink = await setup(["2026-11-08"]);
    const cands = new Map([["theme:vegetables", cand()]]);
    await repairDays(sink, cands, { ...ctx, today: "2026-11-07" });
    expect(await repairDays(sink, cands, { ...ctx, today: "2026-11-07" })).toEqual({ amendedDays: 0, added: 0, removed: 0, skippedOversize: 0 });
  });

  it("drops the rarest additions first when a day would go over the size cap", async () => {
    const sink = await setup(["2026-11-08"]);
    const noStray = cand({ homographs: new Set() });
    // The cap fits the day with potato added, but not with carrot too.
    const withPotato = { ...day("2026-11-08"), prompts: [repairPrompt(prompt(), cand({ accepted: ["potato"], homographs: new Set() }), { ...ctx, removeHomographs: false }).prompt] };
    const cap = JSON.stringify(encodeDay(withPotato)).length + 2;
    const r = await repairDays(sink, new Map([["theme:vegetables", noStray]]), { ...ctx, today: "2026-11-07", maxDayChars: cap });
    expect(r.skippedOversize).toBeGreaterThan(0);
    const p = decodeDay((await sink.readDay("2026-11-08"))!).prompts[0];
    expect(matches(p, "potato")).toBe(true); // the commoner word is kept
    expect(matches(p, "carrot")).toBe(false);
  });
});
