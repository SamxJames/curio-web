import { describe, expect, it, vi } from "vitest";
import { fetchDayWithRetry } from "./loadDay";

const res = (status: number) => new Response("{}", { status });

describe("fetchDayWithRetry", () => {
  it("succeeds first time with one call and no wait", async () => {
    const once = vi.fn().mockResolvedValue(res(200));
    const wait = vi.fn().mockResolvedValue(undefined);
    const r = await fetchDayWithRetry(once, wait);
    expect(r.status).toBe(200);
    expect(once).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });

  it("retries once after a thrown network error, then succeeds", async () => {
    const once = vi.fn().mockRejectedValueOnce(new TypeError("net")).mockResolvedValueOnce(res(200));
    const wait = vi.fn().mockResolvedValue(undefined);
    const r = await fetchDayWithRetry(once, wait);
    expect(r.status).toBe(200);
    expect(once).toHaveBeenCalledTimes(2);
  });

  it("retries once on a 503", async () => {
    const once = vi.fn().mockResolvedValueOnce(res(503)).mockResolvedValueOnce(res(200));
    const wait = vi.fn().mockResolvedValue(undefined);
    const r = await fetchDayWithRetry(once, wait);
    expect(r.status).toBe(200);
    expect(once).toHaveBeenCalledTimes(2);
  });

  it("never retries on a 404", async () => {
    const once = vi.fn().mockResolvedValue(res(404));
    const wait = vi.fn().mockResolvedValue(undefined);
    const r = await fetchDayWithRetry(once, wait);
    expect(r.status).toBe(404);
    expect(once).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });

  it("gives up after two attempts and rethrows the last error", async () => {
    const once = vi.fn().mockRejectedValueOnce(new Error("first")).mockRejectedValueOnce(new Error("second"));
    const wait = vi.fn().mockResolvedValue(undefined);
    await expect(fetchDayWithRetry(once, wait)).rejects.toThrow("second");
    expect(once).toHaveBeenCalledTimes(2);
  });

  it("returns the last response when both attempts are 5xx", async () => {
    const once = vi.fn().mockResolvedValueOnce(res(500)).mockResolvedValueOnce(res(502));
    const wait = vi.fn().mockResolvedValue(undefined);
    const r = await fetchDayWithRetry(once, wait);
    expect(r.status).toBe(502);
    expect(once).toHaveBeenCalledTimes(2);
  });

  it("waits 800ms before the retry", async () => {
    const once = vi.fn().mockResolvedValueOnce(res(500)).mockResolvedValueOnce(res(200));
    const wait = vi.fn().mockResolvedValue(undefined);
    await fetchDayWithRetry(once, wait);
    expect(wait).toHaveBeenCalledTimes(1);
    expect(wait).toHaveBeenCalledWith(800);
  });
});
