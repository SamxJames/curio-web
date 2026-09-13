import { afterEach, describe, expect, it } from "vitest";
import { getAllSubscribers, getAllSubscriberRecords, removeSubscriber, upsertSubscriber } from "./db";

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

describe("getAllSubscriberRecords", () => {
  const testEmails = ["admin-stats-a@example.com", "admin-stats-b@example.com"];

  afterEach(async () => {
    for (const email of testEmails) {
      await removeSubscriber(email);
    }
  });

  it("returns full records, not just email addresses", async () => {
    await upsertSubscriber(testEmails[0], 3);
    await upsertSubscriber(testEmails[1], 21);

    const records = await getAllSubscriberRecords();
    const emails = records.map((r) => r.email);

    expect(emails).toEqual(expect.arrayContaining(testEmails));
    for (const record of records.filter((r) => testEmails.includes(r.email))) {
      expect(typeof record.createdAt).toBe("string");
      expect(record.createdAt.length).toBeGreaterThan(0);
    }
  });

  it("omits a subscriber after they unsubscribe", async () => {
    await upsertSubscriber(testEmails[0], 9);
    await removeSubscriber(testEmails[0]);

    const records = await getAllSubscriberRecords();

    expect(records.map((r) => r.email)).not.toContain(testEmails[0]);
  });
});
