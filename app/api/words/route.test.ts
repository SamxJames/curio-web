import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { WORDS } from "@/lib/words";

const get = (qs: string) => GET(new NextRequest(`http://localhost/api/words${qs}`));
const [a, b] = [WORDS[0].slug, WORDS[1].slug];

describe("GET /api/words", () => {
  it("returns the requested words, in request order, with only the collection fields", async () => {
    const res = await get(`?slugs=${b},${a}`);
    expect(res.status).toBe(200);
    const { words } = await res.json();
    expect(words.map((w: { slug: string }) => w.slug)).toEqual([b, a]);
    expect(Object.keys(words[0]).sort()).toEqual(
      ["lineage", "partOfSpeech", "related", "respelling", "slug", "teaser", "word"]
    );
  });

  it("drops unknown slugs and duplicates", async () => {
    const { words } = await (await get(`?slugs=${a},nope-not-a-word,${a}`)).json();
    expect(words.map((w: { slug: string }) => w.slug)).toEqual([a]);
  });

  it("returns an empty list for a missing or empty slugs param", async () => {
    expect((await (await get("")).json()).words).toEqual([]);
    expect((await (await get("?slugs=")).json()).words).toEqual([]);
  });

  it("rejects more than 500 slugs", async () => {
    const many = Array.from({ length: 501 }, (_, i) => `s${i}`).join(",");
    expect((await get(`?slugs=${many}`)).status).toBe(400);
  });

  it("is publicly cacheable", async () => {
    const res = await get(`?slugs=${a}`);
    expect(res.headers.get("cache-control")).toBe("public, s-maxage=86400, stale-while-revalidate=604800");
  });
});
