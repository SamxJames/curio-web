import { beforeEach, describe, expect, it, vi } from "vitest";

const { fakeRedis } = vi.hoisted(() => {
  const store = new Map<string, string>();
  const ttls = new Map<string, number>();
  return {
    fakeRedis: {
      store,
      ttls,
      set: vi.fn(async (key: string, value: string, opts?: { nx?: boolean; ex?: number }) => {
        if (opts?.nx && store.has(key)) return null;
        store.set(key, value);
        if (opts?.ex) ttls.set(key, opts.ex);
        return "OK";
      }),
      del: vi.fn(async (key: string) => (store.delete(key) ? 1 : 0)),
    },
  };
});

vi.mock("./redis", () => ({ redis: fakeRedis, usingUpstash: true }));

const { claimConfirmSend, releaseConfirmSend } = await import("./confirmCooldown");

beforeEach(() => {
  fakeRedis.store.clear();
  fakeRedis.ttls.clear();
  vi.clearAllMocks();
});

describe("confirm-send cooldown", () => {
  it("allows the first send for an address and holds it for 10 minutes", async () => {
    expect(await claimConfirmSend("a@example.com")).toBe(true);
    expect(fakeRedis.ttls.get("curio:confirmcooldown:a@example.com")).toBe(600);
  });

  it("refuses a second send for the same address (case and spaces ignored)", async () => {
    await claimConfirmSend("a@example.com");
    expect(await claimConfirmSend("  A@Example.com ")).toBe(false);
  });

  it("does not affect other addresses", async () => {
    await claimConfirmSend("a@example.com");
    expect(await claimConfirmSend("b@example.com")).toBe(true);
  });

  it("release lets the address try again at once (used when the send fails)", async () => {
    await claimConfirmSend("a@example.com");
    await releaseConfirmSend("a@example.com");
    expect(await claimConfirmSend("a@example.com")).toBe(true);
  });
});
