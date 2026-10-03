// Test-only helpers for the demand report: fixture loading and a fake fetch
// that answers from recorded API responses, so no test touches the network.
import { readFileSync } from "node:fs";
import { generateKeyPairSync } from "node:crypto";
import path from "node:path";
import { vi } from "vitest";
import type { FetchLike } from "./http";
import type { ServiceAccountKey } from "./searchConsole";
import type { SearchConsoleData, Snapshot, WordDemand } from "./types";
import { lastCompleteMonths } from "./wiktionary";

export function fixture(name: string): string {
  return readFileSync(path.join(__dirname, "..", "__fixtures__", "demand", name), "utf8");
}

export function jsonResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "application/json" } });
}

/** quarantine has a page and views; December only exists as "december",
 * which has no recorded views (404); zzxqv has no page at all. */
export const FIXTURE_ENTRIES = [
  { slug: "quarantine", word: "quarantine" },
  { slug: "december", word: "December" },
  { slug: "zzxqv", word: "zzxqv" },
];

export function wikimediaRoute(url: string): Response | null {
  const u = new URL(url);
  if (u.hostname === "en.wiktionary.org" && u.pathname === "/w/api.php") {
    const titles = u.searchParams.get("titles");
    if (titles === "quarantine|December|zzxqv") return jsonResponse(fixture("mediawiki-exact.json"));
    if (titles === "december|Zzxqv") return jsonResponse(fixture("mediawiki-fallback.json"));
  }
  if (u.hostname === "wikimedia.org") {
    if (u.pathname.includes("/user/quarantine/monthly/")) {
      return jsonResponse(fixture("pageviews-quarantine.json"));
    }
    if (u.pathname.includes("/user/december/monthly/")) {
      return jsonResponse('{"title":"Not found."}', 404);
    }
  }
  return null;
}

type Route = (url: string, init?: RequestInit) => Response | null;

/** A fetch that asks each route in turn and fails loudly on anything unrouted. */
export function fakeFetch(...routes: Route[]) {
  return vi.fn<FetchLike>(async (url, init) => {
    for (const route of routes) {
      const response = route(url, init);
      if (response) return response;
    }
    throw new Error(`Unexpected request in test: ${url}`);
  });
}

/** A throwaway RSA service account, generated per test run. envValue is the
 * key file JSON base64-encoded, the way GSC_SERVICE_ACCOUNT_KEY holds it. */
export function testServiceAccount(): { key: ServiceAccountKey; publicKey: string; envValue: string } {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const key = { client_email: "demand-report@curio-test.iam.gserviceaccount.com", private_key: privateKey };
  const file = { type: "service_account", project_id: "curio-test", ...key };
  return { key, publicKey, envValue: Buffer.from(JSON.stringify(file)).toString("base64") };
}

const GSC_FIXTURES: Record<string, string> = {
  page: "gsc-page.json",
  query: "gsc-query.json",
  "page+query": "gsc-page-query.json",
};

/** The token endpoint and the three Search Analytics queries, from fixtures. */
export function googleRoute(url: string, init?: RequestInit): Response | null {
  if (url === "https://oauth2.googleapis.com/token") {
    return jsonResponse('{"access_token":"ya29.test","expires_in":3599,"token_type":"Bearer"}');
  }
  if (url.startsWith("https://searchconsole.googleapis.com/")) {
    const body = JSON.parse(String(init?.body)) as { dimensions: string[] };
    const name = GSC_FIXTURES[body.dimensions.join("+")];
    if (name) return jsonResponse(fixture(name));
  }
  return null;
}

/** A week's snapshot for the report tests: nine words, with Search Console
 * data from the gsc-*.json fixtures. The 8 words with a page and views put
 * quarantine and December in the top quarter. */
export const MONTHS = lastCompleteMonths(new Date("2026-10-05T06:00:00Z"));

export function word(slug: string, total12: number, overrides: Partial<WordDemand> = {}): WordDemand {
  return {
    slug,
    word: slug,
    title: slug,
    views: [...Array(11).fill(0), total12],
    total12,
    avg3: total12 / 3,
    trend: null,
    ...overrides,
  };
}

export function gscFromFixtures(): SearchConsoleData {
  return {
    site: "sc-domain:curioword.com",
    startDate: "2026-09-03",
    endDate: "2026-09-30",
    byPage: JSON.parse(fixture("gsc-page.json")).rows,
    byQuery: JSON.parse(fixture("gsc-query.json")).rows,
    byPageQuery: JSON.parse(fixture("gsc-page-query.json")).rows,
  };
}

export function makeSnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    version: 1,
    date: "2026-10-05",
    generatedAt: "2026-10-05T06:00:00.000Z",
    wiktionary: {
      months: MONTHS,
      words: [
        word("quarantine", 12500),
        word("december", 9000, { word: "December", title: "December" }),
        word("algebra", 8000),
        word("zephyr", 7000),
        word("bank", 300),
        word("thistle", 200),
        word("quixotic", 100),
        word("lexicon", 50),
        word("zzxqv", 0, { title: null }),
      ],
    },
    searchConsole: gscFromFixtures(),
    ...overrides,
  };
}
