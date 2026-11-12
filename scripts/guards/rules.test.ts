import { describe, expect, it } from "vitest";
import { scanSource } from "./rules";

const rules = (file: string, src: string) => scanSource(file, src).map((v) => v.rule);

describe("design-token", () => {
  it("blocks arbitrary type and colour values", () => {
    expect(rules("components/X.tsx", `<p className="text-[13px] mt-2">a</p>`)).toEqual(["design-token"]);
    expect(rules("components/X.tsx", `<p className="md:tracking-[0.1em]">a</p>`)).toEqual(["design-token"]);
    expect(rules("components/X.tsx", `<p className="leading-[1.05]">a</p>`)).toEqual(["design-token"]);
    expect(rules("components/X.tsx", `<p className="bg-[#fff]">a</p>`)).toEqual(["design-token"]);
  });
  it("allows tokens, layout brackets and the documented admin exceptions", () => {
    expect(rules("components/X.tsx", `<p className="text-micro tracking-wide max-w-[46ch] min-h-[calc(100vh-1px)] bg-paper">a</p>`)).toEqual([]);
    expect(rules("components/AdminDashboard.tsx", `<p className="text-[32px]">a</p>`)).toEqual([]);
    expect(rules("components/dig/DigFunnelTable.tsx", `<p className="tracking-[0.18em]">a</p>`)).toEqual([]);
    expect(rules("components/X.test.tsx", `<p className="text-[32px]">a</p>`)).toEqual([]);
  });
  it("ignores mentions inside comments", () => {
    expect(rules("components/X.tsx", `// was text-[13px]\n/* tracking-[1em]\n leading-[2] */\nconst a = 1;`)).toEqual([]);
  });
});

describe("raw-control", () => {
  it("blocks hand-rolled controls outside components/ui", () => {
    expect(rules("components/X.tsx", `<button onClick={f}>go</button>`)).toEqual(["raw-control"]);
    expect(rules("app/x/page.tsx", `<input type="text" />`)).toEqual(["raw-control"]);
    expect(rules("components/X.tsx", `<textarea\n  rows={3}/>`)).toEqual(["raw-control"]);
  });
  it("allows the primitives, other tags and admin", () => {
    expect(rules("components/ui/Button.tsx", `<button className="x" />`)).toEqual([]);
    expect(rules("components/X.tsx", `<Button>go</Button><IconButton /><buttonish />`)).toEqual([]);
    expect(rules("components/AdminDashboard.tsx", `<button>x</button>`)).toEqual([]);
  });
});

describe("backlog-copy", () => {
  const bad = [
    "Your streak is 3", "You missed yesterday", "You've missed 2 words", "12 unread words",
    "Catch up on old words", "3 of 1,147 words", "80% complete", "Don't miss tomorrow",
    "You haven't played today", "5 days in a row", "4 left to read",
  ];
  it.each(bad)("blocks %s", (text) => {
    expect(rules("components/X.tsx", `<p>${text}</p>`)).toContain("backlog-copy");
  });
  it("allows ordinary copy and the stated principle", () => {
    expect(rules("components/ArrivalHero.tsx", `<p>No feed. No backlog to catch up on.</p>`)).toEqual([]);
    expect(rules("components/X.tsx", `<p>Where the word came from, 1,147 of them to browse.</p>`)).toEqual([]);
    expect(rules("lib/words.ts", `journey: "a streak of bad luck"`)).toEqual([]);
    expect(rules("components/X.test.tsx", `expect(html).not.toMatch(/streak/)`)).toEqual([]);
  });
  it("ignores comments that explain the rule", () => {
    expect(rules("lib/storage.ts", `// No streak field, ever.\nexport const a = 1;`)).toEqual([]);
  });
  it("reports file, line and a fix", () => {
    const [v] = scanSource("components\\X.tsx", `const a = 1;\n<p>Your streak</p>`);
    expect(v).toMatchObject({ rule: "backlog-copy", file: "components/X.tsx", line: 2, match: "streak" });
    expect(v!.fix.length).toBeGreaterThan(10);
  });
});
