// Test-only helpers for the demand report: fixture loading and a fake fetch
// that answers from recorded API responses, so no test touches the network.
import { readFileSync } from "node:fs";
import path from "node:path";
import { vi } from "vitest";
import type { FetchLike } from "./http";

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
