import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { authorizeCron } from "./cronAuth";

const req = (auth?: string) =>
  new NextRequest("http://localhost/api/cron/x", { headers: auth ? { authorization: auth } : {} });

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("authorizeCron", () => {
  it("lets through the right bearer and hands back the secret", () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect(authorizeCron(req("Bearer s3cret"))).toEqual({ secret: "s3cret", denied: null });
  });

  it("401s a wrong or missing bearer", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    for (const auth of ["Bearer wrong", undefined]) {
      const { denied } = authorizeCron(req(auth));
      expect(denied?.status).toBe(401);
      expect(await denied?.json()).toEqual({ error: "Unauthorized" });
    }
  });

  it("fails closed in production with no CRON_SECRET", async () => {
    vi.stubEnv("CRON_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");
    const { secret, denied } = authorizeCron(req());
    expect(secret).toBeUndefined();
    expect(denied?.status).toBe(401);
    expect(await denied?.json()).toEqual({ error: "CRON_SECRET is not configured" });
  });

  it("is open outside production with no CRON_SECRET", () => {
    vi.stubEnv("CRON_SECRET", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(authorizeCron(req())).toEqual({ secret: undefined, denied: null });
  });
});
