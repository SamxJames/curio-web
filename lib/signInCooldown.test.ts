import { vi, describe, it, expect, beforeEach } from "vitest";

// Same minimal in-memory Redis stand-in pattern as lib/wordsLocking.test.ts
// — just enough of the NX-claim semantics this module actually uses.
const { fakeRedis } = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    fakeRedis: {
      store,
      set: vi.fn(async (key: string, value: string, opts?: { nx?: boolean; ex?: number }) => {
        if (opts?.nx && store.has(key)) return null;
        store.set(key, value);
        return "OK";
      }),
    },
  };
});

vi.mock("./redis", () => ({ redis: fakeRedis, usingUpstash: true }));

const { claimSignInSend } = await import("./signInCooldown");

beforeEach(() => {
  fakeRedis.store.clear();
  vi.clearAllMocks();
});

describe("claimSignInSend", () => {
  it("allows the first request for an address", async () => {
    expect(await claimSignInSend("person@example.com")).toBe(true);
  });

  it("blocks a second request for the same address within the cooldown window", async () => {
    await claimSignInSend("person@example.com");
    expect(await claimSignInSend("person@example.com")).toBe(false);
  });

  it("treats an address's case and surrounding whitespace as the same address", async () => {
    await claimSignInSend("  Person@Example.com  ");
    expect(await claimSignInSend("person@example.com")).toBe(false);
  });

  it("doesn't block a different address", async () => {
    await claimSignInSend("person@example.com");
    expect(await claimSignInSend("other@example.com")).toBe(true);
  });
});
