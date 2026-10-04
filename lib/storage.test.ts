import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// storage.ts keeps module-level state (the pulled flag + listeners), so each
// test loads a fresh copy. The node test environment has no window; a minimal
// stub is enough because the pulled flag never touches localStorage.
async function freshStorage() {
  vi.resetModules();
  return import("./storage");
}

describe("account favourites pulled flag", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { localStorage: { getItem: () => null, setItem: () => {} } });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is false by default", async () => {
    const storage = await freshStorage();
    expect(storage.getAccountFavoritesPulled()).toBe(false);
  });

  it("is true after markAccountFavoritesPulled", async () => {
    const storage = await freshStorage();
    storage.markAccountFavoritesPulled();
    expect(storage.getAccountFavoritesPulled()).toBe(true);
  });

  it("notifies subscribers when marked", async () => {
    const storage = await freshStorage();
    const listener = vi.fn();
    const unsubscribe = storage.subscribeAccountFavoritesPulled(listener);
    storage.markAccountFavoritesPulled();
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    storage.markAccountFavoritesPulled();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
