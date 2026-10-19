import { describe, expect, it } from "vitest";
import { offerMode } from "./signupOffer";

const base = { session: "unauthenticated", subscribedHere: false, arrivedFromEmail: false, me: "unknown" } as const;

describe("offerMode", () => {
  it("signed out, unknown to this browser: the form", () => expect(offerMode(base)).toBe("form"));
  it("subscribed here or arrived from the digest: nothing", () => {
    expect(offerMode({ ...base, subscribedHere: true })).toBe("none");
    expect(offerMode({ ...base, arrivedFromEmail: true })).toBe("none");
  });
  it("session loading: nothing, so nothing flashes", () => expect(offerMode({ ...base, session: "loading" })).toBe("none"));
  it("signed in: one tap only once we know they're not subscribed", () => {
    const s = { ...base, session: "authenticated" } as const;
    expect(offerMode({ ...s, me: "unknown" })).toBe("none");
    expect(offerMode({ ...s, me: "subscribed" })).toBe("none");
    expect(offerMode({ ...s, me: "error" })).toBe("none");
    expect(offerMode({ ...s, me: "not-subscribed" })).toBe("one-tap");
    expect(offerMode({ ...s, me: "not-subscribed", subscribedHere: true })).toBe("none");
  });
});
