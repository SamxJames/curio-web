import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Same loader as lib/email.confirmSend.test.ts: the Resend client is a module-level
// singleton chosen at import time, so each test sets the environment, mocks resend,
// then imports a fresh copy of ./email. The mocked send is never a real email.
const ADDRESS = "sam@example.com";

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

describe("dig alert email", () => {
  it("lists problems in a plain-text email", async () => {
    const { buildDigAlertMessage } = await loadEmail(undefined);
    const m = buildDigAlertMessage(["Tomorrow's dig is missing."]);
    expect(m.subject).toBe("curio dig: 1 problem needs a look");
    expect(m.text).toContain("- Tomorrow's dig is missing.");
  });

  it("logs a count only in development, never an address", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DIG_ALERT_TO", ADDRESS);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { sendDigAlert } = await loadEmail(undefined);
    await expect(sendDigAlert(["a", "b"])).resolves.toBeUndefined();
    expect(log.mock.calls.join(" ")).toContain("2 problems");
    expect(log.mock.calls.join(" ")).not.toContain("@");
    expect(send).not.toHaveBeenCalled();
  });

  it("in production with no RESEND_API_KEY, throws a fixed message and sends nothing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DIG_ALERT_TO", ADDRESS);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { sendDigAlert } = await loadEmail(undefined);
    const err = await sendDigAlert(["a"]).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("Dig alert email not configured");
    expect((err as Error).message).not.toContain(ADDRESS);
    expect(log).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("sends through Resend when configured, to DIG_ALERT_TO", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DIG_ALERT_TO", ADDRESS);
    send.mockResolvedValue({ data: { id: "1" }, error: null });
    const { sendDigAlert } = await loadEmail("re_test");
    await expect(sendDigAlert(["a"])).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ to: ADDRESS, subject: "curio dig: 1 problem needs a look" })
    );
  });
});
