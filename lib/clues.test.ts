import { describe, expect, it } from "vitest";
import {
  buildCluePrompt,
  buildSolverPrompt,
  clueProblems,
  forbiddenFragments,
  parseClueResponse,
  parseSolverGuess,
  replaceCluesInSource,
  type ClueSet,
} from "./clues";
import { WORDS } from "./words";

const good: ClueSet = [
  "A figure of evil in many religions, whose name began as an ancient word for someone who hurls accusations.",
  "The tempter of old stories; his Greek ancestor meant slanderer, literally one who throws across.",
  "Spanish calls him diablo.",
];

describe("clueProblems", () => {
  it("passes a good set", () => {
    expect(clueProblems(good, "devil")).toEqual([]);
  });

  it("uses the same crude stem as lib/words.test.ts", () => {
    expect(forbiddenFragments("salaries")).toEqual(["salaries", "salari"]);
    expect(forbiddenFragments("tulip")).toEqual(["tulip"]);
  });

  it("flags the answer, its stem, long clues, dashes and letter hints in clue 3", () => {
    const bad = ["Its name means devilish.", "x".repeat(221), "Five letters — starts with D."];
    expect(clueProblems(bad, "devil")).toEqual([
      'clue 1 contains "devil", which gives away the answer',
      'clue 1 quotes "devilish", which shares most of its opening letters with the answer',
      "clue 2 is 221 characters (max 220)",
      "clue 3 uses an em or en dash",
      "clue 3 mentions letters; the game already adds the letter count and first letter",
    ]);
  });

  it("flags jargon, non-Latin scripts, starred forms, macrons and clue-1 near-spellings", () => {
    const set = [
      "A volley of fire, from the Roman greeting salve.",
      "From Proto-Germanic *salw, Greek σάλβο.",
      "Its Latin form was salvā.",
    ];
    expect(clueProblems(set, "salvo")).toEqual([
      'clue 1 quotes "salve", which shares most of its opening letters with the answer',
      'clue 2 uses jargon players can\'t use ("Proto-Germanic")',
      "clue 2 uses a non-Latin script or a starred reconstructed form",
      "clue 3 uses a macron or breve; write the plain spelling",
    ]);
  });

  it("allows accented Latin letters and curly quotes", () => {
    expect(clueProblems(["A café drink, ‘strong’.", "Two.", "Three."], "espresso")).toEqual([]);
  });

  it("rejects the wrong shape", () => {
    expect(clueProblems(["a", "b"], "devil")).toEqual(["there must be exactly 3 non-empty clues"]);
    expect(clueProblems(["a", " ", "c"], "devil")).toEqual(["there must be exactly 3 non-empty clues"]);
    expect(clueProblems(null, "devil")).toEqual(["there must be exactly 3 non-empty clues"]);
  });
});

describe("parseClueResponse", () => {
  it("accepts fenced JSON and trims", () => {
    const raw = "```json\n" + JSON.stringify({ clues: good.map((c) => ` ${c} `) }) + "\n```";
    expect(parseClueResponse(raw, "devil")).toEqual({ ok: true, clues: good });
  });

  it("reports invalid JSON and failed checks", () => {
    expect(parseClueResponse("not json", "devil")).toEqual({ ok: false, problems: ["the reply was not valid JSON"] });
    const res = parseClueResponse(JSON.stringify({ clues: ["a devil", "b", "c"] }), "devil");
    expect(res.ok).toBe(false);
  });
});

describe("prompts", () => {
  const devil = WORDS.find((w) => w.slug === "devil")!;

  it("gives the writer the story and the forbidden fragments, plus feedback when retrying", () => {
    const p = buildCluePrompt(devil, ["clue 1 is too long"]);
    expect(p).toContain(devil.origin);
    expect(p).toContain('"devil"');
    expect(p).toContain("- clue 1 is too long");
    expect(buildCluePrompt(devil)).not.toContain("previous attempt");
  });

  it("shows the solver only the clues for its stage, and the hint at stage 3", () => {
    expect(buildSolverPrompt(good, 1, "5 letters, starts with D")).not.toContain("Clue 2");
    const three = buildSolverPrompt(good, 3, "5 letters, starts with D");
    expect(three).toContain("Clue 3:");
    expect(three).toContain("Hint: 5 letters, starts with D");
  });

  it("parses a solver guess", () => {
    expect(parseSolverGuess('{"guess": " Devil "}')).toBe("Devil");
    expect(parseSolverGuess("nope")).toBeNull();
  });
});

describe("replaceCluesInSource", () => {
  const src = `[
  {
    slug: "a",
    clues: [
      "has a ] bracket",
      "and an \\"escaped\\" quote",
      "three"
    ],
  },
  {
    slug: "ab",
    clues: ["x","y","z"],
  },
]`;

  it("replaces only the named entry, multi-line or single-line", () => {
    const out = replaceCluesInSource(src, "a", ["1", "2", "3"]);
    expect(out).toContain('slug: "a",\n    clues: ["1","2","3"],');
    expect(out).toContain('clues: ["x","y","z"]');
    const out2 = replaceCluesInSource(src, "ab", ["p", "q", "r"]);
    expect(out2).toContain('clues: ["p","q","r"]');
    expect(out2).toContain("has a ] bracket");
  });

  it("throws for an unknown slug", () => {
    expect(() => replaceCluesInSource(src, "zzz", ["1", "2", "3"])).toThrow(/no entry/);
  });
});
