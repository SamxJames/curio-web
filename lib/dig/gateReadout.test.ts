import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();
vi.mock("../email", () => ({ sendGateReadout: (m: unknown) => send(m) }));
vi.mock("./server", () => ({
  readCohorts: async () => ({ "2026-11-12": { d7: 3 } }),
  funnelDays: async () => ({ "2026-11-12": { "finish:new": 20, "shared:new": 4 } }),
}));

import { resetDigestRunsMemory } from "../digestRuns";
import { runGateReadout } from "./gateReadout";

const MONDAY = new Date("2026-11-30T09:00:00Z");

beforeEach(() => {
  send.mockReset();
  resetDigestRunsMemory();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("runGateReadout", () => {
  it("does nothing on an ordinary day", async () => {
    expect(await runGateReadout(new Date("2026-12-01T09:00:00Z"))).toBe("skipped");
    expect(send).not.toHaveBeenCalled();
  });

  it("sends the numbers on a Monday, once per day", async () => {
    expect(await runGateReadout(MONDAY)).toBe("sent");
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].subject).toContain("20 first-time finishers");
    expect(await runGateReadout(MONDAY)).toBe("skipped");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("also sends on the gate day", async () => {
    expect(await runGateReadout(new Date("2026-12-04T09:00:00Z"))).toBe("sent");
  });

  it("never throws when the send fails, and lets a re-run try again", async () => {
    send.mockRejectedValueOnce(new Error("Resend send failed: boom"));
    expect(await runGateReadout(MONDAY)).toBe("failed");
    expect(console.error).toHaveBeenCalledWith("[curio:gate-readout] failed (Error)");
    expect(await runGateReadout(MONDAY)).toBe("sent");
  });
});
