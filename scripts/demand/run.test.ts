import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runDemandReport, snapshotPath } from "./run";
import { FIXTURE_ENTRIES, fakeFetch, jsonResponse, wikimediaRoute } from "./testing";
import type { Snapshot } from "./types";

const NOW = new Date("2026-10-05T06:00:00Z");
let outDir: string;

beforeEach(async () => {
  outDir = await mkdtemp(path.join(os.tmpdir(), "demand-report-"));
});
afterEach(async () => {
  await rm(outDir, { recursive: true, force: true });
});

describe("runDemandReport", () => {
  it("writes a dated snapshot with the Wiktionary half", async () => {
    const { snapshot } = await runDemandReport({
      entries: FIXTURE_ENTRIES,
      now: NOW,
      outDir,
      wikiFetcher: fakeFetch(wikimediaRoute),
    });
    expect(snapshot.date).toBe("2026-10-05");
    const written = JSON.parse(await readFile(snapshotPath(outDir, "2026-10-05"), "utf8")) as Snapshot;
    expect(written.version).toBe(1);
    expect(written.wiktionary.words.map((w) => w.title)).toEqual(["quarantine", "december", null]);
  });

  it("writes nothing when a source fails", async () => {
    const wikiFetcher = fakeFetch((url) =>
      url.startsWith("https://wikimedia.org/") ? jsonResponse("{}", 500) : wikimediaRoute(url)
    );
    await expect(
      runDemandReport({ entries: FIXTURE_ENTRIES, now: NOW, outDir, wikiFetcher })
    ).rejects.toThrow("HTTP 500");
    expect(existsSync(path.join(outDir, "snapshots"))).toBe(false);
  });

  it("refuses to write when no word has any views", async () => {
    const wikiFetcher = fakeFetch((url) =>
      url.startsWith("https://wikimedia.org/") ? jsonResponse("{}", 404) : wikimediaRoute(url)
    );
    await expect(
      runDemandReport({ entries: FIXTURE_ENTRIES, now: NOW, outDir, wikiFetcher })
    ).rejects.toThrow("No word has any Wiktionary pageviews");
    expect(existsSync(path.join(outDir, "snapshots"))).toBe(false);
  });
});
