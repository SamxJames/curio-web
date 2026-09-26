import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import type { ReactElement } from "react";
import { NextRequest } from "next/server";

// Every surface that shows "today's word", driven through its real code
// path with only the edges (Redis, auth, email transport, Bluesky network)
// faked — so this fails if any one of them starts resolving the day or
// the word differently from the rest.
const { fakeRedis, session, posted } = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    fakeRedis: {
      store,
      get: vi.fn(async (k: string) => store.get(k) ?? null),
      set: vi.fn(async (k: string, v: string, o?: { nx?: boolean }) => {
        if (o?.nx && store.has(k)) return null;
        store.set(k, v);
        return "OK";
      }),
      mget: vi.fn(async (...ks: string[]) => ks.map((k) => store.get(k) ?? null)),
    },
    session: { current: null as null | { user: { id: string } } },
    posted: [] as { text: string }[],
  };
});

vi.mock("@/lib/redis", () => ({ redis: fakeRedis, usingUpstash: true }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => session.current) }));
vi.mock("@/lib/userData", () => ({ recordUserSeen: vi.fn(async () => {}) }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: vi.fn(),
}));
vi.mock("@/components/HomeContent", () => ({ default: vi.fn(() => null) }));
vi.mock("@/components/ServerSessionMarker", () => ({ default: () => null }));
vi.mock("@/lib/db", () => ({
  getAllSubscribers: vi.fn(async () => ["anon@example.com", "account-holder@example.com"]),
}));
vi.mock("@/lib/email", () => ({ sendDailyDigest: vi.fn(async () => undefined) }));
vi.mock("@atproto/api", () => ({
  AtpAgent: class {
    login = vi.fn(async () => {});
    post = vi.fn(async (record: { text: string }) => {
      posted.push(record);
    });
  },
  RichText: class {
    text: string;
    facets = [];
    constructor({ text }: { text: string }) {
      this.text = text;
    }
    detectFacets = vi.fn(async () => {});
  },
}));

const { default: TodayPage } = await import("@/app/page");
const { GET: cron } = await import("@/app/api/cron/send-daily/route");
const { GET: storyDate } = await import("@/app/api/story/[slug]/date/route");
const { resolveWordForDate } = await import("@/lib/words");
const { sendDailyDigest } = await import("@/lib/email");
const { formatDay } = await import("@/lib/day");
const { default: HomeContent } = await import("@/components/HomeContent");

type HomeTree = ReactElement<{ children: ReactElement<{ word: { slug: string } }>[] }>;

async function homeWordSlug(signedIn: boolean) {
  session.current = signedIn ? { user: { id: "user-1" } } : null;
  const tree = (await TodayPage()) as HomeTree;
  const homeContentEl = tree.props.children.find((child) => child.type === HomeContent);
  if (!homeContentEl) throw new Error("HomeContent not found among TodayPage's children");
  return homeContentEl.props.word.slug;
}

async function everySurfaceAt(iso: string) {
  vi.setSystemTime(new Date(iso));
  const signedOut = await homeWordSlug(false);
  const signedIn = await homeWordSlug(true);

  session.current = null;
  await cron(
    new NextRequest("http://localhost/api/cron/send-daily", {
      headers: { authorization: "Bearer test-secret" },
    })
  );
  const digests = vi.mocked(sendDailyDigest).mock.calls.map((c) => c[1].slug);
  const blueskyText = posted[0]?.text ?? "";

  const res = await storyDate(new Request("http://localhost"), {
    params: Promise.resolve({ slug: signedOut }),
  });
  const { date, today } = (await res.json()) as {
    date: string | null;
    today: { slug: string; word: string } | null;
  };
  return { signedOut, signedIn, digests, blueskyText, date, today };
}

beforeEach(() => {
  fakeRedis.store.clear();
  posted.length = 0;
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  process.env.CRON_SECRET = "test-secret";
  process.env.BLUESKY_IDENTIFIER = "curio.test";
  process.env.BLUESKY_APP_PASSWORD = "test-app-password";
});

afterEach(() => {
  vi.useRealTimers();
});

describe("one shared word, every surface", () => {
  it.each(["2026-09-26T09:00:00.000Z", "2026-09-26T23:59:59.999Z", "2026-09-27T00:00:00.000Z"])(
    "home (signed out and in), both digests, the Bluesky post and the story date all agree at %s",
    async (iso) => {
      const expected = await resolveWordForDate(new Date(iso));
      const s = await everySurfaceAt(iso);

      expect(s.signedOut).toBe(expected.slug);
      expect(s.signedIn).toBe(expected.slug);
      expect(s.digests).toEqual([expected.slug, expected.slug]);
      expect(s.blueskyText).toContain(expected.word);
      expect(s.date).toBe(formatDay(iso.slice(0, 10)));
      expect(s.today).toEqual({ slug: expected.slug, word: expected.word });
    }
  );

  it("a story page for another word still names today's word", async () => {
    vi.setSystemTime(new Date("2026-09-26T09:00:00.000Z"));
    const today = await resolveWordForDate(new Date("2026-09-26T09:00:00.000Z"));
    const other = today.slug === "sideburns" ? "fiasco" : "sideburns";

    const res = await storyDate(new Request("http://localhost"), {
      params: Promise.resolve({ slug: other }),
    });
    const body = (await res.json()) as { today: { slug: string; word: string } | null };

    expect(body.today).toEqual({ slug: today.slug, word: today.word });
  });

  it("every surface moves to the next word at the same instant, 00:00 UTC", async () => {
    const before = await everySurfaceAt("2026-09-26T23:59:59.999Z");
    fakeRedis.store.clear();
    posted.length = 0;
    vi.clearAllMocks();
    const after = await everySurfaceAt("2026-09-27T00:00:00.000Z");

    expect(after.signedOut).not.toBe(before.signedOut);
    expect(after.signedIn).toBe(after.signedOut);
    expect(after.digests).toEqual([after.signedOut, after.signedOut]);
  });
});
