import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/db", () => ({ removeSubscriber: vi.fn() }));

const { default: UnsubscribePage, metadata } = await import("./page");
const { removeSubscriber } = await import("@/lib/db");
const { signUnsubscribeToken, unsubscribeSecret } = await import("@/lib/unsubscribeToken");

const render = async (token?: string) =>
  renderToStaticMarkup(await UnsubscribePage({ searchParams: Promise.resolve({ token }) }));

describe("/unsubscribe confirm page", () => {
  it("shows the address masked, with one button that POSTs the token", async () => {
    const token = signUnsubscribeToken("sam@gmail.com", unsubscribeSecret()!);
    const html = await render(token);

    expect(html).toContain("s***@gmail.com");
    expect(html).not.toContain("sam@gmail.com");
    expect(html).toContain('method="post"');
    expect(html).toContain(`action="/api/unsubscribe?token=${encodeURIComponent(token)}"`);
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toContain("Unsubscribe</button>");
  });

  it("doesn't unsubscribe just by being viewed", async () => {
    await render(signUnsubscribeToken("sam@gmail.com", unsubscribeSecret()!));
    expect(removeSubscriber).not.toHaveBeenCalled();
  });

  it.each([undefined, "garbage", Buffer.from("sam@gmail.com").toString("base64url")])(
    "redirects an invalid token (%j) to the failure page",
    async (token) => {
      await expect(render(token)).rejects.toMatchObject({
        digest: expect.stringContaining("/unsubscribed?ok=0"),
      });
    }
  );

  it("is noindex", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
