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
  sources: [], anchor: "x", senseIds: null, ancestors: new Set(), languages: [], excluded: new Set(["more", "chat"]),
  ...over,
});
const zipf = new Map([["potato", 4.1], ["carrot", 3.6]]);
const ctx = { zipf, guardLexicon: new Set(["potato", "carrot", "kale", "tomato"]) };
const matches = (p: DigPromptPlain, w: string) => checkGuess(buildLookup(p), w).kind === "match";

describe("repairPrompt", () => {
  it("adds accepted words the day is missing, tiered by frequency, as accepted-only", () => {
    const r = repairPrompt(prompt(), cand(), { ...ctx, unplayed: false });
    expect(r.added).toEqual(["potato", "carrot"]);
    expect(r.prompt.answers).toContainEqual(["potato", "common", 0]);
    expect(r.prompt.answers).toContainEqual(["carrot", "familiar", 0]);
    expect(matches(r.prompt, "potato")).toBe(true);
    expect(matches(r.prompt, "potatoes")).toBe(true); // plurals come with the matcher
    expect(r.removed).toEqual([]);
  });

  it("removes stray-sense words only when asked (unplayed days), keeping aliases and stories pointing right", () => {
    const r = repairPrompt(prompt(), cand(), { ...ctx, unplayed: true });
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

  it("removes an excluded word even from the shown list (hyena as a canid), but never the fossil", () => {
    // A finished candidate never lists an excluded word as an answer.
    const c = cand({ core: ["rutabaga", "tomato"], accepted: ["rutabaga", "tomato"], excluded: new Set(["kale", "rutabaga"]) });
    const r = repairPrompt(prompt(), c, { ...ctx, unplayed: true });
    expect(r.removed).toEqual(["kale"]);
    expect(matches(r.prompt, "kale")).toBe(false);
    expect(matches(r.prompt, "rutabaga")).toBe(true);
    expect(r.prompt.fossil.word).toBe("rutabaga");
  });

  it("hides a rude word on an unplayed day: still accepted, no longer shown, never the fossil", () => {
    const c = cand({ excluded: new Set(), hidden: new Set(["tomato", "rutabaga", "more"]) });
    const r = repairPrompt(prompt(), c, { ...ctx, unplayed: true });
    expect(r.hidden).toEqual(["tomato"]); // "more" was never shown; the fossil stays
    expect(r.prompt.answers).toContainEqual(["tomato", "familiar", 0]);
    expect(r.prompt.answers).toContainEqual(["rutabaga", "fossil", 1]);
    expect(matches(r.prompt, "tomatoes")).toBe(true);
    // A played day keeps what its players saw.
    expect(repairPrompt(prompt(), c, { ...ctx, unplayed: false }).hidden).toEqual([]);
  });

  it("puts back what the old stray-sense filter took out: tulip, sad and juice return on every day but today", () => {
    const r = repairPrompt(prompt(), cand({ accepted: ["rutabaga", "tomato", "kale", "tulip"], excluded: new Set() }), { ...ctx, unplayed: true });
    expect(r.added).toEqual(["tulip"]);
    expect(matches(r.prompt, "tulips")).toBe(true);
    expect(matches(r.prompt, "more")).toBe(true); // no longer listed as a stray: left alone
  });

  it("skips a word that a typo of the fossil would land on (the validator's rule)", () => {
    // "rutabags", one typo from the fossil, would read as the plural of "rutabag".
    const r = repairPrompt(prompt(), cand({ accepted: ["rutabaga", "rutabag", "potato"] }), { ...ctx, unplayed: false });
    expect(r.added).toEqual(["potato"]);
  });

  it("changes nothing when the day already has every accepted word and no stray senses", () => {
    const p = prompt({ answers: [["rutabaga", "fossil", 1], ["tomato", "familiar", 1]], aliases: {}, stories: {} });
    const r = repairPrompt(p, cand({ accepted: ["rutabaga", "tomato"] }), { ...ctx, unplayed: true });
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
    expect(r).toEqual({ amendedDays: 2, added: 4, removed: 2, hidden: 0, skippedOversize: 0 });
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
    expect(await repairDays(sink, cands, { ...ctx, today: "2026-11-07" })).toEqual({ amendedDays: 0, added: 0, removed: 0, hidden: 0, skippedOversize: 0 });
  });

  it("drops the rarest additions first when a day would go over the size cap", async () => {
    const sink = await setup(["2026-11-08"]);
    const noStray = cand({ excluded: new Set() });
    // The cap fits the day with potato added, but not with carrot too.
    const withPotato = { ...day("2026-11-08"), prompts: [repairPrompt(prompt(), cand({ accepted: ["potato"], excluded: new Set() }), { ...ctx, unplayed: false }).prompt] };
    const cap = JSON.stringify(encodeDay(withPotato)).length + 2;
    const r = await repairDays(sink, new Map([["theme:vegetables", noStray]]), { ...ctx, today: "2026-11-07", maxDayChars: cap });
    expect(r.skippedOversize).toBeGreaterThan(0);
    const p = decodeDay((await sink.readDay("2026-11-08"))!).prompts[0];
    expect(matches(p, "potato")).toBe(true); // the commoner word is kept
    expect(matches(p, "carrot")).toBe(false);
  });
});
