import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";

vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => ({ user: { email: "a@b.com" } })), signOut: vi.fn() }));
vi.mock("@/lib/db", () => ({ getSubscriberByEmail: vi.fn(), removeSubscriber: vi.fn(), upsertSubscriber: vi.fn() }));
vi.mock("@/lib/trafficStats", () => ({ recordTrafficEvent: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { default: AccountPage } = await import("./page");
const { getSubscriberByEmail, upsertSubscriber } = await import("@/lib/db");
const { recordTrafficEvent } = await import("@/lib/trafficStats");

/** The page's Subscribe server action, pulled out of the rendered tree. */
async function subscribeAction(): Promise<() => Promise<void>> {
  const found: (() => Promise<void>)[] = [];
  const walk = (node: ReactNode) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== "object" || !("props" in node)) return;
    const props = (node as ReactElement<{ action?: unknown; children?: ReactNode }>).props;
    if (typeof props.action === "function" && props.action.name === "subscribe") found.push(props.action as () => Promise<void>);
    walk(props.children);
  };
  walk(await AccountPage());
  expect(found).toHaveLength(1);
  return found[0];
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getSubscriberByEmail).mockResolvedValue(null);
  vi.mocked(upsertSubscriber).mockResolvedValue(undefined);
  vi.mocked(recordTrafficEvent).mockResolvedValue(undefined);
});

describe("/account Subscribe", () => {
  it("counts the signup in the per-source total as well as the per-placement one", async () => {
    const subscribe = await subscribeAction();
    await subscribe();
    expect(upsertSubscriber).toHaveBeenCalledWith("a@b.com");
    expect(recordTrafficEvent).toHaveBeenCalledWith({ kind: "signup", source: "direct" });
    expect(recordTrafficEvent).toHaveBeenCalledWith({ kind: "signup-at", placement: "account" });
  });

  it("a failed count still subscribes, and logs only the error's name", async () => {
    const subscribe = await subscribeAction();
    const err = new Error("secret detail a@b.com");
    err.name = "RedisError";
    vi.mocked(recordTrafficEvent).mockRejectedValue(err);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(subscribe()).resolves.toBeUndefined();
    expect(upsertSubscriber).toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("traffic: account record failed", "RedisError");
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret");
    log.mockRestore();
  });
});
