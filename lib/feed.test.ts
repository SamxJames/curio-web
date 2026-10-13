import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildFeedXml, FEED_DAYS, FEED_PATH } from "./feed";
import { WORDS, type HistoryDay } from "./words";

const original = process.env.CURIO_SITE_URL;
const NOW = new Date("2026-10-13T08:30:00Z");

beforeEach(() => {
  process.env.CURIO_SITE_URL = "https://curio.example";
});

afterEach(() => {
  if (original === undefined) delete process.env.CURIO_SITE_URL;
  else process.env.CURIO_SITE_URL = original;
});

const days: HistoryDay[] = [
  { date: "2026-10-13", word: WORDS[0] },
  { date: "2026-10-12", word: WORDS[1] },
  { date: "2026-10-11", word: WORDS[2] },
];

describe("feed constants", () => {
  it("covers 30 days at /feed.xml", () => {
    expect(FEED_DAYS).toBe(30);
    expect(FEED_PATH).toBe("/feed.xml");
  });
});

describe("buildFeedXml", () => {
  let xml = "";
  beforeEach(() => {
    xml = buildFeedXml(days, NOW);
  });

  it("is RSS 2.0 with the atom namespace and a self link", () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">');
    expect(xml).toContain(
      '<atom:link href="https://curio.example/feed.xml" rel="self" type="application/rss+xml"/>',
    );
  });

  it("has one item per day, in input order, dated the day it was the word", () => {
    expect(xml.match(/<item>/g)).toHaveLength(3);
    const slugs = [...xml.matchAll(/<guid isPermaLink="true">[^<]*\/story\/([^<]+)<\/guid>/g)].map((m) => m[1]);
    expect(slugs).toEqual(days.map((d) => d.word.slug));
    const pubDates = [...xml.matchAll(/<pubDate>([^<]+)<\/pubDate>/g)].map((m) => m[1]);
    expect(pubDates).toEqual(days.map((d) => new Date(`${d.date}T00:00:00Z`).toUTCString()));
    expect(pubDates[0]).toBe(new Date("2026-10-13T00:00:00Z").toUTCString());
  });

  it("tags item links with utm_source=rss and keeps the guid bare", () => {
    for (const { word } of days) {
      expect(xml).toContain(`<link>https://curio.example/story/${word.slug}?utm_source=rss</link>`);
      expect(xml).toContain(`<guid isPermaLink="true">https://curio.example/story/${word.slug}</guid>`);
    }
  });

  it("escapes markup and ampersands in descriptions and stays balanced", () => {
    const nasty: HistoryDay = {
      date: "2026-10-13",
      word: { ...WORDS[0], teaser: 'Fish & chips <b>"quoted"</b>' },
    };
    const out = buildFeedXml([nasty], NOW);
    const description = out.match(/<item>.*?<description>(.*?)<\/description>/)![1];
    expect(description).not.toContain("<b>");
    expect(description).toContain("&amp;");
    expect(description).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;)/);
    expect(out.match(/<item>/g)!.length).toBe(out.match(/<\/item>/g)!.length);
  });

  it("discloses where the stories come from in the channel description", () => {
    const channel = xml.match(/^<description>(.*)<\/description>$/m)![1];
    expect(channel).toContain("language model");
    expect(channel).toContain("Wiktionary");
  });

  it("never uses unread, missed, streak or catch-up copy", () => {
    const lower = xml.toLowerCase();
    for (const banned of ["missed", "unread", "streak", "catch up"]) {
      expect(lower).not.toContain(banned);
    }
  });
});
