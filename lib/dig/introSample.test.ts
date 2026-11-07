import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { tierFromZipf } from "./score";
import { loadWordfreq } from "../../scripts/dig/sources/wordfreq";

/** The intro says "apple lands in the topsoil. quince digs down to the clay." That has to be
 * true under the real frequency data. The data is a large download kept outside git, so the
 * check runs when it can be found (DIG_WORDFREQ, dig-data/, or data/ in a parent folder). */
function findWordfreq(): string | null {
  const rel = path.join("wordfreq", "large_en.msgpack.gz");
  const found: string[] = [];
  if (process.env.DIG_WORDFREQ) found.push(process.env.DIG_WORDFREQ);
  for (let dir = process.cwd(); ; dir = path.dirname(dir)) {
    found.push(path.join(dir, "dig-data", rel), path.join(dir, "data", rel));
    if (path.dirname(dir) === dir) break;
  }
  return found.find((p) => existsSync(p)) ?? null;
}

const file = findWordfreq();

describe("intro sample sentence", () => {
  it.skipIf(!file)("apple is topsoil and quince is clay, by the real frequencies", () => {
    const zipf = loadWordfreq(file!);
    expect(["common", "popular"]).toContain(tierFromZipf(zipf.get("apple")));
    expect(tierFromZipf(zipf.get("quince"))).toBe("uncommon");
  });
  it("tier cut-offs map the documented examples", () => {
    // Checked 2026-11-07 against wordfreq large_en: apple 4.76, quince 2.86.
    expect(tierFromZipf(4.76)).toBe("common");
    expect(tierFromZipf(2.86)).toBe("uncommon");
  });
});
