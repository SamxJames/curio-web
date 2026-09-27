import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WordEntry } from "./words";

const { batchSend } = vi.hoisted(() => ({
  // A second (options) parameter, even unused, so `.mock.calls` elements are
  // typed as a 2-tuple — sendInBatches always calls with (chunk, idempotencyKey).
  batchSend: vi.fn(async (chunk: unknown[], idempotencyKey?: unknown) => {
    void idempotencyKey; // unused: only its shape matters, asserted via .mock.calls below
    return {
      data: { data: chunk.map((_, i) => ({ id: `id-${i}` })), errors: [] },
      error: null,
      headers: {},
    };
  }),
}));
vi.mock("resend", () => ({
  Resend: class {
    batch = { send: batchSend };
    emails = { send: vi.fn() };
  },
}));
vi.stubEnv("RESEND_API_KEY", "re_test_key");
vi.stubEnv("CURIO_SITE_URL", "https://curio.example");

const { sendDailyDigests } = await import("./email");
const { verifyUnsubscribeToken } = await import("./unsubscribeToken");

const word = {
  slug: "custard", word: "custard", respelling: "KUS-terd", partOfSpeech: "noun",
  teaser: "A pie filling that started as a crust.", origin: "From crustade.",
  journey: "", related: "", lineage: ["Old French", "English"],
} as WordEntry;
const emails = Array.from({ length: 101 }, (_, i) => `r${i}@example.com`);

// A plain block: an arrow body that just returns `batchSend.mockClear()`'s
// result (the mock itself, chainable) would hand Vitest a function back from
// beforeEach, which it then invokes as a teardown hook — calling the mock
// with no arguments and crashing it. Discard the return value instead.
beforeEach(() => {
  batchSend.mockClear();
});

describe("sendDailyDigests (Resend configured)", () => {
  it("sends every email through the batch endpoint, one recipient each, with its own List-Unsubscribe headers", async () => {
    const onSent = vi.fn(async (recipients: string[]) => {
      void recipients; // unused: only its shape matters, asserted via .mock.calls below
    });
    const out = await sendDailyDigests(emails, word, new Date("2026-09-27T09:00:00Z"), {
      secret: "s3cret",
      runKey: "curio-digest-2026-09-27-scheduled",
      onSent,
    });
    expect(onSent.mock.calls.map(([r]) => r.length)).toEqual([100, 1]);

    expect(batchSend.mock.calls.map(([c]) => c.length)).toEqual([100, 1]);
    const sent = batchSend.mock.calls.flatMap(([c]) => c) as {
      to: unknown; cc?: unknown; bcc?: unknown; headers: Record<string, string>;
    }[];
    expect(sent.map((m) => m.to)).toEqual(emails);
    for (const m of sent) {
      expect(typeof m.to).toBe("string");
      expect(m.cc).toBeUndefined();
      expect(m.bcc).toBeUndefined();
      expect(m.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
      const url = new URL(m.headers["List-Unsubscribe"].slice(1, -1));
      expect(url.origin).toBe("https://curio.example");
      expect(verifyUnsubscribeToken(url.searchParams.get("token")!, "s3cret")).toBe(m.to);
    }
    expect(batchSend.mock.calls.map(([, o]) => o)).toEqual([
      { batchValidation: "permissive", idempotencyKey: "curio-digest-2026-09-27-scheduled-0" },
      { batchValidation: "permissive", idempotencyKey: "curio-digest-2026-09-27-scheduled-1" },
    ]);
    expect(out).toMatchObject({ attempted: 101, sent: 101, failed: 0 });
  });
});
