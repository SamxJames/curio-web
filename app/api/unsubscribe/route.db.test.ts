import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { getSubscriberByEmail, removeSubscriber, upsertSubscriber } from "@/lib/db";
import { signUnsubscribeToken, unsubscribeSecret } from "@/lib/unsubscribeToken";

const EMAIL = "already-removed@example.com";

const oneClick = (token: string) =>
  new NextRequest(`http://localhost/api/unsubscribe?token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "List-Unsubscribe=One-Click",
  });

describe("POST /api/unsubscribe against the real subscriber store", () => {
  it("returns 200 for a valid one-click token whose address is already gone", async () => {
    await upsertSubscriber(EMAIL);
    await removeSubscriber(EMAIL);
    expect(await getSubscriberByEmail(EMAIL)).toBeNull();

    const res = await POST(oneClick(signUnsubscribeToken(EMAIL, unsubscribeSecret()!)));

    expect(res.status).toBe(200);
    expect(await getSubscriberByEmail(EMAIL)).toBeNull();
  });
});
