import { afterEach, describe, expect, it } from "vitest";
import { getAllSubscribers, removeSubscriber, upsertSubscriber } from "./db";

// These exercise the local-JSON-fallback path (no Upstash env vars set in
// the test environment), the same path a zero-config `npm run dev` uses —
// see lib/db.ts's own module comment. Every test cleans up the emails it
// wrote so runs don't leak into `.data/subscribers.json` between tests.
describe("getAllSubscribers", () => {
  const testEmails = ["cron-fix-a@example.com", "cron-fix-b@example.com"];

  afterEach(async () => {
    for (const email of testEmails) {
      await removeSubscriber(email);
    }
  });

  it("returns every subscriber regardless of delivery hour", async () => {
    await upsertSubscriber(testEmails[0], 3);
    await upsertSubscriber(testEmails[1], 21);

    const all = await getAllSubscribers();

    expect(all).toEqual(expect.arrayContaining(testEmails));
  });

  it("omits a subscriber after they unsubscribe", async () => {
    await upsertSubscriber(testEmails[0], 9);
    await removeSubscriber(testEmails[0]);

    const all = await getAllSubscribers();

    expect(all).not.toContain(testEmails[0]);
  });
});
