import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import EmailSignupInline from "./EmailSignupInline";

describe("EmailSignupInline", () => {
  it("form says what you get and links the sample", () => {
    const html = renderToStaticMarkup(<EmailSignupInline placement="story" />);
    expect(html).toContain("Get tomorrow&#x27;s word");
    expect(html).toContain("One short email each morning. Free; stop anytime.");
    expect(html).toContain('href="/sample-email"');
    expect(html).not.toContain(">Join<");
  });
});
