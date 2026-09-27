import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { getAllSubscribers, getAllSubscriberRecords, getSubscriberByEmail, removeSubscriber, upsertSubscriber } from "./db";
import { POST as unsubscribePost } from "@/app/api/unsubscribe/route";
import { signUnsubscribeToken, unsubscribeSecret } from "./unsubscribeToken";

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

// Lives here rather than beside the route: it writes the real
// `.data/subscribers.json`, and test files run in parallel workers, so
// every real-store test shares this one (serially run) file.
describe("POST /api/unsubscribe against the real subscriber store", () => {
  const email = "already-removed@example.com";

  afterEach(async () => {
    await removeSubscriber(email);
  });

  it("returns 200 for a valid one-click token whose address is already gone", async () => {
    await upsertSubscriber(email);
    await removeSubscriber(email);
    expect(await getSubscriberByEmail(email)).toBeNull();

    const token = signUnsubscribeToken(email, unsubscribeSecret()!);
    const res = await unsubscribePost(
      new NextRequest(`http://localhost/api/unsubscribe?token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "List-Unsubscribe=One-Click",
      })
    );

    expect(res.status).toBe(200);
    expect(await getSubscriberByEmail(email)).toBeNull();
  });
});
