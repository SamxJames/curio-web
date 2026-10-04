import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildConfirmMessage,
  buildDigestMessage,
  buildDigestSubject,
  confirmUrl,
  digestStoryUrl,
  sendDailyDigests,
  unsubscribeUrl,
} from "./email";
import { verifyConfirmToken } from "./confirmToken";
import { verifyUnsubscribeToken } from "./unsubscribeToken";

describe("buildDigestSubject", () => {
  it("returns a short teaser unchanged", () => {
    expect(buildDigestSubject("A short teaser.")).toBe("A short teaser.");
  });

  it("truncates a long teaser to the max length, breaking on a word boundary", () => {
    const teaser =
      "Venice once made incoming ships wait offshore for exactly forty days — no more, no less.";
    const subject = buildDigestSubject(teaser, 60);
    expect(subject.length).toBeLessThanOrEqual(61); // 60 + the ellipsis character
    expect(subject.endsWith("…")).toBe(true);
    // No partial word before the ellipsis: strip it and confirm what's left
    // doesn't end mid-word (the char before the ellipsis, if not itself the
    // ellipsis, must be preceded by a word boundary in the original text).
    const withoutEllipsis = subject.slice(0, -1);
    expect(teaser.startsWith(withoutEllipsis)).toBe(true);
    expect(teaser[withoutEllipsis.length]).toMatch(/\s/);
  });

  it("never leaves dangling punctuation immediately before the ellipsis", () => {
    // Constructed so the naive word-boundary cut would land right after a comma.
    const teaser = "A word for something, done in a very particular and quite specific way, historically.";
    const subject = buildDigestSubject(teaser, 22);
    expect(subject.endsWith("…")).toBe(true);
    expect(subject).not.toMatch(/[.,;:!?—–-]…$/);
  });

  it("uses a 60-character default when no maxLength is given", () => {
    const teaser = "T".repeat(100);
    const subject = buildDigestSubject(teaser);
    expect(subject.length).toBeLessThanOrEqual(61);
  });
});

describe("digestStoryUrl", () => {
  it("links to the story page, tagged so the page knows the reader came from the digest", () => {
    const url = new URL(digestStoryUrl("sideburns"));
    expect(url.pathname).toBe("/story/sideburns");
    expect(url.searchParams.get("utm_source")).toBe("email");
    expect(url.searchParams.get("utm_medium")).toBe("email");
    expect(url.searchParams.get("utm_campaign")).toBe("daily-word");
  });
});

const word = {
  slug: "custard", word: "custard", respelling: "KUS-terd", partOfSpeech: "noun",
  teaser: "A pie filling that started as a crust.", origin: "From crustade.",
  journey: "", related: "", lineage: ["Old French", "English"],
};

describe("unsubscribe links and headers", () => {
  beforeEach(() => vi.stubEnv("CURIO_SITE_URL", "https://curio.example/"));
  afterEach(() => vi.unstubAllEnvs());

  it("builds the link from CURIO_SITE_URL with a signed token", () => {
    const url = new URL(unsubscribeUrl("Sam@Example.com", "s3cret"));
    expect(url.origin + url.pathname).toBe("https://curio.example/api/unsubscribe");
    expect(verifyUnsubscribeToken(url.searchParams.get("token")!, "s3cret")).toBe("sam@example.com");
  });

  it("gives each digest one recipient, its own link, and both List-Unsubscribe headers", () => {
    const msg = buildDigestMessage("sam@example.com", word as never, new Date("2026-09-27T09:00:00Z"), "s3cret");
    const link = unsubscribeUrl("sam@example.com", "s3cret");

    expect(msg.to).toBe("sam@example.com");
    expect(msg).not.toHaveProperty("cc");
    expect(msg).not.toHaveProperty("bcc");
    expect(msg.headers).toEqual({
      "List-Unsubscribe": `<${link}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
    expect(msg.html).toContain(link);
    expect(msg.text).toContain(`Unsubscribe: ${link}`);
    expect(msg.subject).toBe(word.teaser);
  });
});

describe("sendDailyDigests dev fallback (no RESEND_API_KEY)", () => {
  it("logs a subject and a count, sends nothing, and never logs addresses", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const out = await sendDailyDigests(["a@example.com", "b@example.com"], word as never, new Date(), {
      secret: "s3cret",
      runKey: "k",
    });
    const logged = log.mock.calls.flat().join(" ");
    log.mockRestore();

    expect(out).toEqual({ attempted: 2, sent: 2, failed: 0, errors: [], failedRecipients: [] });
    expect(logged).toContain("2 subscriber");
    expect(logged).not.toContain("@example.com");
  });
});

describe("confirmation email", () => {
  const SECRET = "test-secret";
  const NOW = new Date("2026-10-03T12:00:00Z");

  it("confirmUrl points at the confirm page with a token for that address and source, tagged as email", () => {
    const url = new URL(confirmUrl("Sam@Example.com", "share", SECRET, NOW));
    expect(url.pathname).toBe("/subscribe/confirm");
    expect(url.searchParams.get("utm_source")).toBe("email");
    expect(verifyConfirmToken(url.searchParams.get("token")!, SECRET, NOW)).toEqual({
      email: "sam@example.com",
      source: "share",
    });
  });

  it("buildConfirmMessage has the exact subject, the link in both parts, and the ignore-it line", () => {
    const link = "https://curioword.com/subscribe/confirm?token=abc&utm_source=email";
    const msg = buildConfirmMessage("sam@example.com", link);
    expect(msg.to).toBe("sam@example.com");
    expect(msg.subject).toBe("Confirm your Curio subscription");
    // Raw URL in the href, same convention as the digest's story link
    // (buildDigestHtml interpolates its utm-tagged URL unescaped).
    expect(msg.html).toContain(`href="${link}"`);
    expect(msg.text).toContain(link);
    expect(msg.text).toMatch(/didn.t ask for this/i);
    expect(msg.html + msg.text).not.toMatch(/streak|don.t miss/i);
  });
});
