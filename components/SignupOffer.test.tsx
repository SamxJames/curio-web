import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import EmailSignupInline from "./EmailSignupInline";

const session: { status: string } = { status: "loading" };
vi.mock("next-auth/react", () => ({ useSession: () => ({ status: session.status }) }));

const { default: SignupOffer } = await import("./SignupOffer");

describe("EmailSignupInline", () => {
  it("form says what you get and links the sample", () => {
    const html = renderToStaticMarkup(<EmailSignupInline placement="story" />);
    expect(html).toContain("Get tomorrow&#x27;s word");
    expect(html).toContain("One short email each morning. Free; stop anytime.");
    expect(html).toContain('href="/sample-email"');
    expect(html).not.toContain(">Join<");
  });
});

describe("SignupOffer server HTML", () => {
  it("while the session loads: the form and pitch, hidden pre-paint for signed-in readers", () => {
    session.status = "loading";
    const html = renderToStaticMarkup(<SignupOffer placement="arrival" className="mt-5" pitch={<p>Pitch</p>} />);
    expect(html).toContain("Get tomorrow&#x27;s word");
    expect(html).toContain("Pitch");
    expect(html).toMatch(/^<div class="mt-5 signed-in:hidden">/);
  });
  it("signed out: the form, not hidden for anyone", () => {
    session.status = "unauthenticated";
    const html = renderToStaticMarkup(<SignupOffer placement="arrival" className="mt-5" />);
    expect(html).toContain("Get tomorrow&#x27;s word");
    expect(html).not.toContain("signed-in:hidden");
  });
});
