import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The Resend client is a module-level singleton chosen at import time, so each
// test sets the environment, then imports a fresh copy of ./email.
const ADDRESS = "sam@example.com";
const URL_WITH_TOKEN = "https://curioword.com/subscribe/confirm?token=SECRETTOKEN&utm_source=email";

const send = vi.fn();

async function loadEmail(apiKey: string | undefined) {
  vi.resetModules();
  vi.doMock("resend", () => ({
    Resend: class {
      emails = { send };
    },
  }));
  if (apiKey === undefined) vi.stubEnv("RESEND_API_KEY", "");
  else vi.stubEnv("RESEND_API_KEY", apiKey);
  return import("./email");
}

beforeEach(() => send.mockReset());
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.doUnmock("resend");
});

describe("sendConfirmEmail", () => {
  it("in production with no RESEND_API_KEY, rejects without leaking the address or the link", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { sendConfirmEmail } = await loadEmail(undefined);
    const err = await sendConfirmEmail(ADDRESS, URL_WITH_TOKEN).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    const message = (err as Error).message;
    expect(message).toBe("Resend not configured");
    expect(message).not.toContain(ADDRESS);
    expect(message).not.toContain("SECRETTOKEN");
    expect(log).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("outside production with no key, resolves (dev fallback logs locally)", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { sendConfirmEmail } = await loadEmail(undefined);
    await expect(sendConfirmEmail(ADDRESS, URL_WITH_TOKEN)).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
  });

  it("sends through Resend when configured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    send.mockResolvedValue({ data: { id: "1" }, error: null });
    const { sendConfirmEmail } = await loadEmail("re_test");
    await expect(sendConfirmEmail(ADDRESS, URL_WITH_TOKEN)).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ to: ADDRESS, subject: "Confirm your Curio subscription" })
    );
  });

  it("on a Resend error, rejects with only the error name", async () => {
    vi.stubEnv("NODE_ENV", "production");
    send.mockResolvedValue({
      data: null,
      error: { name: "validation_error", message: `secret detail ${ADDRESS}` },
    });
    const { sendConfirmEmail } = await loadEmail("re_test");
    const err = await sendConfirmEmail(ADDRESS, URL_WITH_TOKEN).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    const message = (err as Error).message;
    expect(message).toContain("validation_error");
    expect(message).not.toContain(ADDRESS);
    expect(message).not.toContain("secret detail");
  });
});
