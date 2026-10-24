import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FileSink, RedisSink } from "./sink";
import { digKeys, historyFromManifest } from "../../lib/dig/keys";

describe("digKeys", () => {
  it("keeps every key under curio:dig:", () => {
    const keys = [digKeys.day("2026-12-01"), digKeys.manifest, digKeys.extras, digKeys.adjudicated, digKeys.scores("d"), digKeys.funnel("d"), digKeys.rejected("d", 3), digKeys.claims("d", 3), digKeys.heartbeat, digKeys.usageAlert("2026-12")];
    for (const k of keys) expect(k.startsWith("curio:dig:")).toBe(true);
    expect(digKeys.rejected("2026-12-01", 3)).toBe("curio:dig:rej:2026-12-01:3");
  });
});

describe("FileSink", () => {
  it("round-trips days, manifest, extras and logs", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "dig-"));
    const sink = new FileSink(dir);
    expect(await sink.readManifest()).toBeNull();
    await sink.writeDay({ v: 1, date: "2026-12-01", rejSample: 1, prompts: [] });
    expect((await sink.readDay("2026-12-01"))?.date).toBe("2026-12-01");
    await sink.writeManifest({ v: 1, lastRun: "x", days: { "2026-12-01": [{ id: "theme:a", base: "theme:a", fossil: "f" }] }, poolThemes: 1, poolOrigins: 1 });
    expect(historyFromManifest(await sink.readManifest())).toEqual([{ date: "2026-12-01", prompts: [{ id: "theme:a", base: "theme:a", fossil: "f" }] }]);
    await sink.writeExtras({ "theme:a": ["x"] });
    expect(await sink.readExtras()).toEqual({ "theme:a": ["x"] });
    expect(await sink.readLog("rej", "2026-12-01", 0)).toEqual({});
  });
});

describe("RedisSink.create", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("refuses to run outside GitHub Actions", () => {
    vi.stubEnv("GITHUB_ACTIONS", "");
    expect(() => RedisSink.create()).toThrow(/only inside GitHub Actions/);
  });
});
