import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runDemandReport, snapshotPath } from "./run";
import { FIXTURE_ENTRIES, fakeFetch, googleRoute, jsonResponse, testServiceAccount, wikimediaRoute } from "./testing";
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
      googleFetcher: fakeFetch(),
      env: {},
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
      runDemandReport({ entries: FIXTURE_ENTRIES, now: NOW, outDir, wikiFetcher, googleFetcher: fakeFetch(), env: {} })
    ).rejects.toThrow("HTTP 500");
    expect(existsSync(path.join(outDir, "snapshots"))).toBe(false);
  });

  it("refuses to write when no word has any views", async () => {
    const wikiFetcher = fakeFetch((url) =>
      url.startsWith("https://wikimedia.org/") ? jsonResponse("{}", 404) : wikimediaRoute(url)
    );
    await expect(
      runDemandReport({ entries: FIXTURE_ENTRIES, now: NOW, outDir, wikiFetcher, googleFetcher: fakeFetch(), env: {} })
    ).rejects.toThrow("No word has any Wiktionary pageviews");
    expect(existsSync(path.join(outDir, "snapshots"))).toBe(false);
  });
});

describe("runDemandReport with Search Console", () => {
  const account = testServiceAccount();

  it("skips Search Console, and says so, when the key isn't set", async () => {
    const lines: string[] = [];
    const { snapshot } = await runDemandReport({
      entries: FIXTURE_ENTRIES,
      now: NOW,
      outDir,
      wikiFetcher: fakeFetch(wikimediaRoute),
      googleFetcher: fakeFetch(),
      env: {},
      log: (line) => lines.push(line),
    });
    expect(snapshot.searchConsole).toBeNull();
    expect(lines).toContain("Search Console: skipped (GSC_SERVICE_ACCOUNT_KEY is not set)");
  });

  it("includes Search Console when the key is set, logging counts only", async () => {
    const lines: string[] = [];
    const { snapshot } = await runDemandReport({
      entries: FIXTURE_ENTRIES,
      now: NOW,
      outDir,
      wikiFetcher: fakeFetch(wikimediaRoute),
      googleFetcher: fakeFetch(googleRoute),
      env: { GSC_SERVICE_ACCOUNT_KEY: account.envValue },
      log: (line) => lines.push(line),
    });
    expect(snapshot.searchConsole?.byPage).toHaveLength(4);
    expect(lines).toContain("Search Console: 4 page rows, 4 query rows, 5 page+query rows");
    expect(lines.join("\n")).not.toContain("quarantine origin");
  });

  it("fails, writing nothing, when the key is set but Search Console refuses", async () => {
    const googleFetcher = fakeFetch((url) =>
      url.startsWith("https://searchconsole.googleapis.com/")
        ? jsonResponse('{"error":{"status":"PERMISSION_DENIED"}}', 403)
        : googleRoute(url)
    );
    await expect(
      runDemandReport({
        entries: FIXTURE_ENTRIES,
        now: NOW,
        outDir,
        wikiFetcher: fakeFetch(wikimediaRoute),
        googleFetcher,
        env: { GSC_SERVICE_ACCOUNT_KEY: account.envValue },
      })
    ).rejects.toThrow("PERMISSION_DENIED");
    expect(existsSync(path.join(outDir, "snapshots"))).toBe(false);
  });

  it("fails before the slow Wiktionary pass when the key is malformed", async () => {
    const wikiFetcher = fakeFetch(wikimediaRoute);
    await expect(
      runDemandReport({
        entries: FIXTURE_ENTRIES,
        now: NOW,
        outDir,
        wikiFetcher,
        googleFetcher: fakeFetch(),
        env: { GSC_SERVICE_ACCOUNT_KEY: "garbage" },
      })
    ).rejects.toThrow("isn't base64-encoded JSON");
    expect(wikiFetcher).not.toHaveBeenCalled();
  });
});
