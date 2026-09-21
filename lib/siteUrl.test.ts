import { describe, it, expect, afterEach } from "vitest";
import { siteUrl, absoluteUrl } from "./siteUrl";

const original = process.env.CURIO_SITE_URL;

afterEach(() => {
  if (original === undefined) delete process.env.CURIO_SITE_URL;
  else process.env.CURIO_SITE_URL = original;
});

describe("siteUrl", () => {
  it("uses CURIO_SITE_URL when set", () => {
    process.env.CURIO_SITE_URL = "https://curio.example";
    expect(siteUrl()).toBe("https://curio.example");
  });

  it("strips trailing slashes so joined paths never double up", () => {
    process.env.CURIO_SITE_URL = "https://curio.example//";
    expect(siteUrl()).toBe("https://curio.example");
  });

  it("falls back to localhost when unset or empty", () => {
    delete process.env.CURIO_SITE_URL;
    expect(siteUrl()).toBe("http://localhost:3000");
    process.env.CURIO_SITE_URL = "";
    expect(siteUrl()).toBe("http://localhost:3000");
  });
});

describe("absoluteUrl", () => {
  it("joins a rooted path", () => {
    process.env.CURIO_SITE_URL = "https://curio.example";
    expect(absoluteUrl("/story/quarantine")).toBe("https://curio.example/story/quarantine");
  });

  it("joins a path missing its leading slash", () => {
    process.env.CURIO_SITE_URL = "https://curio.example";
    expect(absoluteUrl("words")).toBe("https://curio.example/words");
  });
});
